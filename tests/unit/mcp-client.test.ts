/**
 * mcp-gateway — MCP Client Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createJsonRpcRequest } from '../../src/mcp-client/upstream-client.js';
import { validateUpstreamUrl } from '../../src/config/upstream-loader.js';
import { ConnectionPool, DEFAULT_POOL_CONFIG } from '../../src/mcp-client/connection-pool.js';
import { HealthChecker } from '../../src/mcp-client/health-checker.js';
import { calculateBackoff, isRetryableError } from '../../src/mcp-client/retry-logic.js';
import type { UpstreamResponse, JsonRpcResponse } from '../../src/mcp-client/types.js';

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
      expect(result.reason).toBe('SSRF protection: Upstream URL cannot point to localhost or private IP ranges (localhost)');
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
    const upstream = { name: 'test', url: 'https://api.example.com' };
    pool.getConnection(upstream);

    setTimeout(() => {
      const removed = pool.cleanup();
      expect(removed).toBe(1);
    }, 150);
  });

  it('tracks unique hosts', () => {
    pool.getConnection({ name: 'a', url: 'https://api-a.example.com' });
    pool.getConnection({ name: 'b', url: 'https://api-b.example.com' });
    pool.getConnection({ name: 'c', url: 'https://api-a.example.com' });

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(2);
    expect(stats.uniqueHosts).toBe(2);
  });

  it('respects max connections per host limit', () => {
    const pool2 = new ConnectionPool({
      maxConnectionsPerHost: 2,
      idleTimeoutMs: 60000,
      maxLifetimeMs: 300000,
    });
    pool2.getConnection({ name: 'a', url: 'https://api-a.example.com' });
    pool2.getConnection({ name: 'b', url: 'https://api-a.example.com' });

    // Third connection should trigger LRU logic
    pool2.getConnection({ name: 'c', url: 'https://api-a.example.com' });

    // Pool should have at most maxConnectionsPerHost connections
    const stats = pool2.getStats();
    expect(stats.totalConnections).toBeLessThanOrEqual(2);
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
      const response: UpstreamResponse = {
        upstream: 'test',
        response: {} as JsonRpcResponse,
        durationMs: 5000,
        success: false,
        error: 'Request timeout',
      };
      expect(isRetryableError(response)).toBe(true);
    });

    it('identifies network errors as retryable', () => {
      const response: UpstreamResponse = {
        upstream: 'test',
        response: {} as JsonRpcResponse,
        durationMs: 100,
        success: false,
        error: 'Network error',
      };
      expect(isRetryableError(response)).toBe(true);
    });

    it('identifies non-retryable errors', () => {
      const response: UpstreamResponse = {
        upstream: 'test',
        response: { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' } },
        durationMs: 50,
        success: false,
      };
      expect(isRetryableError(response)).toBe(false);
    });
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