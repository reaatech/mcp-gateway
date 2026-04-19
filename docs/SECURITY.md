# Security Guide

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

## TLS Configuration

Enable TLS in production:

```yaml
# gateway.yaml
server:
  tls:
    enabled: true
    cert_path: "/etc/ssl/certs/gateway.crt"
    key_path: "/etc/ssl/private/gateway.key"
```

## API Key Management

1. **Generate secure keys**: Use `openssl rand -hex 32`
2. **Hash before storage**: Keys are stored as SHA-256 hashes
3. **Rotate regularly**: Update keys in tenant config and reload
4. **Never log keys**: Keys are automatically redacted from logs

## Rate Limiting

Configure per-tenant rate limits:

```yaml
# tenants/acme-corp.yaml
rate_limits:
  requests_per_minute: 1000
  requests_per_day: 100000
  burst_size: 50
```

## Tool Allowlists

Restrict tool access per tenant:

```yaml
# tenants/acme-corp.yaml
allowlist:
  mode: "allow"  # Only listed tools allowed
  tools:
    - "glean_*"
    - "serval_*"
```

## Audit Logging

Enable audit logging for compliance:

```yaml
# gateway.yaml
audit:
  enabled: true
  storage: "file"
  file_path: "/var/log/gateway/audit.json"
  retention_days: 90
```

## SSRF Protection

Upstream URLs are validated to reject:
- `localhost` and `::1`
- Private IP ranges (10.x, 172.16.x, 192.168.x)
- Link-local (169.254.0.0/16)

## PII Handling

- API keys stored as SHA-256 hashes
- Tokens never logged
- IP addresses masked in logs
- Sensitive metadata redacted from audit events

## References

- [AGENTS.md](../AGENTS.md) — Agent development guide
- [docs/CONFIGURATION.md](CONFIGURATION.md) — Configuration reference
