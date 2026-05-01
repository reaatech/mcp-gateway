/**
 * mcp-gateway — Observability Barrel Export
 * OpenTelemetry tracing, metrics, health checks, and logging re-export
 */

import './otel.js';

export * from './metrics.js';
export * from './tracing.js';
export * from './health.js';
export { shutdownOTel } from './otel.impl.js';
export {
  logger,
  childLogger,
  redactToken,
  type Logger,
  type LogContext,
} from '@reaatech/mcp-gateway-core';
