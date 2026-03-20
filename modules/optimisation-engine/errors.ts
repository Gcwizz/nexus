import { OptimiserError } from '@nexus/contracts/errors';

export class AnalysisFailedError extends OptimiserError {
  readonly code = 'ANALYSIS_FAILED';
  readonly httpStatus = 502;
  readonly retryable = true;
}

export class InsufficientProcessDataError extends OptimiserError {
  readonly code = 'INSUFFICIENT_PROCESS_DATA';
  readonly httpStatus = 422;
  readonly retryable = false;
}

export class RecommendationNotFoundError extends OptimiserError {
  readonly code = 'RECOMMENDATION_NOT_FOUND';
  readonly httpStatus = 404;
  readonly retryable = false;
}

export class AnalysisAlreadyRunningError extends OptimiserError {
  readonly code = 'ANALYSIS_ALREADY_RUNNING';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class InvalidStatusTransitionError extends OptimiserError {
  readonly code = 'INVALID_STATUS_TRANSITION';
  readonly httpStatus = 422;
  readonly retryable = false;
}
