import { describe, expect, it, vi } from 'vitest';

const mockJwtVerify = vi.fn();
const mockCreateRemoteJWKSet = vi.fn(() => 'mock-jwks');

vi.mock('jose', () => ({
  jwtVerify: mockJwtVerify,
  createRemoteJWKSet: mockCreateRemoteJWKSet,
}));

vi.mock('./auth-context.js', () => ({
  createAuthContext: vi.fn((opts) => ({
    tenantId: opts.tenantId,
    scopes: opts.scopes || [],
    authMethod: opts.authMethod,
    tokenFingerprint: opts.tokenFingerprint,
    ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
    ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
    ...(opts.subject !== undefined ? { subject: opts.subject } : {}),
    ...(opts.issuer !== undefined ? { issuer: opts.issuer } : {}),
  })),
  generateTokenFingerprintSync: vi.fn((token: string) => `fp:${token}`),
}));

import type { TenantConfig } from '@reaatech/mcp-gateway-core';

const testTenant: TenantConfig = {
  tenantId: 'test-tenant',
  displayName: 'Test Tenant',
  auth: {
    jwt: {
      issuer: 'https://auth.example.com',
      audience: 'mcp-gateway',
      jwksUri: 'https://auth.example.com/.well-known/jwks.json',
      clockSkewSeconds: 60,
    },
  },
  rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
  cache: { enabled: false, ttlSeconds: 300 },
  allowlist: { mode: 'allow', tools: ['*'] },
  upstreams: [{ name: 'primary', url: 'https://mcp.example.com', weight: 1 }],
};

describe('validateJwt', () => {
  it('returns error when JWT not configured for tenant', async () => {
    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('token', { ...testTenant, auth: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('validates JWT successfully and builds auth context', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-123',
        exp: Date.now() / 1000 + 3600,
        iss: 'https://auth.example.com',
        scope: 'read write',
      },
    });

    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('valid-token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('returns error when jwtVerify throws Error', async () => {
    mockJwtVerify.mockRejectedValue(new Error('invalid signature'));

    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('bad-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JWT validation failed');
  });

  it('handles non-Error thrown during validation', async () => {
    mockJwtVerify.mockRejectedValue('string error');

    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('bad-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JWT validation failed');
  });
});

describe('decodeJwtUnsafe', () => {
  it('decodes valid JWT structure', async () => {
    const { decodeJwtUnsafe } = await import('./jwt-validator.js');
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ sub: 'user123', exp: 9999999999 }));
    const token = `${header}.${payload}.sig`;

    const decoded = decodeJwtUnsafe(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decoded?.payload).toEqual({ sub: 'user123', exp: 9999999999 });
  });

  it('returns null for invalid JWT structure', async () => {
    const { decodeJwtUnsafe } = await import('./jwt-validator.js');
    expect(decodeJwtUnsafe('not-a-jwt')).toBeNull();
  });

  it('returns null for JWT with two parts', async () => {
    const { decodeJwtUnsafe } = await import('./jwt-validator.js');
    expect(decodeJwtUnsafe('only.two')).toBeNull();
  });

  it('returns null for malformed base64 payload', async () => {
    const { decodeJwtUnsafe } = await import('./jwt-validator.js');
    expect(decodeJwtUnsafe('header.not-valid-base64!!!.sig')).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('returns true for expired JWT', async () => {
    const { isJwtExpired } = await import('./jwt-validator.js');
    const header = btoa(JSON.stringify({ alg: 'RS256' }));
    const payload = btoa(JSON.stringify({ exp: 1000000000 }));
    expect(isJwtExpired(`${header}.${payload}.sig`)).toBe(true);
  });

  it('returns false for non-expired JWT', async () => {
    const { isJwtExpired } = await import('./jwt-validator.js');
    const header = btoa(JSON.stringify({ alg: 'RS256' }));
    const payload = btoa(JSON.stringify({ exp: 9999999999 }));
    expect(isJwtExpired(`${header}.${payload}.sig`)).toBe(false);
  });

  it('returns false for JWT without exp claim', async () => {
    const { isJwtExpired } = await import('./jwt-validator.js');
    const header = btoa(JSON.stringify({ alg: 'RS256' }));
    const payload = btoa(JSON.stringify({ sub: 'user' }));
    expect(isJwtExpired(`${header}.${payload}.sig`)).toBe(false);
  });

  it('returns true for invalid JWT', async () => {
    const { isJwtExpired } = await import('./jwt-validator.js');
    expect(isJwtExpired('invalid')).toBe(true);
  });
});

describe('extractScopesFromPayload', () => {
  it('extracts scopes from space-separated scope string', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', scope: 'read write admin' },
    });
    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('extracts scopes from scope array', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', scope: ['read', 'write'] },
    });
    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('extracts scopes from scopes array', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', scopes: ['admin', 'user'] },
    });
    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('extracts scopes from scp array (Azure AD)', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', scp: ['api:read', 'api:write'] },
    });
    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('returns empty array when no scope claims present', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user' },
    });
    const { validateJwt } = await import('./jwt-validator.js');
    const result = await validateJwt('token', testTenant);
    expect(result.valid).toBe(true);
  });
});
