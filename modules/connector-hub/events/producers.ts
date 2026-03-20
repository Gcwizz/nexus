import { publishEvent } from '@nexus/events';
import {
  EventName,
  type DataIngestionCompletePayload,
} from '@nexus/contracts/events';
import { db, connectedSources } from '@nexus/db';
import { eq } from 'drizzle-orm';

/**
 * Publish a DataIngestionComplete event after a full sync completes.
 * This triggers Module 2 (Ontology Engine) to begin processing.
 */
export async function publishDataIngestionComplete(
  orgId: string,
  sourceId: string,
  entityCount: number,
): Promise<void> {
  // Gather full source inventory for this org
  const sources = await db()
    .select()
    .from(connectedSources)
    .where(eq(connectedSources.orgId, orgId));

  const sourceInventory = sources.map((source) => ({
    sourceId: source.id,
    sourceType: source.provider,
    entityCount: source.entityCount,
    status: (source.status === 'connected' ? 'complete' :
             source.status === 'error' ? 'failed' : 'partial') as 'complete' | 'partial' | 'failed',
  }));

  const totalEntities = sources.reduce((sum, s) => sum + s.entityCount, 0);

  const payload: DataIngestionCompletePayload = {
    orgId,
    sourceInventory,
    totalEntities,
    timestamp: new Date().toISOString(),
  };

  await publishEvent(EventName.DataIngestionComplete, payload);

  console.info(
    `[connector-hub] Published DataIngestionComplete for org=${orgId}: ${totalEntities} entities across ${sources.length} sources`,
  );
}

/**
 * Publish an IncrementalSyncComplete event after an incremental sync.
 * This notifies Module 2 to check for ontology drift (Living Twin).
 */
export async function publishIncrementalSyncComplete(
  orgId: string,
  sourceId: string,
  newEntityCount: number,
): Promise<void> {
  const payload = {
    orgId,
    sourceId,
    newEntityCount,
    timestamp: new Date().toISOString(),
  };

  await publishEvent(EventName.IncrementalSyncComplete, payload);

  console.info(
    `[connector-hub] Published IncrementalSyncComplete for org=${orgId} source=${sourceId}: ${newEntityCount} new entities`,
  );
}
