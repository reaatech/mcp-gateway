/**
 * mcp-gateway — Rate Limiter Orchestrator
 * Factory and main interface for rate limiting
 */

import type { RateLimitConfig, RateLimitResult, RateLimitStore, RateLimitStoreType } from './types.js';
import { MemoryRateLimitStore } from './memory-store.js';
import { RedisRateLimitStore, type RedisClient } from './redis-store.js';
import { logger } from '../observability/logger.js';

/**
 * Rate limiter instance
 */
export class RateLimiter {
  private readonly store: RateLimitStore;
  private readonly defaultConfig: RateLimitConfig;

  constructor(store: RateLimitStore, defaultConfig: RateLimitConfig) {
    this.store = store;
    this.defaultConfig = defaultConfig;
  }

  async checkLimit(
    tenantId: string,
    config?: Partial<RateLimitConfig>,
  ): Promise<RateLimitResult> {
    const effectiveConfig = this.resolveConfig(config);
    const key = `ratelimit:${tenantId}`;
    return this.store.checkLimit(key, effectiveConfig);
  }

  async getRemaining(tenantId: string, config?: Partial<RateLimitConfig>): Promise<number> {
    const effectiveConfig = this.resolveConfig(config);
    const key = `ratelimit:${tenantId}`;
    return this.store.getRemaining(key, effectiveConfig);
  }

  async reset(tenantId: string): Promise<void> {
    const key = `ratelimit:${tenantId}`;
    return this.store.reset(key);
  }

  async close(): Promise<void> {
    return this.store.close();
  }

  private resolveConfig(override?: Partial<RateLimitConfig>): RateLimitConfig {
    const result: RateLimitConfig = {
      requestsPerMinute: override?.requestsPerMinute ?? this.defaultConfig.requestsPerMinute,
      requestsPerDay: override?.requestsPerDay ?? this.defaultConfig.requestsPerDay,
    };
    if (override?.burstSize !== undefined) {
      result.burstSize = override.burstSize;
    }
    return result;
  }
}

/**
 * Create a rate limiter with the specified store type
 */
export function createRateLimiter(options: {
  storeType: RateLimitStoreType;
  redisClient?: RedisClient;
  defaultConfig: RateLimitConfig;
}): RateLimiter {
  let store: RateLimitStore;

  if (options.storeType === 'redis' && options.redisClient) {
    store = new RedisRateLimitStore(options.redisClient);
  } else {
    if (options.storeType === 'redis' && !options.redisClient) {
      logger.warn('[RateLimiter] Redis client not provided, falling back to memory store');
    }
    store = new MemoryRateLimitStore();
  }

  return new RateLimiter(store, options.defaultConfig);
}
