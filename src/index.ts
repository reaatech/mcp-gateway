/**
 * mcp-gateway — Production MCP Gateway
 * Main entry point that wires up the full middleware pipeline
 */

import './observability/otel.js';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import { env, isDevelopment, logConfigSummary } from './config/env.js';
import {
  SERVICE_NAME,
  SERVICE_VERSION,
  MAX_REQUEST_BODY_SIZE,
  HEALTH_ENDPOINT,
  DEEP_HEALTH_ENDPOINT,
  MCP_ENDPOINT,
  API_V1_PREFIX,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
} from './config/constants.js';
import { loadTenantsAsync, listTenants, getTenant, startWatching, stopWatching } from './config/tenant-loader.js';
import { logger } from './observability/logger.js';
import {
  auditEvents,
  authAttempts,
  authFailures,
  cacheHits as cacheHitsCounter,
  cacheMisses as cacheMissesCounter,
  rateLimitExceeded,
  allowlistDenied,
  requestsTotal,
  requestDurationMs,
  upstreamRequests,
  upstreamErrors,
  upstreamLatencyMs,
  fanoutUpstreams,
  validationErrors,
  updateCacheSize,
  updateRateLimitRemaining,
} from './observability/metrics.js';
import { registerProbe, getLiveness, getDeepHealth } from './observability/health.js';
import { authMiddleware, AuthenticationError } from './auth/auth.middleware.js';
import { hasAnyScope } from './auth/auth-context.js';
import { createRateLimiter, type RateLimiter } from './rate-limit/rate-limiter.js';
import { rateLimitErrorResponse, addRateLimitHeaders } from './rate-limit/rate-limit.middleware.js';
import { CacheManager } from './cache/cache-manager.js';
import { cacheMiddleware } from './cache/cache.middleware.js';
import { checkToolAccess } from './allowlist/allowlist-manager.js';
import { createValidationMiddleware } from './validation/validation.middleware.js';
import { request_idMiddleware } from './middleware/request-id.js';
import { error_handlerMiddleware } from './middleware/error-handler.js';
import { executeFanout, setUpstreamCaller } from './fanout/fanout-router.js';
import { filterHealthyUpstreams } from './fanout/failover-handler.js';
import type { UpstreamCaller } from './fanout/fanout-router.js';
import type { UpstreamTarget, AggregationStrategy } from './fanout/types.js';
import {
  createAuditEvent,
  ConsoleAuditLogger,
  FileAuditLogger,
  CompositeAuditLogger,
  MemoryAuditStorage,
  type AuditLogger,
} from './audit/index.js';
import type { AuditEventType } from './audit/types.js';
import { randomUUID } from 'node:crypto';

interface McpRequestBody {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> } & Record<string, unknown>;
}

/**
 * Options for constructing the gateway app. All fields are optional — defaults
 * come from environment configuration and tenant registry state.
 */
export interface CreateAppOptions {
  /** Pre-configured rate limiter. If omitted, one is created from env defaults. */
  rateLimiter?: RateLimiter;
  /** Pre-configured cache manager. If omitted, one is created from env defaults. */
  cacheManager?: CacheManager;
  /** Pre-configured audit logger. If omitted, a console (+ optional file) logger is built. */
  auditLogger?: AuditLogger;
  /** Audit storage. If omitted, an in-memory store with 10k retention is used. */
  auditStorage?: MemoryAuditStorage;
  /** Upstream caller override (for tests — routes fan-out to a stub). */
  upstreamCaller?: UpstreamCaller;
  /** Default aggregation strategy for fan-out. Defaults to 'first-success'. */
  aggregationStrategy?: AggregationStrategy;
}

/**
 * Returned from createApp — exposes the Express app plus constructed resources
 * so callers can wire custom listeners or shut things down cleanly in tests.
 */
export interface GatewayApp {
  app: Express;
  rateLimiter: RateLimiter;
  cacheManager: CacheManager;
  auditStorage: MemoryAuditStorage;
  emitAudit: (eventType: AuditEventType, data?: Parameters<typeof createAuditEvent>[2]) => void;
  close: () => Promise<void>;
}

/**
 * Build the Express app with the full middleware pipeline.
 * Pure: does not start listening, does not mutate tenant registry.
 */
