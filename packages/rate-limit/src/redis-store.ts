/**
 * mcp-gateway — Redis Rate Limit Store
 * Distributed rate limiting using Redis with Lua scripts for atomicity
 */

import { logger } from '@reaatech/mcp-gateway-core';
import type { createClient } from 'redis';
import type { RateLimitConfig, RateLimitResult, RateLimitStore } from './types.js';

/**
 * Redis client interface for Lua script execution
 */
interface RedisEvalClient {
  eval(script: string, options?: { keys?: string[]; arguments?: string[] }): Promise<unknown>;
}

function getEvalFunction(client: unknown): RedisEvalClient | null {
  if (typeof client !== 'object' || client === null) {
    return null;
  }

  const v4 = (client as Record<string, unknown>).v4;
  if (
    v4 &&
    typeof v4 === 'object' &&
    'eval' in v4 &&
    typeof (v4 as Record<string, unknown>).eval === 'function'
  ) {
    const evalFn = v4.eval as (
      s: string,
      o?: { keys?: string[]; arguments?: string[] },
    ) => Promise<unknown>;
    return {
      eval: (script: string, options?: { keys?: string[]; arguments?: string[] }) =>
        evalFn(script, options),
    };
  }

  if ('eval' in client && typeof (client as Record<string, unknown>).eval === 'function') {
    const evalFn = (client as Record<string, unknown>).eval as (
      s: string,
      o?: { keys?: string[]; arguments?: string[] },
    ) => Promise<unknown>;
    return {
      eval: (script: string, options?: { keys?: string[]; arguments?: string[] }) =>
        evalFn(script, options),
    };
  }

  return null;
}

export type RedisClient = ReturnType<typeof createClient>;

/**
 * Lua script for atomic token bucket operation
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if not tokens then
  tokens = capacity
  last_refill = now
end

local elapsed = now - last_refill
local new_tokens = elapsed * refill_rate
tokens = math.min(tokens + new_tokens, capacity)

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', key, ttl)

local reset = math.ceil(now / 60000) * 60000
return { allowed, math.floor(tokens), reset }
`;

/**
 * Lua script for daily quota tracking
 */
const DAILY_QUOTA_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'count', 'reset')
local count = tonumber(data[1]) or 0
local reset = tonumber(data[2])

if now >= reset then
  count = 0
  reset = now + 86400000
end

local allowed = 0
if count < limit then
  count = count + 1
  allowed = 1
end

redis.call('HMSET', key, 'count', count, 'reset', reset)
redis.call('EXPIRE', key, ttl)

return { allowed, limit - count, reset }
`;

/**
 * Redis-backed rate limit store
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const capacity = config.burstSize ?? config.requestsPerMinute;
    const refillRate = config.requestsPerMinute / 60000;

    // Check per-minute rate limit first
    const rateKey = `${key}:rate`;
    const rateResult = await this.checkTokenBucket(rateKey, capacity, refillRate, now);

    if (!rateResult.allowed) {
      return {
        allowed: false,
        remaining: rateResult.remaining,
        limit: config.requestsPerMinute,
        reset: rateResult.reset,
        retryAfter: Math.ceil((rateResult.reset - now) / 1000),
      };
    }

    // Check daily quota second (only consumed if per-minute passes)
    const quotaKey = `${key}:daily`;
    const quotaResult = await this.checkDailyQuota(quotaKey, config.requestsPerDay, now);

    if (!quotaResult.allowed) {
      return {
        allowed: false,
        remaining: 0,
        limit: config.requestsPerDay,
        reset: quotaResult.reset,
        retryAfter: Math.ceil((quotaResult.reset - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: rateResult.remaining,
      limit: config.requestsPerMinute,
      reset: rateResult.reset,
    };
  }

  private async checkTokenBucket(
    key: string,
    capacity: number,
    refillRate: number,
    now: number,
  ): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const ttl = 3600;

    try {
      const evalClient = getEvalFunction(this.client);
      if (!evalClient) {
        throw new Error('Redis client does not support eval');
      }
      const result = await evalClient.eval(TOKEN_BUCKET_SCRIPT, {
        keys: [key],
        arguments: [String(capacity), String(refillRate), String(now), '1', String(ttl)],
      });

      const arr = result as unknown[];
      const allowed = arr[0] === 1;
      const remaining = arr[1] as number;
      const reset = arr[2] as number;

      return { allowed, remaining, reset };
    } catch (err) {
      logger.error({ err, key }, 'Redis token bucket check failed, denying request');
      return { allowed: false, remaining: 0, reset: Math.ceil(now / 60000) * 60000 };
    }
  }

  private async checkDailyQuota(
    key: string,
    limit: number,
    now: number,
  ): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const ttl = 86400;

    try {
      const evalClient = getEvalFunction(this.client);
      if (!evalClient) {
        throw new Error('Redis client does not support eval');
      }
      const result = await evalClient.eval(DAILY_QUOTA_SCRIPT, {
        keys: [key],
        arguments: [String(limit), String(now), String(ttl)],
      });

      const arr = result as unknown[];
      const allowed = arr[0] === 1;
      const remaining = arr[1] as number;
      const reset = arr[2] as number;

      return { allowed, remaining, reset };
    } catch (err) {
      logger.error({ err, key }, 'Redis daily quota check failed, denying request');
      return { allowed: false, remaining: 0, reset: now + 86400000 };
    }
  }

  async getRemaining(key: string, config: RateLimitConfig): Promise<number> {
    const rateKey = `${key}:rate`;
    const quotaKey = `${key}:daily`;

    try {
      const data = await this.client.hGetAll(rateKey);
      if (!data?.tokens) {
        return config.burstSize ?? config.requestsPerMinute;
      }

      const tokens = Number.parseFloat(data.tokens);
      const lastRefill = Number.parseFloat(data.last_refill || '0');
      const now = Date.now();

      const elapsed = now - lastRefill;
      const refillRate = config.requestsPerMinute / 60000;
      const refilled = Math.min(
        tokens + elapsed * refillRate,
        config.burstSize ?? config.requestsPerMinute,
      );

      // Also check daily quota if configured
      if (config.requestsPerDay > 0) {
        const quotaData = await this.client.hGetAll(quotaKey);
        if (quotaData?.count) {
          const dailyRemaining = Math.max(
            0,
            config.requestsPerDay - Number.parseFloat(quotaData.count),
          );
          return Math.min(refilled, dailyRemaining);
        }
      }

      return Math.floor(refilled);
    } catch (err) {
      logger.error({ err, key }, 'Redis getRemaining failed');
      return config.burstSize ?? config.requestsPerMinute;
    }
  }

  async reset(key: string): Promise<void> {
    await this.client.del([`${key}:rate`, `${key}:daily`]);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Create a Redis rate limit store
 */
export function createRedisStore(client: RedisClient): RedisRateLimitStore {
  return new RedisRateLimitStore(client);
}
