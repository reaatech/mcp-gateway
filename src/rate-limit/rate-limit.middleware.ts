/**
 * mcp-gateway — Rate Limit Middleware
 * Express middleware for rate limiting
 */

import type { Request, Response, NextFunction } from 'express';
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
    const tenantId = (req as unknown as { authContext?: { tenantId: string } }).authContext?.tenantId;

    if (!tenantId) {
      // No tenant identified, skip rate limiting
      next();
      return;
    }

    const result = await limiter.checkLimit(tenantId);

    if (!result.allowed) {
      rateLimitErrorResponse(res, result);
      return;
    }

    addRateLimitHeaders(res, result);
    next();
  };
}
