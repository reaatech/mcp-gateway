/**
 * mcp-gateway — Cache Strategies
 * Per-tool cache configuration strategies
 */

import type { ToolCacheStrategy } from './types.js';

/**
 * Default cache strategies for common tool patterns
 */
export const DEFAULT_CACHE_STRATEGIES: ToolCacheStrategy[] = [
  {
    tools: ['*_static', '*_readonly'],
    ttlSeconds: 3600, // 1 hour for static/readonly tools
  },
  {
    tools: ['glean_search', 'serval_query'],
    ttlSeconds: 60, // 1 minute for search tools
  },
];

/**
 * Create cache strategies from tenant config
 */
export function createCacheStrategies(config?: ToolCacheStrategy[]): ToolCacheStrategy[] {
  if (!config || config.length === 0) {
    return [...DEFAULT_CACHE_STRATEGIES];
  }
  return config;
}

/**
 * Check if a tool should be cached
 */
export function shouldCacheTool(toolName: string, strategies: ToolCacheStrategy[]): boolean {
  // If no strategies, cache everything
  if (strategies.length === 0) {return true;}

  for (const strategy of strategies) {
    for (const pattern of strategy.tools) {
      if (pattern === '*' || pattern === toolName) {
        return true;
      }
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      if (regex.test(toolName)) {
        return true;
      }
    }
  }

  return false;
}
