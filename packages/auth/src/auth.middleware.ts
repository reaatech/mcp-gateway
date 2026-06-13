/**
 * mcp-gateway — Authentication Middleware (Express adapter)
 * Thin Express wrapper over the framework-agnostic auth core.
 */

import { buildRequestContext } from '@reaatech/mcp-gateway-core';
import type { NextFunction, Request, Response } from 'express';
import type { AuthContext } from './auth-context.js';
import { evaluateAuth, evaluateOptionalAuth } from './auth-core.js';

// Re-exported so existing import paths keep working.
export { AuthenticationError } from './auth-core.js';

import { AuthenticationError } from './auth-core.js';

/**
 * Express module augmentation to include auth context
 */
declare module 'express-serve-static-core' {
  interface Request {
    authContext?: AuthContext;
  }
}

export interface AuthMiddlewareOptions {
  onFailure?: (error: AuthenticationError, req: Request) => void;
}

/**
 * Authentication middleware
 * Extracts and validates credentials, attaches auth context to request.
 */
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = buildRequestContext({
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
    });

    const decision = await evaluateAuth(ctx);

    if (decision.action === 'allow') {
      req.authContext = decision.authContext;
      next();
      return;
    }

    if (decision.error) {
      options.onFailure?.(decision.error, req);
    }
    res.status(decision.status ?? 401).json(decision.body);
  };
}

/**
 * Optional auth middleware - doesn't fail if auth is missing.
 * Useful for endpoints that work differently for authenticated vs anonymous users.
 */
export function optionalAuthMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const ctx = buildRequestContext({
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
    });
    const authContext = await evaluateOptionalAuth(ctx);
    if (authContext) {
      req.authContext = authContext;
    }
    next();
  };
}

/**
 * Get auth context from request (throws if not authenticated)
 */
export function requireAuth(req: Request): AuthContext {
  if (!req.authContext) {
    throw new AuthenticationError('Authentication required', 'AUTH_REQUIRED');
  }
  return req.authContext;
}

/**
 * Get auth context from request (returns undefined if not authenticated)
 */
export function getAuth(req: Request): AuthContext | undefined {
  return req.authContext;
}
