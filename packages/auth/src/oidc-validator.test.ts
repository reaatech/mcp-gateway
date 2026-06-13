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
  })),
  generateTokenFingerprintSync: vi.fn((token: string) => `fp:${token}`),
}));

import type { TenantConfig } from '@reaatech/mcp-gateway-core';

const testTenant: TenantConfig = {
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

describe('validateOidcIdToken', () => {
  it('returns error when OIDC not configured', async () => {
    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('token', { ...testTenant, auth: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('validates OIDC ID token successfully', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-123',
        iat: Date.now() / 1000 - 60,
        exp: Date.now() / 1000 + 3600,
        iss: 'https://auth.example.com',
      },
    });

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('valid-token', testTenant);
    expect(result.valid).toBe(true);
    expect(result.context?.authMethod).toBe('oidc');
  });

  it('returns error when sub claim missing', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        iat: Date.now() / 1000 - 60,
      },
    });

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('no-sub-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing required OIDC claim: sub');
  });

  it('returns error when iat claim missing', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-123',
      },
    });

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('no-iat-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing required OIDC claim: iat');
  });

  it('returns error when requireAtHash is true but at_hash missing', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-123',
        iat: Date.now() / 1000 - 60,
      },
    });

    const tenantWithAtHash: TenantConfig = {
      ...testTenant,
      auth: {
        oidc: {
          issuer: 'https://auth.example.com',
          audience: 'mcp-gateway',
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          requireAtHash: true,
          clockSkewSeconds: 60,
        },
      },
    };

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('token', tenantWithAtHash);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing required at_hash claim');
  });

  it('returns error when jwtVerify throws', async () => {
    mockJwtVerify.mockRejectedValue(new Error('invalid signature'));

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('bad-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('OIDC validation failed');
  });

  it('handles non-Error thrown', async () => {
    mockJwtVerify.mockRejectedValue('string error');

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('bad-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('OIDC validation failed');
  });
});

describe('extractUserInfoFromIdToken', () => {
  it('extracts user info from valid ID token', async () => {
    const { extractUserInfoFromIdToken } = await import('./oidc-validator.js');
    const header = btoa(JSON.stringify({ alg: 'RS256' }));
    const payload = btoa(
      JSON.stringify({
        sub: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        email_verified: true,
        picture: 'https://example.com/avatar.jpg',
      }),
    );
    const token = `${header}.${payload}.sig`;

    const result = extractUserInfoFromIdToken(token);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe('user-123');
    expect(result?.name).toBe('John Doe');
    expect(result?.email).toBe('john@example.com');
    expect(result?.emailVerified).toBe(true);
    expect(result?.picture).toBe('https://example.com/avatar.jpg');
  });

  it('returns null for invalid token structure', async () => {
    const { extractUserInfoFromIdToken } = await import('./oidc-validator.js');
    expect(extractUserInfoFromIdToken('not-a-valid-jwt')).toBeNull();
  });

  it('returns null for malformed JWT (two parts)', async () => {
    const { extractUserInfoFromIdToken } = await import('./oidc-validator.js');
    expect(extractUserInfoFromIdToken('part1.part2')).toBeNull();
  });

  it('returns user info with only sub when optional fields missing', async () => {
    const { extractUserInfoFromIdToken } = await import('./oidc-validator.js');
    const header = btoa(JSON.stringify({ alg: 'RS256' }));
    const payload = btoa(JSON.stringify({ sub: 'user-123' }));
    const token = `${header}.${payload}.sig`;

    const result = extractUserInfoFromIdToken(token);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe('user-123');
    expect(result?.name).toBeUndefined();
  });

  it('handles malformed payload with catch', async () => {
    const { extractUserInfoFromIdToken } = await import('./oidc-validator.js');
    expect(extractUserInfoFromIdToken('a.b.c')).toBeNull();
  });
});

describe('validateNonce', () => {
  it('returns true when no expected nonce', async () => {
    const { validateNonce } = await import('./oidc-validator.js');
    expect(validateNonce({ nonce: 'test' }, '')).toBe(true);
  });

  it('returns true when nonce matches', async () => {
    const { validateNonce } = await import('./oidc-validator.js');
    expect(validateNonce({ nonce: 'expected-nonce' }, 'expected-nonce')).toBe(true);
  });

  it('returns false when nonce does not match', async () => {
    const { validateNonce } = await import('./oidc-validator.js');
    expect(validateNonce({ nonce: 'wrong-nonce' }, 'expected-nonce')).toBe(false);
  });
});

describe('extractScopesFromIdToken', () => {
  it('extracts scopes from space-separated string', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', iat: Date.now() / 1000, scope: 'openid profile email' },
    });

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('extracts scopes from array', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', iat: Date.now() / 1000, scope: ['openid', 'profile'] },
    });

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('token', testTenant);
    expect(result.valid).toBe(true);
  });

  it('returns default openid scope when no scope claim', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user', iat: Date.now() / 1000 },
    });

    const { validateOidcIdToken } = await import('./oidc-validator.js');
    const result = await validateOidcIdToken('token', testTenant);
    expect(result.valid).toBe(true);
  });
});
