/**
 * mcp-gateway — Authentication (Fastify adapter)
 *
 * Fastify plugin that runs the framework-agnostic auth core as a `preHandler`
 * hook. On allow it decorates the request with `authContext` / `tenantId` so
 * later hooks (rate-limit, allowlist, cache) and tool handlers read the same
 * tenant the Express path reads from `req.authContext`. On deny it sends the
 * reply and returns, short-circuiting the pipeline.
 *
 * Subpath export: `@reaatech/mcp-gateway-auth/fastify`.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthContext } from './auth-context.js';
import {
  type AuthDecision,
  type AuthenticationError,
  evaluateAuth,
  evaluateOptionalAuth,
} from './auth-core.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
    tenantId?: string;
  }
}

export interface FastifyAuthOptions {
  /** Invoked on a denied request, mirroring the Express `onFailure` option. */
  onFailure?: (error: AuthenticationError, request: FastifyRequest) => void;
  /** When true, missing/invalid credentials do not deny — they are ignored. */
  optional?: boolean;
}

/**
 * Build a normalized request context from a Fastify request.
 */
export function contextFromFastify(request: FastifyRequest) {
  return buildRequestContext({
    httpMethod: request.method,
    path: request.url,
    headers: request.headers,
    body: request.body,
  });
}

const plugin: FastifyPluginAsync<FastifyAuthOptions> = async (fastify, opts) => {
  if (!fastify.hasRequestDecorator('authContext')) {
    fastify.decorateRequest('authContext', undefined);
  }
  if (!fastify.hasRequestDecorator('tenantId')) {
    fastify.decorateRequest('tenantId', undefined);
  }

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = contextFromFastify(request);

    if (opts.optional) {
      const authContext = await evaluateOptionalAuth(ctx);
      if (authContext) {
        request.authContext = authContext;
        request.tenantId = authContext.tenantId;
      }
      return;
    }

    const decision: AuthDecision = await evaluateAuth(ctx);

    if (decision.action === 'deny') {
      if (decision.error) {
        opts.onFailure?.(decision.error, request);
      }
      if (decision.headers) {
        reply.headers(decision.headers);
      }
      reply.code(decision.status ?? 401).send(decision.body);
      return reply;
    }

    request.authContext = decision.authContext;
    request.tenantId = decision.authContext?.tenantId;
  });
};

/**
 * Fastify auth plugin. Register before rate-limit, allowlist, audit, and cache.
 */
export const fastifyAuth = fp(plugin, {
  name: '@reaatech/mcp-gateway-auth',
  fastify: '5.x',
});

export default fastifyAuth;
