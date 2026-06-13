/**
 * mcp-gateway — Response Cache (Fastify adapter)
 *
 * Fastify plugin that serves and stores cached responses. Reads the tenant
 * decorated by the auth plugin (`request.tenantId` / `request.authContext`) —
 * the same source the Express path reads from `req.authContext`.
 *
 * On a cache HIT it calls `reply.hijack()` and writes the stored body/headers
 * directly to the raw socket, so Fastify does not re-serialize the payload. On
 * a MISS an `onSend` hook captures the serialized response and stores it. The
 * adapter wires the existing {@link RedisCache} so the Fastify path is
 * Redis-backed (memory via {@link CacheManager} is also supported).
 *
 * Subpath export: `@reaatech/mcp-gateway-cache/fastify`.
 */

import { buildRequestContext, type GatewayRequestContext } from '@reaatech/mcp-gateway-core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  type CacheController,
  cacheLookup,
  cacheStore,
  createRedisCacheController,
} from './cache-core.js';
import type { CacheManager } from './cache-manager.js';
import type { RedisCache } from './redis-cache.js';
import type { CacheConfig, ToolCacheStrategy } from './types.js';

export interface FastifyCacheOptions {
  /** A ready-made controller (takes precedence over the convenience fields). */
  controller?: CacheController;
  /** Redis cache to back the controller (recommended for production). */
  redis?: RedisCache;
  /** Memory cache manager (also a valid controller). */
  manager?: CacheManager;
  /** Cache config used when building a Redis-backed controller. */
  config?: CacheConfig;
  /** Per-tool TTL strategies used when building a Redis-backed controller. */
  strategies?: ToolCacheStrategy[];
}

// Per-request state stashed for the onSend hook (avoids decoration conflicts).
const MISS = Symbol('mcp-gateway-cache-miss-key');
const CTX = Symbol('mcp-gateway-cache-ctx');

interface CacheState {
  [MISS]?: string;
  [CTX]?: GatewayRequestContext;
}

function resolveController(opts: FastifyCacheOptions): CacheController {
  if (opts.controller) {
    return opts.controller;
  }
  if (opts.redis) {
    const config: CacheConfig = opts.config ?? { enabled: true, defaultTtlSeconds: 300 };
    return createRedisCacheController(opts.redis, config, opts.strategies);
  }
  if (opts.manager) {
    return opts.manager;
  }
  throw new Error(
    'fastifyCache requires one of: { controller }, { redis, config? }, or { manager }',
  );
}

function tenantIdOf(request: FastifyRequest): string | undefined {
  const r = request as FastifyRequest & {
    tenantId?: string;
    authContext?: { tenantId?: string };
  };
  return r.tenantId ?? r.authContext?.tenantId;
}

const plugin: FastifyPluginAsync<FastifyCacheOptions> = async (fastify, opts) => {
  const controller = resolveController(opts);

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = buildRequestContext({
      httpMethod: request.method,
      path: request.url,
      headers: request.headers,
      body: request.body,
      tenantId: tenantIdOf(request),
    });

    const lookup = await cacheLookup(ctx, controller);
    if (lookup.skip || !lookup.key) {
      return;
    }

    if (lookup.hit) {
      // Serve directly from the raw socket so Fastify does not re-serialize.
      reply.hijack();
      const raw = reply.raw;
      raw.statusCode = 200;
      raw.setHeader('Content-Type', 'application/json; charset=utf-8');
      raw.setHeader('X-Cache', 'HIT');
      if (lookup.ttlRemaining !== undefined) {
        raw.setHeader('X-Cache-TTL', String(Math.max(0, Math.floor(lookup.ttlRemaining / 1000))));
      }
      raw.setHeader('X-Cache-Key', lookup.key);
      raw.end(JSON.stringify(lookup.value));
      return reply;
    }

    // Miss: mark headers now, stash key + ctx for the onSend capture.
    reply.header('X-Cache', 'MISS');
    reply.header('X-Cache-Key', lookup.key);
    const state = request as unknown as CacheState;
    state[MISS] = lookup.key;
    state[CTX] = ctx;
  });

  fastify.addHook('onSend', async (request: FastifyRequest, _reply: FastifyReply, payload) => {
    const state = request as unknown as CacheState;
    const key = state[MISS];
    const ctx = state[CTX];
    if (!key || !ctx || typeof payload !== 'string') {
      return payload;
    }

    try {
      const value = JSON.parse(payload);
      await cacheStore(ctx, controller, key, value);
    } catch {
      // Non-JSON payload — nothing to cache.
    }
    return payload;
  });
};

/**
 * Fastify response-cache plugin. Register last in the pipeline (after auth,
 * rate-limit, allowlist, audit).
 *
 * @example
 * app.register(fastifyCache, { redis: new RedisCache(client), config });
 */
export const fastifyCache = fp(plugin, {
  name: '@reaatech/mcp-gateway-cache',
  fastify: '5.x',
});

export default fastifyCache;
