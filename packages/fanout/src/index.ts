/**
 * mcp-gateway — Fanout Module Barrel Exports
 * Multi-upstream routing and MCP client connections
 */

export {
  ConnectionPool,
  DEFAULT_POOL_CONFIG,
} from './connection-pool.js';
export {
  filterHealthyUpstreams,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  retryWithBackoff,
} from './failover-handler.js';
export {
  executeFanout,
  executeFanoutFirstSuccess,
  resetUpstreamCaller,
  setUpstreamCaller,
  type UpstreamCaller,
} from './fanout-router.js';
export {
  DEFAULT_HEALTH_CHECK_CONFIG,
  HealthChecker,
} from './health-checker.js';
export { aggregateResponses } from './response-aggregator.js';
export {
  calculateBackoff,
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  sendWithRetry,
} from './retry-logic.js';
export type {
  AggregationStrategy,
  ConnectionPoolConfig,
  FanOutResult,
  HealthCheckConfig,
  HealthStatus,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  RetryConfig,
  UpstreamCallResponse,
  UpstreamConfig,
  UpstreamResponse,
  UpstreamTarget,
} from './types.js';
export {
  createJsonRpcRequest,
  sendUpstreamRequest,
} from './upstream-client.js';
export {
  selectByHealth,
  selectRoundRobin,
  selectUpstreams,
  selectWeightedRandom,
} from './upstream-selector.js';
