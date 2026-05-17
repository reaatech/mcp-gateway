/**
 * mcp-gateway — OpenTelemetry Implementation
 * Actual OTel setup (only loaded if configured)
 */

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;
let meterProvider: MeterProvider | undefined;

export function setupOTel(endpoint: string, serviceName: string, serviceVersion: string): void {
  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
  });

  const baseEndpoint = endpoint.replace(/\/$/, '');
  const traceExporter = new OTLPTraceExporter({ url: `${baseEndpoint}/v1/traces` });

  const metricExporter = new OTLPMetricExporter({ url: `${baseEndpoint}/v1/metrics` });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000,
  });

  meterProvider = new MeterProvider({ resource, readers: [metricReader] });

  sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => {
          return request.url === '/health' || request.url === '/health/deep';
        },
      }),
      new ExpressInstrumentation(),
    ],
  });

  sdk.start();
}

export async function shutdownOTel(): Promise<void> {
  if (meterProvider) {
    await meterProvider.shutdown().catch(() => undefined);
    meterProvider = undefined;
  }
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}
