# @reaatech/mcp-gateway-rate-limit

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-rate-limit.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-rate-limit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Per-tenant rate limiting with token bucket algorithm. Supports in-memory and Redis-backed storage with atomic Lua scripts, daily quota tracking, and standard `X-RateLimit-*` response headers.

## Installation

```bash
npm install @reaatech/mcp-gateway-rate-limit
# or
pnpm add @reaatech/mcp-gateway-rate-limit
```

For Redis support:

```bash
npm install redis
```

## Feature Overview

- **Token bucket algorithm** — per-key refill with configurable capacity and burst
- **Two storage backends** — in-memory (`Map`-based) and Redis (atomic Lua scripts)
- **Daily quota tracking** — separate limits for per-minute and per-day windows
- **Standard HTTP headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- **JSON-RPC error format** — 429 responses follow MCP conventions
- **Express middleware** — drop-in with `createRateLimitMiddleware()`
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  createRateLimiter,
  createRateLimitMiddleware,
} from "@reaatech/mcp-gateway-rate-limit";
import express from "express";

// In-memory rate limiter (development / single-process)
const limiter = createRateLimiter("memory", {
  requestsPerMinute: 100,
  requestsPerDay: 10000,
  burstSize: 50,
});

const app = express();
app.use(createRateLimitMiddleware(limiter));
```

```typescript
// Redis-backed rate limiter (production / multi-process)
import { createClient } from "redis";
import { createRateLimiter } from "@reaatech/mcp-gateway-rate-limit";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const limiter = createRateLimiter("redis", {
  requestsPerMinute: 1000,
  requestsPerDay: 100000,
  burstSize: 50,
}, redis);
```

## API Reference

### `RateLimiter` (class)

| Method | Description |
|--------|-------------|
| `checkLimit(key, config?)` | Check if request is allowed for a key. Returns `RateLimitResult`. |
| `getRemaining(key)` | Get remaining tokens for a key |
| `reset(key)` | Reset limit state for a key |
| `close()` | Clean up backend connection |

### `createRateLimiter(storeType, defaultConfig?, redisClient?)`

Factory function. `storeType` is `'redis'` or `'memory'`.

### Token Bucket

| Export | Description |
|--------|-------------|
| `createTokenBucketConfig(rpm, burstSize?)` | Create bucket config from requests-per-minute |
| `consumeTokens(state, config, tokens?)` | Try to consume tokens, returns `{ allowed, newState }` |
| `timeUntilAvailable(state, config, tokens?)` | Calculate milliseconds until tokens available |
| `createBucketState()` | Create initial bucket state |
| `TokenBucketState` | `{ tokens: number, lastRefill: number }` |
| `TokenBucketConfig` | `{ capacity: number, refillRate: number }` |

### Quota Manager

| Export | Description |
|--------|-------------|
| `QuotaManager` | Daily quota tracker: `checkQuota`, `getRemaining`, `reset`, `getUsage`, `cleanup`, `clear` |

### Middleware

| Export | Description |
|--------|-------------|
| `createRateLimitMiddleware(limiter)` | Express middleware — checks limit, sets headers, returns 429 on exceeded |
| `rateLimitErrorResponse(res, result)` | Send 429 JSON-RPC error response |
| `addRateLimitHeaders(res, result)` | Add `X-RateLimit-*` headers to any response |

### Types

| Type | Description |
|------|-------------|
| `RateLimitResult` | `{ allowed, remaining, limit, reset, retryAfter }` |
| `RateLimitConfig` | `{ requestsPerMinute, requestsPerDay, burstSize }` |
| `RateLimitStore` | Interface: `checkLimit`, `getRemaining`, `reset`, `close` |
| `QuotaResult` | `{ allowed, remaining, limit, reset }` |

### Rate Limit Response

When rate limited, the middleware returns:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32000,
    "message": "Rate limit exceeded",
    "data": {
      "retryAfter": 60,
      "limit": 1000,
      "remaining": 0,
      "reset": 1713225600
    }
  }
}
```

## Usage Patterns

### Per-tenant rate limiting

```typescript
import { createRateLimiter } from "@reaatech/mcp-gateway-rate-limit";

const limiter = createRateLimiter("redis", defaultConfig, redis);

async function handleRequest(req: Request) {
  const tenantId = req.authContext?.tenantId ?? "unknown";
  const tenantConfig = getTenant(tenantId);

  const result = await limiter.checkLimit(
    `tenant:${tenantId}:rpm`,
    tenantConfig?.rateLimits,
  );

  if (!result.allowed) {
    throw new Error(`Rate limited — retry after ${result.retryAfter}s`);
  }
}
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Config loading and constants
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates rate limiting)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
