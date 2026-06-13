/**
 * mcp-gateway — Audit (Fastify adapter)
 *
 * Fastify plugin that records an audit event for each request as a `preHandler`
 * hook (audit never denies). Reads the tenant decorated by the auth plugin, the
 * same source the Express path reads from `req.authContext`. Defaults to a
 * silent sink so nothing is written to stdout unless a `logger` is supplied.
 *
 * Subpath export: `@reaatech/mcp-gateway-audit/fastify`.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { type RecordAuditOptions, recordAudit } from './audit-core.js';

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

const plugin: FastifyPluginAsync<RecordAuditOptions> = async (fastify, opts) => {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const ctx = buildRequestContext({
      httpMethod: request.method,
      path: request.url,
      headers: request.headers,
      body: request.body,
      tenantId: tenantIdOf(request),
    });

    recordAudit(ctx, { action: 'allow' }, opts);
  });
};

/**
 * Fastify audit plugin. Register after allowlist and before cache.
 *
 * @example
 * app.register(fastifyAudit, { logger: new ConsoleAuditLogger() });
 */
export const fastifyAudit = fp(plugin, {
  name: '@reaatech/mcp-gateway-audit',
  fastify: '5.x',
});

export default fastifyAudit;
