---
agent_id: "mcp-gateway"
display_name: "MCP Gateway"
version: "1.0.0"
description: "pnpm monorepo — API gateway for MCP server aggregation and routing"
type: "mcp"
confidence_threshold: 0.9
---

# mcp-gateway — Agent Development Guide

## What this is

This document defines development conventions for the `mcp-gateway` **pnpm monorepo**
(10 packages under `packages/`). The project provides production-grade MCP
infrastructure: authentication, rate limiting, schema enforcement, tool
allowlists, audit trails, fan-out routing, and response caching.

**Target audience:** Contributors to this repo, platform teams deploying MCP
servers at scale, and SREs managing MCP infrastructure.

---

## Repository Structure

```
mcp-gateway/
├── packages/
│   ├── core/           @reaatech/mcp-gateway-core        Types, schemas, config, logger, utils
│   ├── auth/           @reaatech/mcp-gateway-auth         API key, JWT, OAuth2, OIDC
│   ├── rate-limit/     @reaatech/mcp-gateway-rate-limit   Token bucket + daily quota
│   ├── cache/          @reaatech/mcp-gateway-cache        Redis + in-memory LRU cache
│   ├── allowlist/      @reaatech/mcp-gateway-allowlist    Per-tenant tool access control
│   ├── validation/     @reaatech/mcp-gateway-validation   JSON Schema / MCP protocol validation
│   ├── fanout/         @reaatech/mcp-gateway-fanout       Multi-upstream routing + MCP client
│   ├── audit/          @reaatech/mcp-gateway-audit        Compliance audit logging
│   ├── observability/  @reaatech/mcp-gateway-observability  OTel tracing, metrics, health
│   └── gateway/        @reaatech/mcp-gateway-gateway      Express 5 server + CLI + middleware
├── biome.json          Lint + format (Biome, not ESLint)
├── turbo.json          Monorepo task orchestration
├── pnpm-workspace.yaml Workspace definition
├── tsconfig.json       Root/base TypeScript config
└── tsconfig.typecheck.json  Cross-package typecheck paths
```

### Toolchain

| Tool | Purpose |
|------|---------|
| **pnpm** (10.22.0) | Package manager with workspace support |
| **turbo** (^2.5.0) | Monorepo task orchestration |
| **tsup** (^8.4.0) | Per-package bundler (dual CJS/ESM) |
| **TypeScript** (^5.8.3) | Type checking (`tsconfig.typecheck.json`) |
| **vitest** (^3.1.1) | Test runner (co-located `*.test.ts` files) |
| **Biome** (^1.9.4) | Lint + format (no ESLint, no Prettier) |
| **Changesets** (^2.28.1) | Versioning + changelog generation |

### Package Dependency Graph

```
core                     (zod, js-yaml, yaml, pino)
 ├── auth                (jose, jsonwebtoken)
 ├── rate-limit          (redis)
 ├── cache               (redis)
 ├── allowlist           ()
 ├── validation          (ajv)
 ├── fanout              ()
 ├── audit               ()
 ├── observability       (@opentelemetry/*)
 └── gateway             (express, @modelcontextprotocol/sdk)
      └── depends on ALL above
```

---

## Development Commands

```bash
pnmp install          # Install all workspace deps
pnpm build            # Build all 10 packages (turbo)
pnpm test             # Run all tests
pnpm test:coverage    # Run tests with coverage
pnpm lint             # Biome check
pnpm lint:fix         # Biome fix
pnpm format           # Biome format
pnpm typecheck        # Cross-package typecheck (tsconfig.typecheck.json)
pnpm clean            # Clean all dist/ dirs
```

## Key Components

| Component | Package | Location |
|-----------|---------|----------|
| **Auth Middleware** | `@reaatech/mcp-gateway-auth` | `packages/auth/src/` |
| **Rate Limiter** | `@reaatech/mcp-gateway-rate-limit` | `packages/rate-limit/src/` |
| **Schema Validator** | `@reaatech/mcp-gateway-validation` | `packages/validation/src/` |
| **Tool Allowlist** | `@reaatech/mcp-gateway-allowlist` | `packages/allowlist/src/` |
| **Fan-out Router** | `@reaatech/mcp-gateway-fanout` | `packages/fanout/src/` |
| **Response Cache** | `@reaatech/mcp-gateway-cache` | `packages/cache/src/` |
| **Audit Trail** | `@reaatech/mcp-gateway-audit` | `packages/audit/src/` |
| **Observability** | `@reaatech/mcp-gateway-observability` | `packages/observability/src/` |
| **Gateway Server** | `@reaatech/mcp-gateway-gateway` | `packages/gateway/src/` |
| **Config & Types** | `@reaatech/mcp-gateway-core` | `packages/core/src/{types,config,utils}/` |

