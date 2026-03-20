/**
 * Base error class for all Nexus errors.
 *
 * Error hierarchy:
 *   NexusError (abstract)
 *   ├── ConnectorError        (module: connector-hub)
 *   │   ├── OAuthProviderError
 *   │   ├── OAuthConsentDeniedError
 *   │   ├── SyncTimeoutError
 *   │   ├── RateLimitError
 *   │   ├── SchemaEvolutionError
 *   │   ├── TokenExpiredError
 *   │   ├── PartialSyncError
 *   │   ├── FileCorruptError
 *   │   ├── FileSizeLimitError
 *   │   └── CyclicSyncError
 *   ├── OntologyError         (module: ontology-engine)
 *   │   ├── LLMParseError
 *   │   ├── LLMRefusalError
 *   │   ├── LLMTimeoutError
 *   │   ├── ContextOverflowError
 *   │   ├── HallucinationError
 *   │   ├── EntityConflictError
 *   │   └── InsufficientDataError
 *   ├── CanvasError           (module: process-canvas)
 *   │   ├── BPMNValidationError
 *   │   ├── CanvasOverflowError
 *   │   └── UnmappedProcessError
 *   ├── OptimiserError        (module: optimisation-engine)
 *   ├── DesignerError         (module: target-designer)
 *   │   └── SemanticValidationError
 *   ├── SpecError             (module: spec-generator)
 *   ├── BuildError            (module: build-engine)
 *   │   ├── AgentDeadlockError
 *   │   ├── TokenBudgetError
 *   │   ├── MergeConflictError
 *   │   ├── SecurityViolationError
 *   │   └── DeployTimeoutError
 *   └── MigrationError        (module: migration-engine)
 *       ├── AmbiguousMappingError
 *       ├── IntegrityViolationError
 *       ├── DuplicateKeyError
 *       └── RollbackFailureError
 */
export abstract class NexusError extends Error {
  abstract readonly module: string;
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  abstract readonly retryable: boolean;

  readonly orgId?: string;
  readonly cause?: Error;
  readonly timestamp: Date;

