/**
 * mcp-gateway — Cache Middleware (Express adapter)
 * Thin Express wrapper over the framework-agnostic cache core.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { NextFunction, Request, Response } from 'express';
import { cacheLookup, cacheStore } from './cache-core.js';
import type { CacheManager } from './cache-manager.js';

/**
 * Cache middleware factory (memory-backed via {@link CacheManager}).
 */
export function cacheMiddleware(cacheManager: CacheManager) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authContext = (req as unknown as { authContext?: { tenantId?: string } }).authContext;
    const ctx = buildRequestContext({
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      tenantId: authContext?.tenantId,
    });

    const lookup = await cacheLookup(ctx, cacheManager);
    if (lookup.skip || !lookup.key) {
      next();
      return;
    }

    const { key, hit, value, ttlRemaining } = lookup;

    if (hit) {
      res.set('X-Cache', 'HIT');
      if (ttlRemaining !== undefined) {
        res.set('X-Cache-TTL', String(Math.max(0, Math.floor(ttlRemaining / 1000))));
      }
      res.set('X-Cache-Key', key);
      res.json(value);
      return;
    }

    // Cache miss - continue to upstream, intercepting the response to cache it.
    res.set('X-Cache', 'MISS');
    res.set('X-Cache-Key', key);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      void cacheStore(ctx, cacheManager, key, body);
      return originalJson(body);
    };

    next();
  };
}
