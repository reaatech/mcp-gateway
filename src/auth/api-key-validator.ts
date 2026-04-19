/**
 * mcp-gateway — API Key Validator
 * Validates API keys using SHA-256 hash comparison
 */

import { createHash } from 'node:crypto';
import type { AuthContext } from './auth-context.js';
import { createAuthContext, generateTokenFingerprintSync } from './auth-context.js';
import type { TenantConfig } from '../types/schemas.js';

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  context?: AuthContext;
  error?: string;
}

/**
 * Validate an API key against a tenant's configured keys
 */
export function validateApiKey(
  key: string,
  tenantConfig: TenantConfig,
): ApiKeyValidationResult {
  if (!tenantConfig.auth?.apiKeys || tenantConfig.auth.apiKeys.length === 0) {
    return { valid: false, error: 'No API keys configured for tenant' };
  }

  const keyHash = hashApiKey(key);

  for (const apiKeyConfig of tenantConfig.auth.apiKeys) {
    // Extract hash from key_hash field (format: "sha256:<hex>" or just hex)
    const storedHash = apiKeyConfig.keyHash.startsWith('sha256:')
      ? apiKeyConfig.keyHash.slice(7)
      : apiKeyConfig.keyHash;

    if (constantTimeCompare(keyHash, storedHash)) {
      // Check expiration
      if (apiKeyConfig.expiresAt && Date.now() > apiKeyConfig.expiresAt) {
        return { valid: false, error: 'API key has expired' };
      }

      // Build auth context
      const scopes = apiKeyConfig.scopes || ['tools:*'];
      const context = createAuthContext({
        tenantId: tenantConfig.tenantId,
        scopes,
        authMethod: 'api-key',
        keyName: apiKeyConfig.name,
        tokenFingerprint: generateTokenFingerprintSync(key),
      });

      return { valid: true, context };
    }
  }

  return { valid: false, error: 'Invalid API key' };
}

/**
 * Find the tenant for an API key by checking all tenants
 */
export function findTenantForApiKey(
  key: string,
  tenants: TenantConfig[],
): { tenant: TenantConfig; context: AuthContext } | null {
  for (const tenant of tenants) {
    const result = validateApiKey(key, tenant);
    if (result.valid && result.context) {
      return { tenant, context: result.context };
    }
  }
  return null;
}

/**
 * Constant-time comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
