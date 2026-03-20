import { z } from 'zod';

// ── Event Names ──────────────────────────────────────────────────

export const EventName = {
  DataIngestionComplete: 'data.ingestion.complete',
  OntologyReady: 'ontology.ready',
  OntologyValidated: 'ontology.validated',
  ProcessCanvasReady: 'process.canvas.ready',
  OptimisationComplete: 'optimisation.complete',
  TargetStateApproved: 'target.state.approved',
  SpecificationReady: 'specification.ready',
  BuildComplete: 'build.complete',
  MigrationComplete: 'migration.complete',
  // Living Twin events
  DriftDetected: 'drift.detected',
  IncrementalSyncComplete: 'sync.incremental.complete',
} as const;

export type EventName = (typeof EventName)[keyof typeof EventName];

// ── Event Payloads ───────────────────────────────────────────────

export const DataIngestionCompletePayload = z.object({
  orgId: z.string(),
  sourceInventory: z.array(z.object({
    sourceId: z.string(),
    sourceType: z.string(),
    entityCount: z.number(),
    status: z.enum(['complete', 'partial', 'failed']),
  })),
  totalEntities: z.number(),
  timestamp: z.string().datetime(),
});

export const OntologyReadyPayload = z.object({
  orgId: z.string(),
  ontologyVersion: z.string(),
  entityCount: z.number(),
  relationshipCount: z.number(),
  ghostProcessCount: z.number(),
  timestamp: z.string().datetime(),
});

export const OntologyValidatedPayload = z.object({
  orgId: z.string(),
  ontologyVersion: z.string(),
  validatedBy: z.string(),
  confidenceSummary: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  timestamp: z.string().datetime(),
});

export const ProcessCanvasReadyPayload = z.object({
  orgId: z.string(),
  canvasId: z.string(),
  processCounts: z.object({
    level0: z.number(),
    level1: z.number(),
    level2: z.number(),
    level3: z.number(),
    level4: z.number(),
  }),
  timestamp: z.string().datetime(),
});

export const OptimisationCompletePayload = z.object({
  orgId: z.string(),
  recommendationCount: z.number(),
  quickWinCount: z.number(),
  estimatedImpact: z.object({
    hoursPerWeek: z.number().optional(),
    costPerYear: z.number().optional(),
  }).optional(),
  timestamp: z.string().datetime(),
});

export const TargetStateApprovedPayload = z.object({
  orgId: z.string(),
  designId: z.string(),
  approvedBy: z.string(),
  changeCount: z.number(),
  timestamp: z.string().datetime(),
});

export const SpecificationReadyPayload = z.object({
  orgId: z.string(),
  specBundleId: z.string(),
  moduleCount: z.number(),
  timestamp: z.string().datetime(),
});

export const BuildCompletePayload = z.object({
  orgId: z.string(),
  buildId: z.string(),
  repoUrl: z.string(),
  deploymentEndpoints: z.record(z.string()),
  timestamp: z.string().datetime(),
});

export const MigrationCompletePayload = z.object({
  orgId: z.string(),
  migrationId: z.string(),
  recordsMigrated: z.number(),
  recordsFailed: z.number(),
  dataQualityScore: z.number().min(0).max(1),
  timestamp: z.string().datetime(),
});

export const DriftDetectedPayload = z.object({
  orgId: z.string(),
  driftType: z.enum(['entity_added', 'entity_removed', 'relationship_changed', 'process_diverged']),
  significance: z.enum(['low', 'medium', 'high']),
  description: z.string(),
  affectedEntities: z.array(z.string()),
  timestamp: z.string().datetime(),
});

// ── Type exports ─────────────────────────────────────────────────

export type DataIngestionCompletePayload = z.infer<typeof DataIngestionCompletePayload>;
export type OntologyReadyPayload = z.infer<typeof OntologyReadyPayload>;
export type OntologyValidatedPayload = z.infer<typeof OntologyValidatedPayload>;
export type ProcessCanvasReadyPayload = z.infer<typeof ProcessCanvasReadyPayload>;
export type OptimisationCompletePayload = z.infer<typeof OptimisationCompletePayload>;
export type TargetStateApprovedPayload = z.infer<typeof TargetStateApprovedPayload>;
export type SpecificationReadyPayload = z.infer<typeof SpecificationReadyPayload>;
export type BuildCompletePayload = z.infer<typeof BuildCompletePayload>;
export type MigrationCompletePayload = z.infer<typeof MigrationCompletePayload>;
export type DriftDetectedPayload = z.infer<typeof DriftDetectedPayload>;
