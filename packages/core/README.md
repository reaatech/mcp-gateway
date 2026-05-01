# @reaatech/mcp-gateway-core

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-core.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Core types, Zod schemas, configuration loading, and structured logging for the MCP Gateway ecosystem. Every other `@reaatech/mcp-gateway-*` package depends on this one. It is the single source of truth for gateway config shapes, tenant registry management, upstream validation with SSRF protection, and shared utilities.

## Installation

```bash
npm install @reaatech/mcp-gateway-core
# or
pnpm add @reaatech/mcp-gateway-core
```

## Feature Overview

- **21 domain interfaces** — `TenantConfig`, `GatewayConfig`, `UpstreamServer`, `AuthContext`, `FanOutResult`, and more
- **25 Zod schemas** — runtime validation for gateway, tenant, upstream, rate-limit, cache, allowlist, and JSON-RPC configs
- **25 inferred types** — each Zod schema has a corresponding TypeScript type
- **Configuration loading** — YAML-based gateway config, tenant registry with hot-reload via file watchers
- **Upstream validation** — SSRF protection (localhost, private IP, link-local rejection) with DNS resolution checks
- **Structured logging** — Pino-based JSON logger with PII redaction, request correlation, and child loggers
- **8 utility functions** — SHA-256 hashing, constant-time comparison, exponential backoff retry, deep clone
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  loadTenantsAsync,
  getTenant,
  env,
  logger,
  validateUpstreamUrl,
} from "@reaatech/mcp-gateway-core";

// Load tenant registry from YAML files
const tenants = await loadTenantsAsync();
console.log(`Loaded ${tenants.size} tenants`);

// Look up a tenant
const acmeCorp = getTenant("acme-corp");
console.log("Upstreams:", acmeCorp?.upstreams);

// Validate upstream URLs (SSRF protection)
const result = validateUpstreamUrl("https://mcp-server-1.acme.com");
console.log("URL valid:", result.valid);

