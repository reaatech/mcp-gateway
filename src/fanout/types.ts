/**
 * mcp-gateway — Fan-out Router Types
 */

/**
 * Aggregation strategy for fan-out responses
 */
export type AggregationStrategy = 'first-success' | 'all-wait' | 'majority-vote';

/**
 * Upstream server definition for fan-out
 */
export interface UpstreamTarget {
  name: string;
  url: string;
  weight?: number;
  timeoutMs?: number;
  healthy?: boolean;
}

/**
 * Individual upstream response in a fan-out
 */
export interface UpstreamResponse {
  upstream: string;
  success: boolean;
  response?: unknown;
  error?: string;
  latencyMs: number;
}

/**
 * Aggregated fan-out result
 */
export interface FanOutResult {
  strategy: AggregationStrategy;
  upstreamsContacted: number;
  successful: number;
  failed: number;
  responses: UpstreamResponse[];
  finalResponse?: unknown;
}
