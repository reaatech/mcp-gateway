# @reaatech/mcp-gateway-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-observability.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

OpenTelemetry tracing, metrics, health checks, and structured logging for the MCP Gateway. Provides auto-configured OTel SDK initialization, pre-built gateway metrics (counters, histograms, gauges), liveness/readiness/deep-health endpoints, and structured JSON logging via Pino.

## Installation

```bash
npm install @reaatech/mcp-gateway-observability
# or
pnpm add @reaatech/mcp-gateway-observability
```

## Feature Overview

- **Auto-configured OpenTelemetry** — initializes SDK if `OTEL_EXPORTER_OTLP_ENDPOINT` is set
- **Pre-built metrics** — counters for requests, auth attempts, cache hits/misses, rate limits, upstream errors, and fan-out; histograms for request and upstream latency
- **Distributed tracing** — spans for auth, rate limiting, cache, validation, allowlist, upstream, and fan-out operations
- **Health checks** — `GET /health` (liveness), `GET /health/deep` (deep probes with component-level status)
- **Pluggable probes** — register custom health probes for Redis, upstreams, or any dependency
- **Structured logging** — Pino-based JSON logger re-exported from `@reaatech/mcp-gateway-core`
- **Prometheus-style metrics format** — all metrics follow standard conventions with `tenant_id`, `status`, `method` labels
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  getLiveness,
  getDeepHealth,
  registerProbe,
  createRedisProbe,
} from "@reaatech/mcp-gateway-observability";
import express from "express";

const app = express();

// Liveness — quick check, always returns 200 if process is alive
app.get("/health", (req, res) => res.json(getLiveness()));

// Deep health — runs all registered probes
app.get("/health/deep", async (req, res) => {
  const status = await getDeepHealth();
  res.status(status.status === "unhealthy" ? 503 : 200).json(status);
});

// Register a custom probe
registerProbe("redis", createRedisProbe(() => redis.ping()));
```

## API Reference

### Health Checks

| Export | Description |
|--------|-------------|
| `registerProbe(name, probe)` | Register a named health probe function |
| `unregisterProbe(name)` | Remove a registered probe |
| `resetProbes()` | Clear all registered probes (for testing) |
| `getLiveness()` | Returns `{ status: 'healthy', version, uptimeSeconds }` — always succeeds |
| `getReadiness()` | Returns combined readiness status from all probes |
| `getDeepHealth()` | Returns per-component health with individual latency timings |
| `createRedisProbe(pingFn, timeoutMs?)` | Factory for Redis ping-based health probe |
| `createUpstreamProbe(url, timeoutMs?)` | Factory for HTTP GET-based upstream health probe |
| `HealthProbe` | `() => Promise<ComponentHealth>` |
| `HealthStatus` | `{ status, version?, uptimeSeconds?, components? }` |
| `ComponentHealth` | `{ status, message?, latencyMs? }` |

### Metrics

All metrics use OpenTelemetry API. Meter name is `SERVICE_NAME` (`mcp-gateway`).

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `gateway.requests.total` | `tenant_id`, `status` | Total requests processed |
| `gateway.auth.attempts` | `method`, `result` | Auth attempts by type and outcome |
| `gateway.auth.failures` | `reason` | Failed auth attempts |
| `gateway.cache.hits` | `tool` | Cache hit count per tool |
| `gateway.cache.misses` | `tool` | Cache miss count per tool |
| `gateway.rate_limit.exceeded` | `tenant_id` | Rate limit exceeded count |
| `gateway.allowlist.denied` | `tenant_id`, `tool` | Allowlist denial count |
| `gateway.upstream.requests` | `upstream`, `method` | Upstream request count |
| `gateway.upstream.errors` | `upstream`, `error_type` | Upstream error count |
| `gateway.fanout.upstreams` | `strategy` | Fan-out upstream count |
| `gateway.validation.errors` | `type` | Validation error count |
| `gateway.audit.events` | `event_type` | Audit event count |

#### Histograms

| Metric | Labels | Description |
|--------|--------|-------------|
| `gateway.requests.duration_ms` | `tenant_id`, `method` | Request processing time |
| `gateway.upstream.latency_ms` | `upstream` | Upstream call latency |

#### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `gateway.cache.size` | — | Current cache entry count |
| `gateway.rate_limit.remaining` | `tenant_id` | Remaining rate limit tokens |

#### Utility

| Export | Description |
|--------|-------------|
| `resetMetricsState()` | Reset all metric values (for testing only) |

### Tracing

| Export | Description |
|--------|-------------|
| `getTracer()` | Get the OpenTelemetry tracer |
| `startSpan(name, options?)` | Start a new span with standard attributes |
| `endSpan(span, status?)` | End a span with optional status code |

### OpenTelemetry Lifecycle

| Export | Description |
|--------|-------------|
| `setupOTel()` | Initialize the OTel SDK (called automatically on import) |
| `shutdownOTel()` | Gracefully shut down OTel (flush pending telemetry) |

#### Auto-Init Behavior

The SDK initializes automatically when the package is imported, but only if `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is set. In production without the endpoint, it logs a warning and skips initialization. Raw JSON is always used (no pretty-printing in production).

## Usage Patterns

### Enabling OpenTelemetry

```bash
# Set the OTLP endpoint (e.g., Jaeger, OpenTelemetry Collector)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# The SDK auto-initializes on import — no code needed
node dist/index.js
```

### Custom health probe

```typescript
import { registerProbe } from "@reaatech/mcp-gateway-observability";

registerProbe("database", async () => {
  const start = Date.now();
  try {
    await db.query("SELECT 1");
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "unhealthy", message: err.message };
  }
});
```

### Graceful shutdown with OTel flush

```typescript
import { shutdownOTel } from "@reaatech/mcp-gateway-observability";

process.on("SIGTERM", async () => {
  await shutdownOTel();
  process.exit(0);
});
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Logger and constants re-exported here
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates observability)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
