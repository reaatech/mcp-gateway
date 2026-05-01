# mcp-gateway — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  MCP Client │    │  Web/Mobile │    │  Service-to │                  │
│  │  (Claude)   │    │  App        │    │  Service    │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │ HTTP/HTTPS                                    │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Gateway Layer                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Request Pipeline                             │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │     TLS     │───▶│    Auth     │───▶│  Rate       │           │   │
│  │  │  Terminate  │    │  Middleware │    │  Limiter    │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  │         │                   │                   │                 │   │
│  │         ▼                   ▼                   ▼                 │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │   Schema    │───▶│    Tool     │───▶│    Fan-out  │           │   │
│  │  │  Validator  │    │  Allowlist  │    │    Router   │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Cache Layer                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Redis Cache Cluster                            │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │   Response  │    │   Rate      │    │   Session   │           │   │
│  │  │    Cache    │    │   Limit     │    │    State    │           │   │
│  │  │             │    │   State     │    │             │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Upstream Pool                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Upstream   │  │  Upstream   │  │  Upstream   │  │  Upstream   │    │
│  │  Server 1   │  │  Server 2   │  │  Server 3   │  │  Server N   │    │
│  │   (MCP)     │  │   (MCP)     │  │   (MCP)     │  │   (MCP)     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cross-Cutting Concerns                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │     Audit        │  │   Observability  │  │   Circuit        │       │
│  │     Trail        │  │  - Tracing (OTel)│  │   Breaker        │       │
│  │  - Compliance    │  │  - Metrics (OTel)│  │  - Resilience    │       │
│  │  - SIEM Export   │  │  - Logging (pino)│  │  - Failover      │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Package Architecture

mcp-gateway is a **pnpm monorepo** with 10 independently versioned packages:

```
core  (@reaatech/mcp-gateway-core)
  ├── auth           (@reaatech/mcp-gateway-auth)
  ├── rate-limit     (@reaatech/mcp-gateway-rate-limit)
  ├── cache          (@reaatech/mcp-gateway-cache)
  ├── allowlist      (@reaatech/mcp-gateway-allowlist)
  ├── validation     (@reaatech/mcp-gateway-validation)
  ├── fanout         (@reaatech/mcp-gateway-fanout)
  ├── audit          (@reaatech/mcp-gateway-audit)
  ├── observability  (@reaatech/mcp-gateway-observability)
  └── gateway        (@reaatech/mcp-gateway-gateway)
```

- `core` is the foundation — types, schemas, config loading, logging, and utilities. Every other package depends on it.
- `gateway` is the compositor — it imports all 9 sibling packages and wires them into an Express 5 server.
- All other packages are leaf modules that encapsulate a single domain concern.
- Each package builds independently via **tsup** (dual CJS/ESM output).
- Cross-package typechecking uses `tsconfig.typecheck.json` with path aliases.
- Package interdependencies are declared as `workspace:*` in `package.json`.

---

## Design Principles

### 1. Zero-Trust Security
- All requests must be authenticated
- All requests must be authorized (tool allowlists)
- All inputs must be validated (schema enforcement)
- All actions must be auditable

### 2. Stateless Gateway
- No in-memory state shared across requests
- All state persisted to Redis
- Enables horizontal scaling
- Graceful instance restarts

### 3. Defense in Depth
- Multiple layers of security
- Fail-secure defaults
- Principle of least privilege
- Comprehensive audit logging

### 4. Observable by Default
- Every request traced
- All metrics collected
- Structured logging everywhere
- Debugging-friendly error messages

### 5. Pluggable Architecture
- Auth providers are swappable
- Rate limit stores are pluggable
- Cache backends are configurable
- Custom middleware support

---

## Middleware Pipeline

Requests to `POST /mcp` flow through this pipeline (implemented in `packages/gateway/src/index.ts`):

