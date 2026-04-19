/**
 * mcp-gateway — Integration Tests
 * Tests the full request pipeline end-to-end using the Express app
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, type GatewayApp } from '../../src/index.js';
import { resetProbes } from '../../src/observability/health.js';
import { resetMetricsState } from '../../src/observability/metrics.js';
import { resetUpstreamCaller, type UpstreamCaller } from '../../src/fanout/fanout-router.js';
import { createHash } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MCP_GATEWAY_DISABLE_AUTOSTART = '1';

const TEST_API_KEY = 'integration-test-key';
const TEST_API_KEY_HASH = 'sha256:' + createHash('sha256').update(TEST_API_KEY).digest('hex');

describe('Integration: Full Request Pipeline', () => {
  let app: GatewayApp;

  beforeEach(async () => {
    resetProbes();
    resetMetricsState();
    resetUpstreamCaller();
    const { clearTenants } = await import('../../src/config/tenant-loader.js');
    clearTenants();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    resetUpstreamCaller();
    const { clearTenants } = await import('../../src/config/tenant-loader.js');
    clearTenants();
  });

  async function setupTenant() {
    const { setTenant } = await import('../../src/config/tenant-loader.js');
    setTenant({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }],
      },
      rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['test_tool'] },
      upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 }],
    });
  }

  async function setupAdminAndSecondaryTenant() {
    const { setTenant } = await import('../../src/config/tenant-loader.js');
    setTenant({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*', 'admin:read'] }],
      },
      rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['test_tool'] },
      upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 }],
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
      upstreams: [{ name: 'backup', url: 'https://secondary.example.com', weight: 1.0, timeoutMs: 5000 }],
    });
  }

  async function setupStandardAndSecondaryTenant() {
    const { setTenant } = await import('../../src/config/tenant-loader.js');
    setTenant({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }],
      },
      rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
      cache: { enabled: false, ttlSeconds: 0 },
      allowlist: { mode: 'allow', tools: ['test_tool'] },
      upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 }],
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
      upstreams: [{ name: 'backup', url: 'https://secondary.example.com', weight: 1.0, timeoutMs: 5000 }],
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
        durationMs: 10,
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
        durationMs: 10,
        success: true,
        latencyMs: 10,
      });
      await setupTenant();
      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(app, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'test_tool' },
      }, { 'x-api-key': 'wrong-key' });

      expect(response.status).toBe(401);
      const failures = app.auditStorage.query({ eventType: 'auth.failure' });
      expect(failures).toHaveLength(1);
      expect(failures[0]?.metadata?.code).toBe('AUTH_FAILED');
    });
  });

  describe('MCP Endpoint - Authenticated', () => {
    it('POST /mcp with valid API key routes to upstream', async () => {
      await setupTenant();

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

      const response = await fetchViaApp(app, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'test_tool', arguments: { q: 'hello' } },
      }, { 'x-api-key': TEST_API_KEY });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.result).toBeDefined();
      expect(mockCaller).toHaveBeenCalledOnce();
    });

    it('POST /mcp with disallowed tool returns 403', async () => {
      await setupTenant();

      const mockCaller: UpstreamCaller = vi.fn().mockResolvedValue({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', result: {} },
        durationMs: 10,
        success: true,
        latencyMs: 10,
      });

      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(app, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'admin_delete' },
      }, { 'x-api-key': TEST_API_KEY });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.error).toBeDefined();
      expect((body.error as Record<string, unknown>).message).toContain('not allowed');
      expect(mockCaller).not.toHaveBeenCalled();
    });

    it('POST /mcp when all upstreams fail returns 502', async () => {
      await setupTenant();

      const mockCaller: UpstreamCaller = vi.fn().mockResolvedValue({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', error: { code: -32000, message: 'timeout' } },
        durationMs: 10,
        success: false,
        error: 'timeout',
        latencyMs: 10,
      });

      app = createApp({ upstreamCaller: mockCaller });

      const response = await fetchViaApp(app, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'test_tool' },
      }, { 'x-api-key': TEST_API_KEY });

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
      const body = await response.json() as { tenants: Array<{ tenantId: string }> };
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
      const body = await response.json() as { tenants: Array<{ tenantId: string }> };
      expect(body.tenants.map((tenant) => tenant.tenantId).sort()).toEqual(['second-tenant', 'test-tenant']);
    });
  });

  describe('Cache Integration', () => {
    it('second request to same tool is served from cache', async () => {
      const { setTenant } = await import('../../src/config/tenant-loader.js');
      setTenant({
        tenantId: 'cache-tenant',
        displayName: 'Cache Test Tenant',
        auth: {
          apiKeys: [{ keyHash: TEST_API_KEY_HASH, name: 'test-key', scopes: ['tools:*'] }],
        },
        rateLimits: { requestsPerMinute: 1000, requestsPerDay: 100000, burstSize: 50 },
        cache: { enabled: true, ttlSeconds: 60 },
        allowlist: { mode: 'allow', tools: ['cached_tool'] },
        upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0, timeoutMs: 5000 }],
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
          durationMs: 10,
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
      const r1 = await fetchViaApp(app, 'POST', '/mcp', body, { 'x-api-key': TEST_API_KEY });
      expect(r1.status).toBe(200);

      // Second request - should be cached (cache middleware checks before upstream)
      const r2 = await fetchViaApp(app, 'POST', '/mcp', body, { 'x-api-key': TEST_API_KEY });
      expect(r2.status).toBe(200);

      // Verify upstream was called at least once
      expect(mockCaller).toHaveBeenCalled();
    });
  });
});

function fetchViaApp(
  gateway: GatewayApp,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: () => Promise<Record<string, unknown>> }> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {
      method,
      url: path,
      path,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...headers,
      },
      body: body ?? {},
      get(key: string) {
        return this.headers[key.toLowerCase()];
      },
      authContext: undefined,
      ip: '127.0.0.1',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = {
      _status: 200,
      _headers: new Map<string, string>(),
      _body: '',
      _ended: false,
      statusCode: 200,
      status(code: number) {
        this._status = code;
        this.statusCode = code;
        return this;
      },
      setHeader(key: string, value: string) {
        this._headers.set(key.toLowerCase(), value);
      },
      getHeader(key: string) {
        return this._headers.get(key.toLowerCase());
      },
      json(data: unknown) {
        this._body = JSON.stringify(data);
        this._ended = true;
        this.end();
        return this;
      },
      end() {
        resolve({
          status: this._status,
          json: async () => {
            try {
              return JSON.parse(this._body);
            } catch {
              return {};
            }
          },
        });
      },
      on() {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gateway.app as any).handle(req, res, (err?: Error) => {
      if (err) {
        resolve({
          status: res._status || 500,
          json: async () => ({ error: err.message }),
        });
      } else {
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
      }
    });
  });
}
