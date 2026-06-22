/**
 * mcp-gateway — MCP Client Unit Tests
 */

import { validateUpstreamUrl } from '@reaatech/mcp-gateway-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionPool, DEFAULT_POOL_CONFIG } from './connection-pool.js';
import { HealthChecker } from './health-checker.js';
import { calculateBackoff, isRetryableError } from './retry-logic.js';
import type { JsonRpcResponse, UpstreamCallResponse } from './types.js';
import { createJsonRpcRequest } from './upstream-client.js';

vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
  },
  lookup: vi.fn(),
}));

describe('upstream-client', () => {
  describe('createJsonRpcRequest', () => {
    it('creates valid JSON-RPC request', () => {
      const request = createJsonRpcRequest('tools/call', { name: 'test' });
      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('tools/call');
      expect(request.params).toEqual({ name: 'test' });
      expect(request.id).toBeDefined();
    });

    it('uses provided id', () => {
      const request = createJsonRpcRequest('ping', undefined, 'custom-id');
      expect(request.id).toBe('custom-id');
    });

    it('handles no params', () => {
      const request = createJsonRpcRequest('ping');
      expect(request.params).toBeUndefined();
    });
  });

  describe('validateUpstreamUrl', () => {
    it('accepts valid HTTPS URLs', () => {
      const result = validateUpstreamUrl('https://api.example.com');
      expect(result.valid).toBe(true);
    });

    it('accepts valid HTTP URLs', () => {
      const result = validateUpstreamUrl('http://api.example.com');
      expect(result.valid).toBe(true);
    });

    it('rejects localhost', () => {
      const result = validateUpstreamUrl('http://localhost:8080');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe(
        'SSRF protection: Upstream URL cannot point to localhost or private IP ranges (localhost)',
      );
    });

    it('rejects private IPs', () => {
      expect(validateUpstreamUrl('http://10.0.0.1').valid).toBe(false);
      expect(validateUpstreamUrl('http://192.168.1.1').valid).toBe(false);
      expect(validateUpstreamUrl('http://172.16.0.1').valid).toBe(false);
    });

    it('rejects non-HTTP protocols', () => {
      const result = validateUpstreamUrl('ftp://example.com');
      expect(result.valid).toBe(false);
    });

    it('rejects invalid URLs', () => {
      const result = validateUpstreamUrl('not-a-url');
      expect(result.valid).toBe(false);
    });

    it('rejects link-local addresses', () => {
      const result = validateUpstreamUrl('http://169.254.0.1');
      expect(result.valid).toBe(false);
    });
  });
});

