/**
 * mcp-gateway — In-Memory Rate Limit Store
 * Single-instance rate limiting using in-memory storage
 */

import type { RateLimitConfig, RateLimitResult, RateLimitStore } from './types.js';
import { createTokenBucketConfig, consumeTokens, timeUntilAvailable } from './token-bucket.js';

/**
 * Bucket entry with state and daily quota tracking
 */
interface BucketEntry {
  tokens: number;
  lastRefill: number;
  dailyCount: number;
  dailyReset: number;
}

/**
 * In-memory rate limit store
 * Suitable for single-instance deployments or development
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, BucketEntry>();
  private readonly cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(cleanupIntervalMs: number = 60000) {
    // Periodically clean up expired entries
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    let entry = this.buckets.get(key);
    const now = Date.now();

    // Initialize entry if not exists
    if (!entry) {
      entry = {
        tokens: config.burstSize ?? config.requestsPerMinute,
        lastRefill: now,
        dailyCount: 0,
        dailyReset: now + 86400000, // 24 hours from now
      };
      this.buckets.set(key, entry);
    }

    // Reset daily quota if needed
    if (now >= entry.dailyReset) {
      entry.dailyCount = 0;
      entry.dailyReset = now + 86400000;
    }

    // Check daily quota first
    if (entry.dailyCount >= config.requestsPerDay) {
      return {
        allowed: false,
        remaining: 0,
        limit: config.requestsPerDay,
        reset: entry.dailyReset,
        retryAfter: Math.ceil((entry.dailyReset - now) / 1000),
      };
    }

    // Check per-minute rate limit using token bucket
    const bucketConfig = createTokenBucketConfig(config.requestsPerMinute, config.burstSize);
    const result = consumeTokens(
      { tokens: entry.tokens, lastRefill: entry.lastRefill },
      bucketConfig,
    );

    // Update entry state
    entry.tokens = result.state.tokens;
    entry.lastRefill = result.state.lastRefill;

    if (result.allowed) {
      entry.dailyCount++;
    }

    // Calculate reset time (end of current minute window)
    const reset = Math.ceil(now / 60000) * 60000;

    if (!result.allowed) {
      const msUntilAvailable = timeUntilAvailable(
        { tokens: entry.tokens, lastRefill: entry.lastRefill },
        bucketConfig,
      );

      return {
        allowed: false,
        remaining: result.remaining,
        limit: config.requestsPerMinute,
        reset,
        retryAfter: Math.ceil(msUntilAvailable / 1000),
      };
    }

    return {
      allowed: true,
      remaining: result.remaining,
      limit: config.requestsPerMinute,
      reset,
    };
  }

  async getRemaining(key: string, config: RateLimitConfig): Promise<number> {
    const entry = this.buckets.get(key);
    if (!entry) {
      return config.requestsPerMinute;
    }

    const now = Date.now();

    // Check daily quota
    if (now >= entry.dailyReset) {
      return config.requestsPerDay;
    }

    const dailyRemaining = config.requestsPerDay - entry.dailyCount;
    if (dailyRemaining <= 0) {
      return 0;
    }

    // Check per-minute rate
    const bucketConfig = createTokenBucketConfig(config.requestsPerMinute, config.burstSize);
    const elapsed = now - entry.lastRefill;
    const newTokens = elapsed * bucketConfig.refillRate;
    const refilledTokens = Math.min(entry.tokens + newTokens, bucketConfig.capacity);

    return Math.min(Math.floor(refilledTokens), dailyRemaining - 1);
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.buckets.entries()) {
      // Remove entries that haven't been used in a while
      if (now - entry.lastRefill > 3600000) { // 1 hour
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Create an in-memory rate limit store
 */
export function createMemoryStore(): MemoryRateLimitStore {
  return new MemoryRateLimitStore();
}
