# Audit Trail

## Capability
Comprehensive compliance logging with PII redaction, multiple storage backends, and SIEM integration.

## Components
| Component | Purpose |
|-----------|---------|
| `audit-engine.ts` | Core audit event processing |
| `pii-redactor.ts` | Automatic PII detection and redaction |
| `file-storage.ts` | File-based audit log storage |
| `siem-exporter.ts` | SIEM integration (Splunk, QRadar) |
| `audit-query.ts` | Audit log search and filtering |

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
| `config.changed` | Configuration reloaded |
| `tenant.created` | New tenant registered |
| `tenant.deleted` | Tenant removed |

## Audit Event Format
```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "event_id": "evt-abc123",
  "event_type": "tool.executed",
  "tenant_id": "acme-corp",
  "user_id": "user-123",
  "request_id": "req-xyz789",
  "tool": "glean_search",
  "success": true,
  "duration_ms": 234,
  "cache_hit": false,
  "upstream": "primary",
  "source_ip": "192.168.1.xxx",
  "user_agent": "Claude/1.0"
}
```

## Storage Backends
| Backend | Use Case | Retention |
|---------|----------|-----------|
| File (JSON) | Development, small deployments | Configurable (default: 90 days) |
| Database | Production, searchable | Configurable |
| SIEM | Enterprise compliance | Per SIEM policy |

## Error Handling
- Audit failures never block request processing (fire-and-forget)
- Failed audit writes logged at WARN level
- Batch writes for high-throughput scenarios
- Automatic retry with exponential backoff

## Security Considerations
- PII automatically redacted (tokens, IPs masked, bodies removed)
- Audit logs immutable (append-only storage)
- Tamper detection via hash chaining
- Encrypted at rest (AES-256)
- Access logging for audit log queries
- Compliance with SOC 2, GDPR, HIPAA requirements
