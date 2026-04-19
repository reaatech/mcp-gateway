---
agent_id: "mcp-gateway"
display_name: "MCP Gateway"
version: "1.0.0"
description: "API gateway for MCP server aggregation and routing"
type: "mcp"
confidence_threshold: 0.9
---

# mcp-gateway — Agent Development Guide

## What this is

This document defines how to use `mcp-gateway` to build production-grade MCP
infrastructure with authentication, rate limiting, schema enforcement, tool
allowlists, audit trails, fan-out routing, and response caching.

**Target audience:** Platform teams deploying MCP servers at scale, SREs managing
MCP infrastructure, and enterprises requiring production-grade gateway features
for their MCP deployments.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCP Client    │────▶│    mcp-gateway   │────▶│  Upstream MCP   │
│  (Claude, etc)  │     │   (Gateway Core) │     │    Servers      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Redis Backend   │
                       │  (Cache + Rate   │
                       │   Limit + State) │
                       └──────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Auth Middleware** | `src/auth/` | OAuth/OIDC + API key validation |
| **Rate Limiter** | `src/rate-limit/` | Per-tenant rate limiting |
| **Schema Validator** | `src/validation/` | MCP message validation |
| **Tool Allowlist** | `src/allowlist/` | Per-tenant tool access control |
| **Fan-out Router** | `src/fanout/` | Broadcast to multiple upstreams |
| **Response Cache** | `src/cache/` | Redis-backed response caching |
| **Audit Trail** | `src/audit/` | Compliance logging |
| **MCP Client** | `src/mcp-client/` | Upstream server connections |

---

## Gateway Configuration

### Gateway Configuration File

```yaml
# gateway.yaml
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

### Tenant Configuration

Each tenant has its own configuration file:

```yaml
# tenants/acme-corp.yaml
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
  mode: "allow"  # Only listed tools allowed
  tools:
    - "glean_*"
    - "serval_*"
    - "internal_*"

cache:
  enabled: true
  ttl_seconds: 300
  max_size_mb: 100

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

### Schema Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `tenant_id` | yes | string | Unique tenant identifier |
| `display_name` | yes | string | Human-readable name |
| `auth.api_keys` | no | array | API key configurations |
| `auth.jwt` | no | object | JWT validation config |
| `rate_limits.requests_per_minute` | yes | number | RPM limit |
| `rate_limits.requests_per_day` | yes | number | Daily limit |
| `allowlist.mode` | yes | string | "allow" or "deny" |
| `allowlist.tools` | yes | string[] | Tool patterns |
| `cache.enabled` | yes | boolean | Enable caching |
| `cache.ttl_seconds` | yes | number | Cache TTL |
| `upstreams` | yes | array | Upstream server definitions |

---

## Authentication

### API Key Authentication

Include the API key in the `x-api-key` header:

```bash
curl -X POST http://gateway:8080/mcp \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {...}}'
```

### JWT Authentication

Include the JWT in the `Authorization` header:

```bash
curl -X POST http://gateway:8080/mcp \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {...}}'
```

### OAuth2 Token Introspection

The gateway supports RFC 7662 token introspection for OAuth2 tokens:

```yaml
auth:
  oauth:
    introspection_url: "https://auth.example.com/oauth/introspect"
    client_id: "mcp-gateway"
    client_secret_env: "OAUTH_CLIENT_SECRET"
```

### OIDC ID Token Validation

The gateway validates OIDC ID tokens:

```yaml
auth:
  oidc:
    issuer: "https://auth.example.com"
    audience: "mcp-gateway"
    jwks_uri: "https://auth.example.com/.well-known/jwks.json"
```

---

## Rate Limiting

### Per-Tenant Quotas

Each tenant has configurable rate limits:

| Limit | Description |
|-------|-------------|
| `requests_per_minute` | Max requests per minute |
| `requests_per_day` | Max requests per day |
| `burst_size` | Max burst size (token bucket) |

