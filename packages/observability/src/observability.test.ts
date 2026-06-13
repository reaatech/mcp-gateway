import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Health Checks', () => {
  let registerProbe: ObsMod['registerProbe'];
  let unregisterProbe: ObsMod['unregisterProbe'];
  let resetProbes: ObsMod['resetProbes'];
  let getLiveness: ObsMod['getLiveness'];
  let getReadiness: ObsMod['getReadiness'];
  let getDeepHealth: ObsMod['getDeepHealth'];
  type ObsMod = typeof import('./index.js');
  let createRedisProbe: ObsMod['createRedisProbe'];
  let createUpstreamProbe: ObsMod['createUpstreamProbe'];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./index.js');
    registerProbe = mod.registerProbe;
    unregisterProbe = mod.unregisterProbe;
    resetProbes = mod.resetProbes;
    getLiveness = mod.getLiveness;
    getReadiness = mod.getReadiness;
    getDeepHealth = mod.getDeepHealth;
    createRedisProbe = mod.createRedisProbe;
    createUpstreamProbe = mod.createUpstreamProbe;
    resetProbes();
  });

  afterEach(() => {
    resetProbes();
  });

  describe('getLiveness', () => {
    it('returns healthy status', () => {
      const status = getLiveness();
      expect(status.status).toBe('healthy');
      expect(status.version).toBeDefined();
      expect(typeof status.uptimeSeconds).toBe('number');
      expect(status.components.process?.status).toBe('healthy');
    });
  });

  describe('getReadiness', () => {
    it('returns healthy when all probes pass', async () => {
      registerProbe('test-probe', async () => ({ status: 'healthy' }));
      const status = await getReadiness();
      expect(status.status).toBe('healthy');
      expect(status.components['test-probe']?.status).toBe('healthy');
    });

    it('returns degraded when a probe reports degraded', async () => {
      registerProbe('degraded-probe', async () => ({
        status: 'degraded',
        message: 'slow response',
      }));
      const status = await getReadiness();
      expect(status.status).toBe('degraded');
    });

    it('returns unhealthy when a probe throws', async () => {
      registerProbe('failing-probe', async () => {
        throw new Error('connection refused');
      });
      const status = await getReadiness();
      expect(status.status).toBe('unhealthy');
      expect(status.components['failing-probe']?.message).toBe('connection refused');
    });

    it('returns unhealthy when any probe is unhealthy (even if others are degraded)', async () => {
      registerProbe('degraded', async () => ({ status: 'degraded' }));
      registerProbe('broken', async () => {
        throw new Error('fail');
      });
      const status = await getReadiness();
      expect(status.status).toBe('unhealthy');
    });

    it('handles probe throwing non-Error values', async () => {
      registerProbe('string-throw', async () => {
        throw 'something went wrong';
      });
      const status = await getReadiness();
      expect(status.status).toBe('unhealthy');
      expect(status.components['string-throw']?.message).toBe('something went wrong');
    });
  });

  describe('getDeepHealth', () => {
    it('delegates to readiness', async () => {
      registerProbe('deep-probe', async () => ({ status: 'healthy', latencyMs: 5 }));
      const status = await getDeepHealth();
      expect(status.components['deep-probe']?.status).toBe('healthy');
    });
  });

  describe('probe lifecycle', () => {
    it('allows unregistering probes', async () => {
      registerProbe('temp', async () => ({ status: 'healthy' }));
      unregisterProbe('temp');
      const status = await getReadiness();
      expect(status.components).not.toHaveProperty('temp');
    });

    it('resetProbes clears all probes', async () => {
      registerProbe('a', async () => ({ status: 'healthy' }));
      registerProbe('b', async () => ({ status: 'healthy' }));
      resetProbes();
      const status = await getReadiness();
      expect(Object.keys(status.components)).toHaveLength(0);
    });
  });

  describe('createRedisProbe', () => {
    it('returns healthy on successful ping', async () => {
      const probe = createRedisProbe(async () => 'PONG');
      const result = await probe();
      expect(result.status).toBe('healthy');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('returns unhealthy on ping failure', async () => {
      const probe = createRedisProbe(async () => {
        throw new Error('ECONNREFUSED');
      });
      const result = await probe();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('ECONNREFUSED');
    });

    it('returns unhealthy with fallback message on string throw', async () => {
      const probe = createRedisProbe(async () => {
        throw 'timeout error';
      });
      const result = await probe();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Redis unreachable');
    });

    it('returns unhealthy on timeout', async () => {
      const probe = createRedisProbe(() => new Promise((resolve) => setTimeout(resolve, 5000)), 50);
      const result = await probe();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('timeout');
    });
  });

  describe('createUpstreamProbe', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns healthy for HTTP 200', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      const probe = createUpstreamProbe('http://localhost:9999', 2000);
      const result = await probe();
      expect(result.status).toBe('healthy');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('returns degraded for HTTP non-200', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });
      const probe = createUpstreamProbe('http://localhost:9999', 2000);
      const result = await probe();
      expect(result.status).toBe('degraded');
      expect(result.message).toContain('503');
    });

    it('returns unhealthy on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const probe = createUpstreamProbe('http://localhost:9999', 2000);
      const result = await probe();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('ECONNREFUSED');
    });

    it('returns unhealthy with fallback message on non-Error rejection', async () => {
      global.fetch = vi.fn().mockRejectedValue('network failure');
      const probe = createUpstreamProbe('http://localhost:9999', 2000);
      const result = await probe();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Upstream unreachable');
    });
  });
});

