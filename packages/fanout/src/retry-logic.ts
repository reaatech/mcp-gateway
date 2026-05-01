/**
 * mcp-gateway — Retry Logic
 * Exponential backoff with jitter and idempotency key support for upstream requests
 */

import { randomUUID } from 'node:crypto';
import type { JsonRpcRequest, RetryConfig, UpstreamCallResponse, UpstreamConfig } from './types.js';
import { sendUpstreamRequest } from './upstream-client.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * 2 ** attempt;
  const delay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Full jitter: random value between 0 and delay
    return Math.floor(Math.random() * delay);
  }

  return delay;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(response: UpstreamCallResponse): boolean {
  // Network errors or timeouts are retryable
  if (!response.success && response.error) {
    const error = response.error.toLowerCase();
    return error.includes('timeout') || error.includes('network') || error.includes('aborted');
  }

  // HTTP 5xx errors are retryable
  if (response.response.error) {
    const code = response.response.error.code;
    return code >= -32099 && code <= -32000;
  }

  return false;
}

/**
 * Generate an idempotency key for a request
 */
export function generateIdempotencyKey(): string {
  return `idem_${randomUUID()}`;
}

/**
 * Attach an idempotency key to a JSON-RPC request if not already present
 */
export function withIdempotencyKey(request: JsonRpcRequest): JsonRpcRequest {
  const params = request.params as Record<string, unknown> | undefined;
  if (params && '_idempotencyKey' in params) {
    return request;
  }
  return {
    ...request,
    params: {
      ...(params ?? {}),
      _idempotencyKey: generateIdempotencyKey(),
    },
  };
}

/**
 * Send request with retry logic and optional idempotency key
 */
export async function sendWithRetry(
  config: UpstreamConfig,
  request: JsonRpcRequest,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  options: { idempotencyKey?: boolean } = {},
): Promise<UpstreamCallResponse> {
  let lastResponse: UpstreamCallResponse | null = null;
  const requestWithKey = options.idempotencyKey ? withIdempotencyKey(request) : request;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = calculateBackoff(attempt - 1, retryConfig);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const response = await sendUpstreamRequest(config, requestWithKey);
    lastResponse = response;

    // Success - return immediately
    if (response.success) {
      return response;
    }

    // Check if retryable
    if (!isRetryableError(response)) {
      return response;
    }

    // Will retry
  }

  return (
    lastResponse ?? {
      upstream: config.name,
      response: {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: `All ${retryConfig.maxRetries + 1} attempts failed`,
        },
      },
      durationMs: 0,
      success: false,
      error: `All ${retryConfig.maxRetries + 1} attempts failed`,
    }
  );
}
