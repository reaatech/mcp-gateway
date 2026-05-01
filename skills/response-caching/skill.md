# Response Caching

## Capability
Redis and in-memory LRU response caching with configurable TTL, per-tool cache strategies, and cache bypass.

## Package
`@reaatech/mcp-gateway-cache` — `packages/cache/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `cache-manager.ts` | CacheManager orchestrator: get, set, delete, clear, shouldBypass |
| `memory-cache.ts` | LRU in-memory cache with configurable max entries |
| `redis-cache.ts` | Redis-backed cache with TTL-based expiration |
| `cache-strategies.ts` | Per-tool cache configuration with pattern matching |
| `cache.middleware.ts` | Express middleware for cache intercept |

## Cache Key Generation
```
cache_key = SHA-256(tenant_id + method + JSON(params))
```

## Cache Strategies
Built-in defaults (`DEFAULT_CACHE_STRATEGIES`):
- `glean_search`, `serval_query` → 60s TTL
- `*_static`, `*_readonly` → 3600s TTL

Custom strategies configurable via YAML.

## Cache Headers
| Header | Description |
|--------|-------------|
| `X-Cache` | `HIT` or `MISS` |
| `X-Cache-TTL` | Remaining TTL in seconds |
| `X-Cache-Key` | Cache key used (for debugging) |

## Error Handling
- Cache misses continue to upstream transparently
- Redis failures fail-open (continue to upstream)
- Cache bypass via `Cache-Control: no-cache` header

## Security Considerations
- Cache keys include tenant_id (prevent cross-tenant pollution)
- Cache entries not shared across tenants
- TTL bounds enforced (min 1s, max 24h)
