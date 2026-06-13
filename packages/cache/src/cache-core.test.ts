import type { GatewayRequestContext } from '@reaatech/mcp-gateway-core';
import { describe, expect, it, vi } from 'vitest';
import {
  type CacheController,
  cacheLookup,
  cacheStore,
  createRedisCacheController,
} from './cache-core.js';
import type { CacheConfig } from './types.js';

function mockController(overrides: Partial<CacheController> = {}): CacheController {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    shouldBypass: vi.fn().mockReturnValue(false),
    generateKey: vi.fn().mockReturnValue('test-key'),
    getTtlForTool: vi.fn().mockReturnValue(300),
    get: vi.fn().mockResolvedValue({ hit: false }),
    set: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockContext(overrides: Partial<GatewayRequestContext> = {}): GatewayRequestContext {
  return {
    method: 'tools/call',
    path: '/mcp',
    headers: {},
    getHeader: () => undefined,
    tenantId: 'tenant-a',
    toolName: 'weather_get',
    body: { jsonrpc: '2.0', method: 'tools/call', params: { name: 'weather_get' } },
    ...overrides,
  };
}

describe('cache-core', () => {
  describe('cacheLookup', () => {
    it('returns skip:true when controller is disabled', async () => {
      const controller = mockController({ isEnabled: vi.fn().mockReturnValue(false) });
      const ctx = mockContext();

      const result = await cacheLookup(ctx, controller);

      expect(result.skip).toBe(true);
      expect(result.hit).toBe(false);
    });

    it('returns skip:true when bypass requested', async () => {
      const controller = mockController({ shouldBypass: vi.fn().mockReturnValue(true) });
      const ctx = mockContext();

      const result = await cacheLookup(ctx, controller);

      expect(result.skip).toBe(true);
    });

    it('returns skip:true when no tenantId', async () => {
      const controller = mockController();
      const ctx = mockContext({ tenantId: undefined });

      const result = await cacheLookup(ctx, controller);

      expect(result.skip).toBe(true);
    });

    it('returns skip:true when no toolName', async () => {
      const controller = mockController();
      const ctx = mockContext({ toolName: undefined });

      const result = await cacheLookup(ctx, controller);

      expect(result.skip).toBe(true);
    });

    it('returns hit when value found in cache', async () => {
      const controller = mockController({
        get: vi
          .fn()
          .mockResolvedValue({ hit: true, value: { result: 'cached' }, ttlRemaining: 120 }),
      });
      const ctx = mockContext();

      const result = await cacheLookup(ctx, controller);

      expect(result.skip).toBe(false);
      expect(result.hit).toBe(true);
      expect(result.value).toEqual({ result: 'cached' });
      expect(result.key).toBe('test-key');
    });

    it('uses body method when context method is missing', async () => {
      const controller = mockController({
        generateKey: vi.fn().mockReturnValue('generated-key'),
        get: vi.fn().mockResolvedValue({ hit: true, value: 'data' }),
      });
      const ctx = mockContext({ method: undefined });

      const result = await cacheLookup(ctx, controller);

      expect(result.key).toBe('generated-key');
    });
  });

  describe('cacheStore', () => {
    it('returns early when toolName is missing', async () => {
      const controller = mockController();
      const ctx = mockContext({ toolName: undefined });

      await cacheStore(ctx, controller, 'some-key', { result: 'data' });

      expect(controller.set).not.toHaveBeenCalled();
    });

    it('returns early for undefined value', async () => {
      const controller = mockController();
      const ctx = mockContext();

      await cacheStore(ctx, controller, 'some-key', undefined);

      expect(controller.set).not.toHaveBeenCalled();
    });

    it('returns early for non-object value', async () => {
      const controller = mockController();
      const ctx = mockContext();

      await cacheStore(ctx, controller, 'some-key', 'string-value');

      expect(controller.set).not.toHaveBeenCalled();
    });

    it('returns early for error responses', async () => {
      const controller = mockController();
      const ctx = mockContext();
      const errorResponse = { error: { code: -32603, message: 'Internal error' } };

      await cacheStore(ctx, controller, 'some-key', errorResponse);

      expect(controller.set).not.toHaveBeenCalled();
    });

    it('stores valid successful responses', async () => {
      const controller = mockController();
      const ctx = mockContext();
      const successResponse = { result: 'success' };

      await cacheStore(ctx, controller, 'some-key', successResponse);

      expect(controller.set).toHaveBeenCalledWith('some-key', successResponse, 300, {
        tool: 'weather_get',
        tenantId: 'tenant-a',
      });
    });
  });

  describe('createRedisCacheController', () => {
    it('builds a working controller from redis cache', () => {
      const redis = {
        get: vi.fn(),
        set: vi.fn(),
        generateKey: vi.fn(),
      } as unknown as import('./redis-cache.js').RedisCache;
      const config: CacheConfig = { enabled: true, defaultTtlSeconds: 600 };

      const controller = createRedisCacheController(redis, config);

      expect(controller.isEnabled()).toBe(true);
      expect(typeof controller.get).toBe('function');
      expect(typeof controller.set).toBe('function');
    });
  });
});
