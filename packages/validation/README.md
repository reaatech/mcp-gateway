# @reaatech/mcp-gateway-validation

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-gateway-validation.svg)](https://www.npmjs.com/package/@reaatech/mcp-gateway-validation)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-gateway/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-gateway/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

JSON Schema validation for MCP protocol messages. Built on AJV (v8) with support for custom per-tool input/output schemas, schema caching, and Express middleware that validates all JSON-RPC 2.0 and MCP method payloads.

## Installation

```bash
npm install @reaatech/mcp-gateway-validation
# or
pnpm add @reaatech/mcp-gateway-validation
```

## Feature Overview

- **JSON-RPC 2.0 validation** — enforces `jsonrpc`, `id`, `method`, `params` structure
- **MCP method schemas** — built-in validation for `tools/call`, `tools/list`, `resources/*`, `prompts/*`, `initialize`, `shutdown`
- **Per-tool argument validation** — register custom JSON Schemas per tool name for input/output checking
- **Schema caching** — compiled AJV validators are cached with configurable TTL
- **Custom schema manager** — runtime schema registration, retrieval, versioning, and rollback
- **Express middleware** — `createValidationMiddleware()` validates every JSON-RPC request
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  createValidationMiddleware,
  getSchemaValidator,
} from "@reaatech/mcp-gateway-validation";
import express from "express";

const app = express();
app.use(express.json());
app.use(createValidationMiddleware());

app.post("/mcp", (req, res) => {
  // req.rpcBody is typed — request already validated
  console.log("Method:", req.rpcBody?.method);
});
```

```typescript
// Register custom tool schemas
import { getCustomSchemaManager } from "@reaatech/mcp-gateway-validation";

const manager = getCustomSchemaManager();
manager.registerSchema("my_tool", {
  type: "object",
  properties: {
    query: { type: "string" },
    limit: { type: "number", minimum: 1, maximum: 100 },
  },
  required: ["query"],
});

const result = manager.validateArguments("my_tool", { query: "hello" });
// → { valid: true }
```

## API Reference

### `SchemaValidator` (class)

Core AJV-based validator.

| Method | Description |
|--------|-------------|
| `validateJsonRpcRequest(body)` | Validate JSON-RPC 2.0 request structure |
| `validateMcpRequest(method, params)` | Validate MCP method params against built-in schemas |
| `validateToolArguments(toolName, args)` | Validate tool arguments against registered schema |
| `cacheToolSchema(toolName, schema)` | Compile and cache a custom tool schema |
| `getToolSchema(toolName)` | Get cached tool schema |
| `clearCache()` | Clear all cached validators |

### `getSchemaValidator()`

Returns or creates the singleton `SchemaValidator` instance.

### `resetSchemaValidator()`

Reset the singleton (for testing).

### `CustomSchemaManager` (class)

Per-tool custom schema lifecycle.

| Method | Description |
|--------|-------------|
| `registerSchema(toolName, schema)` | Register a new schema (auto-versions) |
| `getSchema(toolName)` | Get current schema for a tool |
| `validateArguments(toolName, args)` | Validate arguments against registered schema |
| `validateOutput(toolName, output)` | Validate output against registered schema |
| `hasSchema(toolName)` | Check if tool has a registered schema |
| `getToolNames()` | List all tools with registered schemas |
| `getVersionHistory(toolName)` | Get version history for a tool |
| `rollback(toolName)` | Rollback to previous schema version |
| `removeSchema(toolName)` | Remove schema for a tool |
| `clear()` | Remove all schemas |

### Middleware

| Export | Description |
|--------|-------------|
| `createValidationMiddleware()` | Express middleware — validates JSON-RPC and MCP method params. Attaches `rpcBody` and `validationErrors` to request. |

### MCP Method Schemas

| Export | Description |
|--------|-------------|
| `jsonRpcRequestSchema` | Base JSON-RPC 2.0 schema |
| `toolsCallRequestSchema` | `tools/call` — requires `params.name` |
| `toolsListRequestSchema` | `tools/list` |
| `initializeRequestSchema` | `initialize` |
| `resourcesListRequestSchema` | `resources/list` |
| `resourcesReadRequestSchema` | `resources/read` |
| `promptsListRequestSchema` | `prompts/list` |
| `promptsGetRequestSchema` | `prompts/get` |
| `notificationsInitializedSchema` | `notifications/initialized` |
| `shutdownRequestSchema` | `shutdown` |
| `mcpMethodSchemas` | `Map<string, JSONSchema>` of all method schemas |

### Types

| Type | Description |
|------|-------------|
| `ValidationResult` | `{ valid: boolean, errors: ValidationError[] }` |
| `ValidationError` | `{ field: string, expected: string, received: string, message: string }` |
| `SchemaCacheEntry` | `{ schema, cachedAt, ttl, validator? }` |

### Standard Error Codes

| Code | Meaning |
|------|---------|
| `-32700` | Parse error (invalid JSON) |
| `-32600` | Invalid request (not JSON-RPC 2.0) |
| `-32601` | Method not found |
| `-32602` | Invalid params |

## Usage Patterns

### Full request validation pipeline

```typescript
import {
  createValidationMiddleware,
  getSchemaValidator,
} from "@reaatech/mcp-gateway-validation";

const validator = getSchemaValidator();

app.post("/mcp", createValidationMiddleware(), (req, res, next) => {
  const { method, params } = req.rpcBody!;

  // Additional method-level validation
  const result = validator.validateMcpRequest(method, params);
  if (!result.valid) {
    return res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message: "Invalid params",
        data: { errors: result.errors },
      },
    });
  }

  next();
});
```

### Custom tool schema registration

```typescript
import { getCustomSchemaManager } from "@reaatech/mcp-gateway-validation";

const manager = getCustomSchemaManager();

// Register at startup from config
for (const [toolName, schema] of Object.entries(toolSchemas)) {
  manager.registerSchema(toolName, schema);
}

// Validate during request processing
const { valid, errors } = manager.validateArguments("my_tool", args);
if (!valid) {
  console.error("Invalid arguments:", errors);
}
```

## Related Packages

- [@reaatech/mcp-gateway-core](https://www.npmjs.com/package/@reaatech/mcp-gateway-core) — JSON-RPC types and Zod schemas
- [@reaatech/mcp-gateway-gateway](https://www.npmjs.com/package/@reaatech/mcp-gateway-gateway) — Full gateway server (integrates validation)

## License

[MIT](https://github.com/reaatech/mcp-gateway/blob/main/LICENSE)
