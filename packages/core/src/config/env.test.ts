import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('env exports', () => {
    it('should export env singleton with defaults', async () => {
      const { env } = await import('./env.js');
      expect(env).toBeDefined();
      expect(env.PORT).toBeGreaterThanOrEqual(1);
      expect(env.NODE_ENV).toMatch(/^(development|test|production)$/);
    });

    it('should export isProduction as false in test', async () => {
      const { isProduction } = await import('./env.js');
      expect(isProduction).toBe(false);
    });

    it('should export isDevelopment as false in test', async () => {
      const { isDevelopment } = await import('./env.js');
      expect(isDevelopment).toBe(false);
    });

    it('should export isTest as true in test', async () => {
      const { isTest } = await import('./env.js');
      expect(isTest).toBe(true);
    });

    it('should parse string booleans for TLS_ENABLED', async () => {
      process.env.TLS_ENABLED = 'true';
      process.env.NODE_ENV = 'test';
      vi.resetModules();
      const { env } = await import('./env.js');
      expect(env.TLS_ENABLED).toBe(true);
    });

    it('should parse "1" string as true for CACHE_ENABLED', async () => {
      process.env.CACHE_ENABLED = '1';
      process.env.NODE_ENV = 'test';
      vi.resetModules();
      const { env } = await import('./env.js');
      expect(env.CACHE_ENABLED).toBe(true);
    });
  });

  describe('logConfigSummary', () => {
    it('should log configuration summary', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { logConfigSummary } = await import('./env.js');

      logConfigSummary();

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls.some((call) => String(call[0]).includes('Configuration:'))).toBe(true);
      spy.mockRestore();
    });

    it('should log OTel endpoint when configured', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4318';
      vi.resetModules();
      const { logConfigSummary } = await import('./env.js');

      logConfigSummary();

      expect(spy.mock.calls.some((call) => String(call[0]).includes('OTel Endpoint'))).toBe(true);
      spy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should exit process on invalid env', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as unknown as typeof process.exit);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      process.env.NODE_ENV = 'test';
      process.env.PORT = 'abc';
      vi.resetModules();

      await expect(() => import('./env.js')).rejects.toThrow('process.exit');
      expect(errorSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('production warnings', () => {
    it('should warn when REDIS_HOST is localhost in production', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_HOST;
      vi.resetModules();

      await import('./env.js');

      expect(warnSpy).toHaveBeenCalled();
      expect(
        warnSpy.mock.calls.some((call) => String(call[0]).includes('localhost in production')),
      ).toBe(true);
      warnSpy.mockRestore();
    });
  });
});

describe('Constants', () => {
  it('should export SERVICE_NAME', async () => {
    const { SERVICE_NAME } = await import('../../src/config/constants.js');
    expect(SERVICE_NAME).toBe('mcp-gateway');
  });

  it('should export SERVICE_VERSION', async () => {
    const { SERVICE_VERSION } = await import('../../src/config/constants.js');
    expect(SERVICE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should export MCP_PROTOCOL_VERSION', async () => {
    const { MCP_PROTOCOL_VERSION } = await import('../../src/config/constants.js');
    expect(MCP_PROTOCOL_VERSION).toBe('2024-11-05');
  });

  it('should export JSON_RPC_VERSION', async () => {
    const { JSON_RPC_VERSION } = await import('../../src/config/constants.js');
    expect(JSON_RPC_VERSION).toBe('2.0');
  });
});
