# Audit Trail

## Capability
Compliance audit logging with structured JSON output, multiple storage backends, tamper-evident chaining, and query API.

## Package
`@reaatech/mcp-gateway-audit` — `packages/audit/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `audit-logger.ts` | Core logging: ConsoleAuditLogger, FileAuditLogger, CompositeAuditLogger, TamperEvidentLogger |
| `audit-storage.ts` | MemoryAuditStorage and FileAuditStorage backends |
| `audit-query.ts` | Query API with filtering by tenant, event type, date range, limit |
| `event-types.ts` | Event type configurations and severity mappings |
| `types.ts` | AuditEvent, AuditEventType, AuditSeverity, AuditQueryParams |

## Audit Event Types
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

## Audit Event Format
```json
{
  "id": "evt-abc123",
  "timestamp": "2026-04-15T23:00:00Z",
  "eventType": "tool.executed",
  "severity": "low",
  "tenantId": "acme-corp",
  "userId": "user-123",
  "requestId": "req-xyz789",
  "tool": "glean_search",
  "success": true,
  "durationMs": 234,
  "cacheHit": false,
  "upstream": "primary"
}
```

## Storage Backends
| Backend | Use Case |
|---------|----------|
| Console (`ConsoleAuditLogger`) | Development, stdout |
| File (`FileAuditLogger`) | Production, JSONL format, append-only |
| Memory (`MemoryAuditStorage`) | Queryable, for API access |
| Composite (`CompositeAuditLogger`) | Fan-out to multiple backends |
| Tamper-Evident (`TamperEvidentLogger`) | SHA-256 chain integrity verification |

## Error Handling
- Audit failures never block request processing (fire-and-forget)
- Failed audit writes logged at WARN level
- Integrity verification via `computeEventHash` and `verifyAuditChain`

## Security Considerations
- PII automatically redacted (tokens, IPs masked)
- Audit logs immutable (append-only)
- Tamper detection via hash chaining
- Audit log queries gated behind admin-scoped auth
