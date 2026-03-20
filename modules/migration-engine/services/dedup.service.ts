import type { TransformedRecord, DedupMatch, DedupResult } from '../types.js';

// ── Dedup Configuration ─────────────────────────────────────────

interface DedupConfig {
  /** Levenshtein distance threshold for fuzzy name matching (0-1 normalised) */
  nameMatchThreshold: number;
  /** Fields to use for exact matching */
  exactMatchFields: string[];
  /** Fields to use for fuzzy matching */
  fuzzyMatchFields: string[];
  /** Score above which records are auto-merged */
  autoMergeThreshold: number;
  /** Score above which records are flagged for review */
  reviewThreshold: number;
}

const DEFAULT_CONFIG: DedupConfig = {
  nameMatchThreshold: 0.85,
  exactMatchFields: ['email', 'phone', 'businessId', 'taxId', 'registrationNumber'],
  fuzzyMatchFields: ['name', 'displayName', 'companyName', 'fullName', 'firstName', 'lastName'],
  autoMergeThreshold: 0.9,
  reviewThreshold: 0.7,
};

// ── Dedup Service ───────────────────────────────────────────────

export class DedupService {
  private config: DedupConfig;

  constructor(config: Partial<DedupConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Deduplicate a batch of transformed records.
   * Returns deduplicated records and a log of all merge decisions.
   */
  deduplicate(records: TransformedRecord[]): DedupResult {
    const merges: DedupMatch[] = [];
    const mergedIndices = new Set<number>();
    const result: TransformedRecord[] = [];

    for (let i = 0; i < records.length; i++) {
      if (mergedIndices.has(i)) continue;

      let currentRecord = records[i];
      let wasMerged = false;

      for (let j = i + 1; j < records.length; j++) {
        if (mergedIndices.has(j)) continue;

        const match = this.compareRecords(currentRecord, records[j]);
        if (!match) continue;

        if (match.matchScore >= this.config.autoMergeThreshold) {
          // Auto-merge: newest record wins for conflicting fields
          currentRecord = this.mergeRecords(currentRecord, records[j]);
          match.mergeDecision = 'merged';
          mergedIndices.add(j);
          wasMerged = true;
        } else if (match.matchScore >= this.config.reviewThreshold) {
          match.mergeDecision = 'flagged';
        } else {
          match.mergeDecision = 'kept_both';
        }

        merges.push(match);
      }

      if (wasMerged) {
        currentRecord.transformationsApplied.push('dedup_merge');
      }

      result.push(currentRecord);
    }

    return {
      records: result,
      merges,
      duplicatesFound: merges.length,
      duplicatesMerged: merges.filter((m) => m.mergeDecision === 'merged').length,
      flaggedForReview: merges.filter((m) => m.mergeDecision === 'flagged').length,
    };
  }

  /**
   * Compare two records and return a match result if they appear to be duplicates.
   */
  compareRecords(a: TransformedRecord, b: TransformedRecord): DedupMatch | null {
    // Only compare records of the same entity type
    if (a.targetEntityType !== b.targetEntityType) return null;

    let totalScore = 0;
    let fieldCount = 0;
    const matchedFields: string[] = [];

    // Exact matching on identifiers
    for (const field of this.config.exactMatchFields) {
      const valA = this.getFieldValue(a, field);
      const valB = this.getFieldValue(b, field);

      if (valA && valB) {
        fieldCount++;
        if (this.normaliseValue(valA) === this.normaliseValue(valB)) {
          totalScore += 1.0;
          matchedFields.push(field);
        }
      }
    }

    // Fuzzy matching on names
    for (const field of this.config.fuzzyMatchFields) {
      const valA = this.getFieldValue(a, field);
      const valB = this.getFieldValue(b, field);

      if (valA && valB && typeof valA === 'string' && typeof valB === 'string') {
        fieldCount++;
        const similarity = this.fuzzyNameMatch(valA, valB);
        if (similarity >= this.config.nameMatchThreshold) {
          totalScore += similarity;
          matchedFields.push(field);
        }
      }
    }

    if (fieldCount === 0 || matchedFields.length === 0) return null;

    const matchScore = totalScore / fieldCount;

    if (matchScore < this.config.reviewThreshold) return null;

    return {
      recordA: a,
      recordB: b,
      matchScore,
      matchedFields,
      mergeDecision: 'kept_both', // Will be updated by caller
    };
  }

  /**
   * Merge two records using "newest wins" strategy.
   * Arrays are concatenated and deduplicated.
   */
  mergeRecords(primary: TransformedRecord, secondary: TransformedRecord): TransformedRecord {
    const mergedData: Record<string, unknown> = { ...primary.data };

    for (const [key, secondaryValue] of Object.entries(secondary.data)) {
      const primaryValue = mergedData[key];

      if (primaryValue === undefined || primaryValue === null || primaryValue === '') {
        // Primary is empty, use secondary
        mergedData[key] = secondaryValue;
      } else if (Array.isArray(primaryValue) && Array.isArray(secondaryValue)) {
        // Concatenate arrays and deduplicate
        const combined = [...primaryValue, ...secondaryValue];
        mergedData[key] = [...new Set(combined.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v));
      }
      // Otherwise, primary (newest) wins — keep existing value
    }

    return {
      sourceId: primary.sourceId,
      sourceSystem: primary.sourceSystem,
      targetEntityType: primary.targetEntityType,
      data: mergedData,
      transformationsApplied: [
        ...primary.transformationsApplied,
        `merged_with:${secondary.sourceId}`,
      ],
      warnings: [
        ...primary.warnings,
        ...secondary.warnings,
      ],
    };
  }

  // ── Private helpers ────────────────────────────────────────────

  private getFieldValue(record: TransformedRecord, field: string): unknown {
    return record.data[field];
  }

  private normaliseValue(value: unknown): string {
    return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Fuzzy name matching using normalised Levenshtein distance.
   */
  fuzzyNameMatch(a: string, b: string): number {
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();

    if (normA === normB) return 1.0;

    const maxLen = Math.max(normA.length, normB.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshtein(normA, normB);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance between two strings.
   */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    // Use single-row optimisation for memory efficiency
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array<number>(n + 1);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }
}

export const dedupService = new DedupService();
