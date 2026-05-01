/**
 * mcp-gateway — Redis Cache Implementation
 * Redis-backed cache for production deployments
 */

import type { CacheEntry, CacheStats } from './types.js';

/**
 * Redis cache interface (minimal, using redis or ioredis)
 */
interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
}

/**
 * Redis cache wrapper
 */
export class RedisCache {
  private client: RedisClient;
  private prefix: string;
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, evictions: 0 };

  constructor(client: RedisClient, prefix = 'mcp-gateway:cache:') {
    this.client = client;
    this.prefix = prefix;
  }

  /**
   * Generate cache key from request
   */
  static generateKey(tenantId: string, method: string, params?: unknown): string {
    const paramsStr = params ? JSON.stringify(params) : '';
    return `${tenantId}:${method}:${paramsStr}`;
  }

  private makeKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<unknown | undefined> {
    const fullKey = this.makeKey(key);
    const data = await this.client.get(fullKey);

    if (!data) {
      this.stats.misses++;
      return undefined;
    }

    try {
      const entry = JSON.parse(data) as CacheEntry;
      this.stats.hits++;
      return entry.value;
    } catch {
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Set value in cache
   */
  async set(
    key: string,
    value: unknown,
    ttlSeconds: number,
    metadata?: Partial<CacheEntry>,
  ): Promise<void> {
    const fullKey = this.makeKey(key);
    const entry: CacheEntry = {
      key,
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
      ...metadata,
    };

    await this.client.setex(fullKey, ttlSeconds, JSON.stringify(entry));
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    const result = await this.client.del(fullKey);
    return result > 0;
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    const result = await this.client.exists(fullKey);
    return result > 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
}
