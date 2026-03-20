import { createWorker, type Job } from '@nexus/events';
import { storage } from '@nexus/storage';
import { db, connectedSources } from '@nexus/db';
import { eq } from 'drizzle-orm';
import {
  RateLimitError,
  SyncTimeoutError,
  TokenExpiredError,
  PartialSyncError,
  SchemaEvolutionError,
  FileCorruptError,
  FileSizeLimitError,
} from '@nexus/contracts/errors';
import type { NormalisedEntity } from '@nexus/contracts/entities';
import {
  getProvider,
  type OAuthTokens,
  type ConnectorProviderConfig,
  type FetchEntitiesResult,
} from '../services/connector.service';
import { normaliseRecords, deduplicateEntities, tagProvenance } from '../services/normaliser.service';
import {
  type SyncCheckpoint,
  ensureFreshTokens,
  withRateLimitBackoff,
  withSyncTimeout,
  saveCheckpoint,
  completeSyncJob,
  failSyncJob,
  partialSyncJob,
} from '../services/sync.service';

// ── Job Payload ──────────────────────────────────────────────────

interface SyncJobPayload {
  jobId: string;
  orgId: string;
  sourceId: string;
  mode: 'full' | 'incremental';
  checkpoint?: SyncCheckpoint;
}

// ── Worker ───────────────────────────────────────────────────────

const SYNC_QUEUE = 'connector-hub:sync';
const ENTITY_BATCH_SIZE = 500;

