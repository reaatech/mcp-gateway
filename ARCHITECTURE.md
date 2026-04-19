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

## Component Deep Dive

### Gateway Layer

The gateway processes all inbound HTTP traffic through a middleware pipeline:

| Middleware | Order | Purpose |
|------------|-------|---------|
| **TLS Termination** | 1 | HTTPS enforcement, security headers |
| **Request ID** | 2 | Generate/propagate request ID |
| **Auth** | 3 | Validate credentials, extract tenant |
| **Rate Limit** | 4 | Check rate limits, reject if exceeded |
| **Cache Lookup** | 5 | Check cache for response |
| **Schema Validation** | 6 | Validate MCP JSON-RPC format |
| **Tool Allowlist** | 7 | Check tool access permissions |
| **Fan-out Router** | 8 | Route to upstream(s) |
| **Cache Store** | 9 | Cache successful responses |
| **Audit Log** | 10 | Log security events |

**Design Decision:** Middleware order is critical — auth before rate limiting
(prevents rate limit bypass via unauthenticated requests), cache before
validation (avoid caching invalid requests).

### Authentication System

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Authentication Pipeline                          │
│                                                                      │
│  Request with credentials                                           │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Extract Auth   │───▶│  Determine Auth │───▶│  Validate with  │  │
│  │  Credentials    │    │  Method         │    │  Appropriate    │  │
│  │                 │    │                 │    │  Validator      │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                        │             │
│                                                        ▼             │
│                                               ┌─────────────────┐    │
│                                               │  Extract Tenant │    │
│                                               │  & Permissions  │    │
│                                               └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Auth Methods:**

| Method | Validation | Use Case |
|--------|------------|----------|
| **API Key** | Hash comparison (SHA-256) | Service-to-service |
| **JWT** | Signature verification (RS256/ES256) | User authentication |
| **OAuth2** | Token introspection (RFC 7662) | Third-party apps |
| **OIDC** | ID token validation | SSO integration |

**Design Decision:** API keys are stored as hashes, never plaintext. The gateway
only stores `SHA-256(key)`, so even a database breach doesn't expose valid keys.

### Rate Limiting System

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Rate Limiting Flow                              │
│                                                                      │
│  Request → Extract Tenant → Check Rate Limit → Allow or Reject      │
│                                   │                                  │
│                                   ▼                                  │
│                          ┌─────────────────┐                        │
│                          │  Token Bucket   │                        │
│                          │  Algorithm      │                        │
│                          │                 │                        │
│                          │ - Capacity:     │                        │
│                          │   requests/min  │                        │
│                          │ - Refill rate:  │                        │
│                          │   per config    │                        │
│                          │ - Burst:        │                        │                        │
│                          │   configured    │                        │
│                          └─────────────────┘                        │
│                                   │                                  │
│                                   ▼                                  │
│                          ┌─────────────────┐                        │
│                          │    Redis Lua    │                        │
│                          │    Script       │                        │
│                          │                 │                        │
│                          │ - Atomic op     │                        │
│                          │ - Distributed   │                        │
│                          │ - Low latency   │                        │
│                          └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Rate Limit Store:**

| Store | Use Case | Pros | Cons |
|-------|----------|------|------|
| **Redis** | Production, multi-instance | Distributed, atomic, fast | External dependency |
| **Memory** | Development, single-instance | No dependency, fastest | Not distributed |

**Design Decision:** Redis with Lua scripts ensures atomic operations across
distributed instances. The token bucket algorithm is implemented entirely in
Lua to avoid race conditions.

### Schema Validation System

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Schema Validation Flow                           │
│                                                                      │
│  Incoming MCP Request                                               │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   JSON-RPC 2.0 Validation                    │    │
│  │                                                               │    │
│  │  - `jsonrpc` field present and equals "2.0"                 │    │
│  │  - `id` field present (number or string)                    │    │
│  │  - `method` field present (string)                          │    │
│  │  - `params` field optional (object or array)                │    │
│  │                                                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    MCP Protocol Validation                   │    │
│  │                                                               │    │
│  │  - Method is valid MCP method                               │    │
│  │  - For tools/call: tool name present                        │    │
│  │  - For tools/call: arguments match tool schema              │    │
│  │  - For initialize: protocol version compatible              │    │
│  │                                                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Tool Input Validation                      │    │
│  │                                                               │    │
│  │  - Load tool schema from upstream                           │    │
│  │  - Validate arguments against JSON Schema                   │    │
│  │  - Check required fields present                            │    │
│  │  - Validate field types and constraints                     │    │
│  │                                                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  Valid Request → Continue to upstream                               │
│  Invalid Request → Return -32602 (Invalid params)                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Validation Layers:**

