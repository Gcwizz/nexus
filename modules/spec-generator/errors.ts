import { SpecError } from '@nexus/contracts/errors';

export class DecompositionError extends SpecError {
  readonly code = 'DECOMPOSITION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class DataModelGenerationError extends SpecError {
  readonly code = 'DATA_MODEL_GENERATION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class RBACGenerationError extends SpecError {
  readonly code = 'RBAC_GENERATION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class RulesExtractionError extends SpecError {
  readonly code = 'RULES_EXTRACTION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class ApiGenerationError extends SpecError {
  readonly code = 'API_GENERATION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class ScreenGenerationError extends SpecError {
  readonly code = 'SCREEN_GENERATION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class CriteriaGenerationError extends SpecError {
  readonly code = 'CRITERIA_GENERATION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class IntegrationGenerationError extends SpecError {
  readonly code = 'INTEGRATION_GENERATION_FAILED';
  readonly httpStatus = 500;
  readonly retryable = true;
}

export class TargetStateNotFoundError extends SpecError {
  readonly code = 'TARGET_STATE_NOT_FOUND';
  readonly httpStatus = 404;
  readonly retryable = false;
}

export class SpecBundleNotFoundError extends SpecError {
  readonly code = 'SPEC_BUNDLE_NOT_FOUND';
  readonly httpStatus = 404;
  readonly retryable = false;
}

export class SpecReviewError extends SpecError {
  readonly code = 'SPEC_REVIEW_FAILED';
  readonly httpStatus = 400;
  readonly retryable = false;
}
