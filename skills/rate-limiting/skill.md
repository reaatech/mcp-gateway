# Rate Limiting

## Capability
Per-tenant rate limiting with token bucket algorithm and Redis-backed distributed state.

## Components
| Component | Purpose |
|-----------|---------|
| `rate-limiter.ts` | Token bucket algorithm implementation |
| `redis-store.ts` | Distributed rate limiting with Lua scripts |
| `memory-store.ts` | In-memory rate limiting for development |
| `quota-manager.ts` | Per-tenant quota configuration |

## Algorithms
| Algorithm | Use Case |
|-----------|----------|
| Token Bucket | General purpose, allows bursting |
| Sliding Window | Smooth rate limiting |
| Fixed Window | Simple, predictable |

## Rate Limit Headers
| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait before retrying (on 429) |

## Error Handling
- **429 Too Many Requests** — Rate limit exceeded
- Includes `Retry-After` header with seconds to wait
- Includes current limit status in response body

## Security Considerations
- Rate limits enforced per-tenant (extracted from auth context)
- Redis Lua scripts ensure atomic operations
- Hard limits never exceeded (fail-closed on Redis errors)
- Per-key rate limits supported for API keys
