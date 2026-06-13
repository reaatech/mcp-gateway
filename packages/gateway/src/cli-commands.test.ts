import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheStatsCommand } from './cli/cache-stats.command.js';
import { healthCommand } from './cli/health.command.js';
import { listTenantsCommand } from './cli/list-tenants.command.js';
import { listUpstreamsCommand } from './cli/list-upstreams.command.js';
import { rateLimitStatusCommand } from './cli/rate-limit-status.command.js';
import { startCommand } from './cli/start.command.js';

vi.mock('@reaatech/mcp-gateway-core', () => ({
  loadGatewayConfig: vi.fn(),
  loadTenantsAsync: vi.fn().mockResolvedValue(
    new Map([
      [
        'test',
        {
          tenantId: 'test',
          displayName: 'Test',
          rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
          cache: { enabled: true, ttlSeconds: 300 },
          allowlist: { mode: 'allow', tools: [] },
          upstreams: [],
          auth: { apiKeys: [], jwt: { issuer: '', audience: '', jwksUri: '' } },
        },
      ],
    ]),
  ),
}));

function okResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response;
}

function mockConsole() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return { log, error, warn };
}

function mockExit() {
  return vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
}

describe('startCommand', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses default port 8080 when not specified', async () => {
    await startCommand([]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('8080'));
  });

  it('parses custom port from --port', async () => {
    await startCommand(['--port', '3000']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('3000'));
  });

  it('prints version and returns for --version flag', async () => {
    await startCommand(['--version']);
    expect(console.log).toHaveBeenCalledWith('mcp-gateway v1.0.0');
  });

  it('prints version and returns for -v flag', async () => {
    await startCommand(['-v']);
    expect(console.log).toHaveBeenCalledWith('mcp-gateway v1.0.0');
  });

  it('shows config path when --config provided', async () => {
    await startCommand(['--config', 'custom.yaml']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('custom.yaml'));
  });
});