---

## Gateway Configuration

### Gateway Configuration File (`gateway.yaml`)

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  tls:
    enabled: true
    cert_path: "/etc/ssl/certs/gateway.crt"
    key_path: "/etc/ssl/private/gateway.key"

redis:
  host: "redis.example.com"
  port: 6379
  password_env: "REDIS_PASSWORD"
  db: 0

rate_limits:
  default_requests_per_minute: 100
  default_requests_per_day: 10000
  store: "redis"

cache:
  enabled: true
  store: "redis"
  default_ttl_seconds: 300

audit:
  enabled: true
  storage: "file"
  file_path: "/var/log/gateway/audit.json"
  retention_days: 90

observability:
  otel_endpoint: "http://otel-collector:4318"
  log_level: "info"
  service_name: "mcp-gateway"
```

### Tenant Configuration (`tenants/acme-corp.yaml`)

```yaml
tenant_id: "acme-corp"
display_name: "ACME Corporation"

auth:
  api_keys:
    - key_hash: "sha256:abc123..."
      name: "production-api-key"
      scopes: ["tools:*"]
  jwt:
    issuer: "https://auth.acme.com"
    audience: "mcp-gateway"
    jwks_uri: "https://auth.acme.com/.well-known/jwks.json"

rate_limits:
  requests_per_minute: 1000
  requests_per_day: 100000
  burst_size: 50

allowlist:
  mode: "allow"
  tools:
    - "glean_*"
    - "serval_*"

cache:
  enabled: true
  ttl_seconds: 300

upstreams:
  - name: "primary"
    url: "https://mcp-server-1.acme.com"
    weight: 0.7
    timeout_ms: 30000
  - name: "secondary"
    url: "https://mcp-server-2.acme.com"
    weight: 0.3
    timeout_ms: 30000
```

---

## Authentication

### API Key Authentication

```bash
curl -X POST http://gateway:8080/mcp \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {...}}'
```

### JWT Authentication

```bash
curl -X POST http://gateway:8080/mcp \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {...}}'
```

### OAuth2 Token Introspection (RFC 7662)

```yaml
auth:
  oauth:
    introspection_url: "https://auth.example.com/oauth/introspect"
    client_id: "mcp-gateway"
    client_secret_env: "OAUTH_CLIENT_SECRET"
```

### OIDC ID Token Validation

```yaml
auth:
  oidc:
    issuer: "https://auth.example.com"
    audience: "mcp-gateway"
    jwks_uri: "https://auth.example.com/.well-known/jwks.json"
```

---

## Middleware Pipeline

Requests to `POST /mcp` flow through (implemented in `packages/gateway/src/index.ts`):

```
1. express.json() → Parse JSON body (10 MB limit)
2. authMiddleware → API key / JWT / OAuth / OIDC validation
3. Rate limit check → Per-tenant token bucket + daily quota
4. Schema validation → JSON-RPC 2.0 + MCP method params
5. Allowlist check → Tool access control (tools/call only)
6. Cache check → Return cached response if hit
7. Fan-out router → Broadcast to upstreams, aggregate
8. Error handler → Catch AuthenticationError, schema errors
```

---

## Rate Limiting

| Limit | Description |
|-------|-------------|
| `requests_per_minute` | Max requests per minute (token bucket) |
| `requests_per_day` | Max requests per day (quota) |
| `burst_size` | Max burst size for token bucket |

### Rate Limit Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait before retrying (on 429) |

---

## Tool Allowlists

| Mode | Behavior |
|------|----------|
| `allow` | Only listed tools allowed (default deny) |
| `deny` | Listed tools blocked (default allow) |

| Pattern | Matches |
|---------|---------|
| `glean_*` | All tools starting with `glean_` |
| `*_search` | All tools ending with `_search` |
| `*` | All tools |
| `glean_search\|serval_query` | Exact tool names (pipe-separated) |

---

## Fan-out Routing

| Strategy | Behavior |
|----------|----------|
| `first-success` | Return first valid response, cancel others |
| `all-wait` | Wait for all responses, return aggregated |
| `majority-vote` | Return consensus from multiple upstreams |

---

## Response Caching

### Cache Bypass

```bash
curl -X POST http://gateway:8080/mcp \
  -H "x-api-key: your-key" \
  -H "Cache-Control: no-cache" \
  -d '{"jsonrpc": "2.0", ...}'
