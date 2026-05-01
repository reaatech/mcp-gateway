/**
 * mcp-gateway — Rate Limiting Module
 */

export { RateLimiter, createRateLimiter } from './rate-limiter.js';
export { MemoryRateLimitStore, createMemoryStore } from './memory-store.js';
export { RedisRateLimitStore, createRedisStore } from './redis-store.js';
export { QuotaManager } from './quota-manager.js';
export {
  createRateLimitMiddleware,
  rateLimitErrorResponse,
  addRateLimitHeaders,
} from './rate-limit.middleware.js';
export {
  createTokenBucketConfig,
  consumeTokens,
  timeUntilAvailable,
  createBucketState,
} from './token-bucket.js';

export type {
  RateLimitResult,
  RateLimitConfig,
  RateLimitStore,
  QuotaResult,
  RateLimitStoreType,
} from './types.js';

export type { TokenBucketState, TokenBucketConfig } from './token-bucket.js';
