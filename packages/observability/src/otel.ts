/**
 * mcp-gateway — OpenTelemetry Initialization
 * Configures tracing and metrics export
 */

import { env, isProduction } from '@reaatech/mcp-gateway-core';
import { SERVICE_NAME, SERVICE_VERSION } from '@reaatech/mcp-gateway-core';
import { logger } from '@reaatech/mcp-gateway-core';

function initOpenTelemetry(): void {
  const otelEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!otelEndpoint) {
    if (isProduction) {
      logger.warn(
        `[${SERVICE_NAME}] OTel endpoint not configured. Set OTEL_EXPORTER_OTLP_ENDPOINT to enable observability.`,
      );
    }
    return;
  }

  void import('./otel.impl.js')
    .then(({ setupOTel }) => {
      setupOTel(otelEndpoint, SERVICE_NAME, SERVICE_VERSION);
      logger.info(`OpenTelemetry initialized, exporting to ${otelEndpoint}`);
    })
    .catch((error) => {
      logger.warn({ err: error }, `[${SERVICE_NAME}] Failed to initialize OpenTelemetry`);
    });
}

initOpenTelemetry();
