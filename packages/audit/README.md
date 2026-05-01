# @reaatech/mcp-gateway-audit

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-audit.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Compliance audit trail logging for the MCP Gateway. Captures security-relevant events with structured JSON output, supports multiple storage backends, tamper-evident chaining, and query capabilities.

## Installation

```bash
npm install @reaatech/mcp-gateway-audit
# or
pnpm add @reaatech/mcp-gateway-audit
```

## Feature Overview

- **8 event types** — `auth.success`, `auth.failure`, `rate_limit.exceeded`, `allowlist.denied`, `tool.executed`, `cache.hit`, `cache.miss`, `upstream.error`
- **Configurable severity** — `low`, `medium`, `high` per event type
- **Three storage backends** — console (stdout), file (JSONL), and in-memory (queryable)
- **Composite logging** — fan out to multiple backends simultaneously
- **Tamper-evident mode** — SHA-256 chaining for integrity verification
- **Query API** — filter by tenant, event type, date range, limit, and success/failure
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  createAuditEvent,
  ConsoleAuditLogger,
  FileAuditLogger,
} from "@reaatech/mcp-gateway-audit";

// Console logger (development)
const consoleLogger = new ConsoleAuditLogger();
consoleLogger.log(createAuditEvent("tool.executed", {
  requestId: "req-abc123",
  tenantId: "acme-corp",
  userId: "user-456",
  tool: "glean_search",
  success: true,
  durationMs: 234,
}));

// File logger (production)
const fileLogger = new FileAuditLogger({ path: "/var/log/gateway/audit.json" });
fileLogger.log(createAuditEvent("auth.failure", {
  requestId: "req-def789",
  metadata: { reason: "invalid_token" },
}));
```

## API Reference

### Event Creation

| Export | Description |
|--------|-------------|
| `createAuditEvent(type, data?)` | Create a typed audit event with auto-generated ID, timestamp, and severity |

### Loggers

| Export | Description |
|--------|-------------|
| `ConsoleAuditLogger` | Writes JSON events to `console.log` |
| `FileAuditLogger` | Appends JSONL events to a file |
| `CompositeAuditLogger` | Fans out to multiple logger backends |
| `TamperEvidentLogger` | Wraps a logger with SHA-256 chain integrity |
| `AuditLogger` | Type alias for the logger interface |

### Storage

| Export | Description |
|--------|-------------|
| `MemoryAuditStorage` | In-memory store with query capabilities |
| `FileAuditStorage` | File-based store with append and query |
| `createAuditQueryService(store)` | Create a query service over any storage backend |

### Integrity

| Export | Description |
|--------|-------------|
| `computeEventHash(event)` | Compute SHA-256 hash of an event |
| `verifyAuditChain(events)` | Verify the tamper-evident chain of events |

### Event Types

| Export | Description |
|--------|-------------|
| `getEventTypeConfig(type)` | Get metadata for an event type |
| `getEventSeverity(type)` | Get severity for an event type |
| `EVENT_TYPE_CONFIGS` | Map of all event type configurations |

### Event Types Reference

| Event Type | Severity | Description |
|------------|----------|-------------|
| `auth.success` | low | Successful authentication |
| `auth.failure` | medium | Failed authentication attempt |
| `rate_limit.exceeded` | medium | Rate limit exceeded |
| `allowlist.denied` | high | Tool access denied by allowlist |
| `tool.executed` | low | Tool execution completed |
| `cache.hit` | low | Cache served the response |
| `cache.miss` | low | Cache miss — upstream was called |
| `upstream.error` | high | Upstream server returned an error |

### Types

| Type | Description |
|------|-------------|
| `AuditEvent` | `{ id, timestamp, eventType, severity, tenantId?, userId?, requestId?, tool?, success?, durationMs?, cacheHit?, upstream?, metadata? }` |
| `AuditEventType` | String union of all event types |
| `AuditSeverity` | `'low' \| 'medium' \| 'high'` |
| `AuditStorageType` | `'memory' \| 'file'` |
| `AuditQueryParams` | `{ tenantId?, eventType?, startDate?, endDate?, limit?, success?, offset? }` |

### Audit Log Format

```json
{
  "id": "evt-abc123",
  "timestamp": "2026-04-15T23:00:00Z",
  "eventType": "tool.executed",
  "severity": "low",
  "tenantId": "acme-corp",
  "userId": "user-123",
  "requestId": "req-abc123",
  "tool": "glean_search",
  "success": true,
  "durationMs": 234,
  "cacheHit": false,
  "upstream": "primary"
}
```

## Usage Patterns

### Composite logging (console + file)

```typescript
import { ConsoleAuditLogger, FileAuditLogger, CompositeAuditLogger } from "@reaatech/mcp-gateway-audit";

const logger = new CompositeAuditLogger([
  new ConsoleAuditLogger(),
  new FileAuditLogger({ path: "/var/log/gateway/audit.json" }),
]);

logger.log(createAuditEvent("auth.success", { tenantId: "acme-corp" }));
// → Written to both console and file
```

### Tamper-evident audit chain

```typescript
import { FileAuditLogger, TamperEvidentLogger, verifyAuditChain } from "@reaatech/mcp-gateway-audit";

const baseLogger = new FileAuditLogger({ path: "./audit.json" });
const logger = new TamperEvidentLogger(baseLogger);

// Log events — each gets a chain hash referencing the previous event
logger.log(createAuditEvent("tool.executed", { tool: "glean_search" }));
logger.log(createAuditEvent("tool.executed", { tool: "serval_query" }));

// Verify integrity later
const events = loadAuditLog("./audit.json");
const result = verifyAuditChain(events);
console.log(result.valid, result.errors);
```

### Querying audit logs

```typescript
import { MemoryAuditStorage, createAuditQueryService } from "@reaatech/mcp-gateway-audit";

const storage = new MemoryAuditStorage();
const query = createAuditQueryService(storage);

const results = query({
  tenantId: "acme-corp",
  eventType: "auth.failure",
  startDate: new Date("2026-01-01"),
  limit: 50,
});

console.log(`Found ${results.total} auth failures for acme-corp`);
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Audit event type definitions
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates audit logging)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
