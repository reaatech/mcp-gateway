# @reaatech/mcp-gateway-allowlist

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-allowlist.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-allowlist)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Per-tenant tool access control with wildcard pattern matching, versioned allowlists, and Express middleware enforcement. Supports both allow and deny modes.

## Installation

```bash
npm install @reaatech/mcp-gateway-allowlist
# or
pnpm add @reaatech/mcp-gateway-allowlist
```

## Feature Overview

- **Two modes** — `allow` (default-deny, list allowed tools) and `deny` (default-allow, block listed tools)
- **Wildcard patterns** — `glean_*` matches all tools starting with `glean_`, `*_search` matches suffix, `*` matches everything
- **Version tracking** — every allowlist update is versioned with rollback support
- **Per-tenant storage** — independent allowlists for each tenant
- **Express middleware** — drop-in enforcement that returns 403 with JSON-RPC error format
- **Zero runtime dependencies** — lightweight and self-contained

## Quick Start

```typescript
import { checkToolAccess } from "@reaatech/mcp-gateway-allowlist";

// Allow mode — only listed tools are allowed
const allowlist = { mode: "allow" as const, tools: ["glean_*", "serval_*"] };

console.log(checkToolAccess("glean_search", allowlist));
// → { allowed: true, matchedPattern: "glean_*" }

console.log(checkToolAccess("admin_delete", allowlist));
// → { allowed: false, reason: "Tool 'admin_delete' is not in the allowed list" }
```

```typescript
// Deny mode — listed tools are blocked
const denylist = { mode: "deny" as const, tools: ["admin_*"] };

console.log(checkToolAccess("admin_delete", denylist));
// → { allowed: false, matchedPattern: "admin_*" }

console.log(checkToolAccess("glean_search", denylist));
// → { allowed: true }
```

## API Reference

### Allowlist Manager

| Export | Description |
|--------|-------------|
| `checkToolAccess(toolName, allowlist)` | Check if a tool is allowed. Returns `AllowlistCheckResult`. |
| `matchesPattern(toolName, pattern)` | Test if a tool name matches a wildcard pattern |
| `validateAllowlist(allowlist)` | Validate that an allowlist config is well-formed |

### Middleware

| Export | Description |
|--------|-------------|
| `allowlistMiddleware()` | Express middleware — checks tool access from `req.body.params.name`, returns 403 if denied |

### Dynamic Allowlist

| Export | Description |
|--------|-------------|
| `updateAllowlist(tenantId, allowlist)` | Update allowlist with version tracking |
| `getAllowlist(tenantId)` | Get current allowlist for a tenant |
| `getAllowlistVersion(tenantId)` | Get version info: `{ version, updatedAt }` |
| `rollbackAllowlist(tenantId)` | Rollback to the previous version |
| `removeAllowlist(tenantId)` | Remove allowlist for a tenant |

### Types

| Type | Description |
|------|-------------|
| `AllowlistMode` | `'allow' \| 'deny'` |
| `ToolAllowlist` | `{ mode: AllowlistMode, tools: string[] }` |
| `AllowlistCheckResult` | `{ allowed: boolean, reason?: string, matchedPattern?: string }` |

### Allowlist Violation Response

When the middleware denies a tool, it returns:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32601,
    "message": "Tool not allowed",
    "data": { "tool": "admin_delete", "tenant": "acme-corp", "reason": "..." }
  }
}
```

## Usage Patterns

### Express middleware integration

```typescript
import { allowlistMiddleware } from "@reaatech/mcp-gateway-allowlist";
import express from "express";

const app = express();
app.post("/mcp", allowlistMiddleware(), (req, res) => {
  // Tool has been validated — safe to forward
});
```

### Runtime allowlist management

```typescript
import { updateAllowlist, getAllowlist, rollbackAllowlist } from "@reaatech/mcp-gateway-allowlist";

// Update
updateAllowlist("acme-corp", { mode: "allow", tools: ["glean_*", "serval_*"] });

// Check current
const current = getAllowlist("acme-corp");
console.log(current); // { mode: "allow", tools: ["glean_*", "serval_*"] }

// Rollback if needed
const rolledBack = rollbackAllowlist("acme-corp");
```

### Pattern matching examples

| Pattern | Matches |
|---------|---------|
| `glean_*` | `glean_search`, `glean_chat`, `glean_index` |
| `*_search` | `glean_search`, `serval_search`, `internal_search` |
| `*` | Everything |
| `glean_search\|serval_query` | Exact tool names (pipe-separated) |

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — Config types
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates allowlist)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
