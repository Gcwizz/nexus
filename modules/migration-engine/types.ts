import { z } from 'zod';

// ── Field Mapping ──────────────────────────────────────────────

export const FieldMappingConfidence = z.enum(['high', 'medium', 'low', 'manual']);
export type FieldMappingConfidence = z.infer<typeof FieldMappingConfidence>;

export const TransformationRule = z.object({
  type: z.enum([
    'type_cast',
    'date_format',
    'currency_convert',
    'string_format',
    'computed',
    'default_value',
    'lookup',
    'concatenate',
    'split',
    'regex_extract',
  ]),
  params: z.record(z.unknown()),
});
export type TransformationRule = z.infer<typeof TransformationRule>;

export const FieldMapping = z.object({
  id: z.string(),
  sourceField: z.string(),
  sourceEntityType: z.string(),
  targetField: z.string(),
  targetEntityType: z.string(),
  confidence: z.number().min(0).max(1),
  confidenceLevel: FieldMappingConfidence,
  matchMethod: z.enum(['exact_name', 'semantic', 'type_compatible', 'manual']),
  transformations: z.array(TransformationRule).default([]),
  approved: z.boolean().default(false),
  notes: z.string().optional(),
});
export type FieldMapping = z.infer<typeof FieldMapping>;

export const MappingSet = z.object({
  id: z.string(),
  migrationId: z.string(),
  orgId: z.string(),
  sourceEntityType: z.string(),
  targetEntityType: z.string(),
  mappings: z.array(FieldMapping),
  unmappedSourceFields: z.array(z.string()),
  unmappedTargetFields: z.array(z.string()),
  overallConfidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MappingSet = z.infer<typeof MappingSet>;

// ── Migration Job ──────────────────────────────────────────────

export type MigrationStatus =
  | 'pending'
  | 'mapping'
  | 'validating'
  | 'executing'
  | 'complete'
  | 'failed'
  | 'rolled_back';

export type BatchStatus =
  | 'pending'
  | 'extracting'
  | 'transforming'
  | 'validating'
  | 'deduplicating'
  | 'loading'
  | 'complete'
  | 'failed'
  | 'rolled_back';

export const MigrationBatch = z.object({
  id: z.string(),
  migrationId: z.string(),
  batchIndex: z.number(),
  sourceSystem: z.string(),
  entityType: z.string(),
  status: z.enum([
    'pending', 'extracting', 'transforming', 'validating',
    'deduplicating', 'loading', 'complete', 'failed', 'rolled_back',
  ]),
  recordCount: z.number().default(0),
  recordsLoaded: z.number().default(0),
  recordsFailed: z.number().default(0),
  offset: z.number().default(0),
  limit: z.number().default(1000),
  checkpoint: z.boolean().default(false),
  error: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});
export type MigrationBatch = z.infer<typeof MigrationBatch>;

export const MigrationJob = z.object({
  id: z.string(),
  orgId: z.string(),
  buildId: z.string(),
  status: z.enum([
    'pending', 'mapping', 'validating', 'executing',
    'complete', 'failed', 'rolled_back',
  ]),
  mappingSets: z.array(MappingSet).default([]),
  batches: z.array(MigrationBatch).default([]),
  recordsMigrated: z.number().default(0),
  recordsFailed: z.number().default(0),
  recordsTotal: z.number().default(0),
  dataQualityScore: z.number().min(0).max(1).optional(),
  batchSize: z.number().default(1000),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type MigrationJob = z.infer<typeof MigrationJob>;

// ── Extraction ─────────────────────────────────────────────────

export interface ExtractionPage {
  entities: SourceRecord[];
  hasMore: boolean;
  nextOffset: number;
  totalEstimate?: number;
}

export interface SourceRecord {
  id: string;
  sourceSystem: string;
  sourceId: string;
  entityType: string;
  data: Record<string, unknown>;
  extractedAt: string;
}

// ── Transformation ─────────────────────────────────────────────

export interface TransformedRecord {
  sourceId: string;
  sourceSystem: string;
  targetEntityType: string;
  data: Record<string, unknown>;
  transformationsApplied: string[];
  warnings: string[];
}

// ── Validation ─────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  record: TransformedRecord;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  field: string;
  constraint: string;
  message: string;
  value?: unknown;
}

export interface ValidationReport {
  migrationId: string;
  totalRecords: number;
  passCount: number;
  failCount: number;
  warningCount: number;
  commonIssues: Array<{
    issue: string;
    count: number;
    sampleFields: string[];
  }>;
  failedRecords: ValidationResult[];
  generatedAt: string;
}

// ── Deduplication ──────────────────────────────────────────────

export interface DedupMatch {
  recordA: TransformedRecord;
  recordB: TransformedRecord;
  matchScore: number;
  matchedFields: string[];
  mergeDecision: 'merged' | 'kept_both' | 'flagged';
}

export interface DedupResult {
  records: TransformedRecord[];
  merges: DedupMatch[];
  duplicatesFound: number;
  duplicatesMerged: number;
  flaggedForReview: number;
}

// ── Loading ────────────────────────────────────────────────────

export type ConflictStrategy = 'skip' | 'merge' | 'fail';

export interface LoadResult {
  batchId: string;
  recordsInserted: number;
  recordsSkipped: number;
  recordsMerged: number;
  recordsFailed: number;
  errors: Array<{ sourceId: string; error: string }>;
  targetIds: Map<string, string>;
}

// ── Audit ──────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  migrationId: string;
  batchId: string;
  sourceSystem: string;
  sourceId: string;
  targetId?: string;
  entityType: string;
  action: 'inserted' | 'merged' | 'skipped' | 'failed' | 'rolled_back';
  transformations: string[];
  dedupMerges: string[];
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface AuditSummary {
  migrationId: string;
  orgId: string;
  totalEntries: number;
  byAction: Record<string, number>;
  bySource: Record<string, number>;
  byEntityType: Record<string, number>;
  startedAt: string;
  completedAt?: string;
}

// ── Rollback ───────────────────────────────────────────────────

export interface RollbackResult {
  batchId: string;
  recordsRolledBack: number;
  recordsFailed: number;
  errors: Array<{ targetId: string; error: string }>;
  complete: boolean;
}

// ── Data Quality ───────────────────────────────────────────────

export interface DataQualityReport {
  migrationId: string;
  overallScore: number;
  duplicatesFound: number;
  duplicatesMerged: number;
  recordsRequiringReview: number;
  fieldCoverage: Record<string, number>;
  entityTypeCoverage: Record<string, { populated: number; total: number; percentage: number }>;
  issues: Array<{ category: string; severity: 'low' | 'medium' | 'high'; count: number; description: string }>;
  generatedAt: string;
}

// ── Target Schema (from build artifacts / spec bundle) ─────────

export const TargetFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'json', 'array', 'enum']),
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  enumValues: z.array(z.string()).optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  pattern: z.string().optional(),
  referencesEntity: z.string().optional(),
  referencesField: z.string().optional(),
});
export type TargetFieldSchema = z.infer<typeof TargetFieldSchema>;

