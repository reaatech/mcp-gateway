/**
 * mcp-gateway — Middleware Pipeline Barrel Exports
 */

export {
  Pipeline,
  createPipeline,
} from './pipeline.js';

export {
  request_idMiddleware,
} from './request-id.js';

export {
  loggingMiddleware,
  logUpstreamCall,
} from './logging.js';

export {
  error_handlerMiddleware,
  formatJsonRpcError,
  categoryToErrorCode,
  categoryToHttpStatus,
  JSONRPC_ERRORS,
} from './error-handler.js';

export {
  timeoutMiddleware,
  withTimeout,
} from './timeout.js';

export {
  createCategorizedError,
} from './types.js';

export type {
  PipelineContext,
  MiddlewareFn,
  ErrorCategory,
  CategorizedError,
  TimeoutOptions,
  LoggingOptions,
  RequestIdOptions,
} from './types.js';