1. **JSON-RPC 2.0** — Base protocol validation
2. **MCP Protocol** — MCP-specific method validation
3. **Tool Schema** — Per-tool input validation

**Design Decision:** Tool schemas are cached after first fetch from upstream.
Schema cache is invalidated on SIGHUP or when upstream schemas change.

### Tool Allowlist System

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Tool Allowlist Flow                             │
│                                                                      │
│  Request with tool name                                             │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Get Tenant     │───▶│  Get Allowlist  │───▶│  Match Tool     │  │
│  │  Allowlist      │    │  Mode (allow/   │    │  Against        │  │
│  │                 │    │  deny)          │    │  Patterns       │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                        │             │
│                                                        ▼             │
│                                               ┌─────────────────┐    │
│                                               │  Pattern Match  │    │
│                                               │                 │    │
│                                               │ - Wildcards:    │    │
│                                               │   glean_*       │    │
│                                               │ - Regex:        │    │
│                                               │   ^admin_.*     │    │
│                                               │ - Exact:        │    │
│                                               │   specific_tool │    │
│                                               └─────────────────┘    │
│                                                        │             │
│                                                        ▼             │
│                                               ┌─────────────────┐    │
│                                               │  Mode Check:    │    │
│                                               │                 │    │
│                                               │ allow mode:     │    │
│                                               │ matched = OK    │    │
│                                               │                 │    │
│                                               │ deny mode:      │    │
│                                               │ matched = BLOCK │    │
│                                               └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Allowlist Modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `allow` | Only listed tools allowed | High security, explicit opt-in |
| `deny` | Listed tools blocked | Permissive, explicit opt-out |

**Design Decision:** Default-deny (allow mode) is recommended for production.
Tenants must explicitly list allowed tools, preventing accidental exposure.

### Fan-out Router

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Fan-out Router Flow                            │
│                                                                      │
│  Request                                                            │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Select         │───▶│  Send to All    │───▶│  Aggregate      │  │
│  │  Upstreams      │    │  Upstreams      │    │  Responses      │  │
│  │  (by weight)    │    │  (parallel)     │    │  (by strategy)  │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                        │             │
│                                                        ▼             │
│                                               ┌─────────────────┐    │
│                                               │  Aggregation    │    │
│                                               │  Strategies:    │    │
│                                               │                 │    │
│                                               │ - first-success:│    │
│                                               │   return first  │    │
│                                               │   valid         │    │
│                                               │                 │    │
│                                               │ - all-wait:     │    │
│                                               │   wait all,     │    │
│                                               │   merge results │    │
│                                               │                 │    │
│                                               │ - majority-vote:│    │
│                                               │   consensus     │    │
│                                               │   from all      │    │
│                                               └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Aggregation Strategies:**

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `first-success` | Return first valid response | Low latency, redundancy |
| `all-wait` | Wait for all, merge results | Data aggregation |
| `majority-vote` | Consensus from multiple | High reliability |

**Design Decision:** Fan-out uses parallel requests with configurable timeout.
Slow upstreams don't block the response — they're cancelled after timeout.

### Response Cache

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Cache Flow                                    │
│                                                                      │
│  Request                                                            │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Generate       │───▶│  Check Redis    │───▶│  Cache Hit?     │  │
│  │  Cache Key      │    │  for Key        │    │                 │  │
│  │  (request hash) │    │                 │    │  Yes → Return   │  │
│  └─────────────────┘    └─────────────────┘    │  Cached         │  │
│                                                 │                 │  │
│                                                 │  No → Continue  │  │
│                                                 └─────────────────┘  │
│                                                        │             │
│                                                        ▼             │
│                                               ┌─────────────────┐    │
│                                               │  Send to        │    │
│                                               │  Upstream       │    │
│                                               └─────────────────┘    │
│                                                        │             │
│                                                        ▼             │
│                                               ┌─────────────────┐    │
│                                               │  Cache          │    │
│                                               │  Response       │    │
│                                               │  (if cacheable) │    │
│                                               └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Cache Key Generation:**

