/**
 * mcp-gateway — Cache Barrel Exports
 */

export { CacheManager } from './cache-manager.js';
export { MemoryCache } from './memory-cache.js';
export { RedisCache } from './redis-cache.js';
export { cacheMiddleware } from './cache.middleware.js';
export {
  createCacheStrategies,
  shouldCacheTool,
  DEFAULT_CACHE_STRATEGIES,
} from './cache-strategies.js';

export type {
  CacheEntry,
  CacheConfig,
  CacheStats,
  ToolCacheStrategy,
} from './types.js';
