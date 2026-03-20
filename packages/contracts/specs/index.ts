import { z } from 'zod';

// ── Specification Module ─────────────────────────────────────────

export const SpecModule = z.object({
  id: z.string(),
  orgId: z.string(),
  specBundleId: z.string(),
  name: z.string(),
  department: z.string(),
  description: z.string(),

  dataModel: z.object({
    entities: z.array(z.object({
      name: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        constraints: z.array(z.string()).optional(),
      })),
      relationships: z.array(z.object({
        target: z.string(),
        type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
        required: z.boolean(),
      })),
    })),
  }),

  roles: z.array(z.object({
    name: z.string(),
    permissions: z.array(z.string()),
  })),

  businessRules: z.array(z.object({
    id: z.string(),
    description: z.string(),
    condition: z.string(),
    action: z.string(),
    priority: z.number(),
  })),

  apiContracts: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string(),
    description: z.string(),
    requestSchema: z.record(z.unknown()).optional(),
    responseSchema: z.record(z.unknown()).optional(),
  })),

  screens: z.array(z.object({
    name: z.string(),
    description: z.string(),
    route: z.string(),
    components: z.array(z.string()),
    dataRequired: z.array(z.string()),
    actionsAvailable: z.array(z.string()),
  })),

  acceptanceCriteria: z.array(z.object({
    id: z.string(),
    feature: z.string(),
    given: z.string(),
    when: z.string(),
    then: z.string(),
  })),

  integrations: z.array(z.object({
    system: z.string(),
    type: z.enum(['api', 'file', 'event', 'webhook']),
    direction: z.enum(['inbound', 'outbound', 'bidirectional']),
    dataMapping: z.record(z.string()),
  })),

  dependencies: z.array(z.string()),
});

export type SpecModule = z.infer<typeof SpecModule>;

// ── Specification Bundle ─────────────────────────────────────────

export const SpecBundle = z.object({
  id: z.string(),
  orgId: z.string(),
  designId: z.string(),
  modules: z.array(SpecModule),
  sharedComponents: z.array(z.object({
    name: z.string(),
    type: z.enum(['auth', 'rbac', 'audit', 'notifications', 'file-handling']),
    description: z.string(),
  })),
  dependencyGraph: z.record(z.array(z.string())),
  generatedAt: z.string().datetime(),
  status: z.enum(['draft', 'in_review', 'approved']),
});

export type SpecBundle = z.infer<typeof SpecBundle>;
