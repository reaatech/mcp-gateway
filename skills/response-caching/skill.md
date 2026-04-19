# Response Caching

## Capability
Redis-backed response caching with configurable TTL, per-tool cache strategies, and cache invalidation.

## Components
| Component | Purpose |
|-----------|---------|
| `cache-manager.ts` | Core caching logic, key generation, TTL management |
| `memory-cache.ts` | LRU in-memory cache implementation |
| `redis-cache.ts` | Redis-backed cache implementation |
| `cache-strategies.ts` | Per-tool cache configuration |
| `cache.middleware.ts` | Express middleware for cache intercept |

## Cache Key Generation
```
cache_key = SHA-256(tenant_id + method + JSON(params))
```

## Cacheability Rules
| Condition | Cacheable? |
|-----------|------------|
| GET requests | Yes (default) |
| tools/call with idempotent tools | Yes (configurable) |
| tools/call with side effects | No |
| Requests with `Cache-Control: no-cache` | No |
| Responses with errors | No |

## Cache Configuration
```yaml
cache:
  enabled: true
  ttl_seconds: 300
  max_size_mb: 100
  strategies:
    - tools: ["glean_search", "serval_query"]
      ttl_seconds: 60
    - tools: ["*_static"]
      ttl_seconds: 3600
```

## Cache Headers
| Header | Description |
|--------|-------------|
| `X-Cache` | `HIT` or `MISS` |
| `X-Cache-TTL` | Remaining TTL in seconds |
| `X-Cache-Key` | Cache key used (for debugging) |

## Error Handling
- Cache misses continue to upstream transparently
- Cache errors (Redis failures) fail-open (continue to upstream)
- Corrupted cache entries automatically invalidated
- Cache size limits enforced (LRU eviction)

## Security Considerations
- Cache keys include tenant_id (prevent cross-tenant cache pollution)
- Sensitive data never cached (PII detection)
- Cache entries signed to prevent tampering
- TTL bounds enforced (min 1s, max 24h)
