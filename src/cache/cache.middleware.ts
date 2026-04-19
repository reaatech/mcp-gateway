/**
 * mcp-gateway — Cache Middleware
 * Express middleware for response caching
 */

import type { Request, Response, NextFunction } from 'express';
import type { CacheManager } from './cache-manager.js';

/**
 * Extract tool name from MCP request body
 */
function extractToolName(body: unknown): string | null {
  if (!body || typeof body !== 'object') {return null;}
  const req = body as Record<string, unknown>;
  if (req.method !== 'tools/call') {return null;}
  const params = req.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== 'object') {return null;}
  const name = (params as Record<string, unknown>).name;
  if (typeof name === 'string') {return name;}
  return null;
}

/**
 * Cache middleware factory
 */
export function cacheMiddleware(cacheManager: CacheManager) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Check if caching is enabled
    if (!cacheManager.isEnabled()) {
      next();
      return;
    }

    // Check for cache bypass header
    if (cacheManager.shouldBypass(req.headers as Record<string, string>)) {
      next();
      return;
    }

    const tenantId = req.authContext?.tenantId;
    if (!tenantId) {
      next();
      return;
    }

    // Extract tool name
    const toolName = extractToolName(req.body);
    if (!toolName) {
      next();
      return;
    }

    // Generate cache key
    const cacheKey = cacheManager.generateKey(tenantId, req.body?.method as string, (req.body as Record<string, unknown>)?.params);

    // Check cache
    const { hit, value, ttlRemaining } = cacheManager.get(cacheKey);
    if (hit) {
      res.set('X-Cache', 'HIT');
      if (ttlRemaining !== undefined) {
        res.set('X-Cache-TTL', String(Math.max(0, Math.floor(ttlRemaining / 1000))));
      }
      res.set('X-Cache-Key', cacheKey);
      res.json(value);
      return;
    }

    // Cache miss - continue to upstream
    res.set('X-Cache', 'MISS');
    res.set('X-Cache-Key', cacheKey);

    // Store original json method
    const originalJson = res.json.bind(res);

    // Intercept response to cache it
    res.json = (body) => {
      // Only cache successful responses (no error field)
      if (body && typeof body === 'object' && !('error' in body)) {
        const ttl = cacheManager.getTtlForTool(toolName);
        cacheManager.set(cacheKey, body, ttl, { tool: toolName, tenantId });
      }
      return originalJson(body);
    };

    next();
  };
}