```
cache_key = SHA-256(tenant_id + method + JSON(params))
```

**Cacheability Rules:**

| Condition | Cacheable? |
|-----------|------------|
| GET requests | Yes (default) |
| tools/call with idempotent tools | Yes (configurable) |
| tools/call with side effects | No |
| Requests with Cache-Control: no-cache | No |
| Responses with errors | No |

**Design Decision:** Cache keys include tenant_id to prevent cross-tenant cache
pollution. Cache TTL is configurable per tool pattern for fine-grained control.

### Audit Trail

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Audit Trail Flow                              │
│                                                                      │
│  Security Event                                                     │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Create Audit   │───▶│  Redact PII     │───▶│  Write to       │  │
│  │  Event          │    │                 │    │  Storage        │  │
│  │                 │    │ - Hash tokens   │    │                 │  │
│  │ - Timestamp     │    │ - Remove body   │    │ - File (JSON)   │  │
│  │ - Event type    │    │ - Mask IPs      │    │ - Database      │  │
│  │ - Context       │    │                 │    │ - SIEM          │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Audit Event Types:**

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

**Storage Backends:**

| Backend | Use Case | Pros | Cons |
|---------|----------|------|------|
| **File** | Development, small deployments | Simple, no dependency | Not searchable |
| **Database** | Production | Searchable, queryable | External dependency |
| **SIEM** | Enterprise | Integrated with security tools | Complex setup |

---

## Data Flow

### Complete Request Flow

```
1. Client sends HTTP request to gateway
        │
2. TLS termination (if HTTPS)
        │
3. Generate/extract request ID
        │
4. Authentication:
   - Extract credentials from headers
   - Validate against configured method
   - Extract tenant ID and user info
        │
5. Rate limiting:
   - Look up tenant rate limits
   - Check token bucket in Redis
   - Reject with 429 if exceeded
        │
6. Cache lookup:
   - Generate cache key from request
   - Check Redis for cached response
   - Return cached response if hit
        │
7. Schema validation:
   - Validate JSON-RPC 2.0 format
   - Validate MCP protocol compliance
   - Validate tool input schema
        │
8. Tool allowlist check:
   - Get tenant's allowlist
   - Match tool name against patterns
   - Reject with 403 if not allowed
        │
9. Fan-out routing:
   - Select upstream(s) by weight
   - Send request in parallel
   - Aggregate responses by strategy
        │
10. Cache store:
    - If response is cacheable
    - Store in Redis with TTL
        │
11. Audit logging:
    - Create audit event
    - Redact PII
    - Write to storage
        │
12. Return response to client
        │
13. Observability:
    - Close trace span
    - Record metrics
    - Write structured log
```

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                                     │
│ - HTTPS required in production                                       │
│ - TLS 1.2+ enforced                                                  │
│ - Security headers (CSP, HSTS, X-Frame-Options)                      │
│ - Rate limiting on all endpoints                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication                                              │
│ - Multiple auth methods (API key, JWT, OAuth, OIDC)                  │
│ - Cryptographic token validation                                     │
│ - Key rotation support                                               │
│ - Token revocation checking                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Authorization                                               │
│ - Per-tenant tool allowlists                                         │
│ - Scope-based access control                                         │
│ - Resource isolation                                                 │
│ - Comprehensive audit logging                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Input Validation                                            │
│ - JSON Schema validation                                             │
│ - MCP protocol compliance                                            │
│ - Size limits on requests                                            │
│ - SSRF protection on upstream URLs                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 5: Data Protection                                             │
│ - PII redaction in logs                                              │
│ - Hashed API key storage                                             │
│ - Encrypted Redis connections                                        │
│ - Secure secret management                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### SSRF Protection

Upstream URLs are validated to reject:
- `localhost` and `::1`
- Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Link-local (169.254.0.0/16)
- Loopback (127.0.0.0/8)

This validation runs regardless of environment to catch misconfigurations early.

