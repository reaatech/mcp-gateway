/**
 * mcp-gateway — Rate Limiting Types
 * Type definitions for rate limiting system
 */

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Remaining requests in current window */
  remaining: number;

  /** Total requests allowed in window */
  limit: number;

  /** Unix timestamp (ms) when the limit resets */
  reset: number;

  /** Seconds to wait before retrying (if rate limited) */
  retryAfter?: number;
}

/**
 * Rate limit configuration per tenant
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;

  /** Maximum requests per day */
  requestsPerDay: number;

  /** Burst size for token bucket (defaults to requestsPerMinute) */
  burstSize?: number;
}

/**
 * Interface for rate limit storage backends
 */
export interface RateLimitStore {
  /**
   * Check if a request is allowed and record it
   */
  checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult>;

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string, config: RateLimitConfig): Promise<number>;

  /**
   * Reset the rate limit for a key
   */
  reset(key: string): Promise<void>;

  /**
   * Close the store (cleanup resources)
   */
  close(): Promise<void>;
}

/**
 * Daily quota tracking result
 */
export interface QuotaResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Remaining requests for the day */
  remaining: number;

  /** Total daily quota */
  limit: number;

  /** Unix timestamp (ms) when the quota resets */
  reset: number;
}

/**
 * Rate limit store type
 */
export type RateLimitStoreType = 'redis' | 'memory';
