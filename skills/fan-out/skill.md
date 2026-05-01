# Fan-out Routing

## Capability
Broadcast MCP requests to multiple upstream servers with configurable aggregation strategies, circuit breaker, and retry logic.

## Package
`@reaatech/mcp-gateway-fanout` — `packages/fanout/src/`

## Components
| Component | Purpose |
|-----------|---------|
| `fanout-router.ts` | Multi-upstream orchestration: executeFanout, setUpstreamCaller |
| `response-aggregator.ts` | Aggregation by strategy (first-success, all-wait, majority-vote) |
| `upstream-selector.ts` | Weight-based upstream selection (round-robin, weighted, health-based) |
| `failover-handler.ts` | Circuit breaker, retry with backoff, health tracking |
| `upstream-client.ts` | JSON-RPC request creation and upstream HTTP calls |
| `retry-logic.ts` | Exponential backoff with jitter and idempotency keys |
| `health-checker.ts` | Periodic upstream health probes with configurable thresholds |
| `connection-pool.ts` | HTTP Keep-Alive connection pooling for upstream requests |

## Aggregation Strategies
| Strategy | Behavior |
|----------|----------|
| `first-success` | Return first valid response, cancel others |
| `all-wait` | Wait for all responses, merge results |
| `majority-vote` | Return consensus from multiple upstreams |

## Error Handling
- Partial failures handled gracefully (return available results)
- Timeout on slow upstreams (configurable per upstream)
- Circuit breaker prevents cascading failures
- Fan-out metadata included in response

## Security Considerations
- SSRF protection on all upstream URLs (via core package)
- Each upstream call uses same auth context as original request
- Circuit breaker state configurable per upstream
