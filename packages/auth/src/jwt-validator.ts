/**
 * mcp-gateway — JWT Validator
 * Validates JWT tokens using RS256/ES256 signature verification
 */

import type { TenantConfig } from '@reaatech/mcp-gateway-core';
import type { AuthContext } from './auth-context.js';
import { createAuthContext, generateTokenFingerprintSync } from './auth-context.js';

export interface JwtValidationResult {
  valid: boolean;
  context?: AuthContext;
  error?: string;
}

const DEFAULT_CLOCK_SKEW_SECONDS = 60;

const jwksCache = new Map<string, Awaited<ReturnType<typeof import('jose').createRemoteJWKSet>>>();
let joseModule: typeof import('jose') | null = null;

async function getJose() {
  if (!joseModule) {
    joseModule = await import('jose');
  }
  return joseModule;
}

async function getJWKS(jwksUri: string) {
  const cached = jwksCache.get(jwksUri);
  if (cached !== undefined) {
    return cached;
  }
  const jose = await getJose();
  const jwks = jose.createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, jwks);
  return jwks;
}

export async function validateJwt(
  token: string,
  tenantConfig: TenantConfig,
): Promise<JwtValidationResult> {
  const jwtConfig = tenantConfig.auth?.jwt;
  if (!jwtConfig) {
    return { valid: false, error: 'JWT not configured for tenant' };
  }

  try {
    const jose = await getJose();
    const JWKS = await getJWKS(jwtConfig.jwksUri);

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      clockTolerance: jwtConfig.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS,
    });

    // Extract scopes from JWT claims
    const scopes = extractScopesFromPayload(payload);

    // Build auth context
    const context = createAuthContext({
      tenantId: tenantConfig.tenantId,
      scopes,
      authMethod: 'jwt',
      tokenFingerprint: generateTokenFingerprintSync(token),
    });
    if (payload.exp) {
      context.expiresAt = payload.exp * 1000;
    }
    if (payload.sub) {
      context.userId = payload.sub;
      context.subject = payload.sub;
    }
    if (payload.iss) {
      context.issuer = payload.iss as string;
    }

    return { valid: true, context };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown JWT validation error';
    return { valid: false, error: `JWT validation failed: ${errorMessage}` };
  }
}

/**
 * Extract scopes from JWT payload
 * Supports common scope claim formats:
 * - "scope": "read write" (space-separated string)
 * - "scope": ["read", "write"] (array)
 * - "scopes": ["read", "write"] (array)
 * - "scp": ["read", "write"] (Azure AD format)
 */
function extractScopesFromPayload(payload: Record<string, unknown>): string[] {
  // Try "scope" as string (space-separated)
  if (typeof payload.scope === 'string') {
    return payload.scope.split(' ').filter(Boolean);
  }

  // Try "scope" as array
  if (Array.isArray(payload.scope)) {
    return payload.scope.filter((s): s is string => typeof s === 'string');
  }

  // Try "scopes" as array
  if (Array.isArray(payload.scopes)) {
    return payload.scopes.filter((s): s is string => typeof s === 'string');
  }

  // Try "scp" as array (Azure AD)
  if (Array.isArray(payload.scp)) {
    return payload.scp.filter((s): s is string => typeof s === 'string');
  }

  // Default: no scopes
  return [];
}

/**
 * Decode a JWT without verification (for debugging only)
 * WARNING: Do not trust the contents of an unverified JWT
 */
export function decodeJwtUnsafe(token: string): { header: unknown; payload: unknown } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const header = JSON.parse(Buffer.from(parts[0] as string, 'base64url').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf-8'));

    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Check if a JWT is expired (without full verification)
 */
export function isJwtExpired(token: string): boolean {
  const decoded = decodeJwtUnsafe(token);
  if (!decoded || !decoded.payload) {
    return true; // Treat invalid tokens as expired
  }

  const payload = decoded.payload as Record<string, unknown>;
  const exp = payload.exp as number | undefined;
  if (!exp) {
    return false; // No expiration = not expired
  }

  return Date.now() > exp * 1000;
}