```

### Cache Response Headers

| Header | Description |
|--------|-------------|
| `X-Cache` | `HIT` or `MISS` |
| `X-Cache-TTL` | Remaining TTL in seconds |
| `X-Cache-Key` | Cache key (for debugging) |

---

## Audit Trail

### Event Types

| Event | Description |
|-------|-------------|
| `auth.success` | Successful authentication |
| `auth.failure` | Failed authentication |
| `rate_limit.exceeded` | Rate limit exceeded |
| `allowlist.denied` | Tool access denied |
| `tool.executed` | Tool execution |
| `cache.hit` | Cache hit |
| `cache.miss` | Cache miss |
| `upstream.error` | Upstream server error |

### Query Audit Logs

```bash
curl -X GET "http://gateway:8080/api/v1/audit?tenant_id=acme-corp&event_type=auth.failure&limit=100" \
  -H "Authorization: Bearer admin-token"
```

---

## Observability

### Structured Logging

All logs are structured JSON via Pino:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "mcp-gateway",
  "request_id": "req-abc123",
  "tenant_id": "acme-corp",
  "level": "info",
  "message": "Request processed"
}
```

### OpenTelemetry Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gateway.requests.total` | Counter | `tenant_id`, `status` |
| `gateway.requests.duration_ms` | Histogram | `tenant_id`, `method` |
| `gateway.auth.attempts` | Counter | `method`, `result` |
| `gateway.rate_limit.exceeded` | Counter | `tenant_id` |
| `gateway.cache.hits` | Counter | `tool` |
| `gateway.cache.misses` | Counter | `tool` |
| `gateway.upstream.errors` | Counter | `upstream`, `error_type` |

---

## Security Model

### Defense in Depth

| Layer | Measures |
|-------|----------|
| **Network** | HTTPS, API key or JWT required, rate limiting, TLS headers |
| **Authentication** | Multiple methods, proper crypto, key rotation, token revocation |
| **Authorization** | Per-tenant allowlists, scope-based access, resource isolation |
| **Input Validation** | JSON Schema validation, MCP compliance, size limits |

### PII Handling
- Never log raw tokens — only hashed identifiers
- Never log request bodies — only metadata
- Redact sensitive fields automatically
- Store only hashed API keys, never plaintext

### SSRF Protection

Upstream URLs reject:
- `localhost` and `::1`
- Private IP ranges (10.x, 172.16.x, 192.168.x)
- Link-local (169.254.0.0/16)

---

## Testing

Tests are co-located with source in each package (`packages/<name>/src/*.test.ts`).

```bash
pnpm test              # All tests via turbo
pnpm test:coverage     # With coverage reports
```

The test suite includes:
- **Unit tests** — per-function/per-class tests in each package
- **Integration tests** — full request pipeline in `packages/gateway/src/integration-pipeline.test.ts`
- **Contract tests** — JSON-RPC 2.0 compliance

---

## Graceful Shutdown

```typescript
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutdown requested');
  stopWatching();
  await gateway.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
```

---

## Deployment

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | HTTP listen port |
| `NODE_ENV` | `development` | Environment name |
| `REDIS_HOST` | — | Redis host (required) |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTel collector endpoint |
| `LOG_LEVEL` | `info` | Log level |
| `TENANT_CONFIG_DIR` | `./tenants` | Tenant config directory |
| `GATEWAY_CONFIG_PATH` | `./gateway.yaml` | Gateway config path |

### Docker

```bash
docker build -t mcp-gateway .
docker run -p 8080:8080 \
  -e REDIS_HOST=redis \
  -e REDIS_PASSWORD=secret \
  -v ./tenants:/app/tenants \
  -v ./gateway.yaml:/app/gateway.yaml \
  mcp-gateway
```

### GCP Cloud Run

```bash
gcloud run deploy mcp-gateway \
  --image gcr.io/my-project/mcp-gateway:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars REDIS_HOST=redis.example.com \
  --set-secrets REDIS_PASSWORD=redis-password:latest
```

---

## CI Pipeline

`.github/workflows/ci.yml` mirrors `a2a-reference-ts`:

```
install → audit, format, lint, typecheck, build → test (matrix: Node 20, 22) → coverage → all-checks
```

Uses `pnpm/action-setup@v4`, `actions/setup-node@v4` with pnpm cache.
Release via `.github/workflows/release.yml` using `changesets/action@v1`.

See [`GITHUB_TO_NPM.md`](./GITHUB_TO_NPM.md) for the publishing runbook.

---

## References

- **ARCHITECTURE.md** — System design deep dive
- **README.md** — Quick start and overview
- **GITHUB_TO_NPM.md** — Publishing runbook
- **MCP Specification** — https://modelcontextprotocol.io/
- **JSON-RPC 2.0** — https://www.jsonrpc.org/specification
