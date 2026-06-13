/**
 * mcp-gateway — Rate Limit Middleware
 * Express middleware for rate limiting
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { NextFunction, Request, Response } from 'express';
import { checkRateLimit } from './rate-limit-core.js';
import type { RateLimiter } from './rate-limiter.js';
import type { RateLimitResult } from './types.js';

/**
 * Rate limit exceeded error response
 */
export function rateLimitErrorResponse(res: Response, result: RateLimitResult): void {
  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  res.set('X-RateLimit-Reset', String(result.reset));
  res.set('Retry-After', String(result.retryAfter ?? 60));

  res.status(429).json({
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
  });
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  res.set('X-RateLimit-Reset', String(result.reset));
}

/**
 * Create rate limit middleware
 */
export function createRateLimitMiddleware(limiter: RateLimiter) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authContext = (req as unknown as { authContext?: { tenantId: string } }).authContext;
    const ctx = buildRequestContext({
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      tenantId: authContext?.tenantId,
    });

    const decision = await checkRateLimit(ctx, limiter);

    if (decision.headers) {
      for (const [name, value] of Object.entries(decision.headers)) {
        res.set(name, value);
      }
    }

    if (decision.action === 'deny') {
      res.status(decision.status ?? 429).json(decision.body);
      return;
    }

    next();
  };
}
