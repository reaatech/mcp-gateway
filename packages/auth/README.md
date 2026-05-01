# @reaatech/mcp-gateway-auth

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-auth.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Pluggable authentication middleware for the MCP Gateway. Supports four authentication methods — API key, JWT (with JWKS), OAuth2 token introspection (RFC 7662), and OIDC ID token validation — all orchestrated through a single Express middleware that attaches a typed `AuthContext` to every request.

## Installation

```bash
npm install @reaatech/mcp-gateway-auth
# or
pnpm add @reaatech/mcp-gateway-auth
```

## Feature Overview

- **API key authentication** — constant-time comparison with SHA-256 hashed keys
- **JWT validation** — JWKS-based RS256/ES256 token verification with `jose`
- **OAuth2 introspection** — RFC 7662 token introspection with LRU caching and automatic cleanup
- **OIDC validation** — OpenID Connect ID token validation with nonce replay protection
- **Single Express middleware** — `authMiddleware()` orchestrates all four methods
- **Tenant-aware** — auto-discovers authentication config from the tenant registry
- **Audit-friendly** — every auth call produces a token fingerprint for audit trails
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import express from "express";
import { authMiddleware } from "@reaatech/mcp-gateway-auth";

const app = express();
app.use(authMiddleware());

app.get("/protected", (req, res) => {
  // req.authContext is typed — tenantId, userId, scopes, authMethod
  res.json({ tenant: req.authContext?.tenantId });
});
```

## API Reference

### Auth Middleware

| Export | Description |
|--------|-------------|
| `authMiddleware(options?)` | Express middleware — extracts credentials, validates, attaches `authContext` to `req`. Returns 401 on failure. |
| `optionalAuthMiddleware()` | Like `authMiddleware` but never rejects — attaches context if valid, passes through if not |
| `requireAuth(req)` | Get auth context from request; throws `AuthenticationError` if missing |
| `getAuth(req)` | Get auth context from request; returns `undefined` if missing |
| `AuthenticationError` | Error class with `code` (e.g. `'AUTH_REQUIRED'`, `'AUTH_FAILED'`) and `statusCode` |

### Auth Context

| Export | Description |
|--------|-------------|
| `AuthContext` | Interface: `tenantId`, `userId`, `scopes`, `authMethod`, `keyName`, `subject`, `issuer`, `expiresAt`, `tokenFingerprint` |
| `AuthMethod` | String union: `'api-key' \| 'jwt' \| 'oauth' \| 'oidc'` |
| `createAuthContext(opts)` | Create a minimal auth context |
| `hasScope(context, scope)` | Check if context has a specific scope (supports wildcard `tools:*`) |
| `hasAnyScope(context, scopes)` | Check if context has any of the given scopes |
| `hasAllScopes(context, scopes)` | Check if context has all given scopes |
| `getRedactedAuthContext(ctx)` | Return a copy safe for logging (token redacted) |
| `generateTokenFingerprint(token)` | SHA-256 fingerprint for audit trail |

### API Key

| Export | Description |
|--------|-------------|
| `hashApiKey(key)` | SHA-256 hash for storage |
| `validateApiKey(key, config)` | Validate key against tenant config |
| `findTenantForApiKey(key, tenants)` | Find which tenant owns this key |
| `ApiKeyValidationResult` | `{ valid, context?, error? }` |

### JWT

| Export | Description |
|--------|-------------|
| `validateJwt(token, config)` | Validate JWT against issuer/audience/JWKS |
| `decodeJwtUnsafe(token)` | Decode without verification (debug only) |
| `isJwtExpired(token)` | Check token expiration |
| `JwtValidationResult` | `{ valid, context?, error? }` |

### OAuth2

| Export | Description |
|--------|-------------|
| `introspectToken(token, config)` | RFC 7662 introspection |
| `clearIntrospectionCache()` | Clear cached introspection results |
| `getIntrospectionCacheStats()` | Get cache size |
| `shutdownOAuthIntrospection()` | Stop background cache cleanup |
| `IntrospectionResult` | `{ valid, context?, error? }` |

### OIDC

| Export | Description |
|--------|-------------|
| `validateOidcIdToken(token, config)` | Validate OIDC ID token |
| `validateNonce(payload, nonce)` | Replay protection check |
| `extractUserInfoFromIdToken(token)` | Extract standard OIDC claims |
| `OidcValidationResult` | `{ valid, context?, error? }` |

## Usage Patterns

### Tenant-aware auth with YAML config

```typescript
import { authMiddleware, AuthenticationError } from "@reaatech/mcp-gateway-auth";
import type { Request, Response, NextFunction } from "express";

const auth = authMiddleware({
  onFailure: (error: AuthenticationError, req: Request) => {
    console.warn(`Auth failed: ${error.code} from ${req.ip}`);
  },
});

app.post("/mcp", auth, (req, res) => {
  // req.authContext is guaranteed non-null here
  const { tenantId, userId, scopes } = req.authContext!;
  console.log(`Tenant ${tenantId} using ${req.authContext!.authMethod}`);
});
```

### Scope-based access control

```typescript
import { getAuth, hasScope } from "@reaatech/mcp-gateway-auth";

app.delete("/admin/:id", (req, res, next) => {
  const ctx = getAuth(req);
  if (!ctx || !hasScope(ctx, "admin:*")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});
```

### Custom auth flow with optional middleware

```typescript
import { optionalAuthMiddleware, getAuth } from "@reaatech/mcp-gateway-auth";

app.use(optionalAuthMiddleware());

app.get("/public", (req, res) => {
  const ctx = getAuth(req);
  res.json({ authenticated: !!ctx, tenant: ctx?.tenantId });
});
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Config loading and type definitions
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates auth)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
