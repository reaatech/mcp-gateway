/**
 * mcp-gateway — Fan-out Router
 * Main fan-out orchestration for broadcasting requests to multiple upstreams
 */

import { recordFailure, recordSuccess } from './failover-handler.js';
import { aggregateResponses } from './response-aggregator.js';
import type {
  AggregationStrategy,
  FanOutResult,
  UpstreamResponse,
  UpstreamTarget,
} from './types.js';
import type { JsonRpcRequest } from './types.js';
import { createJsonRpcRequest, sendUpstreamRequest } from './upstream-client.js';
import { selectUpstreams } from './upstream-selector.js';

/**
 * Function signature for the upstream caller. Exposed for test injection.
 */
export type UpstreamCaller = (
  upstream: UpstreamTarget,
  request: unknown,
  timeoutMs?: number,
) => Promise<UpstreamResponse>;

/**
 * Coerce an arbitrary request payload into a JSON-RPC request
 */
function toJsonRpcRequest(request: unknown): JsonRpcRequest {
  if (request && typeof request === 'object' && 'jsonrpc' in request && 'method' in request) {
    return request as JsonRpcRequest;
  }
  // Fall back to a minimal tools/call if given a method+params shape
  if (request && typeof request === 'object' && 'method' in request) {
    const req = request as { method: string; params?: unknown; id?: string | number };
    return createJsonRpcRequest(req.method, req.params, req.id);
  }
  throw new Error('Invalid upstream request: must be a JSON-RPC object with method');
}

/**
 * Default caller: translates fan-out shapes to the MCP upstream client
 */
export const defaultCaller: UpstreamCaller = async (
  upstream,
  request,
  timeoutMs,
): Promise<UpstreamResponse> => {
  const startTime = Date.now();
  try {
    const jsonRpcRequest = toJsonRpcRequest(request);
    const result = await sendUpstreamRequest(
      {
        name: upstream.name,
        url: upstream.url,
        timeoutMs: (timeoutMs ?? upstream.timeoutMs) as number,
      },
      jsonRpcRequest,
    );

    const response: UpstreamResponse = {
      upstream: upstream.name,
      success: result.success,
      latencyMs: result.durationMs,
    };
    if (result.response !== undefined) {
      response.response = result.response;
    }
    if (result.error !== undefined) {
      response.error = result.error;
    }
    return response;
  } catch (error) {
    return {
      upstream: upstream.name,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime,
    };
  }
};

/**
 * Active caller (mutable for test injection)
 */
let activeCaller: UpstreamCaller = defaultCaller;

/**
 * Override the upstream caller (primarily for tests)
 */
export function setUpstreamCaller(caller: UpstreamCaller): void {
  activeCaller = caller;
}

/**
 * Restore the default upstream caller
 */
export function resetUpstreamCaller(): void {
  activeCaller = defaultCaller;
}

/**
 * Execute fan-out request to multiple upstreams
 */
export async function executeFanout(
  upstreams: UpstreamTarget[],
  request: unknown,
  strategy: AggregationStrategy = 'first-success',
  defaultTimeoutMs = 30000,
): Promise<FanOutResult> {
  if (upstreams.length === 0) {
    return {
      strategy,
      upstreamsContacted: 0,
      successful: 0,
      failed: 0,
      responses: [],
    };
  }

  if (strategy === 'first-success') {
    return executeFanoutFirstSuccess(upstreams, request, defaultTimeoutMs);
  }

  const selected = selectUpstreams(upstreams);

  const promises = selected.map((upstream) => {
    const timeout = upstream.timeoutMs ?? defaultTimeoutMs;
    return activeCaller(upstream, request, timeout);
  });

  const settled = await Promise.allSettled(promises);
  const responses = settled.map((r) => {
    if (r.status === 'fulfilled') {
      const response = r.value;
      recordSuccess(response.upstream);
      return response;
    }
    const errorMsg = r.reason instanceof Error ? r.reason.message : 'Unknown error';
    recordFailure('unknown');
    return {
      upstream: 'unknown',
      success: false,
      error: errorMsg,
      latencyMs: 0,
    } as UpstreamResponse;
  });
  return aggregateResponses(responses, strategy);
}

/**
 * Execute fan-out with first-success strategy (returns early when first succeeds)
 */
export async function executeFanoutFirstSuccess(
  upstreams: UpstreamTarget[],
  request: unknown,
  defaultTimeoutMs = 30000,
): Promise<FanOutResult> {
  if (upstreams.length === 0) {
    return {
      strategy: 'first-success',
      upstreamsContacted: 0,
      successful: 0,
      failed: 0,
      responses: [],
    };
  }

  const selected = selectUpstreams(upstreams);

  let index = 0;
  for (const upstream of selected) {
    const timeout = upstream.timeoutMs ?? defaultTimeoutMs;
    const response = await activeCaller(upstream, request, timeout);

    if (response.success) {
      recordSuccess(upstream.name);
      return {
        strategy: 'first-success',
        upstreamsContacted: index + 1,
        successful: 1,
        failed: index,
        responses: [response],
        finalResponse: response.response,
      };
    }
    recordFailure(upstream.name);
    index++;
  }

  return {
    strategy: 'first-success',
    upstreamsContacted: selected.length,
    successful: 0,
    failed: selected.length,
    responses: [],
  };
}
