import { z } from 'zod';
import type { OntologyNode, OntologyRelationship, GhostProcess, OntologySummary } from '@nexus/contracts/ontology';
import type { NormalisedEntity } from '@nexus/contracts/entities';

// ── Re-exports from contracts ─────────────────────────────────────
export type { OntologyNode, OntologyRelationship, GhostProcess, OntologySummary, NormalisedEntity };

// ── Extraction Pipeline Types ─────────────────────────────────────

/** Input chunk for Stage 1 per-source extraction */
export interface SourceChunk {
  sourceSystem: string;
  entities: NormalisedEntity[];
}

/** Stage 1 output: extracted entities per source */
export const ExtractedEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  name: z.string(),
  description: z.string().optional(),
  properties: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  sourceEntityIds: z.array(z.string()),
  department: z.string().optional(),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

export const Stage1OutputSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
  sourceSystem: z.string(),
});
export type Stage1Output = z.infer<typeof Stage1OutputSchema>;

/** Stage 2 output: deduplicated entities */
export const DeduplicationResultSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
  merges: z.array(z.object({
    keptId: z.string(),
    mergedIds: z.array(z.string()),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});
export type DeduplicationResult = z.infer<typeof DeduplicationResultSchema>;

/** Stage 3 output: inferred relationships */
export const InferredRelationshipSchema = z.object({
  id: z.string(),
  type: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  properties: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  reasoning: z.string(),
});
export type InferredRelationship = z.infer<typeof InferredRelationshipSchema>;

export const Stage3OutputSchema = z.object({
  relationships: z.array(InferredRelationshipSchema),
});
export type Stage3Output = z.infer<typeof Stage3OutputSchema>;

/** Stage 4 output: hierarchy structure */
export const HierarchyEntrySchema = z.object({
  entityId: z.string(),
  parentEntityId: z.string().nullable(),
  hierarchyLevel: z.number(),
  hierarchyType: z.enum(['organisational', 'departmental', 'project', 'document']),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export type HierarchyEntry = z.infer<typeof HierarchyEntrySchema>;

export const Stage4OutputSchema = z.object({
  hierarchies: z.array(HierarchyEntrySchema),
  departmentAssignments: z.array(z.object({
    entityId: z.string(),
    department: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});
export type Stage4Output = z.infer<typeof Stage4OutputSchema>;

// ── Archaeology Types ─────────────────────────────────────────────

export const EmailPatternSchema = z.object({
  participants: z.array(z.string()),
  subject_pattern: z.string(),
  frequency: z.string(),
  day_of_week: z.number().optional(),
  time_of_day: z.string().optional(),
  occurrence_count: z.number(),
});
export type EmailPattern = z.infer<typeof EmailPatternSchema>;

export const FilePatternSchema = z.object({
  filename_pattern: z.string(),
  modifiers: z.array(z.string()),
  frequency: z.string(),
  day_of_week: z.number().optional(),
  occurrence_count: z.number(),
});
export type FilePattern = z.infer<typeof FilePatternSchema>;

export const CalendarPatternSchema = z.object({
  title_pattern: z.string(),
  participants: z.array(z.string()),
  frequency: z.string(),
  day_of_week: z.number().optional(),
  time_of_day: z.string().optional(),
  occurrence_count: z.number(),
});
export type CalendarPattern = z.infer<typeof CalendarPatternSchema>;

export const ArchaeologyInputSchema = z.object({
  emailPatterns: z.array(EmailPatternSchema),
  filePatterns: z.array(FilePatternSchema),
  calendarPatterns: z.array(CalendarPatternSchema),
});
export type ArchaeologyInput = z.infer<typeof ArchaeologyInputSchema>;

export const GhostProcessLLMOutputSchema = z.object({
  ghostProcesses: z.array(z.object({
    name: z.string(),
    description: z.string(),
    pattern: z.object({
      frequency: z.string(),
      dayOfWeek: z.number().optional(),
      timeOfDay: z.string().optional(),
      involvedEntities: z.array(z.string()),
      dataFlow: z.array(z.object({
        from: z.string(),
        to: z.string(),
        action: z.string(),
      })),
    }),
    evidence: z.array(z.object({
      source: z.string(),
      description: z.string(),
      occurrences: z.number(),
    })),
    confidence: z.number().min(0).max(1),
  })),
});
export type GhostProcessLLMOutput = z.infer<typeof GhostProcessLLMOutputSchema>;

// ── Validation Types ──────────────────────────────────────────────

export interface ValidationUpdate {
  entityId?: string;
  relationshipId?: string;
  ghostProcessId?: string;
  action: 'approve' | 'reject' | 'modify';
  modifications?: Record<string, unknown>;
  comment?: string;
}

export interface ValidationState {
  orgId: string;
  versionId: string;
  totalEntities: number;
  validatedEntities: number;
  approvedEntities: number;
  rejectedEntities: number;
  totalRelationships: number;
  validatedRelationships: number;
  totalGhostProcesses: number;
  validatedGhostProcesses: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

// ── Drift Types ───────────────────────────────────────────────────

export interface DriftChange {
  type: 'entity_added' | 'entity_removed' | 'entity_modified' | 'relationship_added' | 'relationship_removed' | 'relationship_modified';
  significance: 'low' | 'medium' | 'high';
  entityId?: string;
  relationshipId?: string;
  description: string;
  previousValue?: unknown;
  newValue?: unknown;
}

export interface DriftReport {
  orgId: string;
  changes: DriftChange[];
  overallSignificance: 'low' | 'medium' | 'high';
  timestamp: string;
}

// ── Pipeline State ────────────────────────────────────────────────

export type PipelineStage = 'extraction' | 'deduplication' | 'relationships' | 'hierarchy' | 'archaeology' | 'writing' | 'complete' | 'failed';

export interface PipelineProgress {
  orgId: string;
  versionId: string;
  stage: PipelineStage;
  progress: number; // 0-100
  entityCount: number;
  relationshipCount: number;
  ghostProcessCount: number;
  error?: string;
}

// ── Worker Job Data ───────────────────────────────────────────────

export interface GenerateJobData {
  orgId: string;
  triggeredBy: 'manual' | 'auto';
  userId?: string;
}

export interface ArchaeologyJobData {
  orgId: string;
  versionId: string;
}

export interface DriftJobData {
  orgId: string;
  currentVersionId: string;
  newEntityIds: string[];
}
