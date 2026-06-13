import { existsSync, readdirSync, readFileSync, watch } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const watchCallbacks = vi.hoisted(() => [] as Array<(eventType: string, filename: string) => void>);

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  watch: vi.fn(
    (_dir: string, _opts: unknown, cb: (eventType: string, filename: string) => void) => {
      watchCallbacks.push(cb);
      return { close: vi.fn() };
    },
  ),
}));

describe('tenant-loader load behaviors', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    watchCallbacks.length = 0;

    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTenants', () => {
    it('returns empty map when tenant config directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadTenants } = await import('./tenant-loader.js');
      const result = loadTenants();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('loads valid yaml files from directory', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['tenant-a.yaml'] as unknown as never);
      vi.mocked(readFileSync).mockReturnValue(`tenantId: "tenant-a"
displayName: "Tenant A"
rateLimits:
  requestsPerMinute: 100
  requestsPerDay: 1000
  burstSize: 10
cache:
  enabled: true
  ttlSeconds: 300
allowlist:
  mode: "allow"
  tools:
    - "*"
upstreams:
  - name: "primary"
    url: "https://93.184.216.34"
    weight: 1
`);

      const { loadTenants } = await import('./tenant-loader.js');
      const result = loadTenants();

      expect(result.size).toBe(1);
      expect(result.get('tenant-a')?.displayName).toBe('Tenant A');
    });

    it('skips files that fail SSRF validation', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['bad-tenant.yaml'] as unknown as never);
      vi.mocked(readFileSync).mockReturnValue(`tenantId: "bad-tenant"
displayName: "Bad Tenant"
rateLimits:
  requestsPerMinute: 100
  requestsPerDay: 1000
  burstSize: 10
cache:
  enabled: true
  ttlSeconds: 300
allowlist:
  mode: "allow"
  tools:
    - "*"
upstreams:
  - name: "local"
    url: "http://localhost:8080"
    weight: 1
`);

      const { loadTenants } = await import('./tenant-loader.js');
      const result = loadTenants();

      expect(result.size).toBe(0);
    });

    it('handles readdir errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { loadTenants } = await import('./tenant-loader.js');
      const result = loadTenants();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('handles yaml parse errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['bad.yaml'] as unknown as never);
      vi.mocked(readFileSync).mockReturnValue('invalid: yaml: [content\n');

      const { loadTenants } = await import('./tenant-loader.js');
      const result = loadTenants();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('loadTenantsAsync', () => {
    it('returns empty map when directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadTenantsAsync } = await import('./tenant-loader.js');
      const result = await loadTenantsAsync();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('loads valid files asynchronously', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['async-tenant.yaml'] as unknown as never);
      vi.mocked(readFileSync).mockReturnValue(`tenantId: "async-tenant"
displayName: "Async Tenant"
rateLimits:
  requestsPerMinute: 100
  requestsPerDay: 1000
  burstSize: 10
cache:
  enabled: true
  ttlSeconds: 300
allowlist:
  mode: "allow"
  tools:
    - "*"
upstreams:
  - name: "primary"
    url: "https://93.184.216.34"
    weight: 1
`);

      const { loadTenantsAsync } = await import('./tenant-loader.js');
      const result = await loadTenantsAsync();

      expect(result.size).toBe(1);
    });

    it('handles readdir errors in async path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('Async permission denied');
      });

      const { loadTenantsAsync } = await import('./tenant-loader.js');
      const result = await loadTenantsAsync();

      expect(result.size).toBe(0);
    });
  });

  describe('startWatching / stopWatching', () => {
    it('startWatching returns early if already watching', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(watch).mockReturnValue({ close: vi.fn() } as unknown as ReturnType<typeof watch>);

      const { startWatching } = await import('./tenant-loader.js');
      startWatching();
      startWatching();

      expect(watch).toHaveBeenCalledTimes(1);
    });

    it('startWatching returns early if dir does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { startWatching } = await import('./tenant-loader.js');
      startWatching();

      expect(watch).not.toHaveBeenCalled();
    });

    it('stopWatching closes active watcher', async () => {
      const closeFn = vi.fn();
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(watch).mockReturnValue({ close: closeFn } as unknown as ReturnType<typeof watch>);

      const { startWatching, stopWatching } = await import('./tenant-loader.js');
      startWatching();
      stopWatching();

      expect(closeFn).toHaveBeenCalled();
    });
  });

  describe('watcher callback', () => {
    it('ignores non-yaml files in watcher', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const { startWatching, listTenants } = await import('./tenant-loader.js');
      startWatching();

      watchCallbacks[0]?.('change', 'readme.txt');

      expect(listTenants()).toHaveLength(0);
    });

    it('ignores events with no filename', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const { startWatching, listTenants } = await import('./tenant-loader.js');
      startWatching();

      watchCallbacks[0]?.('change', '');

      expect(listTenants()).toHaveLength(0);
    });
  });

  describe('reloadTenantFile', () => {
    it('handles SSRF validation failure during reload', async () => {
      vi.mocked(readFileSync).mockReturnValue(`tenantId: "ssrf-tenant"
displayName: "SSRF Tenant"
rateLimits:
  requestsPerMinute: 100
  requestsPerDay: 1000
  burstSize: 10
cache:
  enabled: true
  ttlSeconds: 300
allowlist:
  mode: "allow"
  tools:
    - "*"
upstreams:
  - name: "local"
    url: "http://127.0.0.1:8080"
    weight: 1
`);

      const { reloadTenantFile, getTenant } = await import('./tenant-loader.js');
      await reloadTenantFile('/test/ssrf-tenant.yaml');

      expect(getTenant('ssrf-tenant')).toBeUndefined();
    });

    it('handles parse errors during reload', async () => {
      vi.mocked(readFileSync).mockReturnValue('invalid: yaml: [content');

      const { reloadTenantFile, getTenant } = await import('./tenant-loader.js');
      await reloadTenantFile('/test/bad-tenant.yaml');

      expect(getTenant('whatever')).toBeUndefined();
    });
  });
});
