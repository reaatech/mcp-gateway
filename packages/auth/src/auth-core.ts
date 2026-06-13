/**
 * mcp-gateway — Framework-Agnostic Authentication Core
 *
 * Holds the real authentication logic: inspect a normalized request context,
 * try every configured auth method, verify the tenant exists, and return an
 * allow/deny {@link GatewayDecision}. Express and Fastify adapters are thin
 * wrappers over {@link evaluateAuth}.
 */

import type {
  GatewayDecision,
  GatewayRequestContext,
  TenantConfig,
} from '@reaatech/mcp-gateway-core';
import { getTenant, listTenants, logger } from '@reaatech/mcp-gateway-core';
import { findTenantForApiKey, validateApiKey } from './api-key-validator.js';
import type { AuthContext } from './auth-context.js';
import { validateJwt } from './jwt-validator.js';
import { introspectToken } from './oauth-introspection.js';
import { validateOidcIdToken } from './oidc-validator.js';

/**
 * Authentication error with specific code.
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

/**
 * Decision returned by {@link evaluateAuth}. Extends the generic gateway
 * decision with the resolved (rich) auth context on allow and the original
 * {@link AuthenticationError} on deny (so adapters can invoke `onFailure`).
 */
export type AuthDecision = GatewayDecision & {
  authContext?: AuthContext;
  error?: AuthenticationError;
};

function extractApiKey(ctx: GatewayRequestContext): string | undefined {
  return ctx.getHeader('x-api-key');
}

function extractBearerToken(ctx: GatewayRequestContext): string | undefined {
  const authHeader = ctx.getHeader('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  return authHeader.slice(7);
}

/**
 * Determine tenant from the request context.
 * Priority: x-tenant-id header > tenant extracted from auth context.
 */
function determineTenant(
  ctx: GatewayRequestContext,
  authContext?: AuthContext,
): TenantConfig | undefined {
  const tenantHeader = ctx.getHeader('x-tenant-id');
  if (tenantHeader) {
    return getTenant(tenantHeader);
  }
  if (authContext?.tenantId) {
    return getTenant(authContext.tenantId);
  }
  return undefined;
}

/**
 * Try all authentication methods and return the first successful one.
 * Returns `null` when no credentials are present; throws
 * {@link AuthenticationError} when credentials are present but invalid.
 */
export async function authenticateRequest(ctx: GatewayRequestContext): Promise<AuthContext | null> {
  // 1. Try API key authentication
  const apiKey = extractApiKey(ctx);
  if (apiKey) {
    const tenants = listTenants();
    const result = findTenantForApiKey(apiKey, tenants);
    if (result) {
      return result.context;
    }

    const tenantHeader = ctx.getHeader('x-tenant-id');
    if (tenantHeader) {
      const tenant = getTenant(tenantHeader);
      if (tenant) {
        const validation = validateApiKey(apiKey, tenant);
        if (validation.valid && validation.context) {
          return validation.context;
        }
      }
    }

    throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
  }

  // 2. Try Bearer token (JWT, OAuth, or OIDC)
  const token = extractBearerToken(ctx);
  if (token) {
    const tenantHeader = ctx.getHeader('x-tenant-id');

    if (tenantHeader) {
      const tenant = getTenant(tenantHeader);
      if (!tenant) {
        throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
      }

      if (tenant.auth?.jwt) {
        const result = await validateJwt(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }

      if (tenant.auth?.oauth?.introspectionUrl) {
        const result = await introspectToken(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }

      if (tenant.auth?.oidc) {
        const result = await validateOidcIdToken(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }

      throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
    }

    // No tenant specified - try all tenants
    const tenants = listTenants();

    for (const tenant of tenants) {
      if (tenant.auth?.jwt) {
        const result = await validateJwt(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }
    }

    for (const tenant of tenants) {
      if (tenant.auth?.oidc) {
        const result = await validateOidcIdToken(token, tenant);
        if (result.valid && result.context) {
          return result.context;
        }
      }
    }

    // Note: OAuth introspection is skipped in multi-tenant mode
    // because it requires per-tenant client credentials.
    throw new AuthenticationError('Authentication failed', 'AUTH_FAILED');
  }

  // No credentials provided
  return null;
}

/**
 * Build the JSON-RPC error body returned for a denied request.
 */
function authErrorBody(error: AuthenticationError): unknown {
  return {
    error: {
      code: -32001,
      message: error.message,
      data: { code: error.code },
    },
  };
}

/**
 * Framework-agnostic authentication entry point.
 *
 * - `allow` with `authContext` / `annotations.authContext` when credentials
 *   resolve to a known tenant.
 * - `deny` (401) with the original {@link AuthenticationError} otherwise, or
 *   `deny` (500) on an unexpected error.
 */
export async function evaluateAuth(ctx: GatewayRequestContext): Promise<AuthDecision> {
  try {
    const authContext = await authenticateRequest(ctx);

    if (!authContext) {
      throw new AuthenticationError('Authentication failed', 'AUTH_REQUIRED');
    }

    const tenant = determineTenant(ctx, authContext);
    if (!tenant) {
      throw new AuthenticationError(
        `Tenant '${authContext.tenantId}' not found`,
        'TENANT_NOT_FOUND',
        401,
      );
    }

    return {
      action: 'allow',
      authContext,
      annotations: { authContext, tenantId: authContext.tenantId },
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return {
        action: 'deny',
        status: error.statusCode,
        body: authErrorBody(error),
        error,
      };
    }

    logger.error({ err: error }, '[AuthCore] Unexpected error');
    return {
      action: 'deny',
      status: 500,
      body: { error: { code: -32603, message: 'Internal authentication error' } },
    };
  }
}

/**
 * Optional authentication: resolve an auth context if credentials are present
 * and valid, swallowing auth failures. Returns `undefined` otherwise.
 */
export async function evaluateOptionalAuth(
  ctx: GatewayRequestContext,
): Promise<AuthContext | undefined> {
  try {
    const authContext = await authenticateRequest(ctx);
    return authContext ?? undefined;
  } catch (error) {
    if (!(error instanceof AuthenticationError)) {
      logger.error({ err: error }, '[AuthCore] Unexpected error (optional)');
    }
    return undefined;
  }
}
