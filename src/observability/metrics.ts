/**
 * mcp-gateway — OpenTelemetry Metrics
 * Counters, histograms, and gauges for gateway observability
 */

import { metrics, type Counter, type Histogram, type ObservableGauge } from '@opentelemetry/api';
import { SERVICE_NAME } from '../config/constants.js';

const meter = metrics.getMeter(SERVICE_NAME);

/**
 * Total gateway requests by tenant and status
 */
export const requestsTotal: Counter = meter.createCounter('gateway.requests.total', {
  description: 'Total requests processed by the gateway',
});

/**
 * Request duration histogram in milliseconds
 */
export const requestDurationMs: Histogram = meter.createHistogram('gateway.requests.duration_ms', {
  description: 'Request duration in milliseconds',
  unit: 'ms',
});

/**
 * Authentication attempts (success/failure)
 */
export const authAttempts: Counter = meter.createCounter('gateway.auth.attempts', {
  description: 'Authentication attempts by method and result',
});

/**
 * Authentication failures by reason
 */
export const authFailures: Counter = meter.createCounter('gateway.auth.failures', {
  description: 'Authentication failures by method and reason',
});

/**
 * Rate limit exceeded counter
 */
export const rateLimitExceeded: Counter = meter.createCounter('gateway.rate_limit.exceeded', {
  description: 'Number of requests rejected due to rate limiting',
});

/**
 * Cache hit counter
 */
export const cacheHits: Counter = meter.createCounter('gateway.cache.hits', {
  description: 'Cache hits by tool',
});

/**
 * Cache miss counter
 */
export const cacheMisses: Counter = meter.createCounter('gateway.cache.misses', {
  description: 'Cache misses by tool',
});

/**
 * Upstream request counter
 */
export const upstreamRequests: Counter = meter.createCounter('gateway.upstream.requests', {
  description: 'Upstream requests by upstream name and status',
});

/**
 * Upstream error counter
 */
export const upstreamErrors: Counter = meter.createCounter('gateway.upstream.errors', {
  description: 'Upstream errors by upstream name and error type',
});

/**
 * Upstream latency histogram
 */
export const upstreamLatencyMs: Histogram = meter.createHistogram('gateway.upstream.latency_ms', {
  description: 'Upstream call latency in milliseconds',
  unit: 'ms',
});

/**
 * Fan-out upstreams histogram (how many were contacted per fan-out)
 */
export const fanoutUpstreams: Histogram = meter.createHistogram('gateway.fanout.upstreams', {
  description: 'Upstreams contacted per fan-out request',
});

/**
 * Allowlist denials
 */
export const allowlistDenied: Counter = meter.createCounter('gateway.allowlist.denied', {
  description: 'Requests denied by tool allowlist',
});

/**
 * Validation error counter
 */
export const validationErrors: Counter = meter.createCounter('gateway.validation.errors', {
  description: 'Schema validation errors by type',
});

/**
 * Audit events counter
 */
export const auditEvents: Counter = meter.createCounter('gateway.audit.events', {
  description: 'Audit events by type',
});

/**
 * In-memory gauges (observed via callback)
 */
let cacheSizeBytes = 0;
let rateLimitRemaining = new Map<string, number>();

/**
 * Cache size gauge
 */
export const cacheSize: ObservableGauge = meter.createObservableGauge('gateway.cache.size', {
  description: 'Cache size in bytes',
  unit: 'By',
});

cacheSize.addCallback((observer) => {
  observer.observe(cacheSizeBytes);
});

/**
 * Rate limit remaining gauge
 */
export const rateLimitRemainingGauge: ObservableGauge = meter.createObservableGauge(
  'gateway.rate_limit.remaining',
  {
    description: 'Remaining quota per tenant',
  },
);

rateLimitRemainingGauge.addCallback((observer) => {
  for (const [tenantId, remaining] of rateLimitRemaining.entries()) {
    observer.observe(remaining, { tenant_id: tenantId });
  }
});

/**
 * Update cache size for gauge reporting
 */
export function updateCacheSize(bytes: number): void {
  cacheSizeBytes = bytes;
}

/**
 * Update rate limit remaining for a tenant
 */
export function updateRateLimitRemaining(tenantId: string, remaining: number): void {
  rateLimitRemaining.set(tenantId, remaining);
}

/**
 * Reset all in-memory metric state (primarily for tests)
 */
export function resetMetricsState(): void {
  cacheSizeBytes = 0;
  rateLimitRemaining = new Map();
}
