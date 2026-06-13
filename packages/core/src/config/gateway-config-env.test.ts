import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('gateway-config env-dependent paths', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('includes TLS cert/key in default config when env vars set', async () => {
    process.env.TLS_CERT_PATH = '/etc/certs/cert.pem';
    process.env.TLS_KEY_PATH = '/etc/certs/key.pem';
    process.env.NODE_ENV = 'test';

    vi.resetModules();
    const {
      loadGatewayConfig,
      setConfigLoaderDependencies,
      clearConfigLoaderDependencies,
      resetGatewayConfig,
    } = await import('./gateway-config.js');

    resetGatewayConfig();
    setConfigLoaderDependencies({
      fs: { existsSync: () => false, readFileSync: () => '' },
    });

    const config = loadGatewayConfig();

    expect(config.server.tls?.certPath).toBe('/etc/certs/cert.pem');
    expect(config.server.tls?.keyPath).toBe('/etc/certs/key.pem');

    clearConfigLoaderDependencies();
  });

  it('includes REDIS_PASSWORD in default config when env var set', async () => {
    process.env.REDIS_PASSWORD = 'supersecret';
    process.env.NODE_ENV = 'test';

    vi.resetModules();
    const {
      loadGatewayConfig,
      setConfigLoaderDependencies,
      clearConfigLoaderDependencies,
      resetGatewayConfig,
    } = await import('./gateway-config.js');

    resetGatewayConfig();
    setConfigLoaderDependencies({
      fs: { existsSync: () => false, readFileSync: () => '' },
    });

    const config = loadGatewayConfig();

    expect(config.redis?.passwordEnv).toBe('REDIS_PASSWORD');

    clearConfigLoaderDependencies();
  });
});
