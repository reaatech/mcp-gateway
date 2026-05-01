# @reaatech/mcp-gateway-fanout

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-fanout.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-fanout)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Multi-upstream fan-out routing and MCP client connections. Includes weighted upstream selection, circuit breaker pattern, retry logic with exponential backoff, response aggregation, and health checking — all the primitives needed to build resilient upstream MCP server communication.

## Installation

```bash
npm install @reaatech/mcp-gateway-fanout
# or
pnpm add @reaatech/mcp-gateway-fanout
```

## Feature Overview

- **Fan-out routing** — broadcast a single request to multiple upstreams
- **Three aggregation strategies** — `first-success`, `all-wait`, `majority-vote`
- **Weighted upstream selection** — round-robin, weighted random, or health-based ordering
- **Circuit breaker** — automatic failure tracking with open/close thresholds per upstream
- **Retry logic** — exponential backoff with jitter, configurable max retries, idempotency keys
- **Health checking** — periodic health probes with configurable thresholds
- **Connection pooling** — HTTP Keep-Alive connection reuse for upstream requests
- **Pluggable upstream caller** — inject custom callers for testing or alternative transports
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  executeFanout,
  setUpstreamCaller,
} from "@reaatech/mcp-gateway-fanout";

const upstreams = [
  { name: "primary", url: "https://mcp-server-1.example.com", weight: 0.7 },
  { name: "secondary", url: "https://mcp-server-2.example.com", weight: 0.3 },
];

// Fan-out with first-success strategy (return first valid response)
const result = await executeFanout(upstreams, request, "first-success");
console.log(`Contacted ${result.upstreamsContacted} upstreams, ${result.successful} succeeded`);
```

## API Reference

### Fan-out Router

| Export | Description |
|--------|-------------|
| `executeFanout(upstreams, request, strategy?, timeoutMs?)` | Fan-out to multiple upstreams |
| `executeFanoutFirstSuccess(upstreams, request, timeoutMs?)` | Fan-out, return first success |
| `setUpstreamCaller(caller)` | Inject custom upstream caller (for tests) |
| `resetUpstreamCaller()` | Restore default caller |
| `UpstreamCaller` | `(upstream, request, timeoutMs?) => Promise<UpstreamResponse>` |

### Aggregation Strategies

| Strategy | Behavior |
|----------|----------|
| `first-success` | Return first valid response, cancel others |
| `all-wait` | Wait for all responses, return aggregated |
| `majority-vote` | Return consensus from multiple upstreams |

### Upstream Selector

| Export | Description |
|--------|-------------|
| `selectUpstreams(upstreams, strategy?)` | Select upstreams by strategy |
| `selectRoundRobin(upstreams)` | Round-robin selection |
| `selectWeightedRandom(upstreams)` | Weighted random selection |
| `selectByHealth(upstreams)` | Order by health status |

### Failover Handler

| Export | Description |
|--------|-------------|
| `isCircuitOpen(upstreamName)` | Check if circuit breaker is open |
| `recordFailure(upstreamName)` | Record a failure for an upstream |
| `recordSuccess(upstreamName)` | Record a success (closes circuit) |
| `retryWithBackoff(fn, config?)` | Retry with exponential backoff + jitter |
| `filterHealthyUpstreams(upstreams)` | Filter out unhealthy upstreams |

### Upstream Client

| Export | Description |
|--------|-------------|
| `createJsonRpcRequest(method, params?, id?)` | Create a JSON-RPC 2.0 request object |
| `sendUpstreamRequest(config, request)` | Send a request to an upstream MCP server |

### Retry Logic

| Export | Description |
|--------|-------------|
| `sendWithRetry(config, request, retryConfig?, options?)` | Send with retries and optional idempotency key |
| `calculateBackoff(attempt, config)` | Calculate delay for exponential backoff |
| `isRetryableError(response)` | Check if error is retryable (5xx, timeout, network) |
| `DEFAULT_RETRY_CONFIG` | Default: 3 retries, 100ms base, 30s max, jitter |

### Health Checker

| Export | Description |
|--------|-------------|
| `HealthChecker` | Periodic health probe manager |
| `DEFAULT_HEALTH_CHECK_CONFIG` | Default: 30s interval, 5s timeout, 3 threshold |

### Connection Pool

| Export | Description |
|--------|-------------|
| `ConnectionPool` | HTTP Keep-Alive connection pool |
| `DEFAULT_POOL_CONFIG` | Default: 100 connections/host, 60s idle, 300s lifetime |

### Types

| Type | Description |
|------|-------------|
| `UpstreamTarget` | `{ name, url, weight?, timeoutMs?, healthy? }` |
| `UpstreamResponse` | `{ upstream, success, response?, error?, latencyMs }` |
| `FanOutResult` | `{ strategy, upstreamsContacted, successful, failed, responses, finalResponse? }` |
| `AggregationStrategy` | `'first-success' \| 'all-wait' \| 'majority-vote'` |
| `UpstreamConfig` | `{ name, url, weight?, timeoutMs?, maxRetries? }` |
| `JsonRpcRequest` | `{ jsonrpc: '2.0', id, method, params? }` |
| `JsonRpcResponse` | `{ jsonrpc: '2.0', id, result?, error? }` |
| `RetryConfig` | `{ maxRetries, baseDelayMs, maxDelayMs, jitter }` |

### Fan-out Response Format

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [...],
    "fanout": {
      "upstreamsContacted": 3,
      "successful": 2,
      "failed": 1,
      "strategy": "all-wait",
      "latenciesMs": { "primary": 123, "secondary": 456, "tertiary": null }
    }
  }
}
```

## Usage Patterns

### Circuit breaker with retry

```typescript
import {
  sendWithRetry,
  filterHealthyUpstreams,
  recordFailure,
  recordSuccess,
} from "@reaatech/mcp-gateway-fanout";

const healthy = filterHealthyUpstreams(upstreams);

for (const upstream of healthy) {
  try {
    const result = await sendWithRetry(
      { name: upstream.name, url: upstream.url },
      request,
      DEFAULT_RETRY_CONFIG,
    );
    recordSuccess(upstream.name);
    return result;
  } catch {
    recordFailure(upstream.name);
  }
}
throw new Error("All upstreams failed");
```

### All-wait aggregation

```typescript
import { executeFanout } from "@reaatech/mcp-gateway-fanout";

const result = await executeFanout(upstreams, request, "all-wait");

for (const response of result.responses) {
  console.log(
    `${response.upstream}: ${response.success ? "OK" : response.error} (${response.latencyMs}ms)`,
  );
}
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Upstream config validation
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates fan-out)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
