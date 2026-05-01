/**
 * mcp-gateway — Cache Manager
 * Core cache orchestration with strategy-based TTL
 */

import { MemoryCache } from './memory-cache.js';
import type { CacheConfig, CacheStats, ToolCacheStrategy } from './types.js';

/**
 * Cache Manager - orchestrates caching with per-tool strategies
 */
export class CacheManager {
  private cache: MemoryCache;
  private config: CacheConfig;
  private strategies: ToolCacheStrategy[] = [];

  constructor(config: CacheConfig) {
    this.config = config;
    this.cache = new MemoryCache(config.maxEntries ?? 1000);
  }

  /**
   * Configure per-tool cache strategies
   */
  setStrategies(strategies: ToolCacheStrategy[]): void {
    this.strategies = strategies;
  }

  /**
   * Get TTL for a specific tool
   */
  getTtlForTool(toolName: string): number {
    for (const strategy of this.strategies) {
      for (const pattern of strategy.tools) {
        if (pattern === '*' || pattern === toolName) {
          return strategy.ttlSeconds;
        }
        // Wildcard matching
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        if (regex.test(toolName)) {
          return strategy.ttlSeconds;
        }
      }
    }
    return this.config.defaultTtlSeconds;
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Generate cache key
   */
  generateKey(tenantId: string, method: string, params?: unknown): string {
    return MemoryCache.generateKey(tenantId, method, params);
  }

  /**
   * Get from cache
   */
  get(key: string): { hit: boolean; value?: unknown; ttlRemaining?: number } {
    const result = this.cache.get(key);
    if (result.value !== undefined) {
      const ttl = result.expiresAt ? Math.max(0, result.expiresAt - Date.now()) : undefined;
      const ret: { hit: boolean; value: unknown; ttlRemaining?: number } = {
        hit: true,
        value: result.value,
      };
      if (ttl !== undefined) {
        ret.ttlRemaining = ttl;
      }
      return ret;
    }
    return { hit: false };
  }

  /**
   * Set in cache
   */
  set(
    key: string,
    value: unknown,
    ttlSeconds: number,
    metadata?: { tool?: string; tenantId?: string },
  ): void {
    this.cache.set(key, value, ttlSeconds, metadata);
  }

  /**
   * Delete from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Check if request should bypass cache
   */
  shouldBypass(headers?: Record<string, string>): boolean {
    if (!this.config.enabled) {
      return true;
    }
    if (headers?.['cache-control'] === 'no-cache') {
      return true;
    }
    return false;
  }
}
