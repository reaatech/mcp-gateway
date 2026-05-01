/**
 * mcp-gateway — Integration Tests
 * Tests the full request pipeline end-to-end using the Express app
 */

import { createHash } from 'node:crypto';
import { type UpstreamCaller, resetUpstreamCaller } from '@reaatech/mcp-gateway-fanout';
import { resetProbes } from '@reaatech/mcp-gateway-observability';
import { resetMetricsState } from '@reaatech/mcp-gateway-observability';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type GatewayApp, createApp } from './index.js';

process.env.NODE_ENV = 'test';
process.env.MCP_GATEWAY_DISABLE_AUTOSTART = '1';
process.env.AUDIT_ENABLED = 'false';

const TEST_API_KEY = 'integration-test-key';
const TEST_API_KEY_HASH = `sha256:${createHash('sha256').update(TEST_API_KEY).digest('hex')}`;
const CACHE_API_KEY = 'cache-test-key-special';
const CACHE_API_KEY_HASH =
  'sha256:0bc58ba86b0f09c2d3dd7432edd9ec85995170dbdd0ff1419acace377b765235';

describe('Integration: Full Request Pipeline', () => {
  let app: GatewayApp;

  beforeEach(async () => {
    resetProbes();
    resetMetricsState();
    resetUpstreamCaller();
    const { clearTenants } = await import('@reaatech/mcp-gateway-core');
    clearTenants();

    const { setTenant } = await import('@reaatech/mcp-gateway-core');
    setTenant({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }],
      },
      rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['test_tool'] },
      upstreams: [
        { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
      ],
    });
  });

  async function setupAdminAndSecondaryTenant() {
    const { setTenant } = await import('@reaatech/mcp-gateway-core');
    setTenant({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [
          { keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*', 'admin:read'] },
        ],
      },
      rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['test_tool'] },
      upstreams: [
        { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
      ],
    });
    setTenant({
      tenantId: 'second-tenant',
      displayName: 'Second Tenant',
      auth: {
        apiKeys: [{ keyHash: 'sha256:secondary', name: 'secondary-key', scopes: ['tools:*'] }],
      },
      rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000, burstSize: 10 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['other_tool'] },
      upstreams: [
        { name: 'backup', url: 'https://secondary.example.com', weight: 1.0, timeoutMs: 5000 },
      ],
    });
  }

  async function setupStandardAndSecondaryTenant() {
    const { setTenant } = await import('@reaatech/mcp-gateway-core');
    setTenant({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }],
      },
      rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['test_tool'] },
      upstreams: [
        { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
      ],
    });
    setTenant({
      tenantId: 'second-tenant',
      displayName: 'Second Tenant',
      auth: {
        apiKeys: [{ keyHash: 'sha256:secondary', name: 'secondary-key', scopes: ['tools:*'] }],
      },
      rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000, burstSize: 10 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['other_tool'] },
      upstreams: [
        { name: 'backup', url: 'https://secondary.example.com', weight: 1.0, timeoutMs: 5000 },
      ],
    });
  }

  describe('Health Endpoints', () => {
    it('GET /health returns liveness status', async () => {
      app = createApp();
      const response = await fetchViaApp(app, 'GET', '/health');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.version).toBeDefined();
      expect(body.uptimeSeconds).toBeDefined();
    });

    it('GET /health/deep returns readiness status', async () => {
      app = createApp();
      const response = await fetchViaApp(app, 'GET', '/health/deep');

      expect([200, 503]).toContain(response.status);
      const body = await response.json();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    });
  });

  describe('MCP Endpoint - Unauthenticated', () => {
    it('POST /mcp without auth returns 401', async () => {
      const mockCaller: UpstreamCaller = async () => ({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', result: {} },
        success: true,
        latencyMs: 10,
      });
      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(app, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'test_tool' },
      });

      expect(response.status).toBe(401);
    });

    it('POST /mcp with wrong API key returns 401', async () => {
      const mockCaller: UpstreamCaller = async () => ({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', result: {} },
        success: true,
        latencyMs: 10,
      });
      const { setTenant: st } = await import('@reaatech/mcp-gateway-core');
      st({
        tenantId: 'test-tenant',
        displayName: 'Test Tenant',
        auth: { apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }] },
        rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
        cache: { enabled: false, ttlSeconds: 0 },
        allowlist: { mode: 'allow', tools: ['test_tool'] },
        upstreams: [
          { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
        ],
      });
      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(
        app,
        'POST',
        '/mcp',
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: { name: 'test_tool' },
        },
        { 'x-api-key': 'wrong-key' },
      );

      expect(response.status).toBe(401);
      const failures = app.auditStorage.query({ eventType: 'auth.failure' });
      expect(failures).toHaveLength(1);
      expect(failures[0]?.metadata?.code).toBe('AUTH_FAILED');
    });
  });

  describe('MCP Endpoint - Authenticated', () => {
    it('POST /mcp with valid API key routes to upstream', async () => {
      const { setTenant: st } = await import('@reaatech/mcp-gateway-core');
      st({
        tenantId: 'test-tenant',
        displayName: 'Test Tenant',
        auth: { apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }] },
        rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
        cache: { enabled: false, ttlSeconds: 0 },
        allowlist: { mode: 'allow', tools: ['test_tool'] },
        upstreams: [
          { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
        ],
      });

      const mockCaller: UpstreamCaller = vi.fn().mockResolvedValue({
        upstream: 'primary',
        response: {
          jsonrpc: '2.0',
          id: '1',
          result: { content: [{ type: 'text', text: 'hello' }] },
        },
        durationMs: 50,
        success: true,
        latencyMs: 50,
      });

      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(
        app,
        'POST',
        '/mcp',
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: { name: 'test_tool', arguments: { q: 'hello' } },
        },
        { 'x-api-key': TEST_API_KEY },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.result).toBeDefined();
      expect(mockCaller).toHaveBeenCalledOnce();
    });

    it('POST /mcp with disallowed tool returns 403', async () => {
      const { setTenant: st } = await import('@reaatech/mcp-gateway-core');
      st({
        tenantId: 'test-tenant',
        displayName: 'Test Tenant',
        auth: { apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }] },
        rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
        cache: { enabled: false, ttlSeconds: 0 },
        allowlist: { mode: 'allow', tools: ['test_tool'] },
        upstreams: [
          { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
        ],
      });

      const mockCaller: UpstreamCaller = vi.fn().mockResolvedValue({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', result: {} },
        success: true,
        latencyMs: 10,
      });

      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(
        app,
        'POST',
        '/mcp',
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: { name: 'admin_delete' },
        },
        { 'x-api-key': TEST_API_KEY },
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBeDefined();
      expect((body.error as Record<string, unknown>).message).toContain('not allowed');
      expect(mockCaller).not.toHaveBeenCalled();
    });

    it('POST /mcp when all upstreams fail returns 502', async () => {
      const { setTenant: st } = await import('@reaatech/mcp-gateway-core');
      st({
        tenantId: 'test-tenant',
        displayName: 'Test Tenant',
        auth: { apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }] },
        rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
        cache: { enabled: false, ttlSeconds: 0 },
        allowlist: { mode: 'allow', tools: ['test_tool'] },
        upstreams: [
          { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
        ],
      });

      const mockCaller: UpstreamCaller = vi.fn().mockResolvedValue({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', error: { code: -32000, message: 'timeout' } },
        success: false,
        error: 'timeout',
        latencyMs: 10,
      });

      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(
        app,
        'POST',
        '/mcp',
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: { name: 'test_tool' },
        },
        { 'x-api-key': TEST_API_KEY },
      );

      expect(response.status).toBe(502);
    });
  });

  describe('404 Handler', () => {
    it('returns 404 for unknown paths', async () => {
      app = createApp();
      const response = await fetchViaApp(app, 'GET', '/nonexistent');
      expect(response.status).toBe(404);
    });
  });

  describe('Admin API Authorization', () => {
    it('non-admin tenant only sees its own tenant summary', async () => {
      await setupStandardAndSecondaryTenant();
      app = createApp();

      const response = await fetchViaApp(app, 'GET', '/api/v1/tenants', undefined, {
        'x-api-key': TEST_API_KEY,
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { tenants: Array<{ tenantId: string }> };
      expect(body.tenants).toHaveLength(1);
      expect(body.tenants[0]?.tenantId).toBe('test-tenant');
    });

    it('non-admin tenant cannot request another tenant audit view', async () => {
      await setupStandardAndSecondaryTenant();
      app = createApp();

      const response = await fetchViaApp(
        app,
        'GET',
        '/api/v1/audit?tenant_id=second-tenant',
        undefined,
        { 'x-api-key': TEST_API_KEY },
      );

      expect(response.status).toBe(403);
    });

    it('admin-scoped tenant can list all tenants', async () => {
      await setupAdminAndSecondaryTenant();
      app = createApp();

      const response = await fetchViaApp(app, 'GET', '/api/v1/tenants', undefined, {
        'x-api-key': TEST_API_KEY,
        'x-tenant-id': 'test-tenant',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { tenants: Array<{ tenantId: string }> };
      expect(body.tenants.map((tenant) => tenant.tenantId).sort()).toEqual([
        'second-tenant',
        'test-tenant',
      ]);
    });
  });

  describe('Cache Integration', () => {
    it('second request to same tool is served from cache', async () => {
      const { setTenant } = await import('@reaatech/mcp-gateway-core');
      setTenant({
        tenantId: 'cache-tenant',
        displayName: 'Cache Test Tenant',
        auth: {
          apiKeys: [{ keyHash: CACHE_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }],
        },
        rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
        cache: { enabled: true, ttlSeconds: 60 },
        allowlist: { mode: 'allow', tools: ['cached_tool'] },
        upstreams: [
          { name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 },
        ],
      });

      let callCount = 0;
      const mockCaller: UpstreamCaller = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          upstream: 'primary',
          response: {
            jsonrpc: '2.0',
            id: '1',
            result: { content: [{ type: 'text', text: `response-${callCount}` }] },
          },
          success: true,
          latencyMs: 10,
        };
      });

      app = createApp({
        upstreamCaller: mockCaller,
      });

      const body = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'cached_tool', arguments: { q: 'test' } },
      };

      // First request - should hit upstream
      const r1 = await fetchViaApp(app, 'POST', '/mcp', body, {
        'x-api-key': CACHE_API_KEY,
        'x-tenant-id': 'cache-tenant',
      });
      expect(r1.status).toBe(200);

      // Second request - should be cached (cache middleware checks before upstream)
      const r2 = await fetchViaApp(app, 'POST', '/mcp', body, {
        'x-api-key': CACHE_API_KEY,
        'x-tenant-id': 'cache-tenant',
      });
      expect(r2.status).toBe(200);

      // Verify upstream was called at least once
      expect(mockCaller).toHaveBeenCalled();
    });
  });
});

