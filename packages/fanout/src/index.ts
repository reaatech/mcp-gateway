/**
 * mcp-gateway — Fanout Module Barrel Exports
 * Multi-upstream routing and MCP client connections
 */

export {
  executeFanout,
  executeFanoutFirstSuccess,
  setUpstreamCaller,
  resetUpstreamCaller,
  type UpstreamCaller,
} from './fanout-router.js';

export { aggregateResponses } from './response-aggregator.js';

export {
  selectUpstreams,
  selectRoundRobin,
  selectWeightedRandom,
  selectByHealth,
} from './upstream-selector.js';

export {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  retryWithBackoff,
  filterHealthyUpstreams,
} from './failover-handler.js';

export {
  createJsonRpcRequest,
  sendUpstreamRequest,
} from './upstream-client.js';

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
  AggregationStrategy,
  UpstreamTarget,
  UpstreamResponse,
  UpstreamCallResponse,
  FanOutResult,
  HealthStatus,
  UpstreamConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  RetryConfig,
  ConnectionPoolConfig,
  HealthCheckConfig,
} from './types.js';
