import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:module', () => ({
  createRequire: () => (id: string) => {
    if (id === 'js-yaml') {
      throw new Error('Module not found');
    }
    throw new Error(`Unexpected require: ${id}`);
  },
}));

describe('gateway-config yaml require failure', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('falls back to defaults when js-yaml require fails', async () => {
    const {
      loadGatewayConfig,
      setConfigLoaderDependencies,
      clearConfigLoaderDependencies,
      resetGatewayConfig,
    } = await import('./gateway-config.js');

    resetGatewayConfig();
    setConfigLoaderDependencies({
      cwd: '/test/cwd',
      fs: {
        existsSync: (path: string) => path === '/test/cwd/gateway.yaml',
        readFileSync: () => 'server:\n  host: "127.0.0.1"',
      },
    });

    const config = loadGatewayConfig();

    expect(config.server).toBeDefined();
    expect(config.server.host).toBe('0.0.0.0');

    clearConfigLoaderDependencies();
  });
});
