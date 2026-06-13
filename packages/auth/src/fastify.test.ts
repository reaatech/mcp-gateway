/**
 * mcp-gateway — Auth Fastify Adapter Tests
 * Mirrors the Express auth behavior: allow path attaches auth context,
 * deny path short-circuits with 401.
 */

import { clearTenants, setTenant, type TenantConfig } from '@reaatech/mcp-gateway-core';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashApiKey } from './api-key-validator.js';
import { fastifyAuth } from './fastify.js';

const API_KEY = 'my-secret-api-key';

function tenantWithKey(): TenantConfig {
  return {
    tenantId: 'test-tenant',
    displayName: 'Test Tenant',
    auth: {
      apiKeys: [{ keyHash: hashApiKey(API_KEY), name: 'test-key', scopes: ['tools:*'] }],
    },
    rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
    allowlist: { mode: 'allow', tools: ['*'] },
    cache: { enabled: false, ttlSeconds: 300 },
    upstreams: [{ name: 'primary', url: 'https://mcp.example.com', weight: 1 }],
  };
}

function buildApp(opts = {}) {
  const app = Fastify();
  app.register(fastifyAuth, opts);
  app.post('/mcp', async (request) => ({
    tenantId: request.tenantId,
    authMethod: request.authContext?.authMethod,
  }));
  return app;
}

describe('fastifyAuth', () => {
  beforeEach(() => {
    clearTenants();
    setTenant(tenantWithKey());
  });

  afterEach(() => {
    clearTenants();
  });

  it('allows a request with a valid API key and decorates the request', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': API_KEY },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId: 'test-tenant', authMethod: 'api-key' });
    await app.close();
  });

  it('denies a request with no credentials (401) and short-circuits the handler', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.data.code).toBe('AUTH_REQUIRED');
    await app.close();
  });

  it('denies an invalid API key (401) and invokes onFailure', async () => {
    let failureCode: string | undefined;
    const app = buildApp({
      onFailure: (err: { code: string }) => {
        failureCode = err.code;
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': 'wrong-key' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(401);
    expect(failureCode).toBe('AUTH_FAILED');
    await app.close();
  });

  it('optional mode allows anonymous requests through', async () => {
    const app = buildApp({ optional: true });
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tenantId).toBeUndefined();
    await app.close();
  });

  it('optional mode attaches auth context when valid key provided', async () => {
    const app = buildApp({ optional: true });
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': API_KEY },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tenantId).toBe('test-tenant');
    expect(res.json().authMethod).toBe('api-key');
    await app.close();
  });
});
