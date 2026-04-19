# Fan-out Routing

## Capability
Broadcast MCP requests to multiple upstream servers with configurable aggregation strategies.

## Components
| Component | Purpose |
|-----------|---------|
| `fanout-router.ts` | Multi-upstream request routing |
| `response-aggregator.ts` | Response aggregation by strategy |
| `upstream-selector.ts` | Weight-based upstream selection |
| `failover-handler.ts` | Circuit breaker and retry logic |

## Aggregation Strategies
| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `first-success` | Return first valid response, cancel others | Low latency, redundancy |
| `all-wait` | Wait for all responses, merge results | Data aggregation |
| `majority-vote` | Return consensus from multiple upstreams | High reliability |

## Upstream Configuration
```yaml
upstreams:
  - name: "primary"
    url: "https://mcp-1.example.com"
    weight: 0.7
    timeout_ms: 30000
  - name: "secondary"
    url: "https://mcp-2.example.com"
    weight: 0.3
    timeout_ms: 30000
  - name: "standby"
    url: "https://mcp-3.example.com"
    weight: 0.0  # Only used if others fail
```

## Error Handling
- Partial failures handled gracefully (return available results)
- Timeout on slow upstreams (configurable per upstream)
- Circuit breaker prevents cascading failures
- Fan-out metadata included in response (which upstreams succeeded/failed)

## Security Considerations
- SSRF protection on all upstream URLs
- Each upstream call uses same auth context
- Circuit breaker state shared across instances (Redis-backed)
- Upstream health monitoring with automatic failover