### Rate Limit Headers

The gateway includes standard rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait before retrying (on 429) |

### Rate Limit Response

When rate limited, the gateway returns:

```json
{
  "error": {
    "code": -32000,
    "message": "Rate limit exceeded",
    "data": {
      "retry_after": 60,
      "limit": 1000,
      "remaining": 0,
      "reset": 1713225600
    }
  }
}
```

---

## Schema Validation

### MCP Protocol Validation

The gateway validates all MCP messages against the MCP specification:

- JSON-RPC 2.0 format compliance
- Required fields present
- Field types validated
- Method names valid

### Tool Input/Output Validation

Tool inputs and outputs are validated against declared schemas:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "query",
      "expected": "string",
      "received": "number"
    }
  }
}
```

---

## Tool Allowlists

### Allowlist Modes

| Mode | Behavior |
|------|----------|
| `allow` | Only listed tools are allowed (default deny) |
| `deny` | Listed tools are blocked (default allow) |

### Tool Patterns

Tool patterns support wildcards:

| Pattern | Matches |
|---------|---------|
| `glean_*` | All tools starting with `glean_` |
| `*_search` | All tools ending with `_search` |
| `*` | All tools |
| `glean_search\|serval_query` | Exact tool names (pipe-separated) |

### Allowlist Violation Response

```json
{
  "error": {
    "code": -32601,
    "message": "Tool not allowed",
    "data": {
      "tool": "admin_delete_all",
      "tenant": "acme-corp",
      "policy": "allow"
    }
  }
}
```

---

## Fan-out Routing

### Configuration

Configure multiple upstreams for fan-out:

```yaml
upstreams:
  - name: "primary"
    url: "https://mcp-server-1.example.com"
    weight: 0.7
  - name: "secondary"
    url: "https://mcp-server-2.example.com"
    weight: 0.3
  - name: "tertiary"
    url: "https://mcp-server-3.example.com"
    weight: 0.0  # Standby only
```

### Aggregation Strategies

| Strategy | Behavior |
|----------|----------|
| `first-success` | Return first valid response, cancel others |
| `all-wait` | Wait for all responses, return aggregated |
| `majority-vote` | Return consensus from multiple upstreams |

### Fan-out Response

When using `all-wait` strategy:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [...],
    "fanout": {
      "upstreams_contacted": 3,
      "successful": 2,
      "failed": 1,
      "strategy": "all-wait",
      "latencies_ms": {
        "primary": 123,
        "secondary": 456,
        "tertiary": null
      }
    }
  }
}
```

---

## Response Caching

### Cache Configuration

```yaml
cache:
  enabled: true
  ttl_seconds: 300
  max_size_mb: 100
  strategies:
    - tools: ["glean_search", "serval_query"]
      ttl_seconds: 60
    - tools: ["*_static"]
      ttl_seconds: 3600
```

### Cache Bypass

Bypass cache with the `Cache-Control` header:

```bash
curl -X POST http://gateway:8080/mcp \
  -H "x-api-key: your-key" \
  -H "Cache-Control: no-cache" \
  -d '{"jsonrpc": "2.0", ...}'
```

### Cache Headers in Response

| Header | Description |
|--------|-------------|
| `X-Cache` | `HIT` or `MISS` |
| `X-Cache-TTL` | Remaining TTL in seconds |
| `X-Cache-Key` | Cache key used (for debugging) |

---

## Audit Trail

### Audit Events

The gateway logs all security-relevant events:

| Event Type | Description |
|------------|-------------|
| `auth.success` | Successful authentication |
| `auth.failure` | Failed authentication |
| `rate_limit.exceeded` | Rate limit exceeded |
| `allowlist.denied` | Tool access denied |
| `tool.executed` | Tool execution |
| `cache.hit` | Cache hit |
| `cache.miss` | Cache miss |
| `upstream.error` | Upstream server error |

