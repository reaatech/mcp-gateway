/**
 * mcp-gateway — Auth Module Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  hashApiKey,
  validateApiKey,
  createAuthContext,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  getRedactedAuthContext,
  generateTokenFingerprintSync,
  decodeJwtUnsafe,
  isJwtExpired,
} from '../../src/auth/index.js';
import type { TenantConfig } from '../../src/types/schemas.js';

describe('auth-context', () => {
  describe('createAuthContext', () => {
    it('creates context with required fields', () => {
      const ctx = createAuthContext({ tenantId: 'test-tenant' });
      expect(ctx.tenantId).toBe('test-tenant');
      expect(ctx.scopes).toEqual([]);
      expect(ctx.authMethod).toBe('api-key');
    });

    it('creates context with custom fields', () => {
      const ctx = createAuthContext({
        tenantId: 'test-tenant',
        userId: 'user-123',
        scopes: ['tools:*', 'admin'],
        authMethod: 'jwt',
        subject: 'sub-456',
      });
      expect(ctx.tenantId).toBe('test-tenant');
      expect(ctx.userId).toBe('user-123');
      expect(ctx.scopes).toEqual(['tools:*', 'admin']);
      expect(ctx.authMethod).toBe('jwt');
      expect(ctx.subject).toBe('sub-456');
    });
  });

  describe('hasScope', () => {
    it('returns true for matching scope', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['read', 'write'] });
      expect(hasScope(ctx, 'read')).toBe(true);
      expect(hasScope(ctx, 'write')).toBe(true);
    });

    it('returns false for non-matching scope', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['read'] });
      expect(hasScope(ctx, 'write')).toBe(false);
    });

    it('returns true for wildcard scope', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['*'] });
      expect(hasScope(ctx, 'anything')).toBe(true);
    });

    it('returns true for tools:* scope', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['tools:*'] });
      expect(hasScope(ctx, 'tools:anything')).toBe(true);
      expect(hasScope(ctx, 'tools:glean_search')).toBe(true);
      expect(hasScope(ctx, 'admin:read')).toBe(false);
    });
  });

  describe('hasAnyScope', () => {
    it('returns true if any scope matches', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['read', 'write'] });
      expect(hasAnyScope(ctx, ['write', 'delete'])).toBe(true);
    });

    it('returns false if no scopes match', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['read'] });
      expect(hasAnyScope(ctx, ['write', 'delete'])).toBe(false);
    });
  });

  describe('hasAllScopes', () => {
    it('returns true if all scopes match', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['read', 'write', 'delete'] });
      expect(hasAllScopes(ctx, ['read', 'write'])).toBe(true);
    });

    it('returns false if any scope is missing', () => {
      const ctx = createAuthContext({ tenantId: 't', scopes: ['read'] });
      expect(hasAllScopes(ctx, ['read', 'write'])).toBe(false);
    });
  });

  describe('getRedactedAuthContext', () => {
    it('redacts sensitive fields', () => {
      const ctx = createAuthContext({
        tenantId: 'test-tenant',
        userId: 'very-long-user-id-12345',
        scopes: ['read'],
        subject: 'very-long-subject-id',
      });
      const redacted = getRedactedAuthContext(ctx);
      expect(redacted.tenantId).toBe('test-tenant');
      expect(redacted.userId).toBe('very...2345'); // first 4 + '...' + last 4
      expect(redacted.subject).toBe('very...t-id'); // first 4 + '...' + last 4
      expect(redacted.scopes).toEqual(['read']);
    });

    it('handles short values', () => {
      const ctx = createAuthContext({
        tenantId: 't',
        userId: 'short',
      });
      const redacted = getRedactedAuthContext(ctx);
      expect(redacted.userId).toBe('***');
    });
  });

  describe('generateTokenFingerprintSync', () => {
    it('generates consistent fingerprint', () => {
      const fp1 = generateTokenFingerprintSync('test-token');
      const fp2 = generateTokenFingerprintSync('test-token');
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^sha256:[a-f0-9]{24}$/);
    });

    it('generates different fingerprints for different tokens', () => {
      const fp1 = generateTokenFingerprintSync('token-1');
      const fp2 = generateTokenFingerprintSync('token-2');
      expect(fp1).not.toBe(fp2);
    });
  });
});

describe('api-key-validator', () => {
  describe('hashApiKey', () => {
    it('generates consistent hash', () => {
      const hash1 = hashApiKey('my-secret-key');
      const hash2 = hashApiKey('my-secret-key');
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different keys', () => {
      const hash1 = hashApiKey('key-1');
      const hash2 = hashApiKey('key-2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateApiKey', () => {
    const createTenantWithKey = (keyHash: string): TenantConfig => ({
      tenantId: 'test-tenant',
      displayName: 'Test Tenant',
      auth: {
        apiKeys: [
          {
            keyHash,
            name: 'test-key',
            scopes: ['tools:*'],
          },
        ],
      },
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerDay: 10000,
      },
      allowlist: {
        mode: 'allow',
        tools: ['*'],
      },
      cache: {
        enabled: false,
        ttlSeconds: 300,
      },
      upstreams: [
        {
          name: 'primary',
          url: 'https://mcp.example.com',
          weight: 1,
        },
      ],
    });

    it('validates correct API key', () => {
      const key = 'my-secret-api-key';
      const hash = hashApiKey(key);
      const tenant = createTenantWithKey(hash);

      const result = validateApiKey(key, tenant);
      expect(result.valid).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.tenantId).toBe('test-tenant');
      expect(result.context?.authMethod).toBe('api-key');
    });

    it('rejects invalid API key', () => {
      const hash = hashApiKey('correct-key');
      const tenant = createTenantWithKey(hash);

      const result = validateApiKey('wrong-key', tenant);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('rejects expired API key', () => {
      const key = 'expired-key';
      const hash = hashApiKey(key);
      const tenant: TenantConfig = {
        ...createTenantWithKey(hash),
        auth: {
          apiKeys: [
            {
              keyHash: hash,
              name: 'expired-key',
              scopes: ['tools:*'],
              expiresAt: Date.now() - 1000, // Expired 1 second ago
            },
          ],
        },
      };

      const result = validateApiKey(key, tenant);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API key has expired');
    });

    it('rejects when no API keys configured', () => {
      const tenant: TenantConfig = {
        tenantId: 'test-tenant',
        displayName: 'Test',
        auth: {},
        rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
        allowlist: { mode: 'allow', tools: ['*'] },
        cache: { enabled: false, ttlSeconds: 300 },
        upstreams: [{ name: 'primary', url: 'https://example.com', weight: 1 }],
      };

      const result = validateApiKey('any-key', tenant);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No API keys configured for tenant');
    });

    it('handles key_hash with sha256: prefix', () => {
      const key = 'test-key';
      const hash = hashApiKey(key);
      const tenant = createTenantWithKey(`sha256:${hash}`);

      const result = validateApiKey(key, tenant);
      expect(result.valid).toBe(true);
    });
  });
});

describe('jwt-validator', () => {
  describe('decodeJwtUnsafe', () => {
    it('decodes valid JWT structure', () => {
      // Create a fake JWT (not cryptographically valid, just structurally)
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ sub: 'user123', exp: 9999999999 })).toString('base64');
      const signature = 'fake-signature';
      const token = `${header}.${payload}.${signature}`;

      const decoded = decodeJwtUnsafe(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.header).toEqual({ alg: 'RS256', typ: 'JWT' });
      expect(decoded?.payload).toEqual({ sub: 'user123', exp: 9999999999 });
    });

    it('returns null for invalid JWT', () => {
      const decoded = decodeJwtUnsafe('not-a-jwt');
      expect(decoded).toBeNull();
    });

    it('returns null for JWT with wrong number of parts', () => {
      const decoded = decodeJwtUnsafe('only.two');
      expect(decoded).toBeNull();
    });
  });

  describe('isJwtExpired', () => {
    it('returns true for expired JWT', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ exp: 1000000000 })).toString('base64'); // Year 2001
      const token = `${header}.${payload}.sig`;

      expect(isJwtExpired(token)).toBe(true);
    });

    it('returns false for non-expired JWT', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64'); // Far future
      const token = `${header}.${payload}.sig`;

      expect(isJwtExpired(token)).toBe(false);
    });

    it('returns false for JWT without exp claim', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ sub: 'user' })).toString('base64');
      const token = `${header}.${payload}.sig`;

      expect(isJwtExpired(token)).toBe(false);
    });

    it('returns true for invalid JWT', () => {
      expect(isJwtExpired('invalid')).toBe(true);
    });
  });
});