### PII Handling

- **API keys** — stored as SHA-256 hashes, never plaintext
- **Tokens** — never logged, only metadata
- **Request bodies** — not logged (only method, tool name, status)
- **IP addresses** — masked in logs (e.g., `192.168.1.xxx`)
- **User identifiers** — hashed for audit logs

---

## Deployment Architecture

### GCP Cloud Run

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Run Service                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    mcp-gateway Container                     │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ Gateway   │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Core      │  │ Sidecar   │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Min instances: 1 (for low latency)                               │
│  - Max instances: 20 (configurable)                                 │
│  - Memory: 1GB, CPU: 1 vCPU                                         │
│  - Timeout: 60s (configurable)                                      │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
│  State: Redis (external, Memorystore)                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Client sends HTTPS request
        │
2. Cloud Load Balancer terminates TLS
        │
3. Cloud Run instance receives request
        │
4. Gateway processes through middleware pipeline
        │
5. Redis lookup (cache, rate limit)
        │
6. Upstream call(s) via HTTPS
        │
7. Response cached in Redis (if applicable)
        │
8. Audit event written to storage
        │
9. Response returned to client
        │
10. Metrics and traces exported to OTel
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Auth service unavailable | Timeout on validation | Fail-closed (reject all) |
| Redis unavailable | Connection error | Fail-open for cache, fail-closed for rate limit |
| Upstream server error | Non-2xx response | Try next upstream, circuit breaker |
| Schema validation error | Parse error | Return -32602 (Invalid params) |
| Rate limit exceeded | Token bucket empty | Return 429 with Retry-After |
| Cache miss | Key not found | Continue to upstream |
| All upstreams unavailable | All connections failed | Return 502 with details |
| TLS certificate expired | TLS handshake failure | Connection refused, alert |

---

## Observability

### Tracing

Every request generates an OpenTelemetry trace with spans for:
- `gateway.tls` — TLS termination
- `gateway.auth` — Authentication
- `gateway.rate_limit` — Rate limit check
- `gateway.cache` — Cache lookup/store
- `gateway.validation` — Schema validation
- `gateway.allowlist` — Tool allowlist check
- `gateway.upstream` — Upstream call(s)
- `gateway.fanout` — Fan-out aggregation
- `gateway.audit` — Audit logging

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gateway.requests.total` | Counter | `tenant_id`, `status` | Total requests |
| `gateway.requests.duration_ms` | Histogram | `tenant_id`, `method` | Request latency |
| `gateway.auth.attempts` | Counter | `method`, `result` | Auth attempts |
| `gateway.auth.failures` | Counter | `method`, `reason` | Auth failures |
| `gateway.rate_limit.exceeded` | Counter | `tenant_id` | Rate limit hits |
| `gateway.cache.hits` | Counter | `tool` | Cache hits |
| `gateway.cache.misses` | Counter | `tool` | Cache misses |
| `gateway.cache.size` | Gauge | — | Cache size (bytes) |
| `gateway.upstream.requests` | Counter | `upstream`, `status` | Upstream requests |
| `gateway.upstream.errors` | Counter | `upstream`, `error_type` | Upstream errors |
| `gateway.upstream.latency_ms` | Histogram | `upstream` | Upstream latency |
| `gateway.fanout.upstreams` | Histogram | — | Upstreams per fan-out |
| `gateway.allowlist.denied` | Counter | `tenant_id`, `tool` | Allowlist denials |
| `gateway.validation.errors` | Counter | `type` | Validation errors |
| `gateway.audit.events` | Counter | `event_type` | Audit events |

### Logging

All logs are structured JSON with standard fields:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "mcp-gateway",
  "request_id": "req-abc123",
  "tenant_id": "acme-corp",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "level": "info",
  "message": "Request processed",
  "method": "tools/call",
  "tool": "glean_search",
  "duration_ms": 234,
  "cache_hit": false,
  "upstream": "primary",
  "status": "success",
  "http_status": 200
}
```

---

## References

- **AGENTS.md** — Agent development guide
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **MCP Specification** — https://modelcontextprotocol.io/
- **JSON-RPC 2.0** — https://www.jsonrpc.org/specification
- **RFC 7662** — OAuth 2.0 Token Introspection