### Audit Log Format

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "event_type": "tool.executed",
  "tenant_id": "acme-corp",
  "user_id": "user-123",
  "request_id": "req-abc123",
  "tool": "glean_search",
  "success": true,
  "duration_ms": 234,
  "cache_hit": false,
  "upstream": "primary"
}
```

### Query Audit Logs

```bash
curl -X GET "http://gateway:8080/api/v1/audit?tenant_id=acme-corp&event_type=auth.failure&limit=100" \
  -H "Authorization: Bearer admin-token"
```

---

## Skill System

Skills represent the atomic capabilities of the gateway. Each skill corresponds
to a component of the gateway.

### Available Skills

| Skill ID | File | Description |
|----------|------|-------------|
| `auth` | `skills/auth/skill.md` | Authentication and authorization |
| `rate-limiting` | `skills/rate-limiting/skill.md` | Per-tenant rate limiting |
| `schema-validation` | `skills/schema-validation/skill.md` | MCP message validation |
| `tool-allowlist` | `skills/tool-allowlist/skill.md` | Tool access control |
| `fan-out` | `skills/fan-out/skill.md` | Multi-upstream broadcasting |
| `response-caching` | `skills/response-caching/skill.md` | Response cache management |
| `audit-trail` | `skills/audit-trail/skill.md` | Compliance logging |

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                                     │
│ - HTTPS required in production                                       │
│ - API key or JWT required on all requests                            │
│ - Rate limiting per tenant                                           │
│ - TLS security headers                                               │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication                                              │
│ - Multiple auth methods (API key, JWT, OAuth, OIDC)                  │
│ - Token validation with proper crypto                                │
│ - Key rotation support                                               │
│ - Token revocation checking                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Authorization                                               │
│ - Per-tenant tool allowlists                                         │
│ - Scope-based access control                                         │
│ - Resource isolation                                                 │
│ - Audit logging for all access                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Input Validation                                            │
│ - JSON Schema validation for all messages                            │
│ - MCP protocol compliance checks                                     │
│ - Size limits on requests                                            │
│ - Rate limiting on all endpoints                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### PII Handling

- **Never log raw tokens** — only hashed identifiers
- **Never log request bodies** — only metadata
- **Redact sensitive fields** — automatic PII redaction
- **Secure token storage** — hashed API keys, never plaintext

### SSRF Protection

Upstream URLs are validated to reject:
- `localhost` and `::1`
- Private IP ranges (10.x, 172.16.x, 192.168.x)
- Link-local (169.254.0.0/16)

---

## Observability

### Structured Logging

All logs are structured JSON with standard fields:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "mcp-gateway",
  "request_id": "req-abc123",
  "tenant_id": "acme-corp",
  "level": "info",
  "message": "Request processed",
  "method": "tools/call",
  "tool": "glean_search",
  "duration_ms": 234,
  "cache_hit": false,
  "upstream": "primary",
  "status": "success"
}
```

### OpenTelemetry Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gateway.requests.total` | Counter | `tenant_id`, `status` | Total requests |
| `gateway.requests.duration_ms` | Histogram | `tenant_id`, `method` | Request latency |
| `gateway.auth.attempts` | Counter | `method`, `result` | Auth attempts |
| `gateway.rate_limit.exceeded` | Counter | `tenant_id` | Rate limit hits |
| `gateway.cache.hits` | Counter | `tool` | Cache hits |
| `gateway.cache.misses` | Counter | `tool` | Cache misses |
| `gateway.upstream.errors` | Counter | `upstream`, `error_type` | Upstream errors |

### Tracing

Each request generates an OpenTelemetry trace with spans for:
- `gateway.auth` — Authentication
- `gateway.rate_limit` — Rate limit check
- `gateway.cache` — Cache lookup
- `gateway.validation` — Schema validation
- `gateway.allowlist` — Tool allowlist check
- `gateway.upstream` — Upstream call
- `gateway.fanout` — Fan-out aggregation

