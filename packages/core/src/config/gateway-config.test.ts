/**
 * mcp-gateway — Gateway Config Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearConfigLoaderDependencies,
  getGatewayConfig,
  loadGatewayConfig,
  resetGatewayConfig,
  setConfigLoaderDependencies,
} from './gateway-config.js';

describe('gateway-config', () => {
  beforeEach(() => {
    resetGatewayConfig();
    clearConfigLoaderDependencies();
  });

  afterEach(() => {
    clearConfigLoaderDependencies();
  });

  describe('loadGatewayConfig', () => {
    it('returns default config when no file exists', () => {
      setConfigLoaderDependencies({
        fs: {
          existsSync: () => false,
          readFileSync: () => {
            throw new Error('should not be called');
          },
        },
        cwd: '/test/cwd',
        yaml: {
          load: () => {
            throw new Error('should not be called');
          },
        },
      });

      const config = loadGatewayConfig();

      expect(config.server).toBeDefined();
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.redis).toBeDefined();
      expect(config.cache).toBeDefined();
      expect(config.rateLimits).toBeDefined();
      expect(config.audit).toBeDefined();
      expect(config.observability).toBeDefined();
    });

    it('returns default config when yaml module unavailable', () => {
      setConfigLoaderDependencies({
        fs: {
          existsSync: (path: string) => path === '/config/gateway.yaml',
          readFileSync: () => 'some content',
        },
      });

      const config = loadGatewayConfig();

      expect(config.server).toBeDefined();
    });

    it('parses valid yaml config', () => {
      const mockConfig = {
        server: { host: '127.0.0.1', port: 9000 },
        redis: { host: 'redis.test', port: 6380 },
        rateLimits: {
          defaultRequestsPerMinute: 200,
          defaultRequestsPerDay: 20000,
          store: 'memory' as const,
        },
        cache: { enabled: true, store: 'memory' as const, defaultTtlSeconds: 300 },
        audit: {
          enabled: false,
          storage: 'file' as const,
          filePath: '/tmp/audit',
          retentionDays: 30,
        },
        observability: { otelEndpoint: '', logLevel: 'debug' as const, serviceName: 'test' },
      };
      const mockYaml = {
        load: () => mockConfig,
      };

      setConfigLoaderDependencies({
        fs: {
          existsSync: () => true,
          readFileSync: () => 'valid yaml content',
        },
        yaml: mockYaml,
      });

      const config = loadGatewayConfig();

      expect(config.server.host).toBe('127.0.0.1');
      expect(config.server.port).toBe(9000);
    });

    it('falls back to defaults on parse error', () => {
      const mockYaml = {
        load: () => {
          throw new Error('Parse error');
        },
      };

      setConfigLoaderDependencies({
        cwd: '/test/cwd',
        fs: {
          existsSync: (path: string) => path === '/test/cwd/gateway.yaml',
          readFileSync: () => 'invalid yaml',
        },
        yaml: mockYaml,
      });

      const config = loadGatewayConfig();

      expect(config.server).toBeDefined();
      expect(config.server.host).toBe('0.0.0.0');
    });

    it('falls back to defaults when TLS enabled but cert/key missing', () => {
      const mockConfig = {
        server: { host: '0.0.0.0', port: 8080, tls: { enabled: true } },
        rateLimits: { defaultRequestsPerMinute: 100, defaultRequestsPerDay: 10000 },
        cache: { enabled: true, defaultTtlSeconds: 300 },
        audit: { enabled: true, storage: 'file', filePath: '/tmp/audit', retentionDays: 90 },
        observability: { logLevel: 'info', serviceName: 'test' },
      };
      const mockYaml = { load: () => mockConfig };

      setConfigLoaderDependencies({
        cwd: '/test/cwd',
        fs: {
          existsSync: (path: string) => path === '/test/cwd/gateway.yaml',
          readFileSync: () => 'tls config content',
        },
        yaml: mockYaml,
      });

      const config = loadGatewayConfig();

      expect(config.server).toBeDefined();
      expect(config.server.host).toBe('0.0.0.0');
    });

    it('falls back to defaults when caught error is not an Error instance', () => {
      const mockYaml = {
        load: () => {
          throw 'string error';
        },
      };

      setConfigLoaderDependencies({
        cwd: '/test/cwd',
        fs: {
          existsSync: (path: string) => path === '/test/cwd/gateway.yaml',
          readFileSync: () => 'invalid yaml',
        },
        yaml: mockYaml,
      });

      const config = loadGatewayConfig();

      expect(config.server).toBeDefined();
      expect(config.server.host).toBe('0.0.0.0');
    });
  });

  describe('getGatewayConfig', () => {
    it('caches config on first call', () => {
      setConfigLoaderDependencies({
        fs: {
          existsSync: () => false,
          readFileSync: () => {
            throw new Error('should not be called');
          },
        },
      });

      const config1 = getGatewayConfig();
      const config2 = getGatewayConfig();

      expect(config1).toBe(config2);
    });

    it('returns cached value', () => {
      setConfigLoaderDependencies({
        fs: {
          existsSync: () => false,
          readFileSync: () => {
            throw new Error('should not be called');
          },
        },
      });

      const config1 = getGatewayConfig();
      resetGatewayConfig();

      const config2 = getGatewayConfig();
      expect(config1).not.toBe(config2);
    });
  });

  describe('createDefaultConfig', () => {
    it('uses env overrides when provided', () => {
      setConfigLoaderDependencies({
        envOverrides: {
          server: { host: '0.0.0.0', port: 9999 },
        },
        fs: {
          existsSync: () => false,
          readFileSync: () => {
            throw new Error('should not be called');
          },
        },
      });

      const config = loadGatewayConfig();

      expect(config.server.port).toBe(9999);
    });

    it('uses default fs when deps.fs not provided', () => {
      setConfigLoaderDependencies({
        cwd: '/nonexistent',
      });

      const config = loadGatewayConfig();

      expect(config.server.host).toBe('0.0.0.0');
    });

    it('uses empty deps when testDependencies not set', () => {
      resetGatewayConfig();

      const config = loadGatewayConfig();

      expect(config.server.host).toBe('0.0.0.0');
    });
  });
});
