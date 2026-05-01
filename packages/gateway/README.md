# @reaatech/mcp-gateway-gateway

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-gateway.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Production-grade MCP Gateway server. This is the full Express 5-based gateway that wires together authentication, rate limiting, schema validation, tool allowlists, fan-out routing, response caching, audit trail logging, and OpenTelemetry observability into a single `createApp()` factory. Ships with a CLI binary for start, health check, config validation, and diagnostics.

## Installation

```bash
npm install @reaatech/mcp-gateway-gateway
# or
pnpm add @reaatech/mcp-gateway-gateway
```

## Quick Start

### CLI

```bash
npx mcp-gateway start --port 8080 --config gateway.yaml
```

```bash
# Other CLI commands
mcp-gateway validate-config --config gateway.yaml
mcp-gateway health --url http://localhost:8080 --deep
mcp-gateway list-tenants
mcp-gateway list-upstreams --tenant acme-corp
mcp-gateway rate-limit-status --tenant acme-corp
mcp-gateway cache-stats --url http://localhost:8080
```

### Programmatic

```typescript
import { createApp } from "@reaatech/mcp-gateway-gateway";

const gateway = createApp();

gateway.app.listen(8080, () => {
  console.log("MCP Gateway listening on :8080");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await gateway.close();
  process.exit(0);
});
```

## Feature Overview

- **Full middleware pipeline** — auth → rate limit → validation → allowlist → cache → fan-out → upstream
- **MCP JSON-RPC endpoint** — `POST /mcp` with complete protocol handling
- **Admin API** — `GET /api/v1/tenants`, `/api/v1/upstreams`, `/api/v1/cache/stats`, `/api/v1/rate-limits/status`, `/api/v1/audit`
- **Health endpoints** — `GET /health` (liveness), `GET /health/deep` (deep probes)
- **CLI binary** — `mcp-gateway` with 7 subcommands for diagnostics and management
- **Graceful shutdown** — drains in-flight requests, closes Redis connections, flushes OTel telemetry
- **Configurable via YAML** — `gateway.yaml` for server config, per-tenant YAML files for routing/auth/limits
- **Dual ESM/CJS output** — works with `import` and `require`

## API Reference

### `createApp(options?): GatewayApp`

Factory function that builds the Express application with the full middleware pipeline.

```typescript
const gateway = createApp({
  rateLimiter: myCustomLimiter,      // Pre-configured rate limiter (optional)
  cacheManager: myCustomCache,        // Pre-configured cache manager (optional)
  auditStorage: myStorage,            // Pre-configured audit storage (optional)
  upstreamCaller: myCaller,           // Custom upstream caller (optional, for tests)
});
```

### `CreateAppOptions`

| Property | Type | Description |
|----------|------|-------------|
| `rateLimiter` | `RateLimiter` | Pre-configured rate limiter. If omitted, created from env config. |
| `cacheManager` | `CacheManager` | Pre-configured cache manager. Created from config if omitted. |
| `auditStorage` | `MemoryAuditStorage` | Pre-configured audit storage. File-backed from config if omitted. |
| `upstreamCaller` | `UpstreamCaller` | Custom upstream caller for fan-out (injects test doubles). |

### `GatewayApp`

| Property / Method | Description |
|-------------------|-------------|
| `app` | Express 5 application instance |
| `rateLimiter` | Active rate limiter |
| `cacheManager` | Active cache manager |
| `auditStorage` | Active audit storage |
| `emitAudit(type, data?)` | Emit an audit event programmatically |
| `close()` | Graceful shutdown — closes rate limiter, cache, file watchers |

## Middleware Pipeline

Requests to `POST /mcp` flow through this pipeline:

