/**
 * mcp-gateway — OAuth2 Token Introspection
 * RFC 7662 compliant token introspection
 */

import type { TenantConfig } from '@reaatech/mcp-gateway-core';
import type { AuthContext } from './auth-context.js';
import { createAuthContext, generateTokenFingerprintSync } from './auth-context.js';

/**
 * OAuth2 introspection result
 */
export interface IntrospectionResult {
  valid: boolean;
  context?: AuthContext;
  error?: string;
}

/**
 * In-memory cache for introspection results
 * Key: token fingerprint, Value: { active, expiresAt, context }
 */
const introspectionCache = new Map<
  string,
  { active: boolean; expiresAt: number; context?: AuthContext }
>();

/**
 * Maximum cache size to prevent memory exhaustion
 */
const MAX_CACHE_SIZE = 10000;

/**
 * Default cache TTL (seconds)
 */
const DEFAULT_CACHE_TTL_SECONDS = 300;

/**
 * Background cleanup interval (ms) - cleans expired entries periodically
 */
const CLEANUP_INTERVAL_MS = 60000;

/**
 * Background cleanup interval handle
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start background cleanup of expired cache entries
 */
function startBackgroundCleanup(): void {
  if (cleanupInterval) {
    return;
  }
  cleanupInterval = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL_MS);
  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    (cleanupInterval as ReturnType<typeof setInterval> & { unref(): void }).unref();
  }
}

/**
 * Stop background cleanup
 */
function stopBackgroundCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Clean up expired entries from cache
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of introspectionCache.entries()) {
    if (now >= value.expiresAt) {
      introspectionCache.delete(key);
    }
  }
}

/**
 * Introspect an OAuth2 token using RFC 7662
 */
export async function introspectToken(
  token: string,
  tenantConfig: TenantConfig,
): Promise<IntrospectionResult> {
  const oauthConfig = tenantConfig.auth?.oauth;
  if (!oauthConfig?.introspectionUrl) {
    return { valid: false, error: 'OAuth introspection not configured for tenant' };
  }

  // Check cache first
  const tokenFingerprint = generateTokenFingerprintSync(token);
  const cached = introspectionCache.get(tokenFingerprint);
  if (cached && Date.now() < cached.expiresAt) {
    if (cached.active && cached.context) {
      return { valid: true, context: cached.context };
    }
    return { valid: false, error: 'Token is inactive (cached)' };
  }

  try {
    // Build introspection request
    const body = new URLSearchParams();
    body.append('token', token);
    body.append('token_type_hint', oauthConfig.tokenTypeHint ?? 'access_token');

    // Get client credentials
    const clientId = oauthConfig.clientId;
    const clientSecretEnv = oauthConfig.clientSecretEnv;
    if (!clientId) {
      return { valid: false, error: 'OAuth client ID not configured' };
    }
    if (!clientSecretEnv) {
      return { valid: false, error: 'OAuth client secret env variable not configured' };
    }
    const clientSecret = process.env[clientSecretEnv];
    if (!clientSecret) {
      return {
        valid: false,
        error: `OAuth client secret env variable '${clientSecretEnv}' is not set`,
      };
    }

    // Make introspection request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(oauthConfig.introspectionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        error: `Introspection failed: ${response.status} ${response.statusText}`,
      };
    }

    const result = (await response.json()) as IntrospectionResponse;

    if (!result.active) {
      // Cache inactive result
      const cacheTtl = (oauthConfig.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS) * 1000;
      ensureCacheCapacity();
      introspectionCache.set(tokenFingerprint, {
        active: false,
        expiresAt: Date.now() + cacheTtl,
      });
      return { valid: false, error: 'Token is inactive' };
    }

    // Build auth context from introspection result
    const scopes = result.scope ? result.scope.split(' ').filter(Boolean) : [];
    const context = createAuthContext({
      tenantId: tenantConfig.tenantId,
      scopes,
      authMethod: 'oauth',
      tokenFingerprint: tokenFingerprint,
    });
    if (result.exp) {
      context.expiresAt = result.exp * 1000;
    }
    const userId = result.username || result.sub;
    if (userId) {
      context.userId = userId;
    }
    if (result.sub) {
      context.subject = result.sub;
    }

    // Cache active result
    const cacheTtl = (oauthConfig.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS) * 1000;
    ensureCacheCapacity();
    introspectionCache.set(tokenFingerprint, {
      active: true,
      expiresAt: Date.now() + cacheTtl,
      context,
    });

    return { valid: true, context };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown introspection error';
    return { valid: false, error: `OAuth introspection failed: ${errorMessage}` };
  }
}

/**
 * OAuth2 introspection response (RFC 7662)
 */
interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  jti?: string;
}

function ensureCacheCapacity(): void {
  if (introspectionCache.size >= MAX_CACHE_SIZE) {
    evictOldestEntries(Math.floor(MAX_CACHE_SIZE * 0.1));
  }
}
function evictOldestEntries(count: number): void {
  const entries = Array.from(introspectionCache.entries());
  // Sort by expiresAt (oldest first)
  entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  // Remove oldest entries
  const toRemove = entries.slice(0, Math.min(count, entries.length));
  for (const [key] of toRemove) {
    introspectionCache.delete(key);
  }
}

/**
 * Clear the introspection cache (for testing or hot-reload)
 */
export function clearIntrospectionCache(): void {
  introspectionCache.clear();
}

/**
 * Get cache statistics
 */
export function getIntrospectionCacheStats(): { size: number } {
  cleanupExpiredEntries();
  return { size: introspectionCache.size };
}

/**
 * Initialize OAuth introspection - starts background cleanup
 * Call this during application startup
 */
export function initOAuthIntrospection(): void {
  startBackgroundCleanup();
}

/**
 * Shutdown OAuth introspection - stops background cleanup
 * Call this during application shutdown
 */
export function shutdownOAuthIntrospection(): void {
  stopBackgroundCleanup();
}
