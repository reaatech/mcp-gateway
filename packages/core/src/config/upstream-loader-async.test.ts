import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantConfig } from '../types/schemas.js';

vi.mock('node:dns', () => ({
  lookup: vi.fn(),
}));

const INVALID_URL_TENANT: TenantConfig = {
  tenantId: 'invalid-url-tenant',
  displayName: 'Invalid URL Tenant',
  auth: {
    apiKeys: [{ keyHash: 'sha256:bad', name: 'bad-key', scopes: ['tools:*'] }],
  },
  rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000, burstSize: 10 },
  cache: { enabled: true, ttlSeconds: 300 },
  allowlist: { mode: 'allow', tools: ['*'] },
  upstreams: [{ name: 'bad', url: 'ftp://bad.example.com', weight: 1.0 }],
};

describe('upstream-loader async SSRF validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects hostnames that resolve to private IPv4 addresses', async () => {
    const dns = await import('node:dns');
    vi.mocked(dns.lookup).mockImplementation(((
      _hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const cb = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
        | ((err: Error | null, address: string, family: number) => void)
        | undefined;
      cb?.(null, '10.0.0.7', 4);
      return {} as unknown as ReturnType<typeof dns.lookup>;
    }) as unknown as typeof dns.lookup);

    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('https://internal.example.test');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('resolves to private IP 10.0.0.7');
  });

  it('accepts hostnames that resolve to public IP addresses', async () => {
    const dns = await import('node:dns');
    vi.mocked(dns.lookup).mockImplementation(((
      _hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const cb = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
        | ((err: Error | null, address: string, family: number) => void)
        | undefined;
      cb?.(null, '93.184.216.34', 4);
      return {} as unknown as ReturnType<typeof dns.lookup>;
    }) as unknown as typeof dns.lookup);

    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('https://public.example.test');

    expect(result.valid).toBe(true);
  });

  it('rejects invalid protocol in async validation', async () => {
    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('ftp://example.com');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid protocol');
  });

  it('rejects private IP directly in async validation', async () => {
    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('http://127.0.0.1:8080');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('SSRF protection');
  });

  it('handles invalid URL in async validation', async () => {
    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('not-a-url');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid URL');
  });

  it('includes reason in validateAllUpstreams results for invalid URLs', async () => {
    const { setTenant, clearTenants } = await import('../../src/config/tenant-loader.js');
    const { validateAllUpstreams } = await import('../../src/config/upstream-loader.js');

    clearTenants();
    setTenant(INVALID_URL_TENANT);
    const results = validateAllUpstreams();

    expect(results).toHaveLength(1);
    expect(results[0]?.valid).toBe(false);
    expect(results[0]?.reason).toBeDefined();
    expect(results[0]?.tenantId).toBe('invalid-url-tenant');
  });

  it('handles DNS resolution failure gracefully', async () => {
    const dns = await import('node:dns');
    vi.mocked(dns.lookup).mockImplementation(((
      _hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const cb = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
        | ((err: Error | null, address: string, family: number) => void)
        | undefined;
      cb?.(new Error('DNS not found'), '', 0);
      return {} as unknown as ReturnType<typeof dns.lookup>;
    }) as unknown as typeof dns.lookup);

    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('https://nonexistent.example.test');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('DNS resolution failed');
  });

  it('rejects hostnames resolving to private IPv6', async () => {
    const dns = await import('node:dns');
    vi.mocked(dns.lookup).mockImplementation(((
      _hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const cb = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
        | ((err: Error | null, address: string, family: number) => void)
        | undefined;
      if ((optionsOrCallback as { family?: number })?.family === 4) {
        cb?.(new Error('No A record'), '', 0);
        return {} as unknown as ReturnType<typeof dns.lookup>;
      }
      cb?.(null, 'fc00::1', 6);
      return {} as unknown as ReturnType<typeof dns.lookup>;
    }) as unknown as typeof dns.lookup);

    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('https://internal-v6.example.test');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('private IP');
  });

  it('accepts hostnames resolving via IPv6 when IPv4 fails', async () => {
    const dns = await import('node:dns');
    vi.mocked(dns.lookup).mockImplementation(((
      _hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const cb = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
        | ((err: Error | null, address: string, family: number) => void)
        | undefined;
      if ((optionsOrCallback as { family?: number })?.family === 4) {
        cb?.(new Error('No A record'), '', 0);
        return {} as unknown as ReturnType<typeof dns.lookup>;
      }
      cb?.(null, '2001:db8::1', 6);
      return {} as unknown as ReturnType<typeof dns.lookup>;
    }) as unknown as typeof dns.lookup);

    const { validateUpstreamUrlAsync } = await import('../../src/config/upstream-loader.js');
    const result = await validateUpstreamUrlAsync('https://ipv6-only.example.test');

    expect(result.valid).toBe(true);
  });
});
