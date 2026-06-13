/**
 * mcp-gateway — Framework-Agnostic Rate Limit Core
 *
 * Reads the tenant from the normalized request context (populated by auth),
 * consumes the per-tenant token bucket, and returns an allow/deny decision.
 * When no tenant is identified the request is allowed through unchanged
 * (rate limiting is skipped), matching the existing Express behavior.
 */

import type { GatewayDecision, GatewayRequestContext } from '@reaatech/mcp-gateway-core';
import { getTenantIdFromContext } from '@reaatech/mcp-gateway-core';
import type { RateLimiter } from './rate-limiter.js';
import type { RateLimitResult } from './types.js';

/**
 * Standard `X-RateLimit-*` headers for a result.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  };
}

/**
 * JSON-RPC body returned when the limit is exceeded.
 */
export function rateLimitDenyBody(result: RateLimitResult): unknown {
  return {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32000,
      message: 'Rate limit exceeded',
      data: {
        retry_after: result.retryAfter,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      },
    },
  };
}

/**
 * Framework-agnostic rate limit check.
 *
 * - `allow` (with `X-RateLimit-*` headers) when under the limit, or when no
 *   tenant is identified.
 * - `deny` (429, `Retry-After` + headers + JSON-RPC body) when over the limit.
 */
export async function checkRateLimit(
  ctx: GatewayRequestContext,
  limiter: RateLimiter,
): Promise<GatewayDecision> {
  const tenantId = getTenantIdFromContext(ctx);
  if (!tenantId) {
    return { action: 'allow' };
  }

  const result = await limiter.checkLimit(tenantId);

  if (!result.allowed) {
    return {
      action: 'deny',
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        'Retry-After': String(result.retryAfter ?? 60),
      },
      body: rateLimitDenyBody(result),
    };
  }

  return { action: 'allow', headers: rateLimitHeaders(result) };
}
