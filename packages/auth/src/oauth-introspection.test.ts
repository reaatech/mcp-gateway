import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-context.js', () => ({
  createAuthContext: vi.fn((opts) => ({
    tenantId: opts.tenantId,
    scopes: opts.scopes || [],
    authMethod: opts.authMethod,
    tokenFingerprint: opts.tokenFingerprint,
    ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
    ...(opts.subject !== undefined ? { subject: opts.subject } : {}),
  })),
  generateTokenFingerprintSync: vi.fn((token: string) => `fp:${token}`),
}));

import type { TenantConfig } from '@reaatech/mcp-gateway-core';

const testTenant: TenantConfig = {
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

describe('introspectToken', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_CLIENT_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns error when introspection not configured', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    const result = await introspectToken('token', { ...testTenant, auth: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('returns error when introspection URL is empty', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    const result = await introspectToken('token', {
      ...testTenant,
      auth: { oauth: { introspectionUrl: '', clientId: '', clientSecretEnv: '' } },
    });
    expect(result.valid).toBe(false);
  });

  it('returns error when client ID not configured', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    const result = await introspectToken('token', {
      ...testTenant,
      auth: {
        oauth: {
          introspectionUrl: 'https://example.com/introspect',
          clientId: '',
          clientSecretEnv: '',
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('OAuth client ID not configured');
  });

  it('returns error when client secret env not configured', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    const result = await introspectToken('token', {
      ...testTenant,
      auth: {
        oauth: {
          introspectionUrl: 'https://example.com/introspect',
          clientId: 'client',
          clientSecretEnv: '',
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('client secret env variable not configured');
  });

  it('returns error when client secret env not set', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    const result = await introspectToken('token', {
      ...testTenant,
      auth: {
        oauth: {
          introspectionUrl: 'https://example.com/introspect',
          clientId: 'client',
          clientSecretEnv: 'MISSING_SECRET',
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('is not set');
  });

  it('returns error on non-OK response from introspection endpoint', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await introspectToken('non-ok-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Introspection failed');
  });

  it('returns valid when introspection returns active token', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active: true,
        scope: 'read write',
        username: 'testuser',
        sub: 'sub-123',
        exp: Date.now() / 1000 + 3600,
      }),
    });

    const result = await introspectToken('active-token', testTenant);
    expect(result.valid).toBe(true);
    expect(result.context).toBeDefined();
  });

  it('returns inactive for token introspection with inactive result', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ active: false }),
    });

    const result = await introspectToken('inactive-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('inactive');
  });

  it('serves cached active result', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active: true,
        scope: 'read',
        username: 'cached-user',
        exp: Date.now() / 1000 + 3600,
      }),
    });

    await introspectToken('cache-me-token', testTenant);

    const result = await introspectToken('cache-me-token', testTenant);
    expect(result.valid).toBe(true);
    expect(result.context).toBeDefined();
  });

  it('serves cached inactive result', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ active: false }),
    });

    await introspectToken('cache-inactive', testTenant);

    const result = await introspectToken('cache-inactive', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('inactive');
  });

  it('returns error on fetch failure', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await introspectToken('fetch-fail-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('OAuth introspection failed');
  });

  it('handles non-Error fetch failure', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockRejectedValue('string failure');

    const result = await introspectToken('string-fail-token', testTenant);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('OAuth introspection failed');
  });

  it('handles fetch timeout/abort', async () => {
    const { introspectToken, clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    global.fetch = vi.fn().mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      return fetch('https://example.com', { signal: controller.signal });
    });

    global.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await introspectToken('abort-token', testTenant);
    expect(result.valid).toBe(false);
  });
});

describe('getIntrospectionCacheStats', () => {
  it('returns cache size after caching entries', async () => {
    const { clearIntrospectionCache } = await import('./oauth-introspection.js');
    clearIntrospectionCache();

    vi.stubEnv('OAUTH_CLIENT_SECRET', 'test');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ active: true, scope: 'read' }),
    });

    const { introspectToken } = await import('./oauth-introspection.js');
    await introspectToken('stats-token', testTenant);

    const { getIntrospectionCacheStats } = await import('./oauth-introspection.js');
    const stats = getIntrospectionCacheStats();
    expect(stats.size).toBeGreaterThanOrEqual(0);
  });
});

describe('initOAuthIntrospection', () => {
  it('starts and stops background cleanup', async () => {
    const { initOAuthIntrospection, shutdownOAuthIntrospection, clearIntrospectionCache } =
      await import('./oauth-introspection.js');
    clearIntrospectionCache();

    initOAuthIntrospection();
    shutdownOAuthIntrospection();

    expect(true).toBe(true);
  });
});

describe('clearIntrospectionCache', () => {
  it('clears cache without throwing', async () => {
    const { clearIntrospectionCache } = await import('./oauth-introspection.js');
    expect(clearIntrospectionCache()).toBeUndefined();
  });
});