export function createApp(options: CreateAppOptions = {}): GatewayApp {
  // Health probes
  registerProbe('tenantLoader', async () => ({
    status: listTenants().length > 0 ? 'healthy' : 'degraded',
    message: `${listTenants().length} tenants loaded`,
  }));

  const rateLimiter =
    options.rateLimiter ??
    createRateLimiter({
      storeType: env.RATE_LIMIT_STORE,
      defaultConfig: {
        requestsPerMinute: env.RATE_LIMIT_DEFAULT_RPM,
        requestsPerDay: env.RATE_LIMIT_DEFAULT_RPD,
      },
    });

  const cacheManager =
    options.cacheManager ??
    new CacheManager({
      enabled: env.CACHE_ENABLED,
      defaultTtlSeconds: env.CACHE_DEFAULT_TTL,
      maxEntries: 10000,
    });

  const auditLogger = options.auditLogger ?? buildAuditLogger();
  const auditStorage = options.auditStorage ?? new MemoryAuditStorage(10000);
  const strategy: AggregationStrategy = options.aggregationStrategy ?? 'first-success';

  if (options.upstreamCaller) {
    setUpstreamCaller(options.upstreamCaller);
  }

  const emitAudit = (
    eventType: AuditEventType,
    data: Parameters<typeof createAuditEvent>[2] = {},
  ): void => {
    const event = createAuditEvent(eventType, data?.requestId ?? 'unknown', data);
    auditStorage.store(event);
    void auditLogger.log(event);
    auditEvents.add(1, { event_type: eventType });
  };

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: MAX_REQUEST_BODY_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_BODY_SIZE }));

  // Request ID + base context
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    request_idMiddleware()(req, res, next, {
      requestId: (req.headers['x-request-id'] as string) || '',
      startTime: Date.now(),
    });
  });

  // Request metrics / logging hook
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const tenantId =
        (req.authContext?.tenantId as string | undefined) ??
        (req.headers['x-tenant-id'] as string | undefined) ??
        'unknown';
      requestsTotal.add(1, { tenant_id: tenantId, status: String(res.statusCode) });
      requestDurationMs.record(durationMs, { tenant_id: tenantId, method: req.method });
      const cacheHeader = res.getHeader('X-Cache');
      if (cacheHeader === 'HIT' || cacheHeader === 'MISS') {
        const body = req.body as McpRequestBody | undefined;
        const tool = body?.params?.name ?? 'unknown';
        if (cacheHeader === 'HIT') {
          cacheHitsCounter.add(1, { tool });
        } else {
          cacheMissesCounter.add(1, { tool });
        }
      }
      logger.info(
        {
          requestId: req.headers['x-request-id'],
          tenantId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        },
        'request',
      );
    });
    next();
  });

  // Health endpoints (no auth)
  app.get(HEALTH_ENDPOINT, (_req, res) => {
    res.json(getLiveness());
  });

  app.get(DEEP_HEALTH_ENDPOINT, async (_req, res) => {
    const status = await getDeepHealth();
    const code = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503;
    res.status(code).json(status);
  });

  // Per-tenant rate limit middleware (pulls tenant config from registry)
  const perTenantRateLimit = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const tenantId = req.authContext?.tenantId;
    if (!tenantId) {
      next();
      return;
    }
    const tenant = getTenant(tenantId);
    const result = await rateLimiter.checkLimit(tenantId, tenant?.rateLimits as unknown as Parameters<typeof rateLimiter.getRemaining>[1]);
    if (!result.allowed) {
      rateLimitExceeded.add(1, { tenant_id: tenantId });
      rateLimitErrorResponse(res, result);
      return;
    }
    addRateLimitHeaders(res, result);
    next();
  };

  const recordAuthFailure = (error: AuthenticationError, req: Request): void => {
    authFailures.add(1, { method: 'unknown', reason: error.code });
    emitAudit('auth.failure', {
      requestId: (req.headers['x-request-id'] as string) ?? 'unknown',
      success: false,
      ...(req.authContext?.tenantId ? { tenantId: req.authContext.tenantId } : {}),
      metadata: { code: error.code, message: error.message },
    });
  };

  const isAdminRequest = (req: Request): boolean =>
    req.authContext !== undefined && hasAnyScope(req.authContext, ['admin:read', 'admin:*']);

  const getRequestedTenantId = (req: Request): string | undefined => {
    const queryTenant = req.query.tenant_id;
    if (typeof queryTenant === 'string' && queryTenant.length > 0) {
      return queryTenant;
    }
    if (typeof req.params.id === 'string' && req.params.id.length > 0) {
      return req.params.id;
    }
    return undefined;
  };

  const getAccessibleTenants = (req: Request): typeof listTenants extends () => infer T ? T : never => {
    if (isAdminRequest(req)) {
      const requestedTenantId = getRequestedTenantId(req);
      if (requestedTenantId) {
        return [getTenant(requestedTenantId)].filter(Boolean) as ReturnType<typeof listTenants>;
      }
      return listTenants() as ReturnType<typeof listTenants>;
    }

    const tenantId = req.authContext?.tenantId;
    return tenantId ? ([getTenant(tenantId)].filter(Boolean) as ReturnType<typeof listTenants>) : [];
  };

  const requireAdminForGlobalView = (req: Request, res: Response): boolean => {
    if (isAdminRequest(req)) {
      return true;
    }
    res.status(403).json({
      error: {
        code: -32003,
        message: 'Admin scope required',
      },
    });
    return false;
  };

  // Admin API (read-only). Gated behind authMiddleware so tenants can only see their own view.
  const admin = express.Router();
  admin.use(authMiddleware({ onFailure: recordAuthFailure }));
  admin.use(perTenantRateLimit);

  admin.get('/tenants', (req, res) => {
    const tenants = getAccessibleTenants(req).map((t) => ({
      tenantId: t.tenantId,
      displayName: t.displayName,
      upstreams: t.upstreams.length,
      rateLimits: t.rateLimits,
    }));
    res.json({ tenants });
  });

  admin.get('/tenants/:id', (req, res) => {
    const tenant = getTenant(req.params.id);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    if (!isAdminRequest(req) && req.authContext?.tenantId !== tenant.tenantId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      rateLimits: tenant.rateLimits,
      cache: tenant.cache,
      allowlist: tenant.allowlist,
      upstreams: tenant.upstreams,
    });
  });

  admin.get('/upstreams', (req, res) => {
    const requestedTenantId = req.query.tenant_id as string | undefined;
    if (requestedTenantId && !isAdminRequest(req) && requestedTenantId !== req.authContext?.tenantId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const tenants = getAccessibleTenants(req);
    const upstreams = tenants.flatMap((t) =>
      t!.upstreams.map((u) => ({
        tenantId: t!.tenantId,
        name: u.name,
        url: u.url,
        weight: u.weight,
        timeoutMs: u.timeoutMs,
      })),
    );
    res.json({ upstreams });
  });

  admin.get('/cache/stats', (_req, res) => {
    if (!requireAdminForGlobalView(_req, res)) {
      return;
    }
    const stats = cacheManager.getStats();
    updateCacheSize(stats.size ?? 0);
    res.json({
      hits: stats.hits,
      misses: stats.misses,
      totalKeys: stats.size,
      evictions: stats.evictions,
      hitRate: stats.hits + stats.misses === 0 ? 0 : stats.hits / (stats.hits + stats.misses),
    });
  });

  admin.get('/rate-limits/status', async (req, res) => {
    const requestedTenantId = req.query.tenant_id as string | undefined;
    if (requestedTenantId && !isAdminRequest(req) && requestedTenantId !== req.authContext?.tenantId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const tenants = getAccessibleTenants(req);
    const statuses = await Promise.all(
      tenants.map(async (t) => {
        const remaining = await rateLimiter.getRemaining(t!.tenantId, t!.rateLimits as unknown as Parameters<typeof rateLimiter.getRemaining>[1]);
        updateRateLimitRemaining(t!.tenantId, remaining);
        return {
          tenantId: t!.tenantId,
          remainingMinute: remaining,
          limitMinute: t!.rateLimits.requestsPerMinute,
          limitDay: t!.rateLimits.requestsPerDay,
          resetMinute: Math.ceil(Date.now() / 60000) * 60,
        };
      }),
    );
    res.json({ statuses });
  });

  admin.get('/audit', (req, res) => {
    const requestedTenantId = req.query.tenant_id as string | undefined;
    if (requestedTenantId && !isAdminRequest(req) && requestedTenantId !== req.authContext?.tenantId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const params: Record<string, unknown> = {
      limit: req.query.limit ? Number(req.query.limit) : 100,
    };
    if (requestedTenantId) {
      params.tenantId = requestedTenantId;
    } else if (!isAdminRequest(req) && req.authContext?.tenantId) {
      params.tenantId = req.authContext.tenantId;
    }
    if (req.query.event_type) {
      params.eventType = req.query.event_type as AuditEventType;
    }
    const results = auditStorage.query(params as Parameters<typeof auditStorage.query>[0]);
    res.json({ events: results });
  });

  app.use(API_V1_PREFIX, admin);

  // Authenticated MCP pipeline
  app.post(
    MCP_ENDPOINT,
    authMiddleware({ onFailure: recordAuthFailure }),
    (req: Request, _res: Response, next: NextFunction) => {
      authAttempts.add(1, {
        method: req.authContext?.authMethod ?? 'none',
        result: req.authContext ? 'success' : 'failure',
      });
      if (req.authContext) {
        req.headers['x-tenant-id'] = req.authContext.tenantId;
      }
      next();
    },
    perTenantRateLimit,
    createValidationMiddleware(),
    (req: Request, res: Response, next: NextFunction) => {
      const tenantId = req.authContext?.tenantId;
      if (!tenantId) {
        next();
        return;
      }
      const tenant = getTenant(tenantId);
      if (!tenant) {
        next();
        return;
      }
      const body = req.body as McpRequestBody;
      if (body?.method !== 'tools/call') {
        next();
        return;
      }
      const toolName = body.params?.name;
      if (typeof toolName !== 'string') {
        next();
        return;
      }
      const result = checkToolAccess(toolName, tenant.allowlist);
      if (!result.allowed) {
        allowlistDenied.add(1, { tenant_id: tenantId, tool: toolName });
        emitAudit('allowlist.denied', {
          requestId: (req.headers['x-request-id'] as string) ?? 'unknown',
          tenantId,
          tool: toolName,
          success: false,
          metadata: { reason: result.reason },
        });
        res.status(403).json({
          jsonrpc: '2.0',
          id: body.id ?? null,
          error: {
            code: -32601,
            message: 'Tool not allowed',
            data: { tool: toolName, tenant: tenantId, reason: result.reason },
          },
        });
        return;
      }
      next();
    },
    cacheMiddleware(cacheManager),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.authContext?.tenantId;
        if (!tenantId) {
          throw new AuthenticationError('Tenant not resolved', 'TENANT_NOT_RESOLVED', 401);
        }
        const tenant = getTenant(tenantId);
        if (!tenant) {
          throw new AuthenticationError(`Tenant '${tenantId}' not found`, 'TENANT_NOT_FOUND', 401);
        }

        const body = req.body as McpRequestBody;
        const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();

        const upstreams: UpstreamTarget[] = tenant.upstreams.map((u) => ({
          name: u.name,
          url: u.url,
          weight: u.weight,
          timeoutMs: u.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS,
        }));

        const healthyUpstreams = filterHealthyUpstreams(upstreams);
        if (healthyUpstreams.length === 0) {
          res.status(503).json({
            jsonrpc: '2.0',
            id: body.id ?? null,
            error: {
              code: -32000,
              message: 'No healthy upstream servers available',
            },
          });
          return;
        }

        const fanoutResult = await executeFanout(healthyUpstreams, body, strategy, DEFAULT_UPSTREAM_TIMEOUT_MS);
        fanoutUpstreams.record(fanoutResult.upstreamsContacted);

        for (const r of fanoutResult.responses) {
          upstreamRequests.add(1, {
            upstream: r.upstream,
            status: r.success ? 'success' : 'failure',
          });
          upstreamLatencyMs.record(r.latencyMs, { upstream: r.upstream });
          if (!r.success) {
            upstreamErrors.add(1, { upstream: r.upstream, error_type: 'request_failed' });
          }
        }

        if (fanoutResult.successful === 0) {
          emitAudit('upstream.error', {
            requestId,
            tenantId,
            success: false,
            metadata: { responses: fanoutResult.responses.length },
          });
          res.status(502).json({
            jsonrpc: '2.0',
            id: body.id ?? null,
            error: {
              code: -32000,
              message: 'All upstream servers failed',
              data: { responses: fanoutResult.responses },
            },
          });
          return;
        }

        emitAudit('tool.executed', {
          requestId,
          tenantId,
          ...(body.params?.name ? { tool: body.params.name } : {}),
          success: true,
          ...(() => {
            const successful = fanoutResult.responses.find((r) => r.success);
            return successful ? { upstream: successful.upstream } : {};
          })(),
        });

        res.json(fanoutResult.finalResponse ?? { jsonrpc: '2.0', id: body.id ?? null, result: null });
      } catch (error) {
        next(error);
      }
    },
  );

  // 404
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
  });

  // Central error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AuthenticationError) {
      authFailures.add(1, { method: 'unknown', reason: err.code });
      emitAudit('auth.failure', {
        requestId: (req.headers['x-request-id'] as string) ?? 'unknown',
        success: false,
        metadata: { code: err.code, message: err.message },
      });
      res.status(err.statusCode).json({
        jsonrpc: '2.0',
        id: (req.body as McpRequestBody)?.id ?? null,
        error: { code: -32001, message: err.message, data: { code: err.code } },
      });
      return;
    }
    if (res.statusCode === 400) {
      validationErrors.add(1, { type: 'schema' });
    }
    error_handlerMiddleware()(err, req, res, next);
  });

  const close = async (): Promise<void> => {
    await rateLimiter.close().catch(() => undefined);
    cacheManager.clear();
    stopWatching();
  };

  return { app, rateLimiter, cacheManager, auditStorage, emitAudit, close };
}

