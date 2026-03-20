import { z } from 'zod';

// ── Ontology Node (Neo4j property graph representation) ──────────

export const OntologyNode = z.object({
  id: z.string(),
  orgId: z.string(),
  label: z.string(),
  entityType: z.string(),
  name: z.string(),
  description: z.string().optional(),
  properties: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  sourceEntities: z.array(z.string()),
  department: z.string().optional(),
  hierarchyLevel: z.number().optional(),
});

export type OntologyNode = z.infer<typeof OntologyNode>;

// ── Ontology Relationship ────────────────────────────────────────

export const OntologyRelationship = z.object({
  id: z.string(),
  orgId: z.string(),
  type: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  properties: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export type OntologyRelationship = z.infer<typeof OntologyRelationship>;

// ── Ghost Process (detected by Process Archaeology) ──────────────

export const GhostProcess = z.object({
  id: z.string(),
  orgId: z.string(),
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
  status: z.enum(['detected', 'confirmed', 'dismissed']),
});

export type GhostProcess = z.infer<typeof GhostProcess>;

// ── Ontology Summary (for Business in Numbers dashboard) ─────────

export const OntologySummary = z.object({
  orgId: z.string(),
  version: z.string(),
  totalEntities: z.number(),
  totalRelationships: z.number(),
  entityBreakdown: z.record(z.number()),
  departmentBreakdown: z.record(z.number()),
  toolInventory: z.array(z.object({
    name: z.string(),
    category: z.string(),
    entityCount: z.number(),
  })),
  ghostProcesses: z.number(),
  confidenceDistribution: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
});

export type OntologySummary = z.infer<typeof OntologySummary>;