```
1. express.json()        → Parse JSON body (10 MB limit)
2. authMiddleware()      → API key / JWT / OAuth / OIDC validation
3. Rate limit check      → Per-tenant token bucket + daily quota
4. Schema validation     → JSON-RPC 2.0 structure + MCP method params
5. Allowlist check       → Tool access control (for tools/call only)
6. Cache check           → Return cached response if hit (skips upstream)
7. Fan-out router        → Broadcast to upstreams, aggregate responses
8. Error handler         → Catch AuthenticationError, validation errors, etc.
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check (always returns 200 while process is alive) |
| `GET` | `/health/deep` | Deep health — runs all registered probes, returns per-component status |
| `POST` | `/mcp` | Main MCP JSON-RPC endpoint (requires auth) |
| `GET` | `/api/v1/tenants` | List all tenants (requires auth. Admin scope sees all, tenant scope sees self) |
| `GET` | `/api/v1/tenants/:id` | Get a specific tenant |
| `GET` | `/api/v1/upstreams?tenant_id=...` | List upstreams for a tenant |
| `GET` | `/api/v1/cache/stats` | Cache statistics (hits, misses, size) |
| `GET` | `/api/v1/rate-limits/status?tenant_id=...` | Rate limit status for a tenant |
| `GET` | `/api/v1/audit?tenant_id=...&event_type=...&limit=...` | Query audit events |

## CLI Reference

| Command | Description |
|---------|-------------|
| `start` | Start the gateway server (`--port`, `--config`) |
| `validate-config` | Validate gateway and tenant YAML configs (`--config`, `--tenant-dir`) |
| `health` | Check gateway health (`--url`, `--deep`, `--api-key`) |
| `cache-stats` | Show cache statistics (`--url`, `--api-key`) |
| `list-tenants` | List configured tenants |
| `list-upstreams` | List upstream servers (`--tenant`) |
| `rate-limit-status` | Show rate limit status (`--tenant`) |

## Usage Patterns

### Custom upstream caller (test doubles)

```typescript
import { createApp, type UpstreamCaller } from "@reaatech/mcp-gateway-gateway";

const mockCaller: UpstreamCaller = async (upstream, request) => ({
  upstream: upstream.name,
  response: { jsonrpc: "2.0", id: "1", result: { content: [] } },
  success: true,
  latencyMs: 5,
});

const gateway = createApp({ upstreamCaller: mockCaller });
// → Fan-out uses mockCaller instead of real HTTP
```

### Pre-configured rate limiter

```typescript
import { createRateLimiter } from "@reaatech/mcp-gateway-rate-limit";
import { createApp } from "@reaatech/mcp-gateway-gateway";
import { createClient } from "redis";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const limiter = createRateLimiter("redis", {
  requestsPerMinute: 1000,
  requestsPerDay: 100000,
  burstSize: 50,
}, redis);

const gateway = createApp({ rateLimiter: limiter });
```

### Graceful shutdown

```typescript
import { createApp } from "@reaatech/mcp-gateway-gateway";

const gateway = createApp();
const server = gateway.app.listen(8080);

const shutdown = async (signal: string) => {
  console.log(`${signal} received — shutting down gracefully`);
  await new Promise((resolve) => server.close(resolve));
  await gateway.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Config loading, types, and logging
- [@reaatech/mcp-gateway-auth](https://www.npmjs.com/package/@reaatech/mcp-gateway-auth) — Authentication middleware
- [@reaatech/mcp-gateway-rate-limit](https://www.npmjs.com/package/@reaatech/mcp-gateway-rate-limit) — Rate limiting
- [@reaatech/mcp-gateway-cache](https://www.npmjs.com/package/@reaatech/mcp-gateway-cache) — Response caching
- [@reaatech/mcp-gateway-fanout](https://www.npmjs.com/package/@reaatech/mcp-gateway-fanout) — Fan-out routing
- [@reaatech/mcp-gateway-validation](https://www.npmjs.com/package/@reaatech/mcp-gateway-validation) — Schema validation
- [@reaatech/mcp-gateway-audit](https://www.npmjs.com/package/@reaatech/mcp-gateway-audit) — Audit trail logging
- [@reaatech/mcp-gateway-observability](https://www.npmjs.com/package/@reaatech/mcp-gateway-observability) — OTel observability

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
