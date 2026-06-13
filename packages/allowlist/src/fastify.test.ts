/**
 * mcp-gateway — Allowlist Fastify Adapter Tests
 * Mirrors the Express behavior: allowed tool passes, blocked tool denies 403.
 */

import { clearTenants, setTenant, type TenantConfig } from '@reaatech/mcp-gateway-core';
import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fastifyAllowlist } from './fastify.js';
import type { ToolAllowlist } from './types.js';

function setupTenant(tenantId: string, allowlist: ToolAllowlist) {
  setTenant({
    tenantId,
    displayName: `Test Tenant ${tenantId}`,
    auth: {},
    rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
    allowlist,
    cache: { enabled: false, ttlSeconds: 60 },
    upstreams: [{ name: 'primary', url: 'https://mcp.example.com', weight: 1 }],
  } as TenantConfig);
}

function buildApp(tenantId: string | undefined) {
  const app = Fastify();
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { tenantId?: string }).tenantId = tenantId;
  });
  app.register(fastifyAllowlist);
  app.post('/mcp', async () => ({ ok: true }));
  return app;
}

describe('fastifyAllowlist', () => {
  beforeEach(() => {
    clearTenants();
  });
  afterEach(() => {
    clearTenants();
  });

  it('allows a permitted tool call', async () => {
    setupTenant('tenant-a', { mode: 'allow', tools: ['weather_*'] });
    const app = buildApp('tenant-a');
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'weather_get' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('denies a blocked tool call with 403', async () => {
    setupTenant('tenant-b', { mode: 'allow', tools: ['weather_*'] });
    const app = buildApp('tenant-b');
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'delete_everything' },
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe(-32601);
    expect(body.error.data.tool).toBe('delete_everything');
    expect(body.id).toBe(7);
    await app.close();
  });

  it('passes through non-tool-call requests', async () => {
    setupTenant('tenant-c', { mode: 'allow', tools: ['weather_*'] });
    const app = buildApp('tenant-c');
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('passes through when no tenant is identified', async () => {
    const app = buildApp(undefined);
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'anything' } },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
