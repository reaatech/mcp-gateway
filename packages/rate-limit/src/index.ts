/**
 * mcp-gateway — Rate Limiting Module
 */

export { createMemoryStore, MemoryRateLimitStore } from './memory-store.js';
export { QuotaManager } from './quota-manager.js';
export {
  addRateLimitHeaders,
  createRateLimitMiddleware,
  rateLimitErrorResponse,
} from './rate-limit.middleware.js';
export { createRateLimiter, RateLimiter } from './rate-limiter.js';
export { createRedisStore, RedisRateLimitStore } from './redis-store.js';
export type { TokenBucketConfig, TokenBucketState } from './token-bucket.js';
export {
  consumeTokens,
  createBucketState,
  createTokenBucketConfig,
  timeUntilAvailable,
} from './token-bucket.js';
export type {
  QuotaResult,
  RateLimitConfig,
  RateLimitResult,
  RateLimitStore,
  RateLimitStoreType,
} from './types.js';
