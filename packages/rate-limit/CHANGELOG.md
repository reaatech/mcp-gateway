# @reaatech/mcp-gateway-rate-limit

## 1.1.2

### Patch Changes

- Fix the Redis daily-quota Lua script aborting on the first request for a tenant with `attempt to compare nil with number`. When the quota hash did not yet exist, `reset` was `nil` (only `count` was defaulted), so `now >= reset` crashed and the limiter fail-closed with HTTP 429. `reset` now defaults to `0`. Verified end-to-end against a real node-redis v5 client + real Redis (first call and subsequent calls are allowed and decrement correctly). NOTE: the existing unit tests mock `eval` and never execute the Lua, so they did not catch this — real-Redis integration coverage is recommended.

## 1.1.1

### Patch Changes

- Fix Redis token-bucket/daily-quota checks throwing `TypeError: Cannot read properties of undefined (reading '_self')` against node-redis v5. `getEvalFunction` detached `eval` from the client (`const fn = client.eval; fn(...)`), losing the `this` binding that v5 command methods require, so the rate limiter fail-closed and denied **every** request with HTTP 429. It now invokes `eval` as a method on its owner (`owner.eval(...)`), preserving `this`. Added a v5-style-client regression test.

## 1.1.0

### Minor Changes

- [#56](https://github.com/reaatech/mcp-gateway/pull/56) [`8592332`](https://github.com/reaatech/mcp-gateway/commit/85923328d38f00cc041e972317873dbffa262317) Thanks [@reaatech](https://github.com/reaatech)! - Make the middleware suite framework-agnostic: Fastify support alongside Express.

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

### Patch Changes

- [#55](https://github.com/reaatech/mcp-gateway/pull/55) [`ffb6889`](https://github.com/reaatech/mcp-gateway/commit/ffb6889293c5131cedfbf562007205ee51c72e74) Thanks [@reaatech](https://github.com/reaatech)! - Fix: CI failing on main: Dependabot

  Closes [#54](https://github.com/reaatech/mcp-gateway/issues/54)

- Updated dependencies [[`8592332`](https://github.com/reaatech/mcp-gateway/commit/85923328d38f00cc041e972317873dbffa262317)]:
  - @reaatech/mcp-gateway-core@1.1.0