describe('healthCommand', () => {
  let exitSpy: ReturnType<typeof mockExit>;
  let consoleSpy: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleSpy = mockConsole();
    exitSpy = mockExit();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses default URL when not specified', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ status: 'ok' }));
    await healthCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('localhost:8080/health'));
  });

  it('uses custom URL when --url provided', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ status: 'ok' }));
    await healthCommand(['--url', 'http://example.com/health']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('example.com/health'));
  });

  it('uses deep health URL when --deep flag', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ status: 'ok' }));
    await healthCommand(['--deep']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('/health/deep'));
  });

  it('prints version and returns for --version flag', async () => {
    await healthCommand(['--version']);
    expect(consoleSpy.log).toHaveBeenCalledWith('mcp-gateway health v1.0.0');
  });

  it('logs success details on healthy response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({ status: 'healthy', uptime: 3600, timestamp: '2026-01-01T00:00:00Z' }),
    );
    await healthCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('✓'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('3600'));
  });

  it('displays upstream and redis info for deep health', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        status: 'healthy',
        upstreams: { healthy: 2, total: 3 },
        redis: { connected: true },
      }),
    );
    await healthCommand(['--deep']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('2/3'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('connected'));
  });

  it('logs error and exits on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}, 503));
    await healthCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 503);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await healthCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 'ECONNREFUSED');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs timeout message on AbortError', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await healthCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('cacheStatsCommand', () => {
  let exitSpy: ReturnType<typeof mockExit>;
  let consoleSpy: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleSpy = mockConsole();
    exitSpy = mockExit();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses default URL when not specified', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}));
    await cacheStatsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('localhost:8080'));
  });

  it('uses custom URL when --url provided', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}));
    await cacheStatsCommand(['--url', 'http://example.com/cache']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('example.com/cache'));
  });

  it('prints version and returns for --version flag', async () => {
    await cacheStatsCommand(['--version']);
    expect(consoleSpy.log).toHaveBeenCalledWith('mcp-gateway cache-stats v1.0.0');
  });

  it('displays formatted cache statistics on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        hitRate: 0.85,
        hits: 850,
        misses: 150,
        currentSize: 102400,
        maxSize: 1048576,
        totalKeys: 500,
        evictions: 10,
      }),
    );
    await cacheStatsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('85.0%'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('850'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('10'));
  });

  it('handles undefined optional fields', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}));
    await cacheStatsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('N/A'));
  });

  it('logs error and exits on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}, 500));
    await cacheStatsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 500);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection timeout'));
    await cacheStatsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 'Connection timeout');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs timeout message on AbortError', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await cacheStatsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('listTenantsCommand', () => {
  let exitSpy: ReturnType<typeof mockExit>;
  let consoleSpy: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleSpy = mockConsole();
    exitSpy = mockExit();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses default URL when not specified', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ tenants: [] }));
    await listTenantsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('localhost:8080'));
  });

  it('uses custom URL when --url provided', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ tenants: [] }));
    await listTenantsCommand(['--url', 'http://example.com/tenants']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('example.com/tenants'));
  });

  it('prints version and returns for --version flag', async () => {
    await listTenantsCommand(['--version']);
    expect(consoleSpy.log).toHaveBeenCalledWith('mcp-gateway list-tenants v1.0.0');
  });

  it('shows message when no tenants configured', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ tenants: [] }));
    await listTenantsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('No tenants configured'));
  });

  it('displays tenant details with upstreams and limits', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        tenants: [
          {
            tenantId: 'tenant-1',
            displayName: 'Tenant One',
            upstreams: 3,
            rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
          },
          { tenantId: 'tenant-2', displayName: 'Tenant Two' },
        ],
      }),
    );
    await listTenantsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('tenant-1'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Tenant One'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('upstreams: 3'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('100/min'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('tenant-2'));
  });

  it('logs error and exits on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}, 400));
    await listTenantsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 400);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'));
    await listTenantsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 'Connection refused');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs timeout message on AbortError', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await listTenantsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('listUpstreamsCommand', () => {
  let exitSpy: ReturnType<typeof mockExit>;
  let consoleSpy: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleSpy = mockConsole();
    exitSpy = mockExit();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses default URL when not specified', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ upstreams: [] }));
    await listUpstreamsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('localhost:8080'));
  });

  it('uses tenant query when --tenant provided', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ upstreams: [] }));
    await listUpstreamsCommand(['--tenant', 'acme-corp']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('tenant_id=acme-corp'));
  });

  it('prints version and returns for --version flag', async () => {
    await listUpstreamsCommand(['--version']);
    expect(consoleSpy.log).toHaveBeenCalledWith('mcp-gateway list-upstreams v1.0.0');
  });

  it('shows message when no upstreams configured', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ upstreams: [] }));
    await listUpstreamsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('No upstreams configured'));
  });

  it('displays upstream details', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        upstreams: [
          {
            name: 'primary',
            url: 'http://mcp1:8080',
            weight: 0.7,
            healthy: true,
            timeoutMs: 30000,
          },
          { name: 'secondary', url: 'http://mcp2:8080', healthy: false },
        ],
      }),
    );
    await listUpstreamsCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('primary'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('healthy'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('UNHEALTHY'));
  });

  it('logs error and exits on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}, 500));
    await listUpstreamsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 500);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
    await listUpstreamsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 'Network error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs timeout message on AbortError', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await listUpstreamsCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('rateLimitStatusCommand', () => {
  let exitSpy: ReturnType<typeof mockExit>;
  let consoleSpy: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleSpy = mockConsole();
    exitSpy = mockExit();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses default URL when not specified', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ statuses: [] }));
    await rateLimitStatusCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('localhost:8080'));
  });

  it('uses tenant query when --tenant provided', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ statuses: [] }));
    await rateLimitStatusCommand(['--tenant', 'acme-corp']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('tenant_id=acme-corp'));
  });

  it('prints version and returns for --version flag', async () => {
    await rateLimitStatusCommand(['--version']);
    expect(consoleSpy.log).toHaveBeenCalledWith('mcp-gateway rate-limit-status v1.0.0');
  });

  it('shows message when no status tracked', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ statuses: [] }));
    await rateLimitStatusCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('No rate limit'));
  });

  it('displays rate limit status details', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        statuses: [
          {
            tenantId: 'acme-corp',
            remainingMinute: 50,
            limitMinute: 100,
            remainingDay: 5000,
            limitDay: 10000,
            resetMinute: 1234567890,
          },
        ],
      }),
    );
    await rateLimitStatusCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('acme-corp'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('50/100'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('5000/10000'));
  });

  it('logs error and exits on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}, 500));
    await rateLimitStatusCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 500);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
    await rateLimitStatusCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 'Network error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs timeout message on AbortError', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await rateLimitStatusCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('validateConfigCommand', () => {
  let exitSpy: ReturnType<typeof mockExit>;
  let consoleSpy: ReturnType<typeof mockConsole>;

  beforeEach(async () => {
    consoleSpy = mockConsole();
    exitSpy = mockExit();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses default config path when not specified', async () => {
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('gateway.yaml'));
  });

  it('uses custom config path when --config provided', async () => {
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand(['--config', 'custom.yaml']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('custom.yaml'));
  });

  it('uses custom tenant dir when --tenant-dir provided', async () => {
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand(['--tenant-dir', 'my-tenants']);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('my-tenants'));
  });

  it('prints version and returns for --version flag', async () => {
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand(['--version']);
    expect(consoleSpy.log).toHaveBeenCalledWith('mcp-gateway validate-config v1.0.0');
  });

  it('logs success on valid config', async () => {
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('✓'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('passed'));
  });

  it('shows warning when no tenants found', async () => {
    const mock = (await import('@reaatech/mcp-gateway-core')).loadTenantsAsync as ReturnType<
      typeof vi.fn
    >;
    mock.mockResolvedValue(new Map());
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand([]);
    expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('⚠'));
  });

  it('shows tenant count when tenants found', async () => {
    const mock = (await import('@reaatech/mcp-gateway-core')).loadTenantsAsync as ReturnType<
      typeof vi.fn
    >;
    mock.mockResolvedValue(
      new Map([
        ['t1', {}],
        ['t2', {}],
      ]),
    );
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand([]);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('2 tenant'));
  });

  it('logs error and exits on validation failure', async () => {
    vi.mocked(await import('@reaatech/mcp-gateway-core')).loadGatewayConfig.mockImplementation(
      () => {
        throw new Error('Config file not found');
      },
    );
    const { validateConfigCommand } = await import('./cli/validate-config.command.js');
    await validateConfigCommand([]);
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.any(String), 'Config file not found');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
