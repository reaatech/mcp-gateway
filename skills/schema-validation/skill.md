# Schema Validation

## Capability
Multi-layer validation: JSON-RPC 2.0 protocol compliance, MCP specification validation, and per-tool JSON Schema enforcement via AJV.

## Package
`@reaatech/mcp-gateway-validation` — `packages/validation/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `schema-validator.ts` | Core AJV-based SchemaValidator class |
| `mcp-schema.ts` | Built-in MCP method schemas (tools/call, initialize, etc.) |
| `custom-schemas.ts` | CustomSchemaManager for per-tool schema registration |
| `validation.middleware.ts` | Express middleware for request validation |
| `types.ts` | JSON-RPC error codes, ValidationResult types |

## Validation Layers
| Layer | What It Validates |
|-------|-------------------|
| JSON-RPC 2.0 | `jsonrpc`, `id`, `method`, `params` fields |
| MCP Protocol | Valid MCP methods, tool names, initialize compatibility |
| Tool Schema | Input types, required fields, constraints (via JSON Schema) |

## Error Codes
| Code | Meaning |
|------|---------|
| `-32700` | Parse error (invalid JSON) |
| `-32600` | Invalid Request (JSON-RPC violation) |
| `-32601` | Method not found |
| `-32602` | Invalid params (schema violation) |

## Security Considerations
- All external input validated before reaching upstreams
- Tool schemas cached with configurable TTL
- Custom schema manager supports versioning and rollback
