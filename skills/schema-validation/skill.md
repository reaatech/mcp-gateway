# Schema Validation

## Capability
Multi-layer validation: JSON-RPC 2.0 protocol compliance, MCP specification validation, and per-tool JSON Schema enforcement.

## Components
| Component | Purpose |
|-----------|---------|
| `json-rpc-validator.ts` | JSON-RPC 2.0 protocol validation |
| `mcp-validator.ts` | MCP specification compliance |
| `tool-schema-validator.ts` | Per-tool input validation |
| `schema-cache.ts` | Tool schema caching and invalidation |

## Validation Layers
| Layer | What It Validates |
|-------|-------------------|
| JSON-RPC 2.0 | `jsonrpc`, `id`, `method`, `params` fields |
| MCP Protocol | Valid MCP methods, tool names, initialize compatibility |
| Tool Schema | Input types, required fields, constraints (via JSON Schema) |

## Error Codes
| Code | Meaning |
|------|---------|
| `-32600` | Invalid Request (JSON-RPC violation) |
| `-32601` | Method not found |
| `-32602` | Invalid params (schema violation) |

## Error Handling
- Validation errors return structured JSON-RPC error responses
- Error includes field-level details (which field failed, expected vs received)
- Invalid requests are never forwarded to upstreams

## Security Considerations
- Size limits enforced on all request fields
- Deep nesting prevented (max JSON depth: 10)
- Circular reference detection
- SSRF protection on any URL fields
