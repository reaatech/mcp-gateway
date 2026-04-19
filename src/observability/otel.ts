/**
 * mcp-gateway — OpenTelemetry Initialization
 * Configures tracing and metrics export
 */

import { env, isProduction } from '../config/env.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../config/constants.js';
import { logger } from './logger.js';

function initOpenTelemetry(): void {
  const otelEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!otelEndpoint) {
    if (isProduction) {
      logger.warn(`[${SERVICE_NAME}] OTel endpoint not configured. Set OTEL_EXPORTER_OTLP_ENDPOINT to enable observability.`);
    }
    return;
  }

  void import('./otel.impl.js').then(({ setupOTel }) => {
    setupOTel(otelEndpoint, SERVICE_NAME, SERVICE_VERSION);
    logger.info(`OpenTelemetry initialized, exporting to ${otelEndpoint}`);
  }).catch((error) => {
    logger.warn({ err: error }, `[${SERVICE_NAME}] Failed to initialize OpenTelemetry`);
  });
}

initOpenTelemetry();