describe('connection-pool', () => {
  let pool: ConnectionPool;

  beforeEach(() => {
    pool = new ConnectionPool({
      ...DEFAULT_POOL_CONFIG,
      maxConnectionsPerHost: 3,
      idleTimeoutMs: 100,
    });
  });

  it('creates connections', () => {
    const upstream = { name: 'test', url: 'https://api.example.com' };
    const conn = pool.getConnection(upstream);
    expect(conn.url).toBe(upstream.url);
    expect(conn.requestCount).toBe(1);
  });

  it('reuses connections', () => {
    const upstream = { name: 'test', url: 'https://api.example.com' };
    pool.getConnection(upstream);
    pool.getConnection(upstream);

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(1);
  });

  it('tracks connections per host', () => {
    const upstreams = [
      { name: 'a', url: 'https://api-a.example.com' },
      { name: 'b', url: 'https://api-b.example.com' },
      { name: 'c', url: 'https://api-c.example.com' },
    ];

    for (const upstream of upstreams) {
      pool.getConnection(upstream);
    }

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(3);
    expect(stats.uniqueHosts).toBe(3);
  });

  it('cleans up idle connections', () => {
    const pool = new ConnectionPool({
      maxConnectionsPerHost: 3,
      idleTimeoutMs: -1,
      maxLifetimeMs: -1,
    });
    pool.getConnection({ name: 'test', url: 'https://api.example.com' });
    const removed = pool.cleanup();
    expect(removed).toBe(1);
  });

  it('tracks unique hosts', () => {
    pool.getConnection({ name: 'a', url: 'https://api-a.example.com' });
    pool.getConnection({ name: 'b', url: 'https://api-b.example.com' });
    pool.getConnection({ name: 'c', url: 'https://api-a.example.com' });

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(2);
    expect(stats.uniqueHosts).toBe(2);
  });

  it('creates connections for different URLs on same host up to limit', () => {
    const pool2 = new ConnectionPool({
      maxConnectionsPerHost: 2,
      idleTimeoutMs: 60000,
      maxLifetimeMs: 300000,
    });
    pool2.getConnection({ name: 'a', url: 'https://api-a.example.com/p1' });
    pool2.getConnection({ name: 'b', url: 'https://api-a.example.com/p2' });

    const stats = pool2.getStats();
    expect(stats.totalConnections).toBe(2);
  });

  it('evicts LRU connection when host limit is reached', () => {
    const pool5 = new ConnectionPool({
      maxConnectionsPerHost: 1,
      idleTimeoutMs: 60000,
      maxLifetimeMs: 300000,
    });
    pool5.getConnection({ name: 'a', url: 'https://api-a.example.com/p1' });
    pool5.getConnection({ name: 'b', url: 'https://api-a.example.com/p2' });

    const stats = pool5.getStats();
    expect(stats.totalConnections).toBe(1);
  });

  it('removes specific connection', () => {
    const upstream = { name: 'test', url: 'https://api.example.com' };
    pool.getConnection(upstream);
    pool.remove(upstream.url);

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(0);
  });

  it('clears all connections', () => {
    pool.getConnection({ name: 'a', url: 'https://api-a.example.com' });
    pool.getConnection({ name: 'b', url: 'https://api-b.example.com' });
    pool.clear();

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(0);
  });

  it('releases connection updates lastUsed', () => {
    const upstream = { name: 'test', url: 'https://api.example.com' };
    const conn1 = pool.getConnection(upstream);
    const firstUsed = conn1.lastUsed;

    pool.release(upstream.url);

    const conn2 = pool.getConnection(upstream);
    expect(conn2.lastUsed).toBeGreaterThanOrEqual(firstUsed);
  });

  it('handles invalid URLs gracefully in getStats', () => {
    pool.getConnection({ name: 'test', url: 'not-a-valid-url' });
    const stats = pool.getStats();
    expect(stats.uniqueHosts).toBeGreaterThanOrEqual(0);
  });

  it('reuses existing connection when idle and lifetime within limits', () => {
    const upstream = { name: 'test', url: 'https://api.example.com' };
    const conn1 = pool.getConnection(upstream);
    const conn2 = pool.getConnection(upstream);
    expect(conn1).toBe(conn2);
  });

  it('creates new connection when existing is idle too long', () => {
    const pool3 = new ConnectionPool({
      maxConnectionsPerHost: 3,
      idleTimeoutMs: -1,
      maxLifetimeMs: 300000,
    });
    pool3.getConnection({ name: 'a', url: 'https://api.example.com' });
    pool3.getConnection({ name: 'a', url: 'https://api.example.com' });

    const stats = pool3.getStats();
    expect(stats.totalConnections).toBe(1);
  });

  it('creates new connection when existing exceeds max lifetime', () => {
    const pool4 = new ConnectionPool({
      maxConnectionsPerHost: 3,
      idleTimeoutMs: 60000,
      maxLifetimeMs: -1,
    });
    pool4.getConnection({ name: 'a', url: 'https://api.example.com' });
    pool4.getConnection({ name: 'a', url: 'https://api.example.com' });

    const stats = pool4.getStats();
    expect(stats.totalConnections).toBe(1);
  });

  it('cleanup removes idle and expired connections', () => {
    const pool6 = new ConnectionPool({
      maxConnectionsPerHost: 3,
      idleTimeoutMs: -1,
      maxLifetimeMs: -1,
    });
    pool6.getConnection({ name: 'a', url: 'https://api.example.com' });
    const removed = pool6.cleanup();
    expect(removed).toBe(1);
  });

  it('invalid URL host counting uses catch path', () => {
    const pool7 = new ConnectionPool({
      maxConnectionsPerHost: 1,
      idleTimeoutMs: -1,
      maxLifetimeMs: -1,
    });
    pool7.getConnection({ name: 'a', url: 'not-valid-url' });
    pool7.getConnection({ name: 'b', url: 'not-valid-url' });

    const stats = pool7.getStats();
    expect(stats.totalConnections).toBe(1);
  });

  it('handles invalid URL in host counting without exceeding limit', () => {
    const pool8 = new ConnectionPool({
      maxConnectionsPerHost: 1,
      idleTimeoutMs: -1,
      maxLifetimeMs: -1,
    });
    pool8.getConnection({ name: 'a', url: 'https://api-a.example.com/p1' });
    pool8.getConnection({ name: 'b', url: 'not-valid-url' });

    const stats = pool8.getStats();
    expect(stats.totalConnections).toBe(2);
  });

  it('handles invalid URL with LRU fallback', () => {
    const pool9 = new ConnectionPool({
      maxConnectionsPerHost: 1,
      idleTimeoutMs: -1,
      maxLifetimeMs: -1,
    });
    pool9.getConnection({ name: 'a', url: 'not-valid-url' });
    pool9.getConnection({ name: 'b', url: 'https://api-a.example.com/p1' });

    const stats = pool9.getStats();
    expect(stats.totalConnections).toBe(2);
  });
});

