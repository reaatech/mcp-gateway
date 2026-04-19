/**
 * mcp-gateway — Authentication Middleware
 * Main middleware that orchestrates all authentication methods
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthContext } from './auth-context.js';
import { validateApiKey, findTenantForApiKey } from './api-key-validator.js';
import { validateJwt } from './jwt-validator.js';
import { introspectToken } from './oauth-introspection.js';
import { validateOidcIdToken } from './oidc-validator.js';
import { getTenant, listTenants } from '../config/tenant-loader.js';
import type { TenantConfig } from '../types/schemas.js';
import { logger } from '../observability/logger.js';

/**
 * Express module augmentation to include auth context
 */
declare module 'express-serve-static-core' {
  interface Request {
    authContext?: AuthContext;
  }
}

/**
 * Authentication error with specific code
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'AUTH_FAILED',
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface AuthMiddlewareOptions {
  onFailure?: (error: AuthenticationError, req: Request) => void;
}

/**
 * Extract API key from request headers
 */
function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) {return value[0];}
  return value;
}

function extractApiKey(req: Request): string | undefined {
  return getHeader(req, 'x-api-key');
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined;
  }
  return authHeader.slice(7);
}

/**
 * Determine tenant from request
 * Priority: x-tenant-id header > extracted from auth
 */
function determineTenant(req: Request, authContext?: AuthContext): TenantConfig | undefined {
  // Check for explicit tenant header
  const tenantHeader = getHeader(req, 'x-tenant-id');
  if (tenantHeader) {
    return getTenant(tenantHeader);
  }

  // Use tenant from auth context
  if (authContext?.tenantId) {
    return getTenant(authContext.tenantId);
  }

  return undefined;
}

/**
 * Try all authentication methods and return the first successful one
 */
async function authenticateRequest(req: Request): Promise<AuthContext | null> {
  // 1. Try API key authentication
  const apiKey = extractApiKey(req);
  if (apiKey) {
    // Try to find tenant by API key
    const tenants = listTenants();
    const result = findTenantForApiKey(apiKey, tenants);
    if (result) {
      return result.context;
    }

    // If tenant header is provided, try that specific tenant
    const tenantHeader = getHeader(req, 'x-tenant-id');
    if (tenantHeader) {
      const tenant = getTenant(tenantHeader);
      if (tenant) {
        const validation = validateApiKey(apiKey, tenant);
        if (validation.valid && validation.context) {
          return validation.context;
        }
      }
    }

    // API key provided but invalid
    throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
  }

  // 2. Try Bearer token (JWT, OAuth, or OIDC)
  const token = extractBearerToken(req);
  if (token) {
    // Determine which tenant to use
      const tenantHeader = getHeader(req, 'x-tenant-id');

    if (tenantHeader) {
      // Specific tenant requested
      const tenant = getTenant(tenantHeader);
      if (!tenant) {
        throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
      }

      // Try JWT first
      if (tenant.auth?.jwt) {
        const result = await validateJwt(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }

      // Try OAuth introspection
      if (tenant.auth?.oauth?.introspectionUrl) {
        const result = await introspectToken(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }

      // Try OIDC
      if (tenant.auth?.oidc) {
        const result = await validateOidcIdToken(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }

      throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
    } else {
      // No tenant specified - try all tenants
      const tenants = listTenants();

      // Try JWT for all tenants with JWT config
      for (const tenant of tenants) {
        if (tenant.auth?.jwt) {
          const result = await validateJwt(token, tenant);
          if (result.valid && result.context) {
            return result.context;
          }
        }
      }

      // Try OIDC for all tenants with OIDC config
      for (const tenant of tenants) {
        if (tenant.auth?.oidc) {
          const result = await validateOidcIdToken(token, tenant);
          if (result.valid && result.context) {
            return result.context;
          }
        }
      }

      // Note: OAuth introspection is skipped in multi-tenant mode
      // because it requires per-tenant client credentials

      throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
    }
  }

  // No credentials provided
  return null;
}

/**
 * Authentication middleware
 * Extracts and validates credentials, attaches auth context to request
 */
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authContext = await authenticateRequest(req);

      if (authContext) {
        // Attach auth context to request
        req.authContext = authContext;

        // Verify tenant exists and is loaded
        const tenant = determineTenant(req, authContext);
        if (!tenant) {
          throw new AuthenticationError(
            `Tenant '${authContext.tenantId}' not found`,
            'TENANT_NOT_FOUND',
            401,
          );
        }
      } else {
        // No credentials provided
        throw new AuthenticationError(
          'Authentication failed',
          'AUTH_REQUIRED',
        );
      }

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        options.onFailure?.(error, req);
        res.status(error.statusCode).json({
          error: {
            code: -32001,
            message: error.message,
            data: {
              code: error.code,
            },
          },
        });
        return;
      }

      logger.error({ err: error }, '[AuthMiddleware] Unexpected error');
      res.status(500).json({
        error: {
          code: -32603,
          message: 'Internal authentication error',
        },
      });
    }
  };
}

/**
 * Optional auth middleware - doesn't fail if auth is missing
 * Useful for endpoints that work differently for authenticated vs anonymous users
 */
export function optionalAuthMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authContext = await authenticateRequest(req);
      if (authContext) {
        req.authContext = authContext;
      }
    } catch (error) {
      if (!(error instanceof AuthenticationError)) {
        logger.error({ err: error }, '[OptionalAuth] Unexpected error');
      }
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