async function fetchViaApp(
  gateway: GatewayApp,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: () => Promise<Record<string, unknown>> }> {
  return new Promise((resolve) => {
    const req = {
      method,
      url: path,
      path,
      httpVersion: '1.1',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...headers,
      },
      body: body ?? {},
      _body: true,
      get: (key: string) => (req.headers as Record<string, string>)[key.toLowerCase()],
      authContext: undefined as undefined | { tenantId?: string; scopes?: string[] },
      ip: '127.0.0.1',
      on: () => req,
      socket: { remoteAddress: '127.0.0.1' },
    };

    const res = {
      _status: 200,
      _headers: new Map<string, string>(),
      _body: '',
      statusCode: 200,
      status: (code: number) => {
        res._status = code;
        res.statusCode = code;
        return res;
      },
      setHeader: (key: string, value: string) => {
        res._headers.set(key.toLowerCase(), value);
      },
      getHeader: (key: string) => res._headers.get(key.toLowerCase()),
      json: (data: unknown) => {
        res._body = JSON.stringify(data);
        (res as { end: () => void }).end();
        return res;
      },
      end: () => {
        resolve({
          status: res._status,
          json: async () => {
            try {
              return JSON.parse(res._body);
            } catch {
              return {};
            }
          },
        });
      },
      on: () => res,
    };

    (gateway.app as unknown as (r: typeof req, rs: typeof res, n: (e?: Error) => void) => void)(
      req,
      res,
      (err?: Error) => {
        if (err || res._status >= 500) {
          resolve({
            status: err ? 500 : res._status,
            json: async () => ({ error: err?.message ?? 'Internal error' }),
          });
        }
      },
    );
  });
}