  constructor(message: string, options?: { orgId?: string; cause?: Error }) {
    super(message);
    this.name = this.constructor.name;
    this.orgId = options?.orgId;
    this.cause = options?.cause;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      module: this.module,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      orgId: this.orgId,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// ── Module 1: Connector Hub ──────────────────────────────────────

export abstract class ConnectorError extends NexusError {
  readonly module = 'connector-hub' as const;
}

export class OAuthProviderError extends ConnectorError {
  readonly code = 'OAUTH_PROVIDER_DOWN';
  readonly httpStatus = 502;
  readonly retryable = true;
}

export class OAuthConsentDeniedError extends ConnectorError {
  readonly code = 'OAUTH_CONSENT_DENIED';
  readonly httpStatus = 403;
  readonly retryable = false;
}

export class SyncTimeoutError extends ConnectorError {
  readonly code = 'SYNC_TIMEOUT';
  readonly httpStatus = 504;
  readonly retryable = true;
}

export class RateLimitError extends ConnectorError {
  readonly code = 'RATE_LIMIT';
  readonly httpStatus = 429;
  readonly retryable = true;
}

export class SchemaEvolutionError extends ConnectorError {
  readonly code = 'SCHEMA_CHANGED';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class TokenExpiredError extends ConnectorError {
  readonly code = 'TOKEN_EXPIRED';
  readonly httpStatus = 401;
  readonly retryable = true;
}

export class PartialSyncError extends ConnectorError {
  readonly code = 'PARTIAL_SYNC';
  readonly httpStatus = 206;
  readonly retryable = true;
}

export class FileCorruptError extends ConnectorError {
  readonly code = 'FILE_CORRUPT';
  readonly httpStatus = 422;
  readonly retryable = false;
}

export class FileSizeLimitError extends ConnectorError {
  readonly code = 'FILE_SIZE_LIMIT';
  readonly httpStatus = 413;
  readonly retryable = false;
}

export class CyclicSyncError extends ConnectorError {
  readonly code = 'CYCLIC_SYNC';
  readonly httpStatus = 508;
  readonly retryable = false;
}

// ── Module 2: Ontology Engine ────────────────────────────────────

export abstract class OntologyError extends NexusError {
  readonly module = 'ontology-engine' as const;
}

export class LLMParseError extends OntologyError {
  readonly code = 'LLM_PARSE_FAILED';
  readonly httpStatus = 502;
  readonly retryable = true;
}

export class LLMRefusalError extends OntologyError {
  readonly code = 'LLM_REFUSAL';
  readonly httpStatus = 502;
  readonly retryable = true;
}

export class LLMTimeoutError extends OntologyError {
  readonly code = 'LLM_TIMEOUT';
  readonly httpStatus = 504;
  readonly retryable = true;
}

export class ContextOverflowError extends OntologyError {
  readonly code = 'CONTEXT_OVERFLOW';
  readonly httpStatus = 413;
  readonly retryable = true;
}

export class HallucinationError extends OntologyError {
  readonly code = 'HALLUCINATION_DETECTED';
  readonly httpStatus = 422;
  readonly retryable = true;
}

export class EntityConflictError extends OntologyError {
  readonly code = 'ENTITY_CONFLICT';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class InsufficientDataError extends OntologyError {
  readonly code = 'INSUFFICIENT_DATA';
  readonly httpStatus = 422;
  readonly retryable = false;
}

// ── Module 4: Process Canvas ─────────────────────────────────────

export abstract class CanvasError extends NexusError {
  readonly module = 'process-canvas' as const;
}

export class BPMNValidationError extends CanvasError {
  readonly code = 'BPMN_INVALID';
  readonly httpStatus = 422;
  readonly retryable = true;
}

export class CanvasOverflowError extends CanvasError {
  readonly code = 'CANVAS_OVERFLOW';
  readonly httpStatus = 413;
  readonly retryable = false;
}

export class UnmappedProcessError extends CanvasError {
  readonly code = 'UNMAPPED_PROCESS';
  readonly httpStatus = 422;
  readonly retryable = false;
}

// ── Module 5: Optimisation Engine ────────────────────────────────

export abstract class OptimiserError extends NexusError {
  readonly module = 'optimisation-engine' as const;
}

// ── Module 6: Target Designer ────────────────────────────────────

export abstract class DesignerError extends NexusError {
  readonly module = 'target-designer' as const;
}

export class SemanticValidationError extends DesignerError {
  readonly code = 'SEMANTIC_INVALID';
  readonly httpStatus = 422;
  readonly retryable = false;
}

// ── Module 7: Spec Generator ─────────────────────────────────────

export abstract class SpecError extends NexusError {
  readonly module = 'spec-generator' as const;
}

// ── Module 8: Build Engine ───────────────────────────────────────

export abstract class BuildError extends NexusError {
  readonly module = 'build-engine' as const;
}

export class AgentDeadlockError extends BuildError {
  readonly code = 'AGENT_DEADLOCK';
  readonly httpStatus = 504;
  readonly retryable = true;
}

export class TokenBudgetError extends BuildError {
  readonly code = 'TOKEN_BUDGET_EXCEEDED';
  readonly httpStatus = 402;
  readonly retryable = false;
}

export class MergeConflictError extends BuildError {
  readonly code = 'MERGE_CONFLICT';
  readonly httpStatus = 409;
  readonly retryable = true;
}

export class SecurityViolationError extends BuildError {
  readonly code = 'SECURITY_VIOLATION';
  readonly httpStatus = 422;
  readonly retryable = false;
}

export class DeployTimeoutError extends BuildError {
  readonly code = 'DEPLOY_TIMEOUT';
  readonly httpStatus = 504;
  readonly retryable = true;
}

// ── Module 9: Migration Engine ───────────────────────────────────

export abstract class MigrationError extends NexusError {
  readonly module = 'migration-engine' as const;
}

export class AmbiguousMappingError extends MigrationError {
  readonly code = 'AMBIGUOUS_MAPPING';
  readonly httpStatus = 422;
  readonly retryable = false;
}

export class IntegrityViolationError extends MigrationError {
  readonly code = 'INTEGRITY_VIOLATION';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class DuplicateKeyError extends MigrationError {
  readonly code = 'DUPLICATE_KEY';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class RollbackFailureError extends MigrationError {
  readonly code = 'ROLLBACK_FAILED';
  readonly httpStatus = 500;
  readonly retryable = false;
}
