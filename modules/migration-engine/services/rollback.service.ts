import { storage } from '@nexus/storage';
import { RollbackFailureError } from '@nexus/contracts/errors';
import { loaderService } from './loader.service.js';
import { auditService } from './audit.service.js';
import type {
  MigrationJob,
  MigrationBatch,
  RollbackResult,
  TargetSchema,
  AuditEntry,
} from '../types.js';

// ── Rollback Service ────────────────────────────────────────────

export class RollbackService {
  /**
   * Rollback the last N batches of a migration.
   */
  async rollbackLastN(
    orgId: string,
    migration: MigrationJob,
    targetSchema: TargetSchema,
    count: number = 1,
  ): Promise<RollbackResult[]> {
    const completedBatches = migration.batches
      .filter((b) => b.status === 'complete')
      .sort((a, b) => b.batchIndex - a.batchIndex)
      .slice(0, count);

    if (completedBatches.length === 0) {
      return [];
    }

    const results: RollbackResult[] = [];
    for (const batch of completedBatches) {
      const result = await this.rollbackBatch(orgId, migration.id, batch, targetSchema);
      results.push(result);
    }

    return results;
  }

  /**
   * Rollback a specific batch by ID.
   */
  async rollbackBatch(
    orgId: string,
    migrationId: string,
    batch: MigrationBatch,
    targetSchema: TargetSchema,
  ): Promise<RollbackResult> {
    const errors: Array<{ targetId: string; error: string }> = [];
    let recordsRolledBack = 0;
    let recordsFailed = 0;

    // Find all entity schemas that may have records from this batch
    for (const entitySchema of targetSchema.entities) {
      try {
        // Get record IDs from this batch
        const recordIds = await loaderService.getBatchRecordIds(
          entitySchema.tableName,
          batch.id,
          entitySchema.primaryKey,
        );

        if (recordIds.length === 0) continue;

        // Delete records from this batch
        const deletedCount = await loaderService.deleteBatchRecords(
          entitySchema.tableName,
          batch.id,
        );

        recordsRolledBack += deletedCount;

        // Log rollback audit entries
        const auditEntries: AuditEntry[] = recordIds.map((targetId) => ({
          id: `audit-rb-${batch.id}-${targetId}`,
          migrationId,
          batchId: batch.id,
          sourceSystem: batch.sourceSystem,
          sourceId: '', // Unknown at rollback time
          targetId,
          entityType: entitySchema.entityType,
          action: 'rolled_back' as const,
          transformations: [],
          dedupMerges: [],
          timestamp: new Date().toISOString(),
        }));

        await auditService.logEntries(auditEntries);
      } catch (err) {
        const errMsg = (err as Error).message;
        recordsFailed++;
        errors.push({ targetId: `batch:${batch.id}:${entitySchema.entityType}`, error: errMsg });
      }
    }

    await auditService.flush();

    const complete = recordsFailed === 0;

    if (!complete) {
      // Alert ops with exact state
      const failureDetails = errors.map((e) => `${e.targetId}: ${e.error}`).join('\n');
      console.error(
        `[migration-engine] Partial rollback failure for batch ${batch.id}:\n${failureDetails}`,
      );
    }

    return {
      batchId: batch.id,
      recordsRolledBack,
      recordsFailed,
      errors,
      complete,
    };
  }

  /**
   * Verify that a rollback was complete by checking if any records remain.
   */
  async verifyRollback(
    batch: MigrationBatch,
    targetSchema: TargetSchema,
  ): Promise<{ verified: boolean; remainingRecords: number }> {
    let remainingRecords = 0;

    for (const entitySchema of targetSchema.entities) {
      const recordIds = await loaderService.getBatchRecordIds(
        entitySchema.tableName,
        batch.id,
        entitySchema.primaryKey,
      );
      remainingRecords += recordIds.length;
    }

    return {
      verified: remainingRecords === 0,
      remainingRecords,
    };
  }

  /**
   * Handle partial rollback failure by logging detailed state.
   */
  async handlePartialRollbackFailure(
    orgId: string,
    migrationId: string,
    batchId: string,
    result: RollbackResult,
  ): Promise<void> {
    if (result.complete) return;

    // Store detailed failure report in S3 for ops
    const report = {
      migrationId,
      batchId,
      timestamp: new Date().toISOString(),
      recordsRolledBack: result.recordsRolledBack,
      recordsFailed: result.recordsFailed,
      errors: result.errors,
      message: 'PARTIAL ROLLBACK FAILURE: Manual intervention required. Some records from this batch could not be deleted.',
      resolution: 'Check the errors above and manually remove remaining records from the target database.',
    };

    await storage.putJSON(
      orgId,
      `migration-rollback-failures`,
      `failure-${migrationId}-${batchId}.json`,
      report,
    );

    // Also throw to ensure the caller knows this is not resolved
    throw new RollbackFailureError(
      `Partial rollback failure for batch ${batchId}: ${result.recordsFailed} records could not be rolled back. ` +
      `Details stored in S3 at migration-rollback-failures/failure-${migrationId}-${batchId}.json`,
      { orgId },
    );
  }
}

export const rollbackService = new RollbackService();
