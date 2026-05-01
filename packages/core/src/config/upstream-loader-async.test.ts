import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns', () => ({
  lookup: vi.fn(),
}));

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
});
