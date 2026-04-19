# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-16

### Added

- **Authentication**: API keys, JWT, OAuth2, OIDC support
- **Rate Limiting**: Per-tenant quotas with Redis backend
- **Schema Validation**: MCP JSON-RPC validation
- **Tool Allowlists**: Per-tenant tool access control with wildcard patterns
- **Fan-out Routing**: Multi-upstream broadcasting with aggregation strategies
- **Response Caching**: Redis-backed caching with TTL management
- **Audit Trail**: Compliance logging with PII redaction
- **Observability**: OpenTelemetry tracing and metrics
- **Middleware Pipeline**: Ordered middleware execution with error handling
- **MCP Client**: Upstream connection pooling and health checking
- **203 unit tests** with 80%+ coverage

### Security

- Zero-trust security model
- SSRF protection for upstream URLs
- Automatic PII redaction in logs
- Hashed API key storage (SHA-256)

[1.0.0]: https://github.com/reaatech/mcp-gateway/releases/tag/v1.0.0