describe('health-checker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker({
      intervalMs: 60000,
      timeoutMs: 1000,
      unhealthyThreshold: 2,
      healthyThreshold: 1,
    });
  });

  afterEach(() => {
    healthChecker.stop();
  });

  it('initializes health status for upstreams', () => {
    healthChecker.init([
      { name: 'up1', url: 'https://api1.example.com', timeoutMs: 5000 },
      { name: 'up2', url: 'https://api2.example.com', timeoutMs: 5000 },
    ]);

    const status = healthChecker.getStatus();
    expect(status.size).toBe(2);
    expect(status.get('up1')?.status).toBe('unknown');
  });

  it('returns upstream status', () => {
    healthChecker.init([{ name: 'up1', url: 'https://api1.example.com', timeoutMs: 5000 }]);
    const upstreamStatus = healthChecker.getUpstreamStatus('up1');
    expect(upstreamStatus).toBeDefined();
    expect(upstreamStatus?.name).toBe('up1');
  });

  it('returns undefined for unknown upstream', () => {
    const upstreamStatus = healthChecker.getUpstreamStatus('nonexistent');
    expect(upstreamStatus).toBeUndefined();
  });

  it('checks if upstream is healthy', () => {
    healthChecker.init([{ name: 'up1', url: 'https://api1.example.com', timeoutMs: 5000 }]);
    expect(healthChecker.isHealthy('up1')).toBe(false);
  });

  it('filters healthy upstreams', () => {
    const upstreams = [
      { name: 'up1', url: 'https://api1.example.com', timeoutMs: 5000 },
      { name: 'up2', url: 'https://api2.example.com', timeoutMs: 5000 },
    ];
    healthChecker.init(upstreams);
    const healthy = healthChecker.getHealthyUpstreams(upstreams);
    expect(healthy.length).toBe(0);
  });
});