| Order | Middleware | Package |
|-------|-----------|---------|
| 1 | TLS Termination | gateway (Express) |
| 2 | Request ID | gateway |
| 3 | Auth | `@reaatech/mcp-gateway-auth` |
| 4 | Rate Limit | `@reaatech/mcp-gateway-rate-limit` |
| 5 | Schema Validation | `@reaatech/mcp-gateway-validation` |
| 6 | Tool Allowlist | `@reaatech/mcp-gateway-allowlist` |
| 7 | Cache Lookup | `@reaatech/mcp-gateway-cache` |
| 8 | Fan-out Router | `@reaatech/mcp-gateway-fanout` |
| 9 | Cache Store | `@reaatech/mcp-gateway-cache` |
| 10 | Error Handler | gateway |

**Design Decision:** Middleware order is critical — auth before rate limiting (prevents rate limit bypass), allowlist before cache (prevents unauthorized cache hits).

---

## Authentication System

### Auth Methods

| Method | Implementation | Use Case |
|--------|---------------|----------|
| **API Key** | `api-key-validator.ts` — SHA-256 hash comparison | Service-to-service |
| **JWT** | `jwt-validator.ts` — RS256/ES256 via `jose` | User authentication |
| **OAuth2** | `oauth-introspection.ts` — RFC 7662 | Third-party apps |
| **OIDC** | `oidc-validator.ts` — ID token validation | SSO integration |

**Package:** `packages/auth/src/`

### Auth Flow

```
Request → Extract credentials → Determine method → Validate → Extract tenant
```

**Design Decision:** API keys are stored as SHA-256 hashes, never plaintext. Token fingerprints are generated for audit trails. JWT validation supports JWKS endpoints for key rotation.

---

## Rate Limiting System

### Algorithm

Token bucket with configurable capacity, refill rate, and burst size. Redis-backed implementation uses atomic Lua scripts to avoid race conditions in distributed deployments.

**Package:** `packages/rate-limit/src/`

### Stores

| Store | Use Case |
|-------|----------|
| **Redis** (`redis-store.ts`) | Production, multi-instance, atomic Lua |
| **Memory** (`memory-store.ts`) | Development, single-instance |

---

## Schema Validation System

Three validation layers, all in `packages/validation/src/`:

1. **JSON-RPC 2.0** — `jsonrpc`, `id`, `method`, `params` structure
2. **MCP Protocol** — Valid MCP methods, tool names
3. **Tool Schema** — Per-tool JSON Schema validation (AJV-based)

---

## Tool Allowlist System

**Package:** `packages/allowlist/src/`

### Modes

| Mode | Behavior |
|------|----------|
| `allow` | Only listed tools allowed (default-deny) |
| `deny` | Listed tools blocked (default-allow) |

### Pattern Matching

Supports wildcards (`glean_*`, `*_search`), exact names, and version-tracked rollbacks via `dynamic-allowlist.ts`.

---

## Fan-out Router

**Package:** `packages/fanout/src/`

Includes fan-out routing (`fanout-router.ts`), response aggregation (`response-aggregator.ts`), weighted upstream selection (`upstream-selector.ts`), circuit breaker (`failover-handler.ts`), upstream MCP client (`upstream-client.ts`), retry logic (`retry-logic.ts`), health checking (`health-checker.ts`), and connection pooling (`connection-pool.ts`).

### Aggregation Strategies

| Strategy | Behavior |
|----------|----------|
| `first-success` | Return first valid response, cancel others |
| `all-wait` | Wait for all, merge results |
| `majority-vote` | Consensus from multiple upstreams |

---

## Response Cache

**Package:** `packages/cache/src/`

### Backends

| Backend | Implementation |
|---------|---------------|
| **Redis** | `redis-cache.ts` |
| **Memory** | `memory-cache.ts` (LRU eviction) |

### Cache Key

```
cache_key = SHA-256(tenant_id + method + JSON(params))
```

**Design Decision:** Cache keys include tenant_id to prevent cross-tenant cache pollution. Per-tool TTL strategies via `cache-strategies.ts`.

---

## Audit Trail

**Package:** `packages/audit/src/`

### Event Types

| Event | Triggered When |
|-------|----------------|
| `auth.success` | Authentication succeeds |
| `auth.failure` | Authentication fails |
| `rate_limit.exceeded` | Rate limit exceeded |
| `allowlist.denied` | Tool access denied |
| `tool.executed` | Tool execution completes |
| `cache.hit` | Cache hit |
| `cache.miss` | Cache miss |
| `upstream.error` | Upstream server error |

