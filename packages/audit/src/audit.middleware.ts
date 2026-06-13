/**
 * mcp-gateway — Audit Middleware (Express adapter)
 *
 * Records an audit event for each request that reaches it, then always calls
 * `next()` — audit never denies. Thin wrapper over {@link recordAudit}.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { NextFunction, Request, Response } from 'express';
import { type RecordAuditOptions, recordAudit } from './audit-core.js';

/**
 * Express audit middleware. Defaults to a silent sink — pass `logger` to send
 * events to a real destination (Console/File/custom).
 */
export function auditMiddleware(options: RecordAuditOptions = {}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authContext = (req as unknown as { authContext?: { tenantId?: string } }).authContext;
    const ctx = buildRequestContext({
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      tenantId: authContext?.tenantId,
    });

    recordAudit(ctx, { action: 'allow' }, options);
    next();
  };
}
