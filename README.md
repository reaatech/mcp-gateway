# mcp-gateway

[![CI](https://github.com/anomalyco/mcp-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/anomalyco/mcp-gateway/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mcp-gateway.svg)](https://www.npmjs.com/package/mcp-gateway)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/mcp-gateway.svg)](https://nodejs.org/)
[![Coverage](https://img.shields.io/badge/coverage-80.64%25-brightgreen.svg)](#testing)

**Production-grade MCP gateway with authentication, rate limiting, caching, and fan-out routing.**

The "Kong/Envoy for MCP" — real infrastructure, not a toy.

## Features

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | API keys, JWT, OAuth2, OIDC |
| 🛡️ **Rate Limiting** | Per-tenant quotas with Redis backend |
| 📝 **Schema Validation** | MCP JSON-RPC validation |
| 🎯 **Tool Allowlists** | Per-tenant tool access control |
| 📡 **Fan-out Routing** | Multi-upstream broadcasting |
| 💾 **Response Caching** | Redis-backed caching |
| 📊 **Audit Trail** | Compliance logging |
| 🔭 **Observability** | OpenTelemetry tracing & metrics |

## Quick Start

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm test

# Start development server
npm run dev
```

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MCP Client │────▶│    mcp-gateway   │────▶│  Upstream MCP   │
│  (Claude)   │     │   (Gateway Core) │     │    Servers      │
└─────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  Redis Backend   │
                     │  (Cache + Rate   │
                     │   Limit + State) │
                     └──────────────────┘
```

## Configuration

### Gateway Configuration

```yaml
# gateway.yaml
server:
  host: "0.0.0.0"
  port: 8080

redis:
  host: "localhost"
  port: 6379

rateLimits:
  defaultRequestsPerMinute: 100
  defaultRequestsPerDay: 10000

cache:
  enabled: true
  defaultTtlSeconds: 300

audit:
  enabled: true
  storage: "file"
  filePath: "/var/log/gateway/audit.json"
```

### Tenant Configuration

```yaml
# tenants/acme-corp.yaml
tenantId: "acme-corp"
displayName: "ACME Corporation"

auth:
  apiKeys:
    - keyHash: "sha256:abc123..."
      name: "production-api-key"

rateLimits:
  requestsPerMinute: 1000
  requestsPerDay: 100000

allowlist:
  mode: "allow"
  tools:
    - "glean_*"
    - "serval_*"

upstreams:
  - name: "primary"
    url: "https://mcp-server.example.com"
    weight: 1.0
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/health` | GET | Liveness probe |
| `/health/deep` | GET | Readiness probe |
| `/api/v1/tenants` | GET | List visible tenants; all-tenant view requires admin scope |
| `/api/v1/cache/stats` | GET | Cache statistics (admin) |
| `/api/v1/audit` | GET | Query audit logs; cross-tenant access requires admin scope |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `development` | Environment |
| `REDIS_HOST` | yes | — | Redis host |
| `REDIS_PORT` | no | `6379` | Redis port |
| `REDIS_PASSWORD` | no | — | Redis password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTel endpoint |
| `LOG_LEVEL` | no | `info` | Log level |
| `TENANT_CONFIG_DIR` | no | `./tenants` | Tenant config dir |
| `GATEWAY_CONFIG_PATH` | no | `./gateway.yaml` | Gateway config |

## Testing

```bash
# Run all tests
npm test

# Run with coverage (threshold: 80%)
npm run test:coverage

# Run specific test file
npm test -- tests/unit/auth.test.ts
```

**Test Coverage:** 554 tests

## FAQ

**Q: Does mcp-gateway implement an MCP server?**
A: No. It is a gateway/proxy that sits in front of upstream MCP servers. It handles cross-cutting concerns like auth, rate limiting, caching, and fan-out.

**Q: Can I use it without Redis?**
A: Yes. In-memory backends are available for rate limiting and caching. For production, Redis is recommended for horizontal scaling.

**Q: How do I add a new tenant?**
A: Add a YAML file to the `tenants/` directory. The gateway hot-reloads on file changes.

**Q: How do I rotate API keys?**
A: Update the `keyHash` in the tenant YAML file. The gateway picks up changes automatically via hot-reload.

**Q: What MCP methods are supported?**
A: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT — see [LICENSE](LICENSE).

## References

- [AGENTS.md](AGENTS.md) — Agent development guide
- [ARCHITECTURE.md](ARCHITECTURE.md) — System design deep dive
- [DEV_PLAN.md](DEV_PLAN.md) — Development checklist
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — Configuration reference
- [docs/SECURITY.md](docs/SECURITY.md) — Security guide
- [MCP Specification](https://modelcontextprotocol.io/)
- [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
