/**
 * mcp-gateway — Cache Barrel Exports
 */

export { cacheMiddleware } from './cache.middleware.js';
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