export const TargetEntitySchema = z.object({
  entityType: z.string(),
  tableName: z.string(),
  fields: z.array(TargetFieldSchema),
  primaryKey: z.string(),
  dependsOn: z.array(z.string()).default([]),
});
export type TargetEntitySchema = z.infer<typeof TargetEntitySchema>;

export const TargetSchema = z.object({
  entities: z.array(TargetEntitySchema),
  version: z.string(),
  buildId: z.string(),
});
export type TargetSchema = z.infer<typeof TargetSchema>;

// ── LLM Schemas for semantic mapping ───────────────────────────

export const SemanticMappingInput = z.object({
  sourceFields: z.array(z.object({
    name: z.string(),
    sampleValues: z.array(z.unknown()).optional(),
    inferredType: z.string().optional(),
  })),
  targetFields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string().optional(),
  })),
  entityContext: z.string(),
});
export type SemanticMappingInput = z.infer<typeof SemanticMappingInput>;

export const SemanticMappingOutput = z.object({
  mappings: z.array(z.object({
    sourceField: z.string(),
    targetField: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    suggestedTransformation: z.string().optional(),
  })),
});
export type SemanticMappingOutput = z.infer<typeof SemanticMappingOutput>;

// ── Worker Job Data ────────────────────────────────────────────

export interface MigrateBatchJobData {
  orgId: string;
  migrationId: string;
  batchId: string;
  batchIndex: number;
  sourceSystem: string;
  entityType: string;
  offset: number;
  limit: number;
  batchSize: number;
  conflictStrategy: ConflictStrategy;
}

export interface MigrationCreateParams {
  orgId: string;
  buildId: string;
  batchSize?: number;
}
