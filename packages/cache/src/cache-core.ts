/**
 * mcp-gateway — Framework-Agnostic Cache Core
 *
 * Orchestrates response cache lookups/stores against a backend-neutral
 * {@link CacheController}. The memory-backed {@link CacheManager} satisfies the
 * controller directly; {@link createRedisCacheController} wraps the existing
 * {@link RedisCache} so the Fastify path is Redis-backed.
 */

import type { GatewayRequestContext } from '@reaatech/mcp-gateway-core';
import { getTenantIdFromContext } from '@reaatech/mcp-gateway-core';
import { CacheManager } from './cache-manager.js';
import { RedisCache } from './redis-cache.js';
import type { CacheConfig, ToolCacheStrategy } from './types.js';

type MaybePromise<T> = T | Promise<T>;

/** Result of reading a key from a backend. */
export interface CacheReadResult {
  hit: boolean;
  value?: unknown;
  ttlRemaining?: number;
}

/**
 * Backend-neutral controller consumed by the cache core. Implemented directly
 * by {@link CacheManager} (memory) and by {@link createRedisCacheController}.
 */
export interface CacheController {
  isEnabled(): boolean;
  shouldBypass(headers?: Record<string, string>): boolean;
  generateKey(tenantId: string, method: string, params?: unknown): string;
  getTtlForTool(toolName: string): number;
  get(key: string): MaybePromise<CacheReadResult>;
  set(
    key: string,
    value: unknown,
    ttlSeconds: number,
    metadata?: { tool?: string; tenantId?: string },
  ): MaybePromise<void>;
}

/** Outcome of a cache lookup. */
export interface CacheLookupResult {
  /** True when caching does not apply (disabled, bypassed, no tenant/tool). */
  skip: boolean;
  key?: string;
  hit: boolean;
  value?: unknown;
  ttlRemaining?: number;
}

/**
 * Look up a request in the cache. Returns `skip: true` when caching does not
 * apply, otherwise the key plus hit/value.
 */
export async function cacheLookup(
  ctx: GatewayRequestContext,
  controller: CacheController,
): Promise<CacheLookupResult> {
  if (!controller.isEnabled()) {
    return { skip: true, hit: false };
  }
  if (controller.shouldBypass(ctx.headers as Record<string, string>)) {
    return { skip: true, hit: false };
  }

  const tenantId = getTenantIdFromContext(ctx);
  if (!tenantId) {
    return { skip: true, hit: false };
  }

  const toolName = ctx.toolName;
  if (!toolName) {
    return { skip: true, hit: false };
  }

  const method = ctx.method ?? (ctx.body as Record<string, unknown> | undefined)?.method;
  const params = (ctx.body as Record<string, unknown> | undefined)?.params;
  const key = controller.generateKey(tenantId, method as string, params);

  const result = await controller.get(key);
  return {
    skip: false,
    key,
    hit: result.hit,
    value: result.value,
    ttlRemaining: result.ttlRemaining,
  };
}

/**
 * Store a successful response under `key`. Error responses (objects with an
 * `error` field) are never cached.
 */
export async function cacheStore(
  ctx: GatewayRequestContext,
  controller: CacheController,
  key: string,
  value: unknown,
): Promise<void> {
  const toolName = ctx.toolName;
  if (!toolName) {
    return;
  }
  if (!value || typeof value !== 'object' || 'error' in value) {
    return;
  }

  const tenantId = getTenantIdFromContext(ctx);
  const ttl = controller.getTtlForTool(toolName);
  await controller.set(key, value, ttl, { tool: toolName, tenantId });
}

/**
 * Build a {@link CacheController} backed by Redis, reusing {@link CacheManager}'s
 * config logic (enabled/bypass/TTL/key strategy) while reading and writing
 * entries through the provided {@link RedisCache}.
 */
export function createRedisCacheController(
  redis: RedisCache,
  config: CacheConfig,
  strategies: ToolCacheStrategy[] = [],
): CacheController {
  const meta = new CacheManager(config);
  meta.setStrategies(strategies);

  return {
    isEnabled: () => meta.isEnabled(),
    shouldBypass: (headers) => meta.shouldBypass(headers),
    generateKey: (tenantId, method, params) => RedisCache.generateKey(tenantId, method, params),
    getTtlForTool: (toolName) => meta.getTtlForTool(toolName),
    get: async (key) => {
      const value = await redis.get(key);
      return { hit: value !== undefined, value };
    },
    set: (key, value, ttlSeconds, metadata) => redis.set(key, value, ttlSeconds, metadata),
  };
}