describe('retry-logic', () => {
  describe('calculateBackoff', () => {
    it('calculates exponential backoff', () => {
      const config = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 5000, jitter: false };
      expect(calculateBackoff(0, config)).toBe(100);
      expect(calculateBackoff(1, config)).toBe(200);
      expect(calculateBackoff(2, config)).toBe(400);
    });

    it('respects max delay', () => {
      const config = { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 2000, jitter: false };
      expect(calculateBackoff(0, config)).toBe(1000);
      expect(calculateBackoff(1, config)).toBe(2000);
      expect(calculateBackoff(2, config)).toBe(2000);
    });

    it('applies jitter', () => {
      const config = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000, jitter: true };
      const delay = calculateBackoff(1, config);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(2000);
    });
  });

  describe('isRetryableError', () => {
    it('identifies timeout as retryable', () => {
      const response: UpstreamCallResponse = {
        upstream: 'test',
        response: {} as JsonRpcResponse,
        durationMs: 5000,
        success: false,
        error: 'Request timeout',
      };
      expect(isRetryableError(response)).toBe(true);
    });

    it('identifies network errors as retryable', () => {
      const response: UpstreamCallResponse = {
        upstream: 'test',
        response: {} as JsonRpcResponse,
        durationMs: 100,
        success: false,
        error: 'Network error',
      };
      expect(isRetryableError(response)).toBe(true);
    });

    it('identifies non-retryable errors', () => {
      const response: UpstreamCallResponse = {
        upstream: 'test',
        response: { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' } },
        durationMs: 50,
        success: false,
      };
      expect(isRetryableError(response)).toBe(false);
    });
  });
});

describe('health-checker additional tests', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker({
      intervalMs: 60000,
      timeoutMs: 1000,
      unhealthyThreshold: 2,
      healthyThreshold: 2,
    });
  });

  afterEach(() => {
    checker.stop();
  });

  it('reports unknown when check fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    checker.init([{ name: 'up1', url: 'https://api.example.com' }]);
    const status = checker.getUpstreamStatus('up1');
    expect(status?.status).toBe('unknown');
  });

  it('marks upstream unhealthy after consecutive failures', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    checker.init([{ name: 'up1', url: 'https://api.example.com' }]);

    const status = checker.getUpstreamStatus('up1');
    if (status) {
      status.consecutiveFailures = 3;
    }

    expect(checker.isHealthy('up1')).toBe(false);
  });

  it('close stops health checks', () => {
    checker.init([{ name: 'up1', url: 'https://api.example.com' }]);
    checker.close();
    expect(checker.getUpstreamStatus('up1')).toBeDefined();
  });

  it('getUpstreamStatus returns undefined for unknown upstream', () => {
    expect(checker.getUpstreamStatus('nonexistent')).toBeUndefined();
  });
});

describe('health-checker start/stop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports unknown for upstream not in health map', () => {
    const ck = new HealthChecker();
    expect(ck.getUpstreamStatus('nonexistent')).toBeUndefined();
    expect(ck.isHealthy('nonexistent')).toBe(false);
  });

  it('start and stop with multiple upstreams', () => {
    const ck = new HealthChecker({
      intervalMs: 60000,
      timeoutMs: 500,
      unhealthyThreshold: 2,
      healthyThreshold: 1,
    });
    global.fetch = vi.fn().mockRejectedValue(new Error('fail'));
    ck.start([
      { name: 'a', url: 'https://93.184.216.34' },
      { name: 'b', url: 'https://93.184.216.35' },
    ]);
    expect(ck.getStatus().size).toBe(2);
    expect(ck.getUpstreamStatus('a')?.status).toBe('unknown');
    ck.stop();
  });

  it('close stops health checks', () => {
    const ck = new HealthChecker();
    ck.start([{ name: 'test', url: 'https://93.184.216.34' }]);
    ck.close();
    expect(ck.getUpstreamStatus('test')).toBeDefined();
  });
});

