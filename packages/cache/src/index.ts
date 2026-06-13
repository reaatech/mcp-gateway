/**
 * mcp-gateway — Cache Barrel Exports
 */

// Express middleware
export { cacheMiddleware } from './cache.middleware.js';
// Framework-agnostic core
export {
  type CacheController,
  type CacheLookupResult,
  type CacheReadResult,
  cacheLookup,
  cacheStore,
  createRedisCacheController,
} from './cache-core.js';
export { CacheManager } from './cache-manager.js';
export {
  createCacheStrategies,
  DEFAULT_CACHE_STRATEGIES,
  shouldCacheTool,
} from './cache-strategies.js';
export { MemoryCache } from './memory-cache.js';
export { RedisCache } from './redis-cache.js';

export type {
  CacheConfig,
  CacheEntry,
  CacheStats,
  ToolCacheStrategy,
} from './types.js';
