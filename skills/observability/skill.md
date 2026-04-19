# Observability

## Capability
OpenTelemetry tracing and metrics, structured logging, and health check endpoints for production monitoring.

## Components
| Component | Purpose |
|-----------|---------|
| `otel.ts` | OpenTelemetry SDK initialization and configuration |
| `otel.impl.ts` | OTel implementation with shutdown handling |
| `metrics.ts` | Prometheus metrics (Prometheus client) |
| `logger.ts` | Pino structured JSON logging |
| `health.ts` | Health check endpoints (liveness, readiness, deep) |

## Metrics
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gateway.requests.total` | Counter | `tenant_id`, `status` | Total requests |
| `gateway.requests.duration_ms` | Histogram | `tenant_id`, `method` | Request latency |
| `gateway.auth.attempts` | Counter | `method`, `result` | Auth attempts |
| `gateway.rate_limit.exceeded` | Counter | `tenant_id` | Rate limit hits |
| `gateway.cache.hits` | Counter | `tool` | Cache hits |
| `gateway.cache.misses` | Counter | `tool` | Cache misses |
| `gateway.upstream.errors` | Counter | `upstream`, `error_type` | Upstream errors |

## Health Endpoints
| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness probe - always returns 200 if process is running |
| `/health/deep` | Readiness probe - checks Redis, upstreams, tenant loader |

## Structured Logging
All logs are structured JSON with standard fields:
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

## Tracing
Each request generates an OpenTelemetry trace with spans for:
- `gateway.auth` — Authentication
- `gateway.rate_limit` — Rate limit check
- `gateway.cache` — Cache lookup
- `gateway.validation` — Schema validation
- `gateway.allowlist` — Tool allowlist check
- `gateway.upstream` — Upstream call
- `gateway.fanout` — Fan-out aggregation

## Error Handling
- OTel SDK fails gracefully if exporter unavailable
- Metrics collection continues even if OTel fails
- Health probe failures return 503 with details

## Security Considerations
- Logs contain no raw tokens or PII (automatic redaction)
- Request IDs included in all log lines for traceability
- Tenant IDs included in all log lines for multi-tenant debugging