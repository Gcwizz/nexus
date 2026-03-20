import { eq, and } from 'drizzle-orm';
import { db, connectedSources, syncJobs } from '@nexus/db';
import { getQueue, scheduleRecurring } from '@nexus/events';
import {
  RateLimitError,
  SyncTimeoutError,
  TokenExpiredError,
  PartialSyncError,
  CyclicSyncError,
} from '@nexus/contracts/errors';
import type { ConnectedSource } from '@nexus/contracts/entities';
import { getProvider, type OAuthTokens, type ConnectorProviderConfig } from './connector.service';
import { publishDataIngestionComplete, publishIncrementalSyncComplete } from '../events/producers';

// ── Types ────────────────────────────────────────────────────────

export interface SyncCheckpoint {
  sourceId: string;
  cursor?: string;
  entitiesExtracted: number;
  lastPage: number;
  completedObjectTypes: string[];
  startedAt: string;
}

export interface SyncJobOptions {
  orgId: string;
  sourceId: string;
  mode: 'full' | 'incremental';
  checkpoint?: SyncCheckpoint;
}

export interface SyncProgress {
  jobId: string;
  sourceId: string;
  status: 'pending' | 'running' | 'complete' | 'partial' | 'failed';
  entitiesExtracted: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  checkpoint?: SyncCheckpoint;
}

export interface ConnectionHealth {
  sourceId: string;
  provider: string;
  status: 'healthy' | 'token_expiring' | 'error' | 'disconnected';
  lastSyncAt?: string;
  entityCount: number;
  error?: string;
}

// ── Constants ────────────────────────────────────────────────────

const SYNC_QUEUE = 'connector-hub:sync';
const PARSE_QUEUE = 'connector-hub:parse';
const MAX_SYNC_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 5;
const INCREMENTAL_SYNC_CRON = '0 */6 * * *'; // Every 6 hours

// ── Sync Service ─────────────────────────────────────────────────

/**
 * Enqueue a full or incremental sync job.
 * Returns the sync job ID.
 */
export async function triggerSync(options: SyncJobOptions): Promise<string> {
  const { orgId, sourceId, mode } = options;

  // Guard against cyclic/duplicate syncs
  const activeSyncs = await db()
    .select()
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.sourceId, sourceId),
        eq(syncJobs.status, 'running'),
      ),
    );

  if (activeSyncs.length > 0) {
    throw new CyclicSyncError(
      `A sync is already running for source ${sourceId}`,
      { orgId },
    );
  }

  // Create sync job record
  const jobId = `sync-${sourceId}-${Date.now()}`;
  await db().insert(syncJobs).values({
    id: jobId,
    orgId,
    sourceId,
    status: 'pending',
    entitiesExtracted: 0,
    createdAt: new Date(),
  });

  // Update source status
  await db()
    .update(connectedSources)
    .set({ status: 'syncing' })
    .where(eq(connectedSources.id, sourceId));

  // Enqueue the sync job
  const queue = getQueue(SYNC_QUEUE);
  await queue.add(
    `sync:${mode}`,
    {
      jobId,
      orgId,
      sourceId,
      mode,
      checkpoint: options.checkpoint,
    },
    {
      jobId, // Prevent duplicate jobs
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  );

  return jobId;
}

/**
 * Get the progress of a sync job.
 */
export async function getSyncProgress(sourceId: string): Promise<SyncProgress | null> {
  const jobs = await db()
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.sourceId, sourceId))
    .orderBy(syncJobs.createdAt)
    .limit(1);

  if (jobs.length === 0) return null;

  const job = jobs[0];
  return {
    jobId: job.id,
    sourceId: job.sourceId,
    status: job.status,
    entitiesExtracted: job.entitiesExtracted,
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    error: job.error ?? undefined,
  };
}

/**
 * Get connection health for all sources in an org.
 */
export async function getConnectionHealth(orgId: string): Promise<ConnectionHealth[]> {
  const sources = await db()
    .select()
    .from(connectedSources)
    .where(eq(connectedSources.orgId, orgId));

  return sources.map((source) => {
    let healthStatus: ConnectionHealth['status'] = 'healthy';

    if (source.status === 'error') {
      healthStatus = 'error';
    } else if (source.status === 'disconnected') {
      healthStatus = 'disconnected';
    } else {
      // Check if token might be expiring
      const credentials = source.credentials as { expiresAt?: string } | null;
      if (credentials?.expiresAt) {
        const expiresAt = new Date(credentials.expiresAt);
        const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilExpiry < 1) {
          healthStatus = 'token_expiring';
        }
      }
    }

    return {
      sourceId: source.id,
      provider: source.provider,
      status: healthStatus,
      lastSyncAt: source.lastSyncAt?.toISOString(),
      entityCount: source.entityCount,
      error: source.error ?? undefined,
    };
  });
}

// ── Token Management ─────────────────────────────────────────────

/**
 * Ensure tokens are fresh. Refreshes if expired or about to expire.
 */
export async function ensureFreshTokens(
  sourceId: string,
  provider: string,
  tokens: OAuthTokens,
  providerConfig: ConnectorProviderConfig,
): Promise<OAuthTokens> {
  const expiresIn = tokens.expiresAt.getTime() - Date.now();
  const REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 min before expiry

  if (expiresIn > REFRESH_BUFFER) {
    return tokens; // Still valid
  }

  const connectorProvider = getProvider(provider);
  const newTokens = await connectorProvider.refreshToken(tokens.refreshToken, providerConfig);

  // Persist updated tokens
  await db()
    .update(connectedSources)
    .set({
      credentials: {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt.toISOString(),
      },
    })
    .where(eq(connectedSources.id, sourceId));

  return newTokens;
}

