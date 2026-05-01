# Observability

## Capability
OpenTelemetry auto-initialization, pre-built metrics, distributed tracing, health check endpoints, and structured logging.

## Package
`@reaatech/mcp-gateway-observability` — `packages/observability/src/`

Logging is re-exported from `@reaatech/mcp-gateway-core` (`logger.ts`).

## Components
| Component | Purpose |
|-----------|---------|
| `otel.ts` | OTel SDK auto-initialization (if `OTEL_EXPORTER_OTLP_ENDPOINT` set) |
| `otel.impl.ts` | OTel implementation: NodeSDK setup, trace/metric exporters, shutdown |
| `metrics.ts` | Counters, histograms, gauges for gateway observability |
| `tracing.ts` | Spans for auth, rate limit, cache, validation, allowlist, upstream, fanout |
| `health.ts` | Liveness, readiness, deep-health probes with pluggable component checks |

## Metrics
| Metric | Type | Labels |
|--------|------|--------|
| `gateway.requests.total` | Counter | `tenant_id`, `status` |
| `gateway.requests.duration_ms` | Histogram | `tenant_id`, `method` |
| `gateway.auth.attempts` | Counter | `method`, `result` |
| `gateway.rate_limit.exceeded` | Counter | `tenant_id` |
| `gateway.cache.hits` | Counter | `tool` |
| `gateway.cache.misses` | Counter | `tool` |
| `gateway.upstream.errors` | Counter | `upstream`, `error_type` |
| `gateway.fanout.upstreams` | Counter | `strategy` |
| `gateway.validation.errors` | Counter | `type` |
| `gateway.upstream.latency_ms` | Histogram | `upstream` |
| `gateway.audit.events` | Counter | `event_type` |

## Health Endpoints
| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness — always returns 200 if process is running |
| `/health/deep` | Deep — runs all registered probes, per-component status |

## Health Probes
| Export | Description |
|--------|-------------|
| `registerProbe(name, fn)` | Register a custom health probe |
| `createRedisProbe(pingFn)` | Factory for Redis ping health check |
| `createUpstreamProbe(url)` | Factory for upstream HTTP health check |
| `resetProbes()` | Clear all probes (for testing) |

## Tracing
Each request generates spans for: `gateway.auth`, `gateway.rate_limit`, `gateway.cache`,
`gateway.validation`, `gateway.allowlist`, `gateway.upstream`, `gateway.fanout`.

## Error Handling
- OTel SDK fails gracefully if exporter unavailable
- Metrics collection continues even if OTel fails
- Health probe failures return 503 with per-component details

## Security Considerations
- Logs contain no raw tokens or PII (automatic redaction via core logger)
- Request IDs included in all log lines for traceability
- Tenant IDs included in all log lines for debugging