### Storage Backends

| Backend | Use Case |
|---------|----------|
| **Console** (`ConsoleAuditLogger`) | Development |
| **File** (`FileAuditLogger`) | Production, JSONL format |
| **Memory** (`MemoryAuditStorage`) | Queryable, for API access |

Tamper-evident chaining via `TamperEvidentLogger` with SHA-256 event hashing and `verifyAuditChain()`.

---

## Observability

**Package:** `packages/observability/src/`

### Components

| File | Purpose |
|------|---------|
| `otel.ts` | OTel SDK auto-initialization |
| `otel.impl.ts` | OTel implementation + shutdown |
| `metrics.ts` | Counters, histograms, gauges |
| `tracing.ts` | Spans for auth, cache, upstream, fanout |
| `health.ts` | Liveness, readiness, deep-health probes |

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gateway.requests.total` | Counter | `tenant_id`, `status` |
| `gateway.requests.duration_ms` | Histogram | `tenant_id`, `method` |
| `gateway.auth.attempts` | Counter | `method`, `result` |
| `gateway.rate_limit.exceeded` | Counter | `tenant_id` |
| `gateway.cache.hits` | Counter | `tool` |
| `gateway.cache.misses` | Counter | `tool` |
| `gateway.upstream.errors` | Counter | `upstream`, `error_type` |

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness — always returns 200 if process is running |
| `/health/deep` | Deep — runs all registered probes, per-component status |

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network — HTTPS, rate limiting, TLS headers                │
│ Layer 2: Auth — API key, JWT, OAuth, OIDC, key rotation            │
│ Layer 3: Authorization — Per-tenant allowlists, scope-based access  │
│ Layer 4: Input Validation — JSON Schema, MCP compliance, size limits│
└─────────────────────────────────────────────────────────────────────┘
```

### PII Handling
- Never log raw tokens — only hashed identifiers
- Never log request bodies — only metadata
- Redact sensitive fields automatically
- Store only hashed API keys, never plaintext

### SSRF Protection

Upstream URLs are validated to reject:
- `localhost` and `::1`
- Private IP ranges (10.x, 172.16.x, 192.168.x)
- Link-local (169.254.0.0/16)

Implementation: `packages/core/src/config/upstream-loader.ts`

---

## Data Flow

### Complete Request Flow

```
1. Client sends HTTP request → gateway
2. express.json() parses body (10 MB limit)
3. Generate/extract request ID
4. authMiddleware: validate credentials, extract tenant
5. Rate limit: check token bucket + daily quota
6. Cache: check Redis for cached response (skip if hit)
7. Schema: validate JSON-RPC 2.0 + MCP method params
8. Allowlist: check tool access (tools/call only)
9. Fan-out: select upstreams, send requests, aggregate
10. Cache: store response (if cacheable)
11. Audit: log event (auth result, tool execution, etc.)
12. Return response to client
```

---

## Toolchain

| Tool | Purpose |
|------|---------|
| **pnpm** (10.22.0) | Package manager with workspace support |
| **turbo** (^2.5.0) | Monorepo task orchestration |
| **tsup** (^8.4.0) | Per-package bundler (dual CJS/ESM) |
| **TypeScript** (^5.8.3) | Type checking (`tsconfig.typecheck.json`) |
| **vitest** (^3.1.1) | Test runner (co-located `*.test.ts` files) |
| **Biome** (^1.9.4) | Lint + format |
| **Changesets** (^2.28.1) | Versioning + changelog generation |

## Deployment

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | HTTP listen port |
| `NODE_ENV` | `development` | Environment name |
| `REDIS_HOST` | — | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTel collector endpoint |
| `LOG_LEVEL` | `info` | Log level |
| `TENANT_CONFIG_DIR` | `./tenants` | Tenant config directory |
| `GATEWAY_CONFIG_PATH` | `./gateway.yaml` | Gateway config path |

---

## References

- **AGENTS.md** — Development conventions
- **GITHUB_TO_NPM.md** — Publishing runbook
- **MCP Specification** — https://modelcontextprotocol.io/
- **JSON-RPC 2.0** — https://www.jsonrpc.org/specification