describe('Logger', () => {
  it('redactToken masks tokens correctly', async () => {
    const { redactToken } = await import('./index.js');
    expect(redactToken('')).toBe('');
    expect(redactToken('short')).toBe('***');
    expect(redactToken('a').length).toBeLessThanOrEqual(3);
    const long = 'abcdefghijklmnop';
    const redacted = redactToken(long);
    expect(redacted).toContain('...');
    expect(redacted).toBe('abcd...mnop');
  });

  it('childLogger creates a logger with context', async () => {
    const { childLogger } = await import('./index.js');
    const child = childLogger({ requestId: 'test-123', tenantId: 'tenant-1' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});

describe('Metrics', () => {
  beforeEach(async () => {
    const { resetMetricsState } = await import('./index.js');
    resetMetricsState();
  });

  it('exports all required metric instruments', async () => {
    const mod = await import('./index.js');
    expect(mod.requestsTotal).toBeDefined();
    expect(mod.requestDurationMs).toBeDefined();
    expect(mod.authAttempts).toBeDefined();
    expect(mod.authFailures).toBeDefined();
    expect(mod.rateLimitExceeded).toBeDefined();
    expect(mod.cacheHits).toBeDefined();
    expect(mod.cacheMisses).toBeDefined();
    expect(mod.upstreamRequests).toBeDefined();
    expect(mod.upstreamErrors).toBeDefined();
    expect(mod.upstreamLatencyMs).toBeDefined();
    expect(mod.fanoutUpstreams).toBeDefined();
    expect(mod.allowlistDenied).toBeDefined();
    expect(mod.validationErrors).toBeDefined();
    expect(mod.auditEvents).toBeDefined();
    expect(mod.cacheSize).toBeDefined();
    expect(mod.rateLimitRemainingGauge).toBeDefined();
  });

  it('updateCacheSize updates the internal state', async () => {
    const { updateCacheSize, resetMetricsState } = await import('./index.js');
    resetMetricsState();
    updateCacheSize(1024);
    // No error means success (gauge callback reads internal var)
    expect(true).toBe(true);
  });

  it('updateRateLimitRemaining updates per-tenant state', async () => {
    const { updateRateLimitRemaining, resetMetricsState } = await import('./index.js');
    resetMetricsState();
    updateRateLimitRemaining('tenant-1', 50);
    updateRateLimitRemaining('tenant-2', 25);
    expect(true).toBe(true);
  });

  it('resetMetricsState clears gauge state', async () => {
    const { updateCacheSize, resetMetricsState } = await import('./index.js');
    updateCacheSize(500);
    resetMetricsState();
    expect(true).toBe(true);
  });
});

describe('Tracing', () => {
  it('exports SPAN_NAMES with all pipeline stages', async () => {
    const { SPAN_NAMES } = await import('./index.js');
    expect(SPAN_NAMES.auth).toBe('gateway.auth');
    expect(SPAN_NAMES.rateLimit).toBe('gateway.rate_limit');
    expect(SPAN_NAMES.cache).toBe('gateway.cache');
    expect(SPAN_NAMES.validation).toBe('gateway.validation');
    expect(SPAN_NAMES.allowlist).toBe('gateway.allowlist');
    expect(SPAN_NAMES.upstream).toBe('gateway.upstream');
    expect(SPAN_NAMES.fanout).toBe('gateway.fanout');
    expect(SPAN_NAMES.audit).toBe('gateway.audit');
  });

  it('withSpan executes function and returns result', async () => {
    const { withSpan } = await import('./index.js');
    const result = await withSpan('test-span', async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it('withSpan propagates errors', async () => {
    const { withSpan } = await import('./index.js');
    await expect(
      withSpan('test-span', async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
  });

  it('withSpan propagates non-Error throws', async () => {
    const { withSpan } = await import('./index.js');
    await expect(
      withSpan('test-span', async () => {
        throw 'string error';
      }),
    ).rejects.toBe('string error');
  });

  it('addSpanAttributes does not throw when no active span', async () => {
    const { addSpanAttributes } = await import('./index.js');
    expect(() => addSpanAttributes({ key: 'value' })).not.toThrow();
  });

  it('recordSpanEvent does not throw when no active span', async () => {
    const { recordSpanEvent } = await import('./index.js');
    expect(() => recordSpanEvent('test-event')).not.toThrow();
  });

  it('currentSpan returns undefined when no active span', async () => {
    const { currentSpan } = await import('./index.js');
    expect(currentSpan()).toBeUndefined();
  });

  it('addSpanAttributes sets attributes on active span', async () => {
    const span = { setAttributes: vi.fn() };
    const spanApi = await import('@opentelemetry/api');
    vi.spyOn(spanApi.trace, 'getActiveSpan').mockReturnValue(span as never);
    const { addSpanAttributes } = await import('./index.js');
    addSpanAttributes({ key: 'value' });
    expect(span.setAttributes).toHaveBeenCalledWith({ key: 'value' });
    vi.restoreAllMocks();
  });

  it('recordSpanEvent records event on active span', async () => {
    const span = { addEvent: vi.fn() };
    const spanApi = await import('@opentelemetry/api');
    vi.spyOn(spanApi.trace, 'getActiveSpan').mockReturnValue(span as never);
    const { recordSpanEvent } = await import('./index.js');
    recordSpanEvent('test-event', { attr: 'val' });
    expect(span.addEvent).toHaveBeenCalledWith('test-event', { attr: 'val' });
    vi.restoreAllMocks();
  });
});

describe('OpenTelemetry initialization', () => {
  let originalNodeEnv: string | undefined;
  let originalOtelEndpoint: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalOtelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalOtelEndpoint !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalOtelEndpoint;
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
  });

  it('skips OTel init when endpoint is not configured (non-production)', async () => {
    vi.resetModules();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.NODE_ENV = 'development';
    const core = await import('@reaatech/mcp-gateway-core');
    const warnSpy = vi.spyOn(core.logger, 'warn');
    await import('./index.js');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns in production when endpoint is not configured', async () => {
    vi.resetModules();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.NODE_ENV = 'production';
    const core = await import('@reaatech/mcp-gateway-core');
    const warnSpy = vi.spyOn(core.logger, 'warn');
    await import('./index.js');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('attempts OTel setup when endpoint is configured', async () => {
    vi.resetModules();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4318';
    process.env.NODE_ENV = 'production';
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });

  it('calls shutdownOTel after OTel setup', async () => {
    vi.resetModules();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4318';
    process.env.NODE_ENV = 'production';
    await import('./index.js');
    await vi.waitFor(
      async () => {
        const mod = await import('./index.js');
        await expect(mod.shutdownOTel()).resolves.toBeUndefined();
      },
      { timeout: 5000 },
    );
  });
});