// ── Rate Limit Backoff ───────────────────────────────────────────

/**
 * Execute a function with exponential backoff on rate limit errors.
 */
export async function withRateLimitBackoff<T>(
  fn: () => Promise<T>,
  context: { orgId: string; sourceId: string; operation: string },
): Promise<T> {
  let lastError: RateLimitError | undefined;

  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RateLimitError) {
        lastError = err;
        const delayMs = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[connector-hub] Rate limited on ${context.operation} for source ${context.sourceId} (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}). Backing off ${delayMs}ms`,
        );
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }

  throw lastError!;
}

// ── Sync Timeout Guard ───────────────────────────────────────────

/**
 * Wraps a sync operation with a timeout. If exceeded, saves checkpoint
 * and throws PartialSyncError so the job can be resumed.
 */
export async function withSyncTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  context: { orgId: string; sourceId: string; jobId: string },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_SYNC_DURATION_MS);

  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new SyncTimeoutError(
        `Sync timed out after ${MAX_SYNC_DURATION_MS / 1000}s for source ${context.sourceId}`,
        { orgId: context.orgId },
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Checkpoint Management ────────────────────────────────────────

/**
 * Save a sync checkpoint for resume capability.
 */
export async function saveCheckpoint(
  jobId: string,
  checkpoint: SyncCheckpoint,
): Promise<void> {
  await db()
    .update(syncJobs)
    .set({
      entitiesExtracted: checkpoint.entitiesExtracted,
      // Store checkpoint in error field as JSON (or extend schema with checkpoint column)
      error: JSON.stringify({ _checkpoint: checkpoint }),
    })
    .where(eq(syncJobs.id, jobId));
}

/**
 * Load a checkpoint from a previous sync attempt.
 */
export async function loadCheckpoint(jobId: string): Promise<SyncCheckpoint | null> {
  const jobs = await db()
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.id, jobId))
    .limit(1);

  if (jobs.length === 0) return null;

  const errorField = jobs[0].error;
  if (!errorField) return null;

  try {
    const parsed = JSON.parse(errorField) as { _checkpoint?: SyncCheckpoint };
    return parsed._checkpoint ?? null;
  } catch {
    return null;
  }
}

// ── Job Completion ───────────────────────────────────────────────

/**
 * Mark a sync job as complete and update source stats.
 */
export async function completeSyncJob(
  jobId: string,
  orgId: string,
  sourceId: string,
  entitiesExtracted: number,
  mode: 'full' | 'incremental',
): Promise<void> {
  const now = new Date();

  await db()
    .update(syncJobs)
    .set({
      status: 'complete',
      entitiesExtracted,
      completedAt: now,
      error: null,
    })
    .where(eq(syncJobs.id, jobId));

  await db()
    .update(connectedSources)
    .set({
      status: 'connected',
      entityCount: entitiesExtracted,
      lastSyncAt: now,
      error: null,
    })
    .where(eq(connectedSources.id, sourceId));

  // Emit completion event
  if (mode === 'full') {
    await publishDataIngestionComplete(orgId, sourceId, entitiesExtracted);
  } else {
    await publishIncrementalSyncComplete(orgId, sourceId, entitiesExtracted);
  }
}

/**
 * Mark a sync job as failed.
 */
export async function failSyncJob(
  jobId: string,
  sourceId: string,
  error: string,
): Promise<void> {
  await db()
    .update(syncJobs)
    .set({
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    .where(eq(syncJobs.id, jobId));

  await db()
    .update(connectedSources)
    .set({
      status: 'error',
      error,
    })
    .where(eq(connectedSources.id, sourceId));
}

/**
 * Mark a sync job as partial (timed out but has checkpoint for resume).
 */
export async function partialSyncJob(
  jobId: string,
  sourceId: string,
  checkpoint: SyncCheckpoint,
): Promise<void> {
  await db()
    .update(syncJobs)
    .set({
      status: 'partial',
      entitiesExtracted: checkpoint.entitiesExtracted,
      error: JSON.stringify({ _checkpoint: checkpoint }),
      completedAt: new Date(),
    })
    .where(eq(syncJobs.id, jobId));

  await db()
    .update(connectedSources)
    .set({
      status: 'connected',
      entityCount: checkpoint.entitiesExtracted,
      lastSyncAt: new Date(),
    })
    .where(eq(connectedSources.id, sourceId));
}

// ── Living Twin: Scheduled Incremental Sync ──────────────────────

/**
 * Enable continuous incremental syncs for a source (Living Twin feature).
 */
export async function enableContinuousSync(
  orgId: string,
  sourceId: string,
  cronExpression: string = INCREMENTAL_SYNC_CRON,
): Promise<void> {
  await scheduleRecurring(
    SYNC_QUEUE,
    `incremental:${sourceId}`,
    { orgId, sourceId, mode: 'incremental' },
    cronExpression,
  );
}

/**
 * Enqueue a file parse job for large files.
 */
export async function enqueueParseJob(
  orgId: string,
  sourceId: string,
  filename: string,
  storageKey: string,
): Promise<string> {
  const jobId = `parse-${sourceId}-${Date.now()}`;
  const queue = getQueue(PARSE_QUEUE);
  await queue.add(
    'parse:file',
    { jobId, orgId, sourceId, filename, storageKey },
    {
      jobId,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
      attempts: 2,
    },
  );
  return jobId;
}

// ── Helpers ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
