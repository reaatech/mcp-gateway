/**
 * mcp-gateway — Cache Unit Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { CacheManager } from './cache-manager.js';
import { createCacheStrategies, shouldCacheTool } from './cache-strategies.js';
import { MemoryCache } from './memory-cache.js';
import type { CacheConfig } from './types.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(100);
  });

  it('stores and retrieves values', () => {
    cache.set('key1', { data: 'test' }, 60);
    expect(cache.get('key1').value).toEqual({ data: 'test' });
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('missing').value).toBeUndefined();
  });

  it('respects TTL', () => {
    cache.set('expiring', 'value', 0); // 0 seconds = expires immediately
    // Small delay to ensure expiration
    const start = Date.now();
    while (Date.now() - start < 10) {
      /* busy wait */
    }
    expect(cache.get('expiring').value).toBeUndefined();
  });

  it('tracks hit/miss statistics', () => {
    cache.get('miss1');
    cache.get('miss2');
    cache.set('hit1', 'value', 60);
    cache.get('hit1');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
  });

  it('evicts oldest entries when at capacity', () => {
    const smallCache = new MemoryCache(3);
    smallCache.set('key1', 'value1', 60);
    smallCache.set('key2', 'value2', 60);
    smallCache.set('key3', 'value3', 60);
    smallCache.set('key4', 'value4', 60); // Should evict key1

    expect(smallCache.get('key1').value).toBeUndefined();
    expect(smallCache.get('key4').value).toBe('value4');
  });

  it('generates consistent cache keys', () => {
    const key1 = MemoryCache.generateKey('tenant1', 'tools/call', { name: 'test' });
    const key2 = MemoryCache.generateKey('tenant1', 'tools/call', { name: 'test' });
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex
  });

  it('generates different keys for different tenants', () => {
    const key1 = MemoryCache.generateKey('tenant1', 'tools/call', { name: 'test' });
    const key2 = MemoryCache.generateKey('tenant2', 'tools/call', { name: 'test' });
    expect(key1).not.toBe(key2);
  });
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    const config: CacheConfig = {
      enabled: true,
      defaultTtlSeconds: 300,
      maxEntries: 100,
    };
    cacheManager = new CacheManager(config);
  });

  it('is enabled when configured', () => {
    expect(cacheManager.isEnabled()).toBe(true);
  });

  it('generates cache keys', () => {
    const key = cacheManager.generateKey('tenant1', 'tools/call', { name: 'test' });
    expect(key).toHaveLength(64); // SHA-256 hex
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('caches and retrieves values', () => {
    const key = cacheManager.generateKey('tenant1', 'tools/call', { name: 'test' });
    cacheManager.set(key, { result: 'success' }, 60);

    const { hit, value } = cacheManager.get(key);
    expect(hit).toBe(true);
    expect(value).toEqual({ result: 'success' });
  });

  it('returns miss for uncached keys', () => {
    const { hit } = cacheManager.get('nonexistent');
    expect(hit).toBe(false);
  });

  it('respects cache bypass header', () => {
    expect(cacheManager.shouldBypass({ 'cache-control': 'no-cache' })).toBe(true);
    expect(cacheManager.shouldBypass({})).toBe(false);
  });

  it('returns default TTL for unknown tools', () => {
    expect(cacheManager.getTtlForTool('unknown_tool')).toBe(300);
  });

  it('uses strategy TTL for known tools', () => {
    cacheManager.setStrategies([{ tools: ['glean_search'], ttlSeconds: 60 }]);
    expect(cacheManager.getTtlForTool('glean_search')).toBe(60);
  });
});

describe('cache-strategies', () => {
  describe('createCacheStrategies', () => {
    it('returns default strategies when no config provided', () => {
      const strategies = createCacheStrategies();
      expect(strategies).toHaveLength(2);
      expect(strategies[0]?.tools).toContain('*_static');
    });

    it('uses provided config', () => {
      const custom = [{ tools: ['custom_*'], ttlSeconds: 120 }];
      const strategies = createCacheStrategies(custom);
      expect(strategies).toEqual(custom);
    });
  });

  describe('shouldCacheTool', () => {
    const strategies = [
      { tools: ['cacheable_*'], ttlSeconds: 60 },
      { tools: ['*_search'], ttlSeconds: 30 },
    ];

    it('caches tools matching patterns', () => {
      expect(shouldCacheTool('cacheable_tool', strategies)).toBe(true);
      expect(shouldCacheTool('glean_search', strategies)).toBe(true);
    });

    it('returns true when no strategies defined', () => {
      expect(shouldCacheTool('any_tool', [])).toBe(true);
    });
  });
});
