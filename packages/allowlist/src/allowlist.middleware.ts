/**
 * mcp-gateway — Tool Allowlist Middleware (Express adapter)
 * Thin Express wrapper over the framework-agnostic allowlist core.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { NextFunction, Request, Response } from 'express';
import { checkAllowlist } from './allowlist-core.js';

/**
 * Tool Allowlist middleware
 * Checks if the requested tool is allowed for the tenant.
 */
export function allowlistMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get tenant from auth context (not from header - header is spoofable)
    const authContext = (req as unknown as { authContext?: { tenantId?: string } }).authContext;
    const ctx = buildRequestContext({
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      tenantId: authContext?.tenantId,
    });

    const decision = checkAllowlist(ctx);

    if (decision.action === 'deny') {
      res.status(decision.status ?? 403).json(decision.body);
      return;
    }

    next();
  };
}
