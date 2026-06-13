/**
 * mcp-gateway — Rate Limiting (Fastify adapter)
 *
 * Fastify plugin that enforces the per-tenant token bucket as a `preHandler`
 * hook. Reads the tenant decorated by the auth plugin (`request.tenantId` /
 * `request.authContext`), the same source the Express path reads from
 * `req.authContext` — never a spoofable header. On allow it sets the
 * `X-RateLimit-*` headers; over the limit it sends a 429 and returns.
 *
 * Subpath export: `@reaatech/mcp-gateway-rate-limit/fastify`.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { checkRateLimit } from './rate-limit-core.js';
import type { RateLimiter } from './rate-limiter.js';

export interface FastifyRateLimitOptions {
  limiter: RateLimiter;
}

/**
 * Read the tenant attached by the auth adapter without re-declaring the
 * (auth-owned) FastifyRequest augmentation.
 */
function tenantIdOf(request: FastifyRequest): string | undefined {
  const r = request as FastifyRequest & {
    tenantId?: string;
    authContext?: { tenantId?: string };
  };
  return r.tenantId ?? r.authContext?.tenantId;
}

const plugin: FastifyPluginAsync<FastifyRateLimitOptions> = async (fastify, opts) => {
  const { limiter } = opts;

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = buildRequestContext({
      httpMethod: request.method,
      path: request.url,
      headers: request.headers,
      body: request.body,
      tenantId: tenantIdOf(request),
    });

    const decision = await checkRateLimit(ctx, limiter);

    if (decision.headers) {
      reply.headers(decision.headers);
    }

    if (decision.action === 'deny') {
      reply.code(decision.status ?? 429).send(decision.body);
      return reply;
    }
  });
};

/**
 * Fastify rate-limit plugin. Register after auth and before allowlist.
 *
 * @example
 * app.register(fastifyRateLimit, { limiter });
 */
export const fastifyRateLimit = fp(plugin, {
  name: '@reaatech/mcp-gateway-rate-limit',
  fastify: '5.x',
});

export default fastifyRateLimit;
