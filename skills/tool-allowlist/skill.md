# Tool Allowlist

## Capability
Per-tenant tool access control with wildcard pattern matching, version tracking, and allow/deny modes.

## Package
`@reaatech/mcp-gateway-allowlist` — `packages/allowlist/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `allowlist-manager.ts` | Core evaluation: checkToolAccess, matchesPattern, validateAllowlist |
| `allowlist.middleware.ts` | Express middleware for tool access control |
| `dynamic-allowlist.ts` | Runtime allowlist updates with version tracking and rollback |
| `types.ts` | AllowlistMode, ToolAllowlist, AllowlistCheckResult |

## Allowlist Modes
| Mode | Behavior | Use Case |
|------|----------|----------|
| `allow` | Only listed tools allowed (default deny) | High security environments |
| `deny` | Listed tools blocked (default allow) | Permissive environments |

## Pattern Syntax
| Pattern | Matches |
|---------|---------|
| `glean_*` | Tools starting with `glean_` |
| `*_search` | Tools ending with `_search` |
| `*` | All tools |
| `tool_a\|tool_b` | Exact tool names (pipe-separated) |

## Error Handling
- **403 Forbidden** — Tool access denied, JSON-RPC error format
- Error includes tool name, tenant, and policy mode
- Denied requests are never forwarded to upstreams

## Security Considerations
- Default-deny (allow mode) recommended for production
- Patterns validated at config load time
- Version tracking enables rollback on bad updates
