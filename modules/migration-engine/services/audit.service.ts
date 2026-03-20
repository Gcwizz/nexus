import { db } from '@nexus/db';
import { auditLogs } from '@nexus/db/schema';
import { storage } from '@nexus/storage';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import type { AuditEntry, AuditSummary } from '../types.js';

// ── Audit Service ───────────────────────────────────────────────

export class AuditService {
  private buffer: AuditEntry[] = [];
  private readonly flushThreshold = 500;

  /**
   * Log a single migration audit entry.
   * Entries are buffered and flushed periodically for performance.
   */
  async logEntry(entry: AuditEntry): Promise<void> {
    this.buffer.push(entry);
    if (this.buffer.length >= this.flushThreshold) {
      await this.flush();
    }
  }

  /**
   * Log multiple audit entries at once.
   */
  async logEntries(entries: AuditEntry[]): Promise<void> {
    this.buffer.push(...entries);
    if (this.buffer.length >= this.flushThreshold) {
      await this.flush();
    }
  }

  /**
   * Flush buffered entries to S3 (immutable append-only log) and Postgres (summary).
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    // Group by migration ID
    const byMigration = new Map<string, AuditEntry[]>();
    for (const entry of entries) {
      const existing = byMigration.get(entry.migrationId) ?? [];
      existing.push(entry);
      byMigration.set(entry.migrationId, existing);
    }

    for (const [migrationId, migrationEntries] of byMigration) {
      // Write to S3 as append-only log
      const orgId = migrationEntries[0].batchId.split('-')[0] || 'unknown';
      await this.appendToS3Log(orgId, migrationId, migrationEntries);

      // Write summary to Postgres audit_logs table
      for (const entry of migrationEntries) {
        await db.insert(auditLogs).values({
          id: entry.id,
          orgId,
          module: 'migration-engine',
          action: `migration.record.${entry.action}`,
          resourceType: entry.entityType,
          resourceId: entry.targetId ?? entry.sourceId,
          details: {
            migrationId: entry.migrationId,
            batchId: entry.batchId,
            sourceSystem: entry.sourceSystem,
            sourceId: entry.sourceId,
            targetId: entry.targetId,
            transformations: entry.transformations,
            dedupMerges: entry.dedupMerges,
          },
        });
      }
    }
  }

  /**
   * Append entries to the immutable S3 audit log.
   */
  private async appendToS3Log(
    orgId: string,
    migrationId: string,
    entries: AuditEntry[],
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audit-${migrationId}-${timestamp}.jsonl`;

    // JSONL format (one JSON object per line) for streaming reads
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

    await storage.put(orgId, `migration-audit/${migrationId}`, filename, content);
  }

  /**
   * Get audit entries for a migration from S3.
   */
  async getAuditLog(
    orgId: string,
    migrationId: string,
    options?: {
      sourceSystem?: string;
      entityType?: string;
      action?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ entries: AuditEntry[]; total: number }> {
    const files = await storage.list(orgId, `migration-audit/${migrationId}`);
    const allEntries: AuditEntry[] = [];

    for (const file of files.sort()) {
      const content = await storage.get(orgId, `migration-audit/${migrationId}`, file);
      if (!content) continue;

      const lines = content.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          allEntries.push(entry);
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Apply filters
    let filtered = allEntries;
    if (options?.sourceSystem) {
      filtered = filtered.filter((e) => e.sourceSystem === options.sourceSystem);
    }
    if (options?.entityType) {
      filtered = filtered.filter((e) => e.entityType === options.entityType);
    }
    if (options?.action) {
      filtered = filtered.filter((e) => e.action === options.action);
    }

    const total = filtered.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    const entries = filtered.slice(offset, offset + limit);

    return { entries, total };
  }

  /**
   * Generate an audit summary for a migration.
   */
  async generateSummary(orgId: string, migrationId: string): Promise<AuditSummary> {
    const { entries } = await this.getAuditLog(orgId, migrationId, { limit: Number.MAX_SAFE_INTEGER });

    const byAction: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byEntityType: Record<string, number> = {};
    let startedAt = '';
    let completedAt = '';

    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
      bySource[entry.sourceSystem] = (bySource[entry.sourceSystem] ?? 0) + 1;
      byEntityType[entry.entityType] = (byEntityType[entry.entityType] ?? 0) + 1;

      if (!startedAt || entry.timestamp < startedAt) startedAt = entry.timestamp;
      if (!completedAt || entry.timestamp > completedAt) completedAt = entry.timestamp;
    }

    return {
      migrationId,
      orgId,
      totalEntries: entries.length,
      byAction,
      bySource,
      byEntityType,
      startedAt,
      completedAt,
    };
  }

  /**
   * Export audit trail as CSV.
   */
  async exportCSV(orgId: string, migrationId: string): Promise<string> {
    const { entries } = await this.getAuditLog(orgId, migrationId, { limit: Number.MAX_SAFE_INTEGER });

    const headers = [
      'id', 'migrationId', 'batchId', 'sourceSystem', 'sourceId',
      'targetId', 'entityType', 'action', 'transformations', 'dedupMerges', 'timestamp',
    ];

    const rows = entries.map((e) =>
      [
        e.id,
        e.migrationId,
        e.batchId,
        e.sourceSystem,
        e.sourceId,
        e.targetId ?? '',
        e.entityType,
        e.action,
        e.transformations.join(';'),
        e.dedupMerges.join(';'),
        e.timestamp,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Export audit trail as JSON.
   */
  async exportJSON(orgId: string, migrationId: string): Promise<string> {
    const { entries } = await this.getAuditLog(orgId, migrationId, { limit: Number.MAX_SAFE_INTEGER });
    return JSON.stringify(entries, null, 2);
  }
}

export const auditService = new AuditService();
