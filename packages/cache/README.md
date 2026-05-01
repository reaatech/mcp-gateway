# @reaatech/mcp-gateway-cache

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-cache.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-cache)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Response caching for the MCP Gateway. Supports in-memory LRU and Redis backends with per-tool cache strategies, `Cache-Control` bypass, and standard `X-Cache` response headers.

## Installation

```bash
npm install @reaatech/mcp-gateway-cache
# or
pnpm add @reaatech/mcp-gateway-cache
```

For Redis support:

```bash
npm install redis
```

## Feature Overview

- **Two storage backends** — in-memory LRU (`Map`-based) and Redis
- **Per-tool cache strategies** — different TTLs per tool pattern (e.g. `glean_*` → 60s, `*_static` → 3600s)
- **Cache bypass** — clients send `Cache-Control: no-cache` to skip the cache
- **Standard HTTP headers** — `X-Cache: HIT \| MISS`, `X-Cache-TTL`, `X-Cache-Key`
- **Express middleware** — `cacheMiddleware()` wraps the cache manager for drop-in use
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import { CacheManager, cacheMiddleware } from "@reaatech/mcp-gateway-cache";
import express from "express";

// In-memory cache with 5-minute default TTL
const cache = new CacheManager({
  store: "memory",
  ttlSeconds: 300,
});

const app = express();
app.use(cacheMiddleware(cache));
```

```typescript
// Redis-backed cache with per-tool strategies
import { createClient } from "redis";
import { CacheManager, DEFAULT_CACHE_STRATEGIES } from "@reaatech/mcp-gateway-cache";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const cache = new CacheManager({
  store: "redis",
  redisClient: redis,
  ttlSeconds: 300,
  strategies: [
    ...DEFAULT_CACHE_STRATEGIES,
    { tools: ["my_custom_tool"], ttlSeconds: 120 },
  ],
});
```

## API Reference

### `CacheManager` (class)

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve a cached response |
| `set(key, value, toolName?)` | Store a response (respects per-tool TTL) |
| `delete(key)` | Remove a specific entry |
| `clear()` | Clear all entries |
| `getStats()` | Get cache statistics |
| `getTtlForTool(toolName)` | Get TTL for a specific tool |
| `shouldBypass(headers)` | Check `Cache-Control` header for bypass |
| `generateKey(method, params, tenantId)` | Generate a cache key |
| `setStrategies(strategies)` | Update cache strategies at runtime |
| `isEnabled` | Whether caching is enabled |

### `MemoryCache` (class)

In-memory LRU cache. Same interface as `CacheManager` minus tools/strategies.

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve a cached entry |
| `set(key, value, ttlMs?)` | Store an entry |
| `delete(key)` | Remove an entry |
| `has(key)` | Check if key exists |
| `clear()` | Clear all entries |
| `getStats()` | Get stats: `hits`, `misses`, `size`, `evictions` |
| `static generateKey(...)` | Utility to generate hash keys |

### `RedisCache` (class)

Redis-backed cache.

Same interface as `MemoryCache`. Constructor takes a Redis client.

### Cache Strategies

| Export | Description |
|--------|-------------|
| `createCacheStrategies(config?)` | Create strategies array from config |
| `shouldCacheTool(toolName, strategies)` | Check if tool matches any strategy |
| `DEFAULT_CACHE_STRATEGIES` | Built-in defaults: `glean_search`/`serval_query` (60s), `*_static`/`*_readonly` (3600s) |

### Middleware

| Export | Description |
|--------|-------------|
| `cacheMiddleware(cacheManager)` | Express middleware — checks cache, sets `X-Cache` headers, caches responses |

### Types

| Type | Description |
|------|-------------|
| `CacheEntry` | `{ key, value, expiresAt, createdAt, tool?, tenantId? }` |
| `CacheConfig` | `{ enabled, defaultTtlSeconds, maxEntries?, store, redisClient? }` |
| `CacheStats` | `{ hits, misses, size, evictions }` |
| `ToolCacheStrategy` | `{ tools: string[], ttlSeconds: number }` |

## Cache Response Headers

| Header | Description |
|--------|-------------|
| `X-Cache` | `HIT` or `MISS` |
| `X-Cache-TTL` | Remaining TTL in seconds |
| `X-Cache-Key` | Cache key used (for debugging) |

## Usage Patterns

### Cache bypass via header

```typescript
// Client request
fetch("/mcp", {
  headers: { "Cache-Control": "no-cache" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "tools/call", ... }),
});
// → cacheMiddleware skips lookup and storage
```

### Programmatic cache usage

```typescript
import { MemoryCache } from "@reaatech/mcp-gateway-cache";

const cache = new MemoryCache({ maxEntries: 1000 });
await cache.set("key1", { result: "cached data" }, 60000);

const entry = await cache.get("key1");
console.log(entry?.value.result); // "cached data"
console.log(cache.getStats());   // { hits: 1, misses: 0, size: 1, evictions: 0 }
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Config types
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates caching)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
