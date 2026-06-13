/**
 * mcp-gateway — Rate Limit Fastify Adapter Tests
 * Mirrors the Express behavior: allow path sets headers, over-limit denies 429.
 */

import Fastify, { type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { fastifyRateLimit } from './fastify.js';
import { createRateLimiter } from './rate-limiter.js';

function buildApp(tenantId: string | undefined) {
  const app = Fastify();

  // Stand in for the auth plugin: decorate the tenant the limiter keys on.
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { tenantId?: string }).tenantId = tenantId;
  });

  const limiter = createRateLimiter({
    storeType: 'memory',
    defaultConfig: { requestsPerMinute: 1, requestsPerDay: 1000, burstSize: 1 },
  });

  app.register(fastifyRateLimit, { limiter });
  app.post('/mcp', async () => ({ ok: true }));
  return app;
}

describe('fastifyRateLimit', () => {
  it('allows the first request and sets X-RateLimit headers', async () => {
    const app = buildApp('tenant-a');
    const res = await app.inject({ method: 'POST', url: '/mcp', payload: {} });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    await app.close();
  });

  it('denies an over-limit request with 429 + Retry-After', async () => {
    const app = buildApp('tenant-b');

    const first = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(second.json().error.code).toBe(-32000);
    await app.close();
  });

  it('skips rate limiting when no tenant is identified', async () => {
    const app = buildApp(undefined);
    const first = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    const second = await app.inject({ method: 'POST', url: '/mcp', payload: {} });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    await app.close();
  });
});
