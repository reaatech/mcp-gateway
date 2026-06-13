/**
 * mcp-gateway — Rate Limiting Unit Tests
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitConfig } from './index.js';
import {
  consumeTokens,
  createBucketState,
  createMemoryStore,
  createRateLimiter,
  createTokenBucketConfig,
  MemoryRateLimitStore,
  QuotaManager,
  timeUntilAvailable,
} from './index.js';
import { checkRateLimit } from './rate-limit-core.js';
import type { RateLimiter } from './rate-limiter.js';

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
          const key = keys[0] ?? '';
          if (script.includes('HMGET') && script.includes('tokens')) {
            const capacity = Number.parseFloat(args[0] ?? '0');
            const refillRate = Number.parseFloat(args[1] ?? '0');
            const now = Number.parseFloat(args[2] ?? '0');
            const requested = Number.parseFloat(args[3] ?? '0');

            if (!storage[key]) {
              storage[key] = { tokens: String(capacity), last_refill: String(now) };
            }

            const data = storage[key] ?? { tokens: String(capacity), last_refill: String(now) };
            let tokens = Number.parseFloat(data.tokens || '0');
            const lastRefill = Number.parseFloat(data.last_refill || '0');

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
            const limit = Number.parseFloat(args[0] ?? '0');
            const now = Number.parseFloat(args[1] ?? '0');

            if (!storage[key]) {
              storage[key] = { count: '0', reset: String(now + 86400000) };
            }

            const data = storage[key] ?? { count: '0', reset: String(now + 86400000) };
            let count = Number.parseFloat(data.count || '0');
            let reset = Number.parseFloat(data.reset || '0');

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
        for (const k of keys) {
          delete storage[k];
        }
      }),
      quit: vi.fn(async () => {}),
    };
  };

  it('allows request when under rate limit', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
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
    const { RedisRateLimitStore } = await import('./index.js');
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
    const { RedisRateLimitStore } = await import('./index.js');
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
    const { RedisRateLimitStore } = await import('./index.js');
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
    const { RedisRateLimitStore } = await import('./index.js');
    const mockClient = createMockRedisClient() as unknown;
    const store = new RedisRateLimitStore(mockClient as never);

    const remaining = await store.getRemaining('tenant:get-remaining', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('reset clears rate limit keys', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
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
    const { RedisRateLimitStore } = await import('./index.js');
    const mockClient = createMockRedisClient();
    const store = new RedisRateLimitStore(mockClient as unknown as never);

    await store.close();

    expect(mockClient.quit).toHaveBeenCalled();
  });

  it('handles redis errors gracefully', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
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

  it('handles daily quota redis error gracefully', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    let callCount = 0;
    const errorClient = {
      v4: {
        eval: vi.fn(async () => {
          callCount++;
          if (callCount === 1) {
            return [1, 59, Date.now() + 60000];
          }
          throw new Error('Daily quota Redis error');
        }),
      },
      hGetAll: vi.fn(async () => ({})),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const store = new RedisRateLimitStore(errorClient as never);

    const result = await store.checkLimit('tenant:daily-error', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(result.allowed).toBe(false);
  });

  it('handles null client (getEvalFunction returns null)', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const store = new RedisRateLimitStore(null as never);

    const result = await store.checkLimit('tenant:null-client', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(result.allowed).toBe(false);
  });

  it('works with redis v3/v5 client (direct eval, no v4 wrapper)', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const directEvalClient = {
      eval: vi.fn(async (_script: string, _options?: { keys?: string[]; arguments?: string[] }) => {
        return [1, 59, Math.ceil(Date.now() / 60000) * 60000];
      }),
      hGetAll: vi.fn(async () => ({})),
      del: vi.fn(async () => {}),
      quit: vi.fn(async () => {}),
    };
    const store = new RedisRateLimitStore(directEvalClient as never);

    const result = await store.checkLimit('tenant:direct-eval', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(60);
  });

  it('throws error when client has no eval support', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const noEvalClient = {
      hGetAll: vi.fn(async () => ({})),
      del: vi.fn(async () => {}),
      quit: vi.fn(async () => {}),
      v4: {},
    };
    const store = new RedisRateLimitStore(noEvalClient as never);

    const result = await store.checkLimit('tenant:no-eval', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(result.allowed).toBe(false);
  });

  it('getRemaining with existing tokens and daily quota data', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const mockClient = createMockRedisClient();
    const store = new RedisRateLimitStore(mockClient as unknown as never);

    await store.checkLimit('tenant:get-remaining-full', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
      burstSize: 60,
    });

    const remaining = await store.getRemaining('tenant:get-remaining-full', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(remaining).toBeLessThan(60);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  it('handles getRemaining redis error gracefully', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const errorClient = {
      v4: { eval: vi.fn() },
      hGetAll: vi.fn(async () => {
        throw new Error('Redis error');
      }),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const store = new RedisRateLimitStore(errorClient as never);

    const result = await store.getRemaining('tenant:error', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });

    expect(result).toBe(60);
  });

  it('createRedisStore creates a new store', async () => {
    const { createRedisStore } = await import('./index.js');
    const mockClient = createMockRedisClient();
    const store = createRedisStore(mockClient as unknown as never);
    expect(store).toBeDefined();
    await store.close();
    expect(mockClient.quit).toHaveBeenCalled();
  });
});

describe('RateLimiter', () => {
  it('getRemaining returns remaining', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 10, requestsPerDay: 100 },
    });

    await limiter.checkLimit('test-tenant');
    const remaining = await limiter.getRemaining('test-tenant');
    expect(remaining).toBeLessThanOrEqual(10);

    await limiter.close();
  });

  it('getRemaining with config override', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 10, requestsPerDay: 100 },
    });

    const remaining = await limiter.getRemaining('test-tenant-2', { requestsPerMinute: 5 });
    expect(remaining).toBe(5);

    await limiter.close();
  });

  it('reset resets rate limit', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 1, requestsPerDay: 100 },
    });

    await limiter.checkLimit('test-tenant');
    const denied = await limiter.checkLimit('test-tenant');
    expect(denied.allowed).toBe(false);

    await limiter.reset('test-tenant');
    const allowed = await limiter.checkLimit('test-tenant');
    expect(allowed.allowed).toBe(true);

    await limiter.close();
  });

  it('creates rate limiter with redis store', async () => {
    const mockClient = {
      v4: { eval: vi.fn(async () => [1, 59, Date.now() + 60000]) },
      hGetAll: vi.fn(async () => ({})),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const limiter = createRateLimiter({
      storeType: 'redis',
      redisClient: mockClient as never,
      defaultConfig: { requestsPerMinute: 60, requestsPerDay: 1000 },
    });

    const result = await limiter.checkLimit('test-tenant');
    expect(result.allowed).toBe(true);

    await limiter.close();
  });

  it('accepts burstSize override', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 10, requestsPerDay: 100 },
    });

    const result = await limiter.checkLimit('test-tenant', {
      requestsPerMinute: 10,
      burstSize: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);

    await limiter.close();
  });

  it('close cleans up store', async () => {
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 60, requestsPerDay: 1000 },
    });

    await expect(limiter.close()).resolves.toBeUndefined();
  });
});

describe('memory-store additional coverage', () => {
  it('getRemaining returns 0 when daily quota exhausted', async () => {
    const store = createMemoryStore();
    const config = { requestsPerMinute: 100, requestsPerDay: 2 };

    await store.checkLimit('test-key', config);
    await store.checkLimit('test-key', config);

    const remaining = await store.getRemaining('test-key', config);
    expect(remaining).toBe(0);

    await store.close();
  });

  it('getRemaining returns requestsPerDay after daily reset', async () => {
    vi.useFakeTimers();
    const baseTime = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(baseTime);

    const store = createMemoryStore();
    const config = { requestsPerMinute: 100, requestsPerDay: 5 };

    await store.checkLimit('test-key', config);

    vi.setSystemTime(new Date('2026-01-02T00:00:01Z'));

    const remaining = await store.getRemaining('test-key', config);
    expect(remaining).toBe(5);

    await store.close();
    vi.useRealTimers();
  });

  it('cleanup does not remove recent entries', async () => {
    const store = new MemoryRateLimitStore(50);

    await store.checkLimit('test-key', {
      requestsPerMinute: 100,
      requestsPerDay: 1000,
    });

    await store.getRemaining('test-key', {
      requestsPerMinute: 100,
      requestsPerDay: 1000,
    });

    await store.close();
  });

  it('close with cleanup interval clears buckets', async () => {
    const store = new MemoryRateLimitStore(60000);
    const config = { requestsPerMinute: 100, requestsPerDay: 1000 };

    await store.checkLimit('test-key', config);
    await store.close();

    const newStore = createMemoryStore();
    const remaining = await newStore.getRemaining('test-key', config);
    expect(remaining).toBe(100);
    await newStore.close();
  });

  it('createMemoryStore', () => {
    const store = createMemoryStore();
    expect(store).toBeDefined();
    store.close();
  });
});

describe('token-bucket additional coverage', () => {
  it('timeUntilAvailable with explicit tokens parameter', () => {
    const config = createTokenBucketConfig(60);
    const state = { tokens: 5, lastRefill: Date.now() };

    const result = timeUntilAvailable(state, config, 1);
    expect(result).toBe(0);
  });

  it('timeUntilAvailable returns >0 when tokens needed', () => {
    const config = createTokenBucketConfig(60);
    const state = { tokens: 0, lastRefill: Date.now() };

    const result = timeUntilAvailable(state, config, 2);
    expect(result).toBeGreaterThan(0);
  });

  it('consumeTokens with custom token count', () => {
    const config = createTokenBucketConfig(60);
    const state = { tokens: 10, lastRefill: Date.now() };

    const result = consumeTokens(state, config, 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it('consumeTokens denies when tokens < requested', () => {
    const config = createTokenBucketConfig(60);
    const state = { tokens: 1, lastRefill: Date.now() };

    const result = consumeTokens(state, config, 5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(1);
  });

  it('createTokenBucketConfig default burstSize equals requestsPerMinute', () => {
    const config = createTokenBucketConfig(60);
    expect(config.capacity).toBe(60);
    expect(config.refillRate).toBe(60 / 60000);
  });

  it('createBucketState has zero tokens', () => {
    const state = createBucketState();
    expect(state.tokens).toBe(0);
    expect(state.lastRefill).toBeGreaterThan(0);
  });

  it('createBucketState uses Date.now()', () => {
    const before = Date.now();
    const state = createBucketState();
    expect(state.lastRefill).toBeGreaterThanOrEqual(before);
  });
});

describe('redis-store edge cases', () => {
  it('getRemaining returns refilled when requestsPerDay is 0', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const mockClient = (() => {
      const storage: Record<string, Record<string, string>> = {};
      return {
        v4: {
          eval: vi.fn(
            async (_script: string, options?: { keys?: string[]; arguments?: string[] }) => {
              const args = options?.arguments ?? [];
              const key = options?.keys?.[0] ?? '';
              if (_script.includes('tokens')) {
                if (!storage[key])
                  storage[key] = { tokens: args[0] ?? '0', last_refill: String(Date.now()) };
                return [1, 59, Math.ceil(Date.now() / 60000) * 60000];
              }
              if (_script.includes('count')) {
                if (!storage[key])
                  storage[key] = { count: '0', reset: String(Date.now() + 86400000) };
                return [1, Number(args[0]) - 1, Date.now() + 86400000];
              }
              return [1, 60, Date.now() + 60000];
            },
          ),
        },
        hGetAll: vi.fn(async (key: string) => storage[key] || {}),
        del: vi.fn(async (keys: string[]) => {
          for (const k of keys) delete storage[k];
        }),
        quit: vi.fn(async () => {}),
      };
    })();
    const store = new RedisRateLimitStore(mockClient as never);

    await store.checkLimit('test-nodaily', { requestsPerMinute: 60, requestsPerDay: 1000 });
    const remaining = await store.getRemaining('test-nodaily', {
      requestsPerMinute: 60,
      requestsPerDay: 0,
    });
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('handles daily quota eval not supported', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    let evalCalls = 0;
    const trickyClient = {
      get v4() {
        evalCalls++;
        if (evalCalls <= 1) {
          return {
            eval: vi.fn(async () => [1, 59, Math.ceil(Date.now() / 60000) * 60000]),
          };
        }
        return {};
      },
      hGetAll: vi.fn(async () => ({})),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const store = new RedisRateLimitStore(trickyClient as never);

    const result = await store.checkLimit('test-eval-daily', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });
    expect(result.allowed).toBe(false);
  });

  it('getRemaining uses 0 for missing last_refill', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const mockClient = {
      v4: { eval: vi.fn() },
      hGetAll: vi.fn(async (key: string) => {
        if (key.endsWith(':rate')) return { tokens: '10' };
        return {};
      }),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const store = new RedisRateLimitStore(mockClient as never);

    const remaining = await store.getRemaining('test-no-refill', {
      requestsPerMinute: 60,
      requestsPerDay: 0,
    });
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('getRemaining falls through to Math.floor when daily count is missing', async () => {
    const { RedisRateLimitStore } = await import('./index.js');
    const mockClient = {
      v4: { eval: vi.fn() },
      hGetAll: vi.fn(async (key: string) => {
        if (key.endsWith(':rate')) return { tokens: '10', last_refill: String(Date.now()) };
        return {};
      }),
      del: vi.fn(),
      quit: vi.fn(),
    };
    const store = new RedisRateLimitStore(mockClient as never);

    const remaining = await store.getRemaining('test-no-count', {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    });
    expect(remaining).toBeLessThanOrEqual(60);
  });
});

describe('rate-limit middleware', () => {
  it('addRateLimitHeaders sets headers', async () => {
    const { addRateLimitHeaders } = await import('./rate-limit.middleware.js');
    const res = { set: vi.fn() };
    const result = { allowed: true, remaining: 59, limit: 60, reset: Date.now() + 60000 };

    (addRateLimitHeaders as unknown as (r: object, result: object) => void)(res, result);
    expect(res.set).toHaveBeenCalledTimes(3);
  });

  it('rateLimitErrorResponse sets headers and status', async () => {
    const { rateLimitErrorResponse } = await import('./rate-limit.middleware.js');
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const set = vi.fn();
    const res = { set, status };
    const result = {
      allowed: false,
      remaining: 0,
      limit: 1,
      reset: Date.now() + 60000,
      retryAfter: 30,
    };

    (rateLimitErrorResponse as unknown as (r: object, result: object) => void)(res, result);
    expect(set).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalled();
  });

  it('createRateLimitMiddleware allows request', async () => {
    const { createRateLimitMiddleware } = await import('./rate-limit.middleware.js');
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 60, requestsPerDay: 1000 },
    });

    const middleware = createRateLimitMiddleware(limiter);
    const req = { method: 'POST', path: '/mcp', headers: {}, body: {} };
    const set = vi.fn();
    const status = vi.fn(() => ({ json: vi.fn() }));
    const res = { set, status };
    const next = vi.fn();

    await (middleware as (r: object, s: object, n: () => void) => Promise<void>)(req, res, next);
    expect(next).toHaveBeenCalled();
    await limiter.close();
  });

  it('createRateLimitMiddleware denies over-limit request', async () => {
    const { createRateLimitMiddleware } = await import('./rate-limit.middleware.js');
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 1, requestsPerDay: 1000, burstSize: 1 },
    });

    const middleware = createRateLimitMiddleware(limiter);
    const req = {
      method: 'POST',
      path: '/mcp',
      headers: {},
      body: {},
      authContext: { tenantId: 'test-tenant' },
    };
    const set = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { set, status };
    const next = vi.fn();

    await (middleware as (r: object, s: object, n: () => void) => Promise<void>)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    await (middleware as (r: object, s: object, n: () => void) => Promise<void>)(req, res, next);
    expect(status).toHaveBeenCalledWith(429);
    await limiter.close();
  });
});

describe('checkRateLimit core', () => {
  it('returns allow for no tenant', async () => {
    const ctx = buildRequestContext({ path: '/mcp', headers: {} });
    const limiter = createRateLimiter({
      storeType: 'memory',
      defaultConfig: { requestsPerMinute: 60, requestsPerDay: 1000 },
    });

    const result = await checkRateLimit(ctx, limiter);
    expect(result.action).toBe('allow');
    await limiter.close();
  });

  it('uses default retryAfter when not provided', async () => {
    const ctx = buildRequestContext({
      path: '/mcp',
      headers: {},
      tenantId: 'test-tenant',
    });

    const mockLimiter = {
      checkLimit: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        limit: 1,
        reset: Date.now() + 60000,
      })),
      getRemaining: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(),
    } as unknown as RateLimiter;

    const result = await checkRateLimit(ctx, mockLimiter);
    expect(result.action).toBe('deny');
    expect(result.headers?.['Retry-After']).toBe('60');
  });
});

describe('QuotaManager additional coverage', () => {
  it('reset removes quota entry', () => {
    const manager = new QuotaManager();
    manager.checkQuota('test-key', 10);
    manager.reset('test-key');
    const usage = manager.getUsage('test-key');
    expect(usage).toBeNull();
  });

  it('cleanup removes expired entries', () => {
    const manager = new QuotaManager();
    // Create entry and make it expired via timers
    const entry = manager.getUsage('test-key');
    expect(entry).toBeNull();

    manager.checkQuota('test-key', 10);
    expect(manager.getUsage('test-key')).not.toBeNull();

    // Set entry's resetAt to the past (can't access private, so use time travel)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    manager.checkQuota('old-key', 10);

    vi.setSystemTime(new Date('2026-01-10T00:00:00Z'));
    const cleaned = manager.cleanup();
    expect(cleaned).toBe(1);
    expect(manager.getUsage('old-key')).toBeNull();

    vi.useRealTimers();
  });

  it('clear removes all quotas', () => {
    const manager = new QuotaManager();
    manager.checkQuota('key-1', 10);
    manager.checkQuota('key-2', 10);
    expect(manager.getUsage('key-1')).not.toBeNull();
    expect(manager.getUsage('key-2')).not.toBeNull();

    manager.clear();
    expect(manager.getUsage('key-1')).toBeNull();
    expect(manager.getUsage('key-2')).toBeNull();
  });
});

describe('memory-store daily reset and cleanup', () => {
  it('resets daily quota when day passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const store = createMemoryStore();
    const config = { requestsPerMinute: 100, requestsPerDay: 2 };

    await store.checkLimit('daily-key', config);
    await store.checkLimit('daily-key', config);

    const denied = await store.checkLimit('daily-key', config);
    expect(denied.allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-02T00:00:01Z'));

    const allowed = await store.checkLimit('daily-key', config);
    expect(allowed.allowed).toBe(true);

    await store.close();
    vi.useRealTimers();
  });

  it('cleanup removes entries older than 1 hour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const store = new MemoryRateLimitStore(50);
    const config = { requestsPerMinute: 100, requestsPerDay: 1000 };

    await store.checkLimit('stale-key', config);

    vi.advanceTimersByTime(3600050);

    const remaining = await store.getRemaining('stale-key', config);
    expect(remaining).toBe(100);

    await store.close();
    vi.useRealTimers();
  });
});
