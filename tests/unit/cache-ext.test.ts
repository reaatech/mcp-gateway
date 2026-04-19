/**
 * mcp-gateway — Cache Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { RedisCache } from '../../src/cache/redis-cache.js';
import type { CacheEntry } from '../../src/cache/types.js';

describe('RedisCache', () => {
  const createMockRedisClient = () => {
    const storage: Record<string, string> = {};
    return {
      get: vi.fn(async (key: string) => storage[key] || null),
      setex: vi.fn(async (key: string, _seconds: number, value: string) => {
        storage[key] = value;
      }),
      del: vi.fn(async (key: string) => {
        const existed = key in storage;
        delete storage[key];
        return existed ? 1 : 0;
      }),
      exists: vi.fn(async (key: string) => (key in storage ? 1 : 0)),
    };
  };

  describe('generateKey', () => {
    it('generates key with tenant, method, and params', () => {
      const key = RedisCache.generateKey('tenant1', 'tools/call', { name: 'test' });
      expect(key).toContain('tenant1');
      expect(key).toContain('tools/call');
    });

    it('generates key without params', () => {
      const key = RedisCache.generateKey('tenant1', 'tools/list');
      expect(key).toBe('tenant1:tools/list:');
    });

    it('generates different keys for different params', () => {
      const key1 = RedisCache.generateKey('tenant1', 'tools/call', { name: 'a' });
      const key2 = RedisCache.generateKey('tenant1', 'tools/call', { name: 'b' });
      expect(key1).not.toBe(key2);
    });
  });

  describe('get', () => {
    it('returns undefined for cache miss', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      const result = await cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns cached value on hit', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      const entry: CacheEntry = {
        key: 'test',
        value: { result: 'cached-data' },
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
      };
      await client.setex('mcp-gateway:cache:test', 60, JSON.stringify(entry));

      const result = await cache.get('test');
      expect(result).toEqual({ result: 'cached-data' });
    });

    it('increments miss counter on cache miss', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      await cache.get('nonexistent');
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('increments hit counter on cache hit', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      const entry: CacheEntry = {
        key: 'test',
        value: { result: 'data' },
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
      };
      await client.setex('mcp-gateway:cache:test', 60, JSON.stringify(entry));

      await cache.get('test');
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
    });
  });

  describe('set', () => {
    it('stores value with TTL', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      await cache.set('key1', { data: 'test' }, 300);

      expect(client.setex).toHaveBeenCalledWith(
        'mcp-gateway:cache:key1',
        300,
        expect.stringContaining('"data":"test"'),
      );
    });

    it('includes metadata in stored entry', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      await cache.set('key1', { data: 'test' }, 300, { tenantId: 'tenant-1' });

      expect(client.setex).toHaveBeenCalledWith(
        'mcp-gateway:cache:key1',
        300,
        expect.stringContaining('"tenantId":"tenant-1"'),
      );
    });
  });

  describe('delete', () => {
    it('returns true when key existed', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      await cache.set('key1', { data: 'test' }, 300);
      const result = await cache.delete('key1');

      expect(result).toBe(true);
    });

    it('returns false when key did not exist', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      const result = await cache.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('has', () => {
    it('returns true when key exists', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      await cache.set('key1', { data: 'test' }, 300);
      const result = await cache.has('key1');

      expect(result).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      const result = await cache.has('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns copy of stats object', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      const stats1 = cache.getStats();
      const stats2 = cache.getStats();

      expect(stats1).toEqual(stats2);
      expect(stats1).not.toBe(stats2);
    });

    it('tracks hits and misses', async () => {
      const client = createMockRedisClient();
      const cache = new RedisCache(client);

      await cache.get('miss');
      const entry: CacheEntry = {
        key: 'hit',
        value: { data: 'test' },
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
      };
      await client.setex('mcp-gateway:cache:hit', 60, JSON.stringify(entry));
      await cache.get('hit');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});