import { storage } from '@nexus/storage';
import type { NormalisedEntity } from '@nexus/contracts/entities';
import type { ExtractionPage, SourceRecord } from '../types.js';

// ── Extraction Service ──────────────────────────────────────────

export class ExtractionService {
  /**
   * List available source systems that have data in S3 for this org.
   */
  async listSources(orgId: string): Promise<string[]> {
    const files = await storage.list(orgId, 'entities');
    // Files follow pattern: {sourceSystem}-{entityType}-{page}.json
    const sources = new Set<string>();
    for (const file of files) {
      const parts = file.split('-');
      if (parts.length >= 2) {
        sources.add(parts[0]);
      }
    }
    return Array.from(sources);
  }

  /**
   * List entity types available from a specific source system.
   */
  async listEntityTypes(orgId: string, sourceSystem: string): Promise<string[]> {
    const files = await storage.list(orgId, 'entities');
    const types = new Set<string>();
    for (const file of files) {
      if (file.startsWith(`${sourceSystem}-`)) {
        const parts = file.replace(`${sourceSystem}-`, '').split('-');
        if (parts.length >= 1) {
          types.add(parts[0]);
        }
      }
    }
    return Array.from(types);
  }

  /**
   * Count total entities for a source system and entity type.
   */
  async countEntities(orgId: string, sourceSystem: string, entityType: string): Promise<number> {
    const files = await storage.list(orgId, 'entities');
    let count = 0;
    for (const file of files) {
      if (file.startsWith(`${sourceSystem}-${entityType}-`)) {
        const data = await storage.getJSON<NormalisedEntity[]>(orgId, 'entities', file);
        if (data) count += data.length;
      }
    }
    return count;
  }

  /**
   * Extract a page of entities from S3 storage.
   * Reads normalised entities stored by Module 1 (Connector Hub).
   */
  async extractPage(
    orgId: string,
    sourceSystem: string,
    entityType: string,
    offset: number,
    limit: number,
  ): Promise<ExtractionPage> {
    // List all entity files for this source/type
    const files = await storage.list(orgId, 'entities');
    const relevantFiles = files
      .filter((f) => f.startsWith(`${sourceSystem}-${entityType}-`))
      .sort();

    // Accumulate entities across files
    const allEntities: NormalisedEntity[] = [];
    for (const file of relevantFiles) {
      const data = await storage.getJSON<NormalisedEntity[]>(orgId, 'entities', file);
      if (data) allEntities.push(...data);
    }

    const totalEstimate = allEntities.length;
    const pageEntities = allEntities.slice(offset, offset + limit);
    const hasMore = offset + limit < totalEstimate;

    const records: SourceRecord[] = pageEntities.map((entity) => ({
      id: entity.id,
      sourceSystem: entity.sourceSystem,
      sourceId: entity.sourceId,
      entityType: entity.entityType,
      data: {
        name: entity.name,
        ...entity.properties,
      },
      extractedAt: entity.extractedAt,
    }));

    return {
      entities: records,
      hasMore,
      nextOffset: offset + limit,
      totalEstimate,
    };
  }

  /**
   * Extract all entities for a source/type combination.
   * Yields pages for batch processing.
   */
  async *extractAll(
    orgId: string,
    sourceSystem: string,
    entityType: string,
    batchSize: number = 1000,
  ): AsyncGenerator<ExtractionPage> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await this.extractPage(orgId, sourceSystem, entityType, offset, batchSize);
      yield page;
      hasMore = page.hasMore;
      offset = page.nextOffset;
    }
  }

  /**
   * Get extraction progress summary for a migration.
   */
  async getExtractionSummary(orgId: string): Promise<{
    sources: Array<{
      sourceSystem: string;
      entityTypes: Array<{ entityType: string; count: number }>;
      totalCount: number;
    }>;
    grandTotal: number;
  }> {
    const sourceNames = await this.listSources(orgId);
    const sources: Array<{
      sourceSystem: string;
      entityTypes: Array<{ entityType: string; count: number }>;
      totalCount: number;
    }> = [];
    let grandTotal = 0;

    for (const sourceSystem of sourceNames) {
      const entityTypes = await this.listEntityTypes(orgId, sourceSystem);
      const typeCounts: Array<{ entityType: string; count: number }> = [];
      let sourceTotal = 0;

      for (const entityType of entityTypes) {
        const count = await this.countEntities(orgId, sourceSystem, entityType);
        typeCounts.push({ entityType, count });
        sourceTotal += count;
      }

      sources.push({
        sourceSystem,
        entityTypes: typeCounts,
        totalCount: sourceTotal,
      });
      grandTotal += sourceTotal;
    }

    return { sources, grandTotal };
  }
}

export const extractionService = new ExtractionService();