// Structured logging
logger.info({ tenantId: "acme-corp" }, "Tenant loaded");
```

## API Reference

### Configuration Loading

| Export | Description |
|--------|-------------|
| `loadGatewayConfig(path?)` | Load and validate `gateway.yaml` |
| `getGatewayConfig()` | Get cached gateway config singleton |
| `resetGatewayConfig()` | Reset cached config (for tests) |
| `loadTenants(dir?)` | Synchronous tenant loading from YAML files |
| `loadTenantsAsync(dir?)` | Async tenant loading |
| `startWatching()` | Start file watchers for hot-reload |
| `stopWatching()` | Stop file watchers |
| `getTenant(id)` | Get tenant by ID |
| `setTenant(config)` | Register tenant programmatically (for tests) |
| `clearTenants()` | Clear all tenants from registry |
| `listTenants()` | List all tenants as an array |
| `hasTenant(id)` | Check if tenant exists |
| `getTenantIds()` | Get all tenant IDs |
| `reloadTenantFile(path)` | Reload a single tenant YAML file |
| `removeTenantFile(path)` | Remove a tenant from the registry |

### Upstream Validation

| Export | Description |
|--------|-------------|
| `validateUpstreamUrl(url)` | Synchronous SSRF validation |
| `validateUpstreamUrlAsync(url)` | Async SSRF validation with DNS check |
| `getUpstreams(tenantId)` | Get upstreams for a tenant |
| `getHealthyUpstreams(tenantId)` | Get only healthy upstreams |
| `markUpstreamHealthy(name)` | Mark upstream as healthy |
| `validateTenantUpstreams(tenantId)` | Validate all upstreams for a tenant |
| `validateAllUpstreams()` | Validate all tenants' upstreams |
| `getUpstreamByName(name)` | Get upstream server by name |
| `getWeightedUpstreams(tenantId)` | Get upstreams sorted by weight |

### Environment

| Export | Description |
|--------|-------------|
| `env` | Environment config singleton (Zod-validated) |
| `isProduction` | `true` when `NODE_ENV === 'production'` |
| `isDevelopment` | `true` when `NODE_ENV === 'development'` |
| `isTest` | `true` when `NODE_ENV === 'test'` |
| `logConfigSummary()` | Log configuration summary to stdout |

### Logging

| Export | Description |
|--------|-------------|
| `logger` | Root Pino logger instance |
| `childLogger(context)` | Create child logger with bound context |
| `redactToken(token)` | Redact token for safe logging |
| `Logger` | Pino logger type alias |

### Constants

| Export | Description |
|--------|-------------|
| `SERVICE_NAME` | `'mcp-gateway'` |
| `SERVICE_VERSION` | Version from `package.json` |
| `DEFAULT_PORT` | `8080` |
| `MAX_REQUEST_BODY_SIZE` | `'10mb'` |
| `DEFAULT_REQUESTS_PER_MINUTE` | `100` |
| `DEFAULT_REQUESTS_PER_DAY` | `10000` |
| `DEFAULT_CACHE_TTL_SECONDS` | `300` |
| `MCP_PROTOCOL_VERSION` | `'2024-11-05'` |
| `JSON_RPC_VERSION` | `'2.0'` |
| `DEFAULT_UPSTREAM_TIMEOUT_MS` | `30000` |
| `DEFAULT_MAX_RETRIES` | `3` |
| `HEALTH_ENDPOINT` | `'/health'` |
| `DEEP_HEALTH_ENDPOINT` | `'/health/deep'` |
| `MCP_ENDPOINT` | `'/mcp'` |
| `API_V1_PREFIX` | `'/api/v1'` |

### Utilities

| Export | Description |
|--------|-------------|
| `sha256(input)` | Generate SHA-256 hash |
| `randomHex(bytes?)` | Generate random hex string (default 16 bytes) |
| `safeCompare(a, b)` | Constant-time string comparison (timing-attack safe) |
| `sleep(ms)` | Promise-based sleep |
| `retry(fn, options?)` | Retry async operation with exponential backoff |
| `truncate(str, maxLen)` | Truncate string with `'...'` |
| `deepClone(value)` | Deep clone JSON-serializable values |
| `isPlainObject(value)` | Type guard: check if value is a plain object |

### Key Domain Types

| Type | Description |
|------|-------------|
| `TenantConfig` | Full tenant config: `tenantId`, `displayName`, `auth`, `rateLimits`, `cache`, `allowlist`, `upstreams` |
| `GatewayConfig` | Top-level gateway config: `server`, `redis`, `rateLimits`, `cache`, `audit`, `observability` |
| `UpstreamServer` | Upstream server definition: `name`, `url`, `weight`, `timeoutMs` |
| `AuthContext` | Authenticated context: `tenantId`, `userId`, `scopes`, `authMethod` |
| `JsonRpcRequest` | JSON-RPC 2.0 request: `jsonrpc`, `id`, `method`, `params` |
| `JsonRpcResponse` | JSON-RPC 2.0 response: `jsonrpc`, `id`, `result`, `error` |
| `AuditEvent` | Audit log entry: `id`, `timestamp`, `eventType`, `tenantId`, `success` |
| `FanOutResult` | Fan-out aggregation result |
| `HealthStatus` | Health check response |
| `CacheStats` | Cache statistics: `hits`, `misses`, `sizeBytes`, `hitRate` |
| `RateLimitStatus` | Rate limit status per tenant |

## Usage Patterns

### Load and validate tenant configs

```typescript
import {
  loadTenantsAsync,
  getTenant,
  validateTenantUpstreams,
} from "@reaatech/mcp-gateway-core";

const tenants = await loadTenantsAsync();

for (const [id, tenant] of tenants) {
  const result = validateTenantUpstreams(id);
  console.log(`${id}: ${result.errors.length} URL issues`);
}

const acme = getTenant("acme-corp");
if (acme?.cache.enabled) {
  console.log(`Cache TTL: ${acme.cache.ttlSeconds}s`);
}
```

### Type-safe JSON-RPC handling

```typescript
import {
  JsonRpcRequestSchema,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@reaatech/mcp-gateway-core";

function handleRequest(raw: unknown): JsonRpcRequest {
  return JsonRpcRequestSchema.parse(raw);
}
```

## Related Packages

- [@reaatech/mcp-gateway-auth](https://www.npmjs.com/package/@reaatech/mcp-gateway-auth) — Pluggable authentication
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