describe('health-checker async checkHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkHealth success path', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
    } as Response);

    const ck = new HealthChecker({
      intervalMs: 60000,
      timeoutMs: 5000,
      unhealthyThreshold: 2,
      healthyThreshold: 1,
    });
    ck.start([{ name: 'up', url: 'https://93.184.216.34' }]);

    await new Promise((r) => setTimeout(r, 100));

    ck.stop();
    expect(ck.getUpstreamStatus('up')).toBeDefined();
  });

  it('checkHealth catch block on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network failure'));

    const ck = new HealthChecker({
      intervalMs: 60000,
      timeoutMs: 5000,
      unhealthyThreshold: 1,
      healthyThreshold: 1,
    });
    ck.start([{ name: 'up', url: 'https://93.184.216.34' }]);

    await new Promise((r) => setTimeout(r, 100));

    ck.stop();
    expect(ck.getUpstreamStatus('up')).toBeDefined();
  });

  it('checkHealth failure response path', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    const ck = new HealthChecker({
      intervalMs: 60000,
      timeoutMs: 5000,
      unhealthyThreshold: 1,
      healthyThreshold: 1,
    });
    ck.start([{ name: 'up', url: 'https://93.184.216.34' }]);

    await new Promise((r) => setTimeout(r, 100));

    ck.stop();
    expect(ck.getUpstreamStatus('up')).toBeDefined();
  });

  it('periodic interval runs checkHealth', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network failure'));

    const ck = new HealthChecker({
      intervalMs: 10,
      timeoutMs: 5000,
      unhealthyThreshold: 1,
      healthyThreshold: 1,
    });
    ck.start([{ name: 'up', url: 'https://93.184.216.34' }]);

    await new Promise((r) => setTimeout(r, 50));

    ck.stop();
    expect(ck.getUpstreamStatus('up')).toBeDefined();
  });
});

describe('sendUpstreamRequest', () => {
  const PUBLIC_TEST_IP = 'https://93.184.216.34';

  it('returns error for invalid upstream URL', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    const result = await sendUpstreamRequest(
      { name: 'test', url: 'ftp://bad.example.com' },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error on HTTP failure', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await sendUpstreamRequest(
      { name: 'test', url: PUBLIC_TEST_IP },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('handles fetch abort error', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await sendUpstreamRequest(
      { name: 'test', url: PUBLIC_TEST_IP },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Request timeout');
  });

  it('handles generic fetch error', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await sendUpstreamRequest(
      { name: 'test', url: PUBLIC_TEST_IP },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('handles non-Error fetch rejection', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    global.fetch = vi.fn().mockRejectedValue('string rejection');

    const result = await sendUpstreamRequest(
      { name: 'test', url: PUBLIC_TEST_IP },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });

  it('handles abort with "The operation was aborted" message', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(err);

    const result = await sendUpstreamRequest(
      { name: 'test', url: PUBLIC_TEST_IP },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Request timeout');
  });

  it('handles invalid URL with undefined reason', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    const result = await sendUpstreamRequest(
      { name: 'test', url: 'ftp://127.0.0.1' },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
  });

  it('returns error for fetch that returns error body', async () => {
    const { sendUpstreamRequest } = await import('./upstream-client.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32000, message: 'upstream error' },
      }),
    } as Response);

    const result = await sendUpstreamRequest(
      { name: 'test', url: PUBLIC_TEST_IP },
      { jsonrpc: '2.0', id: 1, method: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.response).toBeDefined();
  });
});

describe('health-checker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  it('initializes health status', () => {
    const upstreams = [
      { name: 'primary', url: 'https://api-1.example.com' },
      { name: 'secondary', url: 'https://api-2.example.com' },
    ];

    checker.init(upstreams);
    const status = checker.getStatus();

    expect(status.size).toBe(2);
    expect(status.get('primary')?.status).toBe('unknown');
    expect(status.get('secondary')?.status).toBe('unknown');
  });

  it('checks if upstream is healthy', () => {
    checker.init([{ name: 'test', url: 'https://api.example.com' }]);
    expect(checker.isHealthy('test')).toBe(false);
  });

  it('returns empty array for healthy upstreams when none are healthy', () => {
    const upstreams = [
      { name: 'a', url: 'https://api-a.example.com' },
      { name: 'b', url: 'https://api-b.example.com' },
    ];

    checker.init(upstreams);
    const healthy = checker.getHealthyUpstreams(upstreams);
    expect(healthy).toHaveLength(0);
  });
});
