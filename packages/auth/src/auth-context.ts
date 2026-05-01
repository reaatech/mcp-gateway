/**
 * mcp-gateway — Authentication Context
 * Types and utilities for authentication context propagation
 */

import crypto from 'node:crypto';

/**
 * Authentication method used
 */
export type AuthMethod = 'api-key' | 'jwt' | 'oauth' | 'oidc';

/**
 * Authentication context attached to each request
 */
export interface AuthContext {
  /** Tenant identifier extracted from auth */
  tenantId: string;

  /** User identifier (if available from auth) */
  userId?: string;

  /** Scopes/permissions granted by auth */
  scopes: string[];

  /** Authentication method used */
  authMethod: AuthMethod;

  /** API key name (if api-key auth) */
  keyName?: string;

  /** Token subject (if JWT/OIDC) */
  subject?: string;

  /** Token issuer (if JWT/OIDC) */
  issuer?: string;

  /** Token expiration timestamp (ms since epoch) */
  expiresAt?: number;

  /** Raw token fingerprint (hashed, for audit) */
  tokenFingerprint?: string;
}

/**
 * Create a minimal auth context (for testing or internal use)
 */
export function createAuthContext(
  options: Partial<AuthContext> & { tenantId: string },
): AuthContext {
  const ctx: AuthContext = {
    tenantId: options.tenantId,
    scopes: options.scopes || [],
    authMethod: options.authMethod || 'api-key',
  };

  if (options.userId !== undefined) {
    ctx.userId = options.userId;
  }
  if (options.keyName !== undefined) {
    ctx.keyName = options.keyName;
  }
  if (options.subject !== undefined) {
    ctx.subject = options.subject;
  }
  if (options.issuer !== undefined) {
    ctx.issuer = options.issuer;
  }
  if (options.expiresAt !== undefined) {
    ctx.expiresAt = options.expiresAt;
  }
  if (options.tokenFingerprint !== undefined) {
    ctx.tokenFingerprint = options.tokenFingerprint;
  }

  return ctx;
}

/**
 * Check if auth context has a specific scope
 */
export function hasScope(context: AuthContext, scope: string): boolean {
  // Wildcard scope grants all access
  if (context.scopes.includes('*')) {
    return true;
  }

  for (const grantedScope of context.scopes) {
    if (grantedScope === scope) {
      return true;
    }
    if (grantedScope.endsWith('*')) {
      const prefix = grantedScope.slice(0, -1);
      if (scope.startsWith(prefix)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if auth context has any of the specified scopes
 */
export function hasAnyScope(context: AuthContext, scopes: string[]): boolean {
  return scopes.some((scope) => hasScope(context, scope));
}

/**
 * Check if auth context has all of the specified scopes
 */
export function hasAllScopes(context: AuthContext, scopes: string[]): boolean {
  return scopes.every((scope) => hasScope(context, scope));
}

/**
 * Get a redacted version of auth context for logging (no sensitive data)
 */
export function getRedactedAuthContext(context: AuthContext): Record<string, unknown> {
  return {
    tenantId: context.tenantId,
    userId: context.userId ? redactValue(context.userId) : undefined,
    scopes: context.scopes,
    authMethod: context.authMethod,
    keyName: context.keyName,
    subject: context.subject ? redactValue(context.subject) : undefined,
    issuer: context.issuer,
    expiresAt: context.expiresAt,
    tokenFingerprint: context.tokenFingerprint,
  };
}

/**
 * Redact a value for logging (show first and last 4 chars)
 */
function redactValue(value: string): string {
  if (value.length <= 8) {
    return '***';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Generate a fingerprint for a token (SHA-256 hash, truncated)
 */
export function generateTokenFingerprint(token: string): string {
  return generateTokenFingerprintSync(token);
}

export function generateTokenFingerprintSync(token: string): string {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return `sha256:${hash.slice(0, 24)}`;
}