export function startSyncWorker() {
  const worker = createWorker<SyncJobPayload>(
    SYNC_QUEUE,
    async (job: Job<SyncJobPayload>) => {
      const { jobId, orgId, sourceId, mode, checkpoint } = job.data;

      console.info(
        `[sync.worker] Starting ${mode} sync for source=${sourceId} org=${orgId} job=${jobId}`,
      );

      try {
        await withSyncTimeout(
          async (signal) => {
            await executeSyncJob(job.data, signal);
          },
          { orgId, sourceId, jobId },
        );
      } catch (err) {
        await handleSyncError(err, jobId, orgId, sourceId);
        throw err; // Re-throw so BullMQ can retry if applicable
      }
    },
    {
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60_000, // Max 10 jobs per minute
      },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[sync.worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[sync.worker] Job ${job.id} completed`);
  });

  return worker;
}

// ── Core Sync Logic ──────────────────────────────────────────────

async function executeSyncJob(payload: SyncJobPayload, signal: AbortSignal): Promise<void> {
  const { jobId, orgId, sourceId, mode } = payload;

  // Load source configuration
  const sources = await db()
    .select()
    .from(connectedSources)
    .where(eq(connectedSources.id, sourceId))
    .limit(1);

  if (sources.length === 0) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const source = sources[0];
  const credentials = source.credentials as {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    providerConfig: ConnectorProviderConfig;
  } | null;

  if (!credentials) {
    await failSyncJob(jobId, sourceId, 'No credentials stored for source');
    return;
  }

  let tokens: OAuthTokens = {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: new Date(credentials.expiresAt),
  };

  // Refresh tokens if needed
  tokens = await ensureFreshTokens(sourceId, source.provider, tokens, credentials.providerConfig);

  const provider = getProvider(source.provider);

  // Resume from checkpoint if available
  let currentCheckpoint: SyncCheckpoint = payload.checkpoint ?? {
    sourceId,
    entitiesExtracted: 0,
    lastPage: 0,
    completedObjectTypes: [],
    startedAt: new Date().toISOString(),
  };

  let cursor = currentCheckpoint.cursor;
  let hasMore = true;
  let totalEntities = currentCheckpoint.entitiesExtracted;

  while (hasMore) {
    // Check abort signal
    if (signal.aborted) {
      await saveCheckpoint(jobId, { ...currentCheckpoint, cursor, entitiesExtracted: totalEntities });
      throw new SyncTimeoutError(`Sync aborted for source ${sourceId}`, { orgId });
    }

    // Fetch page with rate limit backoff
    const result: FetchEntitiesResult = await withRateLimitBackoff(
      async () => {
        // Refresh tokens on each page in case they expire mid-sync
        tokens = await ensureFreshTokens(sourceId, source.provider, tokens, credentials.providerConfig);

        return provider.fetchEntities({
          orgId,
          sourceId,
          tokens,
          since: mode === 'incremental' && source.lastSyncAt ? source.lastSyncAt : undefined,
          cursor,
          pageSize: ENTITY_BATCH_SIZE,
        });
      },
      { orgId, sourceId, operation: `fetchEntities page ${currentCheckpoint.lastPage + 1}` },
    );

    if (result.entities.length > 0) {
      // Normalise entities
      const { entities: normalised, provenance } = normaliseRecords(
        result.entities.map((e) => ({ ...e.properties, _originalEntity: e })),
        { orgId, sourceId, sourceSystem: source.provider },
      );

      // Use the original entities with their already-assigned types from the provider
      const finalEntities = result.entities;

      // Deduplicate within this batch
      const deduplicated = deduplicateEntities(finalEntities);

      // Store entities to S3
      const batchKey = `entities/batch-${currentCheckpoint.lastPage + 1}-${Date.now()}.json`;
      await storage.putJSON(orgId, 'connector-hub', batchKey, deduplicated);

      // Store provenance
      const provenanceRecords = tagProvenance(deduplicated, [`sync_mode:${mode}`, `batch:${currentCheckpoint.lastPage + 1}`]);
      const provenanceKey = `provenance/batch-${currentCheckpoint.lastPage + 1}-${Date.now()}.json`;
      await storage.putJSON(orgId, 'connector-hub', provenanceKey, provenanceRecords);

      totalEntities += deduplicated.length;
    }

    // Update checkpoint
    currentCheckpoint = {
      ...currentCheckpoint,
      cursor: result.nextCursor,
      entitiesExtracted: totalEntities,
      lastPage: currentCheckpoint.lastPage + 1,
    };

    await saveCheckpoint(jobId, currentCheckpoint);

    cursor = result.nextCursor;
    hasMore = result.hasMore;
  }

  // Store final entity manifest
  await storage.putJSON(orgId, 'connector-hub', `manifests/${sourceId}-latest.json`, {
    sourceId,
    provider: source.provider,
    mode,
    totalEntities,
    completedAt: new Date().toISOString(),
  });

  // Mark job complete
  await completeSyncJob(jobId, orgId, sourceId, totalEntities, mode);
}

// ── Error Handling ───────────────────────────────────────────────

async function handleSyncError(
  err: unknown,
  jobId: string,
  orgId: string,
  sourceId: string,
): Promise<void> {
  if (err instanceof SyncTimeoutError) {
    // Timeout: save checkpoint for resume
    console.warn(`[sync.worker] Sync timed out for source=${sourceId}. Checkpoint saved for resume.`);
    // Checkpoint already saved in the sync loop
    return;
  }

  if (err instanceof TokenExpiredError) {
    await failSyncJob(jobId, sourceId, `OAuth token expired and refresh failed: ${err.message}`);
    return;
  }

  if (err instanceof RateLimitError) {
    await failSyncJob(jobId, sourceId, `Rate limit exceeded after max retries: ${err.message}`);
    return;
  }

  if (err instanceof SchemaEvolutionError) {
    await failSyncJob(
      jobId,
      sourceId,
      `Provider schema changed unexpectedly: ${err.message}. Manual reconnection may be required.`,
    );
    return;
  }

  if (err instanceof FileCorruptError || err instanceof FileSizeLimitError) {
    await failSyncJob(jobId, sourceId, `File processing error: ${err.message}`);
    return;
  }

  if (err instanceof PartialSyncError) {
    console.warn(`[sync.worker] Partial sync for source=${sourceId}: ${err.message}`);
    return;
  }

  // Unknown error
  const message = err instanceof Error ? err.message : String(err);
  await failSyncJob(jobId, sourceId, `Unexpected error: ${message}`);
}
