# Rate Limiting

## Capability
Per-tenant rate limiting with token bucket algorithm and Redis-backed distributed state.

## Package
`@reaatech/mcp-gateway-rate-limit` — `packages/rate-limit/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `rate-limiter.ts` | Core RateLimiter class + createRateLimiter factory |
| `redis-store.ts` | Distributed rate limiting with Redis Lua scripts |
| `memory-store.ts` | In-memory rate limiting for development |
| `quota-manager.ts` | Daily quota tracking |
| `token-bucket.ts` | Token bucket algorithm (capacity, refill, consume) |
| `rate-limit.middleware.ts` | Express middleware with X-RateLimit-* headers |

## Rate Limit Headers
| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait before retrying (on 429) |

## Error Handling
- **429 Too Many Requests** — JSON-RPC error format with `retryAfter`
- Includes current limit status in response body
- Fallback to memory store if Redis unavailable

## Security Considerations
- Rate limits enforced per-tenant (extracted from auth context)
- Redis Lua scripts ensure atomic operations
- Hard limits never exceeded (fail-closed on Redis errors)
