# Configuration Reference

## Gateway Configuration

The gateway is configured via `gateway.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  tls:
    enabled: false
    cert_path: "/etc/ssl/certs/gateway.crt"
    key_path: "/etc/ssl/private/gateway.key"

redis:
  host: "localhost"
  port: 6379
  password_env: "REDIS_PASSWORD"
  db: 0

rate_limits:
  default_requests_per_minute: 100
  default_requests_per_day: 10000
  store: "redis"  # redis or memory

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

## Tenant Configuration

Each tenant has a configuration file in `tenants/<tenant-id>.yaml`:

```yaml
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
  mode: "allow"  # allow = only listed tools allowed, deny = listed tools blocked
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

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `development` | Environment name |
| `REDIS_HOST` | yes | — | Redis host |
| `REDIS_PORT` | no | `6379` | Redis port |
| `REDIS_PASSWORD` | no | — | Redis password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTel collector endpoint |
| `LOG_LEVEL` | no | `info` | Log level |
| `TENANT_CONFIG_DIR` | no | `./tenants` | Tenant config directory |
| `GATEWAY_CONFIG_PATH` | no | `./gateway.yaml` | Gateway config path |

## References

- [AGENTS.md](../AGENTS.md) — Agent development guide
- [README.md](../README.md) — Quick start
