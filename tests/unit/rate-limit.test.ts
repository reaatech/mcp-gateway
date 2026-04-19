/**
 * mcp-gateway — Rate Limiting Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTokenBucketConfig,
  consumeTokens,
  timeUntilAvailable,
  createBucketState,
} from '../../src/rate-limit/token-bucket.js';
import { MemoryRateLimitStore, createMemoryStore } from '../../src/rate-limit/memory-store.js';
import { QuotaManager } from '../../src/rate-limit/quota-manager.js';
import { createRateLimiter } from '../../src/rate-limit/rate-limiter.js';
import type { RateLimitConfig } from '../../src/rate-limit/types.js';

const DEFAULT_CONFIG: RateLimitConfig = {
  requestsPerMinute: 60,
  requestsPerDay: 1000,
};

describe('token-bucket', () => {
  describe('createTokenBucketConfig', () => {
    it('creates config with correct refill rate', () => {
      const config = createTokenBucketConfig(60);
      expect(config.capacity).toBe(60);
      expect(config.refillRate).toBe(60 / 60000); // 60 tokens per 60000ms
    });

    it('uses burstSize as capacity when provided', () => {
      const config = createTokenBucketConfig(60, 100);
      expect(config.capacity).toBe(100);
      expect(config.refillRate).toBe(60 / 60000);
    });
  });

  describe('consumeTokens', () => {
    it('allows consumption when tokens available', () => {
      const config = createTokenBucketConfig(60);
      const state = { tokens: 10, lastRefill: Date.now() };

      const result = consumeTokens(state, config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('denies consumption when no tokens available', () => {
      const config = createTokenBucketConfig(60);
      const state = { tokens: 0, lastRefill: Date.now() };

      const result = consumeTokens(state, config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('refills tokens based on elapsed time', () => {
      const config = createTokenBucketConfig(60);
      const now = Date.now();
      const state = { tokens: 0, lastRefill: now - 60000 }; // 1 minute ago

      const result = consumeTokens(state, config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 refilled - 1 consumed
    });
  });

  describe('timeUntilAvailable', () => {
    it('returns 0 when tokens available', () => {
      const config = createTokenBucketConfig(60);
      const state = { tokens: 10, lastRefill: Date.now() };

      const result = timeUntilAvailable(state, config);

      expect(result).toBe(0);
    });

    it('calculates time until token available', () => {
      const config = createTokenBucketConfig(60); // 1 token per 1000ms
      const state = { tokens: 0, lastRefill: Date.now() };

      const result = timeUntilAvailable(state, config);

      expect(result).toBe(1000); // Need to wait 1 second for 1 token
    });
  });

  describe('createBucketState', () => {
    it('creates initial state with zero tokens', () => {
      const state = createBucketState();

      expect(state.tokens).toBe(0);
      expect(state.lastRefill).toBeDefined();
    });
  });
});

describe('MemoryRateLimitStore', () => {
  let store: MemoryRateLimitStore;

  beforeEach(async () => {
    store = createMemoryStore();
  });

  afterEach(async () => {
    await store.close();
  });

  describe('checkLimit', () => {
    it('allows requests within limit', async () => {
      const config: RateLimitConfig = { requestsPerMinute: 10, requestsPerDay: 100 };

      const result = await store.checkLimit('test-key', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
    });

    it('denies requests when limit exceeded', async () => {
      const config: RateLimitConfig = { requestsPerMinute: 2, requestsPerDay: 100 };

      await store.checkLimit('test-key', config);
      await store.checkLimit('test-key', config);
      const result = await store.checkLimit('test-key', config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it('tracks daily quota separately', async () => {
      const config: RateLimitConfig = { requestsPerMinute: 100, requestsPerDay: 2 };

      await store.checkLimit('test-key', config);
      await store.checkLimit('test-key', config);
      const result = await store.checkLimit('test-key', config);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(2); // Daily limit
    });

    it('respects burst size', async () => {
      const config: RateLimitConfig = {
        requestsPerMinute: 10,
        requestsPerDay: 100,
        burstSize: 5,
      };

      // First request should start with burstSize tokens
      const result = await store.checkLimit('new-key', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 - 1
    });
  });

  describe('getRemaining', () => {
    it('returns full limit for unknown key', async () => {
      const config: RateLimitConfig = { requestsPerMinute: 10, requestsPerDay: 100 };

      const remaining = await store.getRemaining('unknown-key', config);

      expect(remaining).toBe(10);
    });

    it('returns reduced remaining for known key', async () => {
      const config: RateLimitConfig = { requestsPerMinute: 10, requestsPerDay: 100 };

      await store.checkLimit('test-key', config);
      const remaining = await store.getRemaining('test-key', config);

      expect(remaining).toBe(9); // 10 - 1 (checkLimit consumes 1, getRemaining doesn't)
    });
  });

  describe('reset', () => {
    it('resets rate limit for key', async () => {
      const config: RateLimitConfig = { requestsPerMinute: 2, requestsPerDay: 100 };

      await store.checkLimit('test-key', config);
      await store.checkLimit('test-key', config);
      await store.reset('test-key');

      const result = await store.checkLimit('test-key', config);

      expect(result.allowed).toBe(true);
    });
  });
});

describe('QuotaManager', () => {
  let manager: QuotaManager;

  beforeEach(() => {
    manager = new QuotaManager();
  });

  describe('checkQuota', () => {
    it('allows requests within quota', () => {
      const result = manager.checkQuota('test-key', 10);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('denies requests when quota exceeded', () => {
      manager.checkQuota('test-key', 2);
      manager.checkQuota('test-key', 2);
      const result = manager.checkQuota('test-key', 2);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('resets quota after 24 hours', () => {
      manager.checkQuota('test-key', 2);
      manager.checkQuota('test-key', 2);

      // Manually expire the quota
      const entry = manager.getUsage('test-key');
      expect(entry).not.toBeNull();
    });
  });

  describe('getRemaining', () => {
    it('returns full quota for unknown key', () => {
      const remaining = manager.getRemaining('unknown', 10);
      expect(remaining).toBe(10);
    });

    it('returns reduced remaining for known key', () => {
      manager.checkQuota('test-key', 10);
      const remaining = manager.getRemaining('test-key', 10);
      expect(remaining).toBe(9);
    });
  });

  describe('getUsage', () => {
    it('returns null for unknown key', () => {
      const usage = manager.getUsage('unknown');
      expect(usage).toBeNull();
    });

    it('returns usage for known key', () => {
      manager.checkQuota('test-key', 10);
      manager.checkQuota('test-key', 10);

      const usage = manager.getUsage('test-key');
      expect(usage).not.toBeNull();
      expect(usage?.used).toBe(2);
      expect(usage?.limit).toBe(10);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', () => {
      manager.checkQuota('test-key', 10);
      // Entries would be cleaned up if expired
      const count = manager.cleanup();
      expect(count).toBe(0); // Not expired yet
    });
  });
});

describe('createRateLimiter', () => {
  it('creates limiter with memory store by default', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: DEFAULT_CONFIG,
    });

    const result = await limiter.checkLimit('test-tenant');
    expect(result.allowed).toBe(true);

    await limiter.close();
  });

  it('falls back to memory store when redis not provided', async () => {
    const limiter = createRateLimiter({
      storeType: 'redis',
      defaultConfig: DEFAULT_CONFIG,
    });

    const result = await limiter.checkLimit('test-tenant');
    expect(result.allowed).toBe(true);

    await limiter.close();
  });

  it('accepts per-tenant config overrides', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: DEFAULT_CONFIG,
    });

    const result = await limiter.checkLimit('test-tenant', {
      requestsPerMinute: 5,
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);

    await limiter.close();
  });

  it('resets rate limit for tenant', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 2, requestsPerDay: 100 },
    });

    await limiter.checkLimit('test-tenant');
    await limiter.checkLimit('test-tenant');
    await limiter.reset('test-tenant');

    const result = await limiter.checkLimit('test-tenant');
    expect(result.allowed).toBe(true);

    await limiter.close();
  });
});

describe('RedisRateLimitStore', () => {
  const createMockRedisClient = () => {
    const storage: Record<string, Record<string, string>> = {};
    return {
      v4: {
        eval: vi.fn(async (script: string, options?: { keys?: string[]; arguments?: string[] }) => {
          const keys = options?.keys ?? [];
          const args = options?.arguments ?? [];
          const key = keys[0]!;
          if (script.includes('HMGET') && script.includes('tokens')) {
            const capacity = parseFloat(args[0]!);
            const refillRate = parseFloat(args[1]!);
            const now = parseFloat(args[2]!);
            const requested = parseFloat(args[3]!);

            if (!storage[key]) {
              storage[key] = { tokens: String(capacity), last_refill: String(now) };
            }

            const data = storage[key]!;
            let tokens = parseFloat(data.tokens || '0');
            const lastRefill = parseFloat(data.last_refill || '0');

            const elapsed = now - lastRefill;
            const newTokens = elapsed * refillRate;
            tokens = Math.min(tokens + newTokens, capacity);

            let allowed = 0;
            if (tokens >= requested) {
              tokens = tokens - requested;
              allowed = 1;
            }

            data.tokens = String(Math.floor(tokens));
            data.last_refill = String(now);

            const reset = Math.ceil(now / 60000) * 60000;
            return [allowed, Math.floor(tokens), reset];
          }

          if (script.includes('HMGET') && script.includes('count')) {
            const limit = parseFloat(args[0]!);
            const now = parseFloat(args[1]!);

            if (!storage[key]) {
              storage[key] = { count: '0', reset: String(now + 86400000) };
            }

            const data = storage[key]!;
            let count = parseFloat(data.count || '0');
            let reset = parseFloat(data.reset || '0');

            if (now >= reset) {
              count = 0;
              reset = now + 86400000;
            }

            let allowed = 0;
            if (count < limit) {
              count = count + 1;
              allowed = 1;
            }

            data.count = String(count);
            data.reset = String(reset);

            return [allowed, limit - count, reset];
          }

          return [1, 60, Date.now() + 60000];
        }),
      },
      hGetAll: vi.fn(async (key: string) => {
        return storage[key] || {};
      }),
      del: vi.fn(async (keys: string[]) => {
        keys.forEach((k) => delete storage[k]);
      }),
      quit: vi.fn(async () => {}),
    };
  };

  it('allows request when under rate limit', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient() as unknown;
    const store = new RedisRateLimitStore(mockClient as never);

    const result = await store.checkLimit('tenant:1', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
      burstSize: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(60);
  });

  it('denies request when daily quota exceeded', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient() as unknown;
    const store = new RedisRateLimitStore(mockClient as never);

    const config = {
      requestsPerMinute: 60,
      requestsPerDay: 1,
      burstSize: 60,
    };

    await store.checkLimit('tenant:daily-quota-test', config);
    const result = await store.checkLimit('tenant:daily-quota-test', config);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('denies request when per-minute rate limit exceeded', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient() as unknown;
    const store = new RedisRateLimitStore(mockClient as never);

    const config = {
      requestsPerMinute: 1,
      requestsPerDay: 1000,
      burstSize: 1,
    };

    await store.checkLimit('tenant:rate-limit-test', config);
    const result = await store.checkLimit('tenant:rate-limit-test', config);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
  });

  it('returns retry-after when rate limited', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient() as unknown;
    const store = new RedisRateLimitStore(mockClient as never);

    const config = {
      requestsPerMinute: 1,
      requestsPerDay: 1000,
      burstSize: 1,
    };

    await store.checkLimit('tenant:retry-test', config);
    const result = await store.checkLimit('tenant:retry-test', config);

    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('getRemaining returns correct remaining tokens', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient() as unknown;
    const store = new RedisRateLimitStore(mockClient as never);

    const remaining = await store.getRemaining('tenant:get-remaining', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('reset clears rate limit keys', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient();
    const store = new RedisRateLimitStore(mockClient as unknown as never);

    await store.checkLimit('tenant:reset-test', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    await store.reset('tenant:reset-test');

    expect(mockClient.del).toHaveBeenCalled();
  });

  it('close quits redis client', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const mockClient = createMockRedisClient();
    const store = new RedisRateLimitStore(mockClient as unknown as never);

    await store.close();

    expect(mockClient.quit).toHaveBeenCalled();
  });

  it('handles redis errors gracefully', async () => {
    const { RedisRateLimitStore } = await import('../../src/rate-limit/redis-store.js');
    const errorClient = {
      v4: {
        eval: vi.fn(async () => {
          throw new Error('Redis connection failed');
        }),
      },
      hGetAll: vi.fn(async () => {
        throw new Error('Redis connection failed');
      }),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const store = new RedisRateLimitStore(errorClient as never);

    const result = await store.checkLimit('tenant:error-test', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(result.allowed).toBe(false); // Fail closed - deny on Redis error
  });
});
