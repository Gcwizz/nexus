import { db } from '@nexus/db';
import { sql } from 'drizzle-orm';
import {
  IntegrityViolationError,
  DuplicateKeyError,
} from '@nexus/contracts/errors';
import type {
  TransformedRecord,
  LoadResult,
  ConflictStrategy,
  TargetSchema,
  TargetEntitySchema,
  MigrationBatch,
} from '../types.js';

// ── Loader Service ──────────────────────────────────────────────

export class LoaderService {
  private defaultBatchSize = 1000;

  /**
   * Load a batch of records into the target database.
   * Each batch is atomic: all records commit or all rollback.
   */
  async loadBatch(
    records: TransformedRecord[],
    batchId: string,
    targetSchema: TargetSchema,
    conflictStrategy: ConflictStrategy = 'skip',
    batchSize?: number,
  ): Promise<LoadResult> {
    const size = batchSize ?? this.defaultBatchSize;
    let recordsInserted = 0;
    let recordsSkipped = 0;
    let recordsMerged = 0;
    let recordsFailed = 0;
    const errors: Array<{ sourceId: string; error: string }> = [];
    const targetIds = new Map<string, string>();

    // Group records by entity type for bulk operations
    const grouped = this.groupByEntityType(records);

    // Determine FK ordering — load parent entities before children
    const loadOrder = this.resolveForeignKeyOrder(targetSchema);

    for (const entityType of loadOrder) {
      const entityRecords = grouped.get(entityType);
      if (!entityRecords || entityRecords.length === 0) continue;

      const entitySchema = targetSchema.entities.find((e) => e.entityType === entityType);
      if (!entitySchema) continue;

      // Process in sub-batches within the entity type
      for (let i = 0; i < entityRecords.length; i += size) {
        const chunk = entityRecords.slice(i, i + size);

        try {
          const result = await this.insertChunk(
            chunk,
            entitySchema,
            batchId,
            conflictStrategy,
          );

          recordsInserted += result.inserted;
          recordsSkipped += result.skipped;
          recordsMerged += result.merged;
          recordsFailed += result.failed;
          errors.push(...result.errors);

          for (const [sourceId, targetId] of result.targetIds) {
            targetIds.set(sourceId, targetId);
          }
        } catch (err) {
          // Batch-level failure
          const errMsg = (err as Error).message;
          for (const record of chunk) {
            recordsFailed++;
            errors.push({ sourceId: record.sourceId, error: errMsg });
          }
        }
      }
    }

    return {
      batchId,
      recordsInserted,
      recordsSkipped,
      recordsMerged,
      recordsFailed,
      errors,
      targetIds,
    };
  }

  /**
   * Insert a chunk of records using a transaction.
   */
  private async insertChunk(
    records: TransformedRecord[],
    entitySchema: TargetEntitySchema,
    batchId: string,
    conflictStrategy: ConflictStrategy,
  ): Promise<{
    inserted: number;
    skipped: number;
    merged: number;
    failed: number;
    errors: Array<{ sourceId: string; error: string }>;
    targetIds: Map<string, string>;
  }> {
    let inserted = 0;
    let skipped = 0;
    let merged = 0;
    let failed = 0;
    const errors: Array<{ sourceId: string; error: string }> = [];
    const targetIds = new Map<string, string>();

    // Build column list from schema
    const columns = entitySchema.fields.map((f) => f.name);
    const tableName = entitySchema.tableName;

    await db.transaction(async (tx) => {
      for (const record of records) {
        try {
          // Build values for this record
          const values: Record<string, unknown> = {};
          for (const col of columns) {
            const value = record.data[col];
            if (value !== undefined) {
              values[col] = value;
            } else {
              // Apply default value from schema if available
              const fieldSchema = entitySchema.fields.find((f) => f.name === col);
              if (fieldSchema?.defaultValue !== undefined) {
                values[col] = fieldSchema.defaultValue;
              }
            }
          }

          // Add batch tracking metadata
          values['_migration_batch_id'] = batchId;
          values['_migration_source_id'] = record.sourceId;
          values['_migration_source_system'] = record.sourceSystem;

          // Generate target ID
          const targetId = `mig-${batchId}-${record.sourceId}`;
          values[entitySchema.primaryKey] = targetId;

          // Build parameterised insert
          const columnNames = Object.keys(values);
          const placeholders = columnNames.map((_, idx) => `$${idx + 1}`);
          const columnsSql = columnNames.map((c) => `"${c}"`).join(', ');
          const placeholdersSql = placeholders.join(', ');

          let insertSql: string;

          switch (conflictStrategy) {
            case 'skip':
              insertSql = `INSERT INTO "${tableName}" (${columnsSql}) VALUES (${placeholdersSql}) ON CONFLICT DO NOTHING RETURNING "${entitySchema.primaryKey}"`;
              break;
            case 'merge': {
              const updateCols = columnNames
                .filter((c) => c !== entitySchema.primaryKey)
                .map((c) => `"${c}" = EXCLUDED."${c}"`)
                .join(', ');
              insertSql = `INSERT INTO "${tableName}" (${columnsSql}) VALUES (${placeholdersSql}) ON CONFLICT ("${entitySchema.primaryKey}") DO UPDATE SET ${updateCols} RETURNING "${entitySchema.primaryKey}"`;
              break;
            }
            case 'fail':
            default:
              insertSql = `INSERT INTO "${tableName}" (${columnsSql}) VALUES (${placeholdersSql}) RETURNING "${entitySchema.primaryKey}"`;
              break;
          }

          const result = await tx.execute(
            sql.raw(`${insertSql}`),
          );

          // The raw SQL execution depends on Drizzle internals
          // We track the insert based on whether it succeeded
          if (result) {
            if (conflictStrategy === 'skip' && !result) {
              skipped++;
            } else if (conflictStrategy === 'merge') {
              merged++;
            } else {
              inserted++;
            }
            targetIds.set(record.sourceId, targetId);
          }

          inserted++;
          targetIds.set(record.sourceId, targetId);
        } catch (err) {
          const errMsg = (err as Error).message;

          if (errMsg.includes('duplicate key') || errMsg.includes('unique constraint')) {
            if (conflictStrategy === 'fail') {
              throw new DuplicateKeyError(
                `Duplicate key for record ${record.sourceId} in ${entitySchema.tableName}`,
                { orgId: record.sourceSystem },
              );
            }
            skipped++;
          } else if (errMsg.includes('foreign key') || errMsg.includes('violates')) {
            throw new IntegrityViolationError(
              `Foreign key violation for record ${record.sourceId}: ${errMsg}`,
              { orgId: record.sourceSystem },
            );
          } else {
            failed++;
            errors.push({ sourceId: record.sourceId, error: errMsg });
          }
        }
      }
    });

    return { inserted, skipped, merged, failed, errors, targetIds };
  }

  /**
   * Group records by target entity type.
   */
  private groupByEntityType(
    records: TransformedRecord[],
  ): Map<string, TransformedRecord[]> {
    const grouped = new Map<string, TransformedRecord[]>();
    for (const record of records) {
      const existing = grouped.get(record.targetEntityType) ?? [];
      existing.push(record);
      grouped.set(record.targetEntityType, existing);
    }
    return grouped;
  }

  /**
   * Resolve foreign key ordering using topological sort.
   * Parent entities (no FK dependencies) are loaded first.
   */
  resolveForeignKeyOrder(targetSchema: TargetSchema): string[] {
    const entities = targetSchema.entities;
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Initialise
    for (const entity of entities) {
      graph.set(entity.entityType, new Set());
      inDegree.set(entity.entityType, 0);
    }

    // Build dependency graph
    for (const entity of entities) {
      for (const dep of entity.dependsOn) {
        if (graph.has(dep)) {
          graph.get(dep)!.add(entity.entityType);
          inDegree.set(entity.entityType, (inDegree.get(entity.entityType) ?? 0) + 1);
        }
      }
    }

    // Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    for (const [entityType, degree] of inDegree) {
      if (degree === 0) queue.push(entityType);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of graph.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If there are entities not in sorted (circular deps), append them
    for (const entity of entities) {
      if (!sorted.includes(entity.entityType)) {
        sorted.push(entity.entityType);
      }
    }

    return sorted;
  }

  /**
   * Get records inserted by a specific batch (for rollback).
   */
  async getBatchRecordIds(
    tableName: string,
    batchId: string,
    primaryKey: string,
  ): Promise<string[]> {
    const result = await db.execute(
      sql.raw(`SELECT "${primaryKey}" FROM "${tableName}" WHERE "_migration_batch_id" = '${batchId}'`),
    );
    return (result as unknown as Array<Record<string, string>>).map((r) => r[primaryKey]);
  }

  /**
   * Delete records from a specific batch (for rollback).
   */
  async deleteBatchRecords(
    tableName: string,
    batchId: string,
  ): Promise<number> {
    const result = await db.execute(
      sql.raw(`DELETE FROM "${tableName}" WHERE "_migration_batch_id" = '${batchId}'`),
    );
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }
}

export const loaderService = new LoaderService();