---

## Testing

### Contract Tests

The gateway includes contract tests that validate:

1. **MCP Protocol Compliance** — JSON-RPC 2.0 spec compliance
2. **Auth Contract** — Authentication flow correctness
3. **Rate Limit Contract** — Rate limiting behavior
4. **Cache Contract** — Cache hit/miss behavior
5. **Allowlist Contract** — Tool access control

Run contract tests:

```bash
npm run test:contract
```

### Integration Tests

Test the full request pipeline:

```bash
# Start gateway with Redis
docker compose up -d

# Run integration tests
npm run test:integration
```

---

## Graceful Shutdown

The gateway handles shutdown signals (SIGTERM, SIGINT) gracefully to prevent dropped requests:

### Shutdown Sequence

1. **Stop accepting new connections** — HTTP server stops accepting new requests
2. **Wait for in-flight requests** — Existing requests complete normally
3. **Close gateway resources** — Rate limiter, cache, OAuth cleanup
4. **Shutdown OTel** — Flush pending telemetry data
5. **Exit cleanly** — Process exits with code 0

### Shutdown Handler

```typescript
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutdown requested');
  stopWatching();
  await gateway.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // OTel and OAuth cleanup...
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
```

### Resource Cleanup

| Resource | Cleanup Method |
|----------|----------------|
| Rate Limiter | `rateLimiter.close()` |
| Cache Manager | `cacheManager.clear()` |
| OAuth Introspection | `shutdownOAuthIntrospection()` |
| Health Checker | `healthChecker.close()` |
| File Watchers | `stopWatching()` |

---

## Memory Management

### OAuth Introspection Cache

The introspection cache has bounded growth with automatic cleanup:

- **Max entries**: 10,000 tokens
- **Background cleanup**: Every 60 seconds
- **Eviction policy**: LRU (oldest entries evicted first when at capacity)

```typescript
// Automatic cleanup happens in background
// No manual intervention required
```

### Circuit Breaker State

Circuit breaker entries are automatically cleaned up:

- **Max entries**: 1,000 upstreams
- **Entry TTL**: 1 hour of inactivity
- **Eviction**: Automatic when max entries reached

### Health Checker Intervals

Health check intervals are properly cleaned up:

```typescript
healthChecker.stop(); // Clears all intervals
// or
healthChecker.close(); // Alias for stop()
```

---

## Deployment

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `development` | Environment name |
| `REDIS_HOST` | yes | — | Redis host |
| `REDIS_PORT` | no | `6379` | Redis port |
| `REDIS_PASSWORD` | no | — | Redis password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTel collector endpoint |
| `LOG_LEVEL` | no | `info` | Log level |
| `TENANT_CONFIG_DIR` | no | `./tenants` | Tenant config directory |
| `GATEWAY_CONFIG_PATH` | no | `./gateway.yaml` | Gateway config path |

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

## Checklist: Production Readiness

Before deploying mcp-gateway to production:

- [ ] TLS enabled with valid certificates
- [ ] Redis cluster configured for HA
- [ ] All tenants configured with auth
- [ ] Rate limits set appropriately per tenant
- [ ] Tool allowlists configured per tenant
- [ ] Upstream servers health-checked
- [ ] Audit logging enabled and storage configured
- [ ] OpenTelemetry exporter configured
- [ ] Alert policies configured for key metrics
- [ ] API keys rotated and secure
- [ ] SSRF protection validated
- [ ] PII redaction verified
- [ ] Backup and restore procedures documented
- [ ] Disaster recovery plan tested
- [ ] Load testing completed
- [ ] Security audit completed

---

## References

- **ARCHITECTURE.md** — System design deep dive
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **docs/CONFIGURATION.md** — Configuration reference
- **docs/SECURITY.md** — Security guide
- **MCP Specification** — https://modelcontextprotocol.io/
- **JSON-RPC 2.0** — https://www.jsonrpc.org/specification
