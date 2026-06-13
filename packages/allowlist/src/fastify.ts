/**
 * mcp-gateway — Tool Allowlist (Fastify adapter)
 *
 * Fastify plugin that gates tool access as a `preHandler` hook. Reads the
 * tenant decorated by the auth plugin (`request.tenantId` /
 * `request.authContext`) — the same source the Express path reads from
 * `req.authContext`. A blocked tool sends a 403 and returns.
 *
 * Subpath export: `@reaatech/mcp-gateway-allowlist/fastify`.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { checkAllowlist } from './allowlist-core.js';

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

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = buildRequestContext({
      httpMethod: request.method,
      path: request.url,
      headers: request.headers,
      body: request.body,
      tenantId: tenantIdOf(request),
    });

    const decision = checkAllowlist(ctx);

    if (decision.action === 'deny') {
      if (decision.headers) {
        reply.headers(decision.headers);
      }
      reply.code(decision.status ?? 403).send(decision.body);
      return reply;
    }
  });
};

/**
 * Fastify allowlist plugin. Register after auth and rate-limit.
 *
 * @example
 * app.register(fastifyAllowlist);
 */
export const fastifyAllowlist = fp(plugin, {
  name: '@reaatech/mcp-gateway-allowlist',
  fastify: '5.x',
});

export default fastifyAllowlist;
