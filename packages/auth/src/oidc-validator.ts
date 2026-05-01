/**
 * mcp-gateway — OIDC ID Token Validator
 * Validates OpenID Connect ID tokens
 */

import type { TenantConfig } from '@reaatech/mcp-gateway-core';
import type { AuthContext } from './auth-context.js';
import { createAuthContext, generateTokenFingerprintSync } from './auth-context.js';

export interface OidcValidationResult {
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

export async function validateOidcIdToken(
  token: string,
  tenantConfig: TenantConfig,
): Promise<OidcValidationResult> {
  const oidcConfig = tenantConfig.auth?.oidc;
  if (!oidcConfig) {
    return { valid: false, error: 'OIDC not configured for tenant' };
  }

  try {
    const jose = await getJose();
    const JWKS = await getJWKS(oidcConfig.jwksUri);

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: oidcConfig.issuer,
      audience: oidcConfig.audience,
      clockTolerance: oidcConfig.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS,
    });

    // Validate required OIDC claims
    if (!payload.sub) {
      return { valid: false, error: 'Missing required OIDC claim: sub' };
    }

    if (!payload.iat) {
      return { valid: false, error: 'Missing required OIDC claim: iat' };
    }

    if (oidcConfig.requireAtHash) {
      if (!payload.at_hash) {
        return { valid: false, error: 'Missing required at_hash claim' };
      }
    }

    // Extract scopes from ID token
    const scopes = extractScopesFromIdToken(payload);

    // Build auth context
    const context = createAuthContext({
      tenantId: tenantConfig.tenantId,
      scopes,
      authMethod: 'oidc',
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown OIDC validation error';
    return { valid: false, error: `OIDC validation failed: ${errorMessage}` };
  }
}

/**
 * Extract scopes from OIDC ID token
 * ID tokens typically don't contain scopes, but some providers include them
 */
function extractScopesFromIdToken(payload: Record<string, unknown>): string[] {
  // OIDC ID tokens may contain scope claim
  if (typeof payload.scope === 'string') {
    return payload.scope.split(' ').filter(Boolean);
  }

  if (Array.isArray(payload.scope)) {
    return payload.scope.filter((s): s is string => typeof s === 'string');
  }

  // Default scopes for ID token
  return ['openid'];
}

/**
 * Validate OIDC nonce (prevent replay attacks)
 * The nonce should be stored in the session and compared here
 */
export function validateNonce(payload: Record<string, unknown>, expectedNonce: string): boolean {
  if (!expectedNonce) {
    return true; // No nonce validation if not provided
  }

  return payload.nonce === expectedNonce;
}

/**
 * Extract user info from OIDC ID token (standard claims)
 */
export function extractUserInfoFromIdToken(token: string): {
  sub: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  picture?: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf-8'));

    const result: {
      sub: string;
      name?: string;
      email?: string;
      emailVerified?: boolean;
      picture?: string;
    } = {
      sub: payload.sub as string,
    };
    if (payload.name) {
      result.name = payload.name as string;
    }
    if (payload.email) {
      result.email = payload.email as string;
    }
    if (payload.email_verified !== undefined) {
      result.emailVerified = payload.email_verified as boolean;
    }
    if (payload.picture) {
      result.picture = payload.picture as string;
    }
    return result;
  } catch {
    return null;
  }
}
