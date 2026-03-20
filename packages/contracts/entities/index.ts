import { z } from 'zod';

// ── Entity Types ─────────────────────────────────────────────────

export const EntityType = {
  Person: 'person',
  Company: 'company',
  Department: 'department',
  Role: 'role',
  Transaction: 'transaction',
  Invoice: 'invoice',
  Product: 'product',
  Service: 'service',
  Document: 'document',
  Communication: 'communication',
  Project: 'project',
  Case: 'case',
  Supplier: 'supplier',
  Customer: 'customer',
  Employee: 'employee',
  Tool: 'tool',
  Process: 'process',
  Activity: 'activity',
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

// ── Normalised Entity (output of Module 1, input to Module 2) ───

export const NormalisedEntity = z.object({
  id: z.string(),
  orgId: z.string(),
  sourceId: z.string(),
  sourceSystem: z.string(),
  entityType: z.nativeEnum(EntityType),
  name: z.string(),
  properties: z.record(z.unknown()),
  extractedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
});

export type NormalisedEntity = z.infer<typeof NormalisedEntity>;

// ── Source Inventory ─────────────────────────────────────────────

export const ConnectedSource = z.object({
  id: z.string(),
  orgId: z.string(),
  provider: z.string(),
  displayName: z.string(),
  status: z.enum(['connected', 'syncing', 'error', 'disconnected']),
  entityCount: z.number().default(0),
  lastSyncAt: z.string().datetime().optional(),
  error: z.string().optional(),
});

export type ConnectedSource = z.infer<typeof ConnectedSource>;

// ── Data Provenance ──────────────────────────────────────────────

export const DataProvenance = z.object({
  entityId: z.string(),
  sourceSystem: z.string(),
  sourceId: z.string(),
  extractedAt: z.string().datetime(),
  transformations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type DataProvenance = z.infer<typeof DataProvenance>;
