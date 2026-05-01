# mcp-gateway

[![CI](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> Production-grade MCP Gateway — the "Kong/Envoy for MCP." Authenticate, rate-limit, validate, cache, and fan-out requests to upstream MCP servers.

This monorepo provides a composable gateway framework with 10 independently versioned packages for building production MCP infrastructure at scale.

## Features

- **Authentication** — API keys, JWT (JWKS), OAuth2 introspection (RFC 7662), and OIDC ID token validation
- **Rate limiting** — Per-tenant token bucket with Redis or in-memory backends, daily quota tracking
- **Schema validation** — JSON-RPC 2.0 and MCP method payload validation with custom per-tool schemas
- **Tool allowlists** — Per-tenant tool access control with wildcard pattern matching and rollback support
- **Fan-out routing** — Multi-upstream broadcasting with three aggregation strategies, circuit breaker, and retry logic
- **Response caching** — Redis or in-memory LRU cache with per-tool TTL strategies and `Cache-Control` bypass
- **Audit trail** — Structured JSONL audit logging with tamper-evident chaining and query API
- **Observability** — OpenTelemetry auto-initialization, pre-built metrics, distributed tracing, and health checks

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core types, config, and logging (required by all other packages)
pnpm add @reaatech/mcp-gateway-core

# Authentication strategies
pnpm add @reaatech/mcp-gateway-auth

# Rate limiting
pnpm add @reaatech/mcp-gateway-rate-limit

# Response caching
pnpm add @reaatech/mcp-gateway-cache

# Tool allowlists
pnpm add @reaatech/mcp-gateway-allowlist

# Schema validation
pnpm add @reaatech/mcp-gateway-validation

# Fan-out routing and MCP client
pnpm add @reaatech/mcp-gateway-fanout

# Audit trail logging
pnpm add @reaatech/mcp-gateway-audit

# OpenTelemetry observability
pnpm add @reaatech/mcp-gateway-observability

# Full gateway server with CLI
pnpm add @reaatech/mcp-gateway-gateway
```

### Contributing

```bash
git clone https://github.com/reaatech/mcp-gateway.git
cd mcp-gateway

pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Quick Start

Run the gateway server:

```bash
npx mcp-gateway start --port 8080 --config gateway.yaml
```

Or programmatically:

```typescript
import { createApp } from "@reaatech/mcp-gateway-gateway";

const gateway = createApp();
gateway.app.listen(8080, () => console.log("Gateway listening on :8080"));
```

## Packages

| Package | Description |
|---------|-------------|
| [`@reaatech/mcp-gateway-core`](./packages/core) | Types, schemas, config loading, logging, and utilities |
| [`@reaatech/mcp-gateway-auth`](./packages/auth) | API key, JWT, OAuth2, and OIDC authentication |
| [`@reaatech/mcp-gateway-rate-limit`](./packages/rate-limit) | Per-tenant rate limiting with token bucket algorithm |
| [`@reaatech/mcp-gateway-cache`](./packages/cache) | Redis/in-memory response caching with per-tool TTL strategies |
| [`@reaatech/mcp-gateway-allowlist`](./packages/allowlist) | Per-tenant tool access control with wildcard patterns |
| [`@reaatech/mcp-gateway-validation`](./packages/validation) | JSON Schema validation for MCP protocol messages |
| [`@reaatech/mcp-gateway-fanout`](./packages/fanout) | Multi-upstream fan-out routing and MCP client connections |
| [`@reaatech/mcp-gateway-audit`](./packages/audit) | Compliance audit trail with tamper-evident chaining |
| [`@reaatech/mcp-gateway-observability`](./packages/observability) | OpenTelemetry tracing, metrics, and health checks |
| [`@reaatech/mcp-gateway-gateway`](./packages/gateway) | Full Express 5 gateway server with CLI |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, package relationships, and data flows
- [`AGENTS.md`](./AGENTS.md) — Coding conventions and development guidelines
- [`GITHUB_TO_NPM.md`](./GITHUB_TO_NPM.md) — Publishing runbook for npm and GitHub Packages
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution workflow and release process
- [`docs/`](./docs/) — Deep dives on configuration, security, and deployment

## License

[MIT](LICENSE)
