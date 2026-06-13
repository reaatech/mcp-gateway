---
"@reaatech/mcp-gateway-core": minor
"@reaatech/mcp-gateway-auth": minor
"@reaatech/mcp-gateway-rate-limit": minor
"@reaatech/mcp-gateway-allowlist": minor
"@reaatech/mcp-gateway-audit": minor
"@reaatech/mcp-gateway-cache": minor
---

Make the middleware suite framework-agnostic: Fastify support alongside Express.

Each concern is now split into a framework-agnostic core (operates on a
normalized `GatewayRequestContext` and returns a `GatewayDecision`) plus thin
Express and Fastify adapters. The existing Express middleware exports keep their
exact signatures and behavior — this is an additive change.

- **core**: adds the shared `GatewayRequestContext` / `GatewayDecision` types and
  helpers (`buildRequestContext`, `buildHeaderAccessor`, `extractToolName`,
  `getTenantIdFromContext`) so every package keys on the same tenant. `zod` is
  relaxed to a peer range (`^3.23 || ^4`) so consumers keep their existing zod.
- **auth / rate-limit / allowlist / audit / cache**: each exposes a core function
  (`evaluateAuth`, `checkRateLimit`, `checkAllowlist`, `recordAudit`,
  `cacheLookup`/`cacheStore`) and a Fastify plugin under a new `./fastify` subpath
  export. `fastify` is an optional peer dependency.
- **cache**: the Fastify adapter wires the existing `RedisCache` (Redis-backed,
  not memory-only) and serves hits via `reply.hijack()` without re-serializing.
- **audit**: adds `SilentAuditLogger` (the default sink for the new middleware) so
  nothing is written to stdout unless a sink is explicitly provided. Also adds an
  Express `auditMiddleware`.

Also fixes a CommonJS load bug in **core** and **audit**: `import.meta.url` (used
by the config loaders and audit logger) is now shimmed in the CJS bundle, so
`require()` works for every package's main and `./fastify` entry.

A consumer can now build the full `auth → rate-limit → allowlist → audit → cache`
pipeline on Fastify with the same tenant context flowing through.
