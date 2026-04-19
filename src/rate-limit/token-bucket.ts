/**
 * mcp-gateway — Token Bucket Algorithm
 * Pure implementation of the token bucket rate limiting algorithm
 */

/**
 * Token bucket state
 */
export interface TokenBucketState {
  /** Current number of tokens */
  tokens: number;

  /** Last refill timestamp (ms) */
  lastRefill: number;
}

/**
 * Token bucket configuration
 */
export interface TokenBucketConfig {
  /** Maximum bucket capacity */
  capacity: number;

  /** Tokens added per millisecond */
  refillRate: number;
}

/**
 * Create a token bucket configuration from requests per minute
 */
export function createTokenBucketConfig(requestsPerMinute: number, burstSize?: number): TokenBucketConfig {
  const capacity = burstSize ?? requestsPerMinute;
  const refillRate = requestsPerMinute / 60000; // tokens per ms

  return { capacity, refillRate };
}

/**
 * Try to consume tokens from the bucket
 * Returns the new state and whether consumption was successful
 */
export function consumeTokens(
  state: TokenBucketState,
  config: TokenBucketConfig,
  tokens: number = 1,
): { state: TokenBucketState; allowed: boolean; remaining: number } {
  const now = Date.now();
  const elapsed = now - state.lastRefill;

  // Refill tokens based on elapsed time
  const newTokens = elapsed * config.refillRate;
  const refilledTokens = Math.min(state.tokens + newTokens, config.capacity);

  // Check if we can consume
  if (refilledTokens >= tokens) {
    return {
      state: {
        tokens: refilledTokens - tokens,
        lastRefill: now,
      },
      allowed: true,
      remaining: Math.floor(refilledTokens - tokens),
    };
  }

  // Not enough tokens
  return {
    state: {
      tokens: refilledTokens,
      lastRefill: now,
    },
    allowed: false,
    remaining: Math.floor(refilledTokens),
  };
}

/**
 * Calculate time until tokens are available
 */
export function timeUntilAvailable(
  state: TokenBucketState,
  config: TokenBucketConfig,
  tokens: number = 1,
): number {
  if (state.tokens >= tokens) {
    return 0;
  }

  const tokensNeeded = tokens - state.tokens;
  const msNeeded = tokensNeeded / config.refillRate;

  return Math.ceil(msNeeded);
}

/**
 * Create initial bucket state
 */
export function createBucketState(): TokenBucketState {
  return {
    tokens: 0,
    lastRefill: Date.now(),
  };
}
