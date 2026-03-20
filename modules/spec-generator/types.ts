import { z } from 'zod';
import type { SpecModule, SpecBundle } from '@nexus/contracts/specs';

// ── Spec Generation Options ─────────────────────────────────────

export type SpecFormat = 'markdown' | 'json';

export type SpecSectionKind =
  | 'overview'
  | 'requirements'
  | 'acceptance-criteria'
  | 'architecture'
  | 'data-model'
  | 'api-contract'
  | 'rbac'
  | 'business-rules'
  | 'screens'
  | 'integrations';

export interface SpecGenerationOptions {
  orgId: string;
  designId: string;
  format?: SpecFormat;
  includeSections?: SpecSectionKind[];
  detailLevel?: 'summary' | 'standard' | 'detailed';
}

export interface SpecGenerationResult {
  specBundleId: string;
  moduleCount: number;
  duration: number;
}

// ── Decomposition Types ─────────────────────────────────────────

export interface ModuleDefinition {
  name: string;
  department: string;
  description: string;
  processes: ProcessRef[];
  sharedConcerns: SharedConcern[];
  dependencies: string[];
}

export interface ProcessRef {
  id: string;
  name: string;
  department: string;
  swimlanes: string[];
  steps: ProcessStep[];
  gateways: Gateway[];
  externalSystems: string[];
}

export interface ProcessStep {
  id: string;
  name: string;
  type: 'user-task' | 'service-task' | 'send-task' | 'receive-task' | 'manual-task';
  performer: string;
  inputs: string[];
  outputs: string[];
  description: string;
}

export interface Gateway {
  id: string;
  name: string;
  type: 'exclusive' | 'inclusive' | 'parallel' | 'event-based';
  conditions: GatewayCondition[];
}

export interface GatewayCondition {
  expression: string;
  targetStepId: string;
  label: string;
}

export interface SharedConcern {
  name: string;
  type: 'auth' | 'rbac' | 'audit' | 'notifications' | 'file-handling';
  description: string;
}

// ── Data Model Types ────────────────────────────────────────────

export interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  relationships: RelationshipDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  constraints: string[];
}

export interface RelationshipDefinition {
  target: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  required: boolean;
}

// ── RBAC Types ──────────────────────────────────────────────────

export interface RoleDefinition {
  name: string;
  isAdmin: boolean;
  permissions: PermissionEntry[];
}

export interface PermissionEntry {
  entity: string;
  actions: ('create' | 'read' | 'update' | 'delete')[];
  conditions?: string;
}

export interface PermissionMatrix {
  roles: RoleDefinition[];
  entities: string[];
  matrix: Record<string, Record<string, ('create' | 'read' | 'update' | 'delete')[]>>;
}

// ── Business Rules Types ────────────────────────────────────────

export interface BusinessRule {
  id: string;
  description: string;
  condition: string;
  action: string;
  priority: number;
  sourceGatewayId?: string;
  exceptionPaths: ExceptionPath[];
}

export interface ExceptionPath {
  condition: string;
  action: string;
  description: string;
}

// ── API Contract Types ──────────────────────────────────────────

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  authentication: boolean;
  rateLimitPerMinute: number;
  sourceProcessStep?: string;
}

// ── Screen Types ────────────────────────────────────────────────

export interface ScreenDefinition {
  name: string;
  description: string;
  route: string;
  components: string[];
  dataRequired: string[];
  actionsAvailable: string[];
  formFields: FormField[];
  navigationTargets: string[];
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'password' | 'select' | 'checkbox' | 'textarea' | 'date' | 'file';
  required: boolean;
  validation?: string;
  options?: string[];
}

// ── Acceptance Criteria Types ───────────────────────────────────

export interface AcceptanceCriterion {
  id: string;
  feature: string;
  given: string;
  when: string;
  then: string;
  type: 'happy-path' | 'error-path' | 'edge-case';
  sourceProcessStepId?: string;
}

// ── Integration Types ───────────────────────────────────────────

export interface IntegrationSpec {
  system: string;
  type: 'api' | 'file' | 'event' | 'webhook';
  direction: 'inbound' | 'outbound' | 'bidirectional';
  dataMapping: Record<string, string>;
  errorHandling: ErrorHandlingStrategy;
  sourceSystemRef?: string;
}

export interface ErrorHandlingStrategy {
  retryPolicy: 'none' | 'exponential-backoff' | 'fixed-interval';
  maxRetries: number;
  deadLetterQueue: boolean;
  fallbackAction: string;
}

// ── Review Types ────────────────────────────────────────────────

export interface SpecReviewComment {
  moduleId: string;
  section: SpecSectionKind;
  comment: string;
  author: string;
  timestamp: string;
}

export interface SpecReviewSubmission {
  status: 'approved' | 'rejected';
  comments: SpecReviewComment[];
  reviewer: string;
}

