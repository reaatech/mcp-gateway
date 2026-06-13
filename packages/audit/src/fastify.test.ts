/**
 * mcp-gateway — Audit Fastify Adapter Tests
 * Records an event for a passing request; defaults to a silent sink.
 */

import Fastify, { type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AuditLogger } from './audit-logger.js';
import { fastifyAudit } from './fastify.js';
import type { AuditEvent } from './types.js';

class CapturingLogger implements AuditLogger {
  events: AuditEvent[] = [];
  log(event: AuditEvent): void {
    this.events.push(event);
  }
}

function buildApp(logger: AuditLogger | undefined, tenantId = 'tenant-a') {
  const app = Fastify();
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { tenantId?: string }).tenantId = tenantId;
  });
  app.register(fastifyAudit, logger ? { logger } : {});
  app.post('/mcp', async () => ({ ok: true }));
  return app;
}

describe('fastifyAudit', () => {
  it('records an event for a passing tool call', async () => {
    const logger = new CapturingLogger();
    const app = buildApp(logger);
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-request-id': 'req-123' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'weather_get' } },
    });

    expect(res.statusCode).toBe(200);
    expect(logger.events).toHaveLength(1);
    const event = logger.events[0];
    expect(event.tenantId).toBe('tenant-a');
    expect(event.tool).toBe('weather_get');
    expect(event.requestId).toBe('req-123');
    expect(event.success).toBe(true);
    await app.close();
  });

  it('defaults to a silent sink (no throw) when no logger is provided', async () => {
    const app = buildApp(undefined);
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
