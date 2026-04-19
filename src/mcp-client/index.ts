/**
 * mcp-gateway — MCP Client Barrel Exports
 */

export {
  createJsonRpcRequest,
  sendUpstreamRequest,
} from './upstream-client.js';

export {
  validateUpstreamUrl,
} from '../config/upstream-loader.js';

export {
  ConnectionPool,
  DEFAULT_POOL_CONFIG,
} from './connection-pool.js';

export {
  HealthChecker,
  DEFAULT_HEALTH_CHECK_CONFIG,
} from './health-checker.js';

export {
  sendWithRetry,
  calculateBackoff,
  isRetryableError,
  DEFAULT_RETRY_CONFIG,
} from './retry-logic.js';

export type {
  HealthStatus,
  UpstreamConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  RetryConfig,
  ConnectionPoolConfig,
  HealthCheckConfig,
  UpstreamResponse,
} from './types.js';