// ── LLM Input/Output Schemas ────────────────────────────────────

export const DecompositionInput = z.object({
  targetState: z.unknown(),
  processes: z.array(z.unknown()),
  ontology: z.object({
    nodes: z.array(z.unknown()),
    relationships: z.array(z.unknown()),
  }),
});

export type DecompositionInput = z.infer<typeof DecompositionInput>;

export const DecompositionOutput = z.object({
  modules: z.array(z.object({
    name: z.string(),
    department: z.string(),
    description: z.string(),
    processIds: z.array(z.string()),
    sharedConcerns: z.array(z.object({
      name: z.string(),
      type: z.enum(['auth', 'rbac', 'audit', 'notifications', 'file-handling']),
      description: z.string(),
    })),
    dependencies: z.array(z.string()),
  })),
  sharedComponents: z.array(z.object({
    name: z.string(),
    type: z.enum(['auth', 'rbac', 'audit', 'notifications', 'file-handling']),
    description: z.string(),
  })),
  dependencyGraph: z.record(z.array(z.string())),
});

export type DecompositionOutput = z.infer<typeof DecompositionOutput>;

export const DataModelInput = z.object({
  moduleName: z.string(),
  department: z.string(),
  processes: z.array(z.unknown()),
  ontologyNodes: z.array(z.unknown()),
  ontologyRelationships: z.array(z.unknown()),
});

export type DataModelInput = z.infer<typeof DataModelInput>;

export const DataModelOutput = z.object({
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
});

export type DataModelOutput = z.infer<typeof DataModelOutput>;

export const RBACInput = z.object({
  moduleName: z.string(),
  processes: z.array(z.unknown()),
  entities: z.array(z.string()),
});

export type RBACInput = z.infer<typeof RBACInput>;

export const RBACOutput = z.object({
  roles: z.array(z.object({
    name: z.string(),
    permissions: z.array(z.string()),
  })),
});

export type RBACOutput = z.infer<typeof RBACOutput>;

export const RulesInput = z.object({
  moduleName: z.string(),
  processes: z.array(z.unknown()),
  gateways: z.array(z.unknown()),
});

export type RulesInput = z.infer<typeof RulesInput>;

export const RulesOutput = z.object({
  rules: z.array(z.object({
    id: z.string(),
    description: z.string(),
    condition: z.string(),
    action: z.string(),
    priority: z.number(),
  })),
});

export type RulesOutput = z.infer<typeof RulesOutput>;

export const ApiInput = z.object({
  moduleName: z.string(),
  entities: z.array(z.unknown()),
  processes: z.array(z.unknown()),
});

export type ApiInput = z.infer<typeof ApiInput>;

export const ApiOutput = z.object({
  endpoints: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string(),
    description: z.string(),
    requestSchema: z.record(z.unknown()).optional(),
    responseSchema: z.record(z.unknown()).optional(),
  })),
});

export type ApiOutput = z.infer<typeof ApiOutput>;

export const ScreensInput = z.object({
  moduleName: z.string(),
  processes: z.array(z.unknown()),
  entities: z.array(z.unknown()),
  apiEndpoints: z.array(z.unknown()),
});

export type ScreensInput = z.infer<typeof ScreensInput>;

export const ScreensOutput = z.object({
  screens: z.array(z.object({
    name: z.string(),
    description: z.string(),
    route: z.string(),
    components: z.array(z.string()),
    dataRequired: z.array(z.string()),
    actionsAvailable: z.array(z.string()),
  })),
});

export type ScreensOutput = z.infer<typeof ScreensOutput>;

export const CriteriaInput = z.object({
  moduleName: z.string(),
  processes: z.array(z.unknown()),
  businessRules: z.array(z.unknown()),
  screens: z.array(z.unknown()),
});

export type CriteriaInput = z.infer<typeof CriteriaInput>;

export const CriteriaOutput = z.object({
  criteria: z.array(z.object({
    id: z.string(),
    feature: z.string(),
    given: z.string(),
    when: z.string(),
    then: z.string(),
  })),
});

export type CriteriaOutput = z.infer<typeof CriteriaOutput>;

export const IntegrationInput = z.object({
  moduleName: z.string(),
  processes: z.array(z.unknown()),
  externalSystems: z.array(z.string()),
});

export type IntegrationInput = z.infer<typeof IntegrationInput>;

export const IntegrationOutput = z.object({
  integrations: z.array(z.object({
    system: z.string(),
    type: z.enum(['api', 'file', 'event', 'webhook']),
    direction: z.enum(['inbound', 'outbound', 'bidirectional']),
    dataMapping: z.record(z.string()),
  })),
});

export type IntegrationOutput = z.infer<typeof IntegrationOutput>;
