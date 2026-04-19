/**
 * mcp-gateway — Response Cache Types
 */

/**
 * Cache entry with metadata
 */
export interface CacheEntry {
  key: string;
  value: unknown;
  expiresAt: number;
  createdAt: number;
  tool?: string;
  tenantId?: string;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  defaultTtlSeconds: number;
  maxEntries?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
}

/**
 * Per-tool cache strategy
 */
export interface ToolCacheStrategy {
  tools: string[];
  ttlSeconds: number;
}
