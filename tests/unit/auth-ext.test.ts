/**
 * mcp-gateway — Auth Tests (OAuth, OIDC, API Key)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TenantConfig } from '../../src/types/schemas.js';

const TEST_TENANT_OAUTH: TenantConfig = {
  tenantId: 'oauth-tenant',
  displayName: 'OAuth Tenant',
  auth: {
    oauth: {
      introspectionUrl: 'https://auth.example.com/introspect',
      clientId: 'test-client',
      clientSecretEnv: 'OAUTH_CLIENT_SECRET',
      tokenTypeHint: 'access_token',
      cacheTtlSeconds: 300,
    },
  },
  rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000 },
  cache: { enabled: false, ttlSeconds: 0 },
  allowlist: { mode: 'allow', tools: ['test_tool'] },
  upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0 }],
};

const TEST_TENANT_OIDC: TenantConfig = {
  tenantId: 'oidc-tenant',
  displayName: 'OIDC Tenant',
  auth: {
    oidc: {
      issuer: 'https://auth.example.com',
      audience: 'mcp-gateway',
      jwksUri: 'https://auth.example.com/.well-known/jwks.json',
      requireAtHash: false,
      clockSkewSeconds: 60,
    },
  },
  rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000 },
  cache: { enabled: false, ttlSeconds: 0 },
  allowlist: { mode: 'allow', tools: ['test_tool'] },
  upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0 }],
};

describe('oauth-introspection', () => {
  let processEnvBackup: string | undefined;

  beforeEach(() => {
    processEnvBackup = process.env.OAUTH_CLIENT_SECRET;
    process.env.OAUTH_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    if (processEnvBackup !== undefined) {
      process.env.OAUTH_CLIENT_SECRET = processEnvBackup;
    } else {
      delete process.env.OAUTH_CLIENT_SECRET;
    }
  });

  it('returns error when introspection not configured', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('../../src/auth/oauth-introspection.js');
    clearIntrospectionCache();

    const tenantWithoutOAuth: TenantConfig = {
      ...TEST_TENANT_OAUTH,
      auth: { apiKeys: [] },
    };

    const result = await introspectToken('some-token', tenantWithoutOAuth);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('returns error when client credentials missing', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('../../src/auth/oauth-introspection.js');
    clearIntrospectionCache();
    delete process.env.OAUTH_CLIENT_SECRET;

    const result = await introspectToken('some-token', TEST_TENANT_OAUTH);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("env variable 'OAUTH_CLIENT_SECRET' is not set");
  });

  it('returns error when introspection URL not set', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('../../src/auth/oauth-introspection.js');
    clearIntrospectionCache();

    const tenantWithoutUrl: TenantConfig = {
      ...TEST_TENANT_OAUTH,
      auth: { oauth: { introspectionUrl: '', clientId: 'test', clientSecretEnv: 'OAUTH_CLIENT_SECRET' } },
    };

    const result = await introspectToken('some-token', tenantWithoutUrl);
    expect(result.valid).toBe(false);
  });

  it('clearIntrospectionCache does not throw', async () => {
    const { clearIntrospectionCache } = await import('../../src/auth/oauth-introspection.js');
    expect(clearIntrospectionCache()).toBeUndefined();
  });

  it('getIntrospectionCacheStats returns size', async () => {
    const { getIntrospectionCacheStats, clearIntrospectionCache } = await import('../../src/auth/oauth-introspection.js');
    clearIntrospectionCache();
    const stats = getIntrospectionCacheStats();
    expect(stats.size).toBe(0);
  });
});

describe('oidc-validator', () => {
  it('returns error when OIDC not configured', async () => {
    const { validateOidcIdToken } = await import('../../src/auth/oidc-validator.js');

    const tenantWithoutOIDC: TenantConfig = {
      ...TEST_TENANT_OIDC,
      auth: { apiKeys: [] },
    };

    const result = await validateOidcIdToken('some-token', tenantWithoutOIDC);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('extractUserInfoFromIdToken returns null for invalid token', async () => {
    const { extractUserInfoFromIdToken } = await import('../../src/auth/oidc-validator.js');

    const result = extractUserInfoFromIdToken('not-a-valid-jwt');
    expect(result).toBeNull();
  });

  it('extractUserInfoFromIdToken returns null for malformed JWT', async () => {
    const { extractUserInfoFromIdToken } = await import('../../src/auth/oidc-validator.js');

    const result = extractUserInfoFromIdToken('part1.part2');
    expect(result).toBeNull();
  });

  it('validateNonce returns true when no expected nonce', async () => {
    const { validateNonce } = await import('../../src/auth/oidc-validator.js');

    const result = validateNonce({ nonce: 'test-nonce' }, '');
    expect(result).toBe(true);
  });

  it('validateNonce returns true when nonce matches', async () => {
    const { validateNonce } = await import('../../src/auth/oidc-validator.js');

    const result = validateNonce({ nonce: 'expected-nonce' }, 'expected-nonce');
    expect(result).toBe(true);
  });

  it('validateNonce returns false when nonce does not match', async () => {
    const { validateNonce } = await import('../../src/auth/oidc-validator.js');

    const result = validateNonce({ nonce: 'wrong-nonce' }, 'expected-nonce');
    expect(result).toBe(false);
  });
});

describe('api-key-validator', () => {
  it('produces consistent hashes', async () => {
    const { hashApiKey } = await import('../../src/auth/api-key-validator.js');
    const hash1 = hashApiKey('test-key');
    const hash2 = hashApiKey('test-key');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 produces 64 hex characters
  });

  it('produces different hashes for different keys', async () => {
    const { hashApiKey } = await import('../../src/auth/api-key-validator.js');
    const hash1 = hashApiKey('key1');
    const hash2 = hashApiKey('key2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('auth-context', () => {
  it('createAuthContext creates context with required fields', async () => {
    const { createAuthContext } = await import('../../src/auth/auth-context.js');

    const context = createAuthContext({
      tenantId: 'test-tenant',
      scopes: ['tools:*'],
      authMethod: 'api-key',
    });

    expect(context.tenantId).toBe('test-tenant');
    expect(context.scopes).toContain('tools:*');
    expect(context.authMethod).toBe('api-key');
  });

  it('createAuthContext handles optional fields', async () => {
    const { createAuthContext } = await import('../../src/auth/auth-context.js');

    const context = createAuthContext({
      tenantId: 'test-tenant',
      scopes: [],
      authMethod: 'jwt',
      userId: 'user-123',
    });

    expect(context.userId).toBe('user-123');
  });

  it('generateTokenFingerprintSync produces consistent fingerprints', async () => {
    const { generateTokenFingerprintSync } = await import('../../src/auth/auth-context.js');

    const fp1 = generateTokenFingerprintSync('test-token');
    const fp2 = generateTokenFingerprintSync('test-token');

    expect(fp1).toBe(fp2);
    expect(fp1.length).toBeGreaterThan(0);
  });

  it('generateTokenFingerprintSync produces different fingerprints for different tokens', async () => {
    const { generateTokenFingerprintSync } = await import('../../src/auth/auth-context.js');

    const fp1 = generateTokenFingerprintSync('token1');
    const fp2 = generateTokenFingerprintSync('token2');

    expect(fp1).not.toBe(fp2);
  });
});