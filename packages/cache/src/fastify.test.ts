/**
 * mcp-gateway — Cache Fastify Adapter Tests
 * A cache hit replays the stored response without re-running the handler,
 * backed by the (fake) Redis client.
 */

import Fastify, { type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { CacheManager } from './cache-manager.js';
import { fastifyCache } from './fastify.js';
import { RedisCache } from './redis-cache.js';
import type { CacheConfig } from './types.js';

/** In-memory fake of the minimal Redis client RedisCache needs. */
function fakeRedisClient() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    setex: async (key: string, _seconds: number, value: string) => {
      store.set(key, value);
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    exists: async (key: string) => (store.has(key) ? 1 : 0),
  };
}

function buildApp(tenantId = 'tenant-a') {
  const app = Fastify();
  const redis = new RedisCache(fakeRedisClient());
  let handlerCalls = 0;

  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { tenantId?: string }).tenantId = tenantId;
  });
  app.register(fastifyCache, { redis, config: { enabled: true, defaultTtlSeconds: 300 } });

  app.post('/mcp', async () => {
    handlerCalls += 1;
    return { jsonrpc: '2.0', id: 1, result: { value: 'computed', calls: handlerCalls } };
  });

  return { app, getCalls: () => handlerCalls };
}

function buildAppWithHitController(controller: ReturnType<typeof createHitController>) {
  const app = Fastify();
  let handlerCalls = 0;

  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { tenantId?: string }).tenantId = 'hit-tenant';
    (
      request as FastifyRequest & {
        authContext?: { tenantId: string; authMethod: string; scopes: string[] };
      }
    ).authContext = {
      tenantId: 'hit-tenant',
      authMethod: 'api-key',
      scopes: ['tools:*'],
    };
  });
  app.register(fastifyCache, { controller });

  app.post('/mcp', async () => {
    handlerCalls += 1;
    return { jsonrpc: '2.0', id: 1, result: { value: 'computed', calls: handlerCalls } };
  });

  return { app, getCalls: () => handlerCalls };
}

function createHitController(withTtl = false) {
  let count = 0;
  return {
    isEnabled: () => true,
    shouldBypass: () => false,
    generateKey: () => 'hit-key',
    getTtlForTool: () => 300,
    get: async () => {
      count++;
      if (count > 1) {
        return {
          hit: true,
          value: { jsonrpc: '2.0', id: 1, result: { value: 'cached' } },
          ttlRemaining: withTtl ? 150000 : undefined,
        };
      }
      return { hit: false };
    },
    set: async () => {},
  };
}

const toolCall = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'weather_get', arguments: { city: 'sf' } },
};

describe('fastifyCache', () => {
  it('serves a cache HIT without re-running the handler', async () => {
    const { app, getCalls } = buildApp();

    const first = await app.inject({ method: 'POST', url: '/mcp', payload: toolCall });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(getCalls()).toBe(1);

    const second = await app.inject({ method: 'POST', url: '/mcp', payload: toolCall });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    // Handler not invoked again.
    expect(getCalls()).toBe(1);
    // Replayed body matches the originally cached response.
    expect(second.json()).toEqual(first.json());

    await app.close();
  });

  it('does not cache non-tool-call requests', async () => {
    const { app, getCalls } = buildApp();
    const payload = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

    await app.inject({ method: 'POST', url: '/mcp', payload });
    const second = await app.inject({ method: 'POST', url: '/mcp', payload });

    expect(second.headers['x-cache']).toBeUndefined();
    expect(getCalls()).toBe(2);
    await app.close();
  });

  it('includes X-Cache-TTL header on hit when ttlRemaining provided', async () => {
    const controller = createHitController(true);
    const { app } = buildAppWithHitController(controller);

    await app.inject({ method: 'POST', url: '/mcp', payload: toolCall });
    const second = await app.inject({ method: 'POST', url: '/mcp', payload: toolCall });

    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.headers['x-cache-ttl']).toBeDefined();
    expect(Number(second.headers['x-cache-ttl'])).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('works with a CacheManager as controller', async () => {
    const app = Fastify();
    const config: CacheConfig = { enabled: true, defaultTtlSeconds: 300 };
    const manager = new CacheManager(config);
    let handlerCalls = 0;

    app.addHook('onRequest', async (request: FastifyRequest) => {
      (request as FastifyRequest & { tenantId?: string }).tenantId = 'manager-tenant';
    });
    app.register(fastifyCache, { manager });

    app.post('/mcp', async () => {
      handlerCalls += 1;
      return { jsonrpc: '2.0', id: 1, result: { calls: handlerCalls } };
    });

    const payload = toolCall;
    await app.inject({ method: 'POST', url: '/mcp', payload });
    const second = await app.inject({ method: 'POST', url: '/mcp', payload });

    expect(second.headers['x-cache']).toBe('HIT');
    await app.close();
  });

  it('works with a direct controller', async () => {
    const app = Fastify();
    const controller = {
      isEnabled: () => true,
      shouldBypass: () => false,
      generateKey: () => 'direct-key',
      getTtlForTool: () => 300,
      get: async () => ({ hit: false }),
      set: async () => {},
    };
    let handlerCalls = 0;

    app.addHook('onRequest', async (request: FastifyRequest) => {
      (request as FastifyRequest & { tenantId?: string }).tenantId = 'direct-tenant';
    });
    app.register(fastifyCache, { controller });

    app.post('/mcp', async () => {
      handlerCalls += 1;
      return { jsonrpc: '2.0', id: 1, result: { calls: handlerCalls } };
    });

    const payload = toolCall;
    await app.inject({ method: 'POST', url: '/mcp', payload });
    const second = await app.inject({ method: 'POST', url: '/mcp', payload });

    expect(second.headers['x-cache']).toBe('MISS');
    await app.close();
  });

  it('throws an error when no controller, redis, or manager provided', async () => {
    const app = Fastify();

    app.register(fastifyCache, {} as never);

    app.post('/mcp', async () => ({ result: 'ok' }));

    await expect(app.ready()).rejects.toThrow('fastifyCache requires one of');
    await app.close();
  });
});