let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info(`Starting ${SERVICE_NAME} v${SERVICE_VERSION}`);
  logConfigSummary();

  await loadTenantsAsync();
  if (env.NODE_ENV !== 'test') {
    startWatching();
  }

  const gateway = createApp();
  const server: Server = gateway.app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV,
        healthUrl: `http://localhost:${env.PORT}${HEALTH_ENDPOINT}`,
        mcpUrl: `http://localhost:${env.PORT}${MCP_ENDPOINT}`,
      },
      'gateway listening',
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {return;}
    isShuttingDown = true;
    logger.info({ signal }, 'shutdown requested');

    // Close gateway resources (rate limiter, cache)
    await gateway.close();

    // Close HTTP server gracefully - stop accepting new connections, wait for existing
    await new Promise<void>((resolve) => {
      server.close(async () => {
        try {
          const otelMod = await import('./observability/otel.impl.js');
          await otelMod.shutdownOTel();
        } catch {
          // module not loaded
        }

        try {
          const { shutdownOAuthIntrospection } = await import('./auth/oauth-introspection.js');
          shutdownOAuthIntrospection();
        } catch {
          // module not loaded
        }

        gateway.emitAudit('config.changed', {
          requestId: 'shutdown',
          success: true,
          metadata: { signal },
        });

        if (isDevelopment) {
          logger.debug('shutdown complete');
        }
        resolve();
      });
    });

    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Build an audit logger writing to console + file based on env
 */
function buildAuditLogger(): AuditLogger {
  const composite = new CompositeAuditLogger();
  composite.addLogger(new ConsoleAuditLogger());
  if (env.AUDIT_ENABLED && env.AUDIT_STORAGE === 'file') {
    try {
      composite.addLogger(new FileAuditLogger(env.AUDIT_FILE_PATH));
    } catch (error) {
      logger.warn({ err: error }, 'failed to initialize file audit logger');
    }
  }
  return composite;
}

// Guard so importing this module for tests doesn't auto-start the server
if (process.env.NODE_ENV !== 'test' && !process.env.MCP_GATEWAY_DISABLE_AUTOSTART) {
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, `${SERVICE_NAME} unhandled promise rejection`);
  });

  main().catch((err) => {
    logger.fatal({ err }, `${SERVICE_NAME} failed to start`);
    process.exit(1);
  });
}

export { main };
