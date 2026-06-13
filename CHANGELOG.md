# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - Unreleased

### Added

- **Framework-agnostic middleware (Express + Fastify)**: the auth, rate-limit,
  allowlist, audit, and cache packages each expose a framework-neutral core
  (operating on a normalized `GatewayRequestContext` → `GatewayDecision`) plus a
  **Fastify** plugin under a new `./fastify` subpath export, alongside the
  existing Express middleware. The full `auth → rate-limit → allowlist → audit →
  cache` pipeline now runs on Fastify with the same tenant context flowing
  through. `fastify` is an optional peer dependency.
- **core**: shared adapter types and helpers — `GatewayRequestContext`,
  `GatewayDecision`, `buildRequestContext`, `buildHeaderAccessor`,
  `extractToolName`, `getTenantIdFromContext`.
- **cache**: the Fastify adapter wires the existing `RedisCache` (Redis-backed,
  not memory-only) and serves cache hits via `reply.hijack()` without
  re-serializing the payload.
- **audit**: `SilentAuditLogger` (the default sink for the new middleware, so
  nothing is written to stdout unless a sink is configured) and an Express
  `auditMiddleware`.

### Changed

- **core**: `zod` relaxed from a pinned dependency to a peer range
  (`^3.23 || ^4`) so consumers keep their existing zod major.

### Fixed

- **core, audit**: CommonJS builds no longer throw on load — `import.meta.url`
  (used by the config loaders and audit logger) is now shimmed in the CJS bundle
  via tsup, so `require()` works for every package's main and `./fastify` entry.

### Compatibility

- Backward compatible: existing Express middleware exports keep their signatures
  and behavior. Additive, minor version bump.

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

[1.1.0]: https://github.com/reaatech/mcp-gateway/releases/tag/v1.1.0
[1.0.0]: https://github.com/reaatech/mcp-gateway/releases/tag/v1.0.0
