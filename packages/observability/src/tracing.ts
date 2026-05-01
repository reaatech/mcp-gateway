/**
 * mcp-gateway — Custom Tracing Helpers
 * Thin wrappers over the OTel API for consistent span naming
 */

import { type Attributes, type Span, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import { SERVICE_NAME } from '@reaatech/mcp-gateway-core';

const tracer: Tracer = trace.getTracer(SERVICE_NAME);

/**
 * Span name prefixes — one per pipeline stage
 */
export const SPAN_NAMES = {
  auth: 'gateway.auth',
  rateLimit: 'gateway.rate_limit',
  cache: 'gateway.cache',
  validation: 'gateway.validation',
  allowlist: 'gateway.allowlist',
  upstream: 'gateway.upstream',
  fanout: 'gateway.fanout',
  audit: 'gateway.audit',
} as const;

/**
 * Run a function inside a span, recording success/error on the span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes: Attributes = {},
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Get the currently active span (if any)
 */
export function currentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Add attributes to the active span
 */
export function addSpanAttributes(attributes: Attributes): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an event on the active span
 */
export function recordSpanEvent(name: string, attributes: Attributes = {}): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Export tracer directly for more advanced use cases
 */
export { tracer };
