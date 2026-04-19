/**
 * mcp-gateway — Fan-out Router Barrel Exports
 */

export {
  executeFanout,
  executeFanoutFirstSuccess,
  setUpstreamCaller,
  resetUpstreamCaller,
  defaultCaller,
} from './fanout-router.js';
export type { UpstreamCaller } from './fanout-router.js';

export {
  aggregateResponses,
} from './response-aggregator.js';

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
  getCircuitBreakerStatus,
} from './failover-handler.js';

export type {
  AggregationStrategy,
  UpstreamTarget,
  UpstreamResponse,
  FanOutResult,
} from './types.js';
