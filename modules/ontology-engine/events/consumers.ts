import { createWorker, getQueue, type Job } from '@nexus/events';
import { EventName } from '@nexus/contracts/events';
import type { DataIngestionCompletePayload, DriftDetectedPayload } from '@nexus/contracts/events';
import type { GenerateJobData, DriftJobData } from '../types.js';

/**
 * Subscribe to DataIngestionComplete events from Module 1.
 * Auto-triggers ontology generation when data ingestion finishes.
 */
export function subscribeToDataIngestionComplete(): void {
  createWorker<DataIngestionCompletePayload>(
    EventName.DataIngestionComplete,
    async (job: Job<DataIngestionCompletePayload>) => {
      const { orgId, totalEntities, sourceInventory, timestamp } = job.data;

      console.info(
        `[ontology-engine] Received DataIngestionComplete for org=${orgId} ` +
        `entities=${totalEntities} sources=${sourceInventory.length}`,
      );

      // Only trigger if ingestion was successful (at least one complete source)
      const completeSources = sourceInventory.filter((s) => s.status === 'complete');
      if (completeSources.length === 0) {
        console.warn(
          `[ontology-engine] Skipping generation for org=${orgId}: no complete sources`,
        );
        return;
      }

      // Queue ontology generation job
      const queue = getQueue('ontology:generate');
      await queue.add('generate', {
        orgId,
        triggeredBy: 'auto',
      } satisfies GenerateJobData, {
        jobId: `generate-${orgId}-${Date.now()}`,
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      });

      console.info(
        `[ontology-engine] Queued ontology generation for org=${orgId} ` +
        `(triggered by DataIngestionComplete at ${timestamp})`,
      );
    },
    {
      concurrency: 1,
    },
  );

  console.info('[ontology-engine] Subscribed to DataIngestionComplete events');
}

/**
 * Subscribe to IncrementalSyncComplete events for Living Twin drift detection.
 * Triggers drift analysis when incremental data comes in.
 */
export function subscribeToIncrementalSync(): void {
  createWorker<{ orgId: string; newEntityIds: string[]; timestamp: string }>(
    EventName.IncrementalSyncComplete,
    async (job) => {
      const { orgId, newEntityIds, timestamp } = job.data;

      console.info(
        `[ontology-engine] Received IncrementalSyncComplete for org=${orgId} ` +
        `newEntities=${newEntityIds.length}`,
      );

      if (newEntityIds.length === 0) {
        console.info(`[ontology-engine] No new entities for org=${orgId}, skipping drift detection`);
        return;
      }

      // Queue drift detection job
      const queue = getQueue('ontology:drift');
      await queue.add('drift', {
        orgId,
        currentVersionId: '', // Worker will look up the latest
        newEntityIds,
      } satisfies DriftJobData, {
        jobId: `drift-${orgId}-${Date.now()}`,
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      });

      console.info(
        `[ontology-engine] Queued drift detection for org=${orgId} ` +
        `(triggered by IncrementalSyncComplete at ${timestamp})`,
      );
    },
    {
      concurrency: 1,
    },
  );

  console.info('[ontology-engine] Subscribed to IncrementalSyncComplete events');
}

/**
 * Initialise all event consumers for the Ontology Engine module.
 */
export function initConsumers(): void {
  subscribeToDataIngestionComplete();
  subscribeToIncrementalSync();
}
