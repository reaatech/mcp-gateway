/**
 * mcp-gateway — Observability Barrel Export
 * OpenTelemetry tracing, metrics, health checks, and logging re-export
 */

import './otel.js';

export {
  childLogger,
  type LogContext,
  type Logger,
  logger,
  redactToken,
} from '@reaatech/mcp-gateway-core';
export * from './health.js';
export * from './metrics.js';
export { shutdownOTel } from './otel.impl.js';
export * from './tracing.js';
