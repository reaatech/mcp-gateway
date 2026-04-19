# Tool Allowlist

## Capability
Per-tenant tool access control with wildcard pattern matching and allow/deny modes.

## Components
| Component | Purpose |
|-----------|---------|
| `allowlist-manager.ts` | Core allowlist evaluation with pattern matching |
| `allowlist.middleware.ts` | Express middleware for tool access control |
| `dynamic-allowlist.ts` | Hot-reload allowlist updates |
| `types.ts` | Type definitions |

## Allowlist Modes
| Mode | Behavior | Use Case |
|------|----------|----------|
| `allow` | Only listed tools allowed (default deny) | High security environments |
| `deny` | Listed tools blocked (default allow) | Permissive environments |

## Pattern Syntax
| Pattern | Matches | Example |
|---------|---------|---------|
| `glean_*` | Tools starting with `glean_` | `glean_search`, `glean_query` |
| `*_search` | Tools ending with `_search` | `glean_search`, `serval_search` |
| `*` | All tools | Any tool name |
| `tool_a\|tool_b` | Exact tool names (pipe-separated) | `glean_search\|serval_query` |
| `^admin_.*` | Regex patterns | Blocks all admin tools |

## Error Handling
- **403 Forbidden** — Tool access denied by allowlist
- Error includes tool name, tenant, and policy mode
- Denied requests are never forwarded to upstreams

## Security Considerations
- Default-deny (allow mode) recommended for production
- Patterns validated at config load time
- Allowlist changes require tenant config reload
- Audit logging for all allowlist decisions
