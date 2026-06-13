import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@reaatech/mcp-gateway-core', async (importOriginal) => ({
  ...(await importOriginal()),
  getTenant: vi.fn(),
  listTenants: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock('./api-key-validator.js', () => ({
  findTenantForApiKey: vi.fn(),
  validateApiKey: vi.fn(),
}));

vi.mock('./jwt-validator.js', () => ({
  validateJwt: vi.fn(),
}));

vi.mock('./oauth-introspection.js', () => ({
  introspectToken: vi.fn(),
}));

vi.mock('./oidc-validator.js', () => ({
  validateOidcIdToken: vi.fn(),
}));

import { getTenant, listTenants, logger } from '@reaatech/mcp-gateway-core';
import { findTenantForApiKey, validateApiKey } from './api-key-validator.js';
import { validateJwt } from './jwt-validator.js';
import { introspectToken } from './oauth-introspection.js';
import { validateOidcIdToken } from './oidc-validator.js';

const mockGetTenant = getTenant as ReturnType<typeof vi.fn>;
const mockListTenants = listTenants as ReturnType<typeof vi.fn>;
const mockLoggerError = logger.error as ReturnType<typeof vi.fn>;
const mockFindTenantForApiKey = findTenantForApiKey as ReturnType<typeof vi.fn>;
const mockValidateApiKey = validateApiKey as ReturnType<typeof vi.fn>;
const mockValidateJwt = validateJwt as ReturnType<typeof vi.fn>;
const mockIntrospectToken = introspectToken as ReturnType<typeof vi.fn>;
const mockValidateOidcIdToken = validateOidcIdToken as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetTenant.mockReset();
  mockListTenants.mockReset();
  mockLoggerError.mockReset();
  mockFindTenantForApiKey.mockReset();
  mockValidateApiKey.mockReset();
  mockValidateJwt.mockReset();
  mockIntrospectToken.mockReset();
  mockValidateOidcIdToken.mockReset();
});

function makeCtx(headers: Record<string, string> = {}) {
  return {
    method: 'tools/call',
    httpMethod: 'POST',
    path: '/mcp',
    headers,
    getHeader: (name: string) => headers[name.toLowerCase()],
    body: { jsonrpc: '2.0', method: 'tools/call', id: 1 },
  };
}

describe('authenticateRequest', () => {
  it('returns null when no credentials provided', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx();
    const result = await authenticateRequest(ctx);
    expect(result).toBeNull();
  });

  it('throws AuthenticationError when x-api-key is invalid and no x-tenant-id', async () => {
    const { authenticateRequest, AuthenticationError } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'invalid-key' });
    mockListTenants.mockReturnValue([]);
    mockFindTenantForApiKey.mockReturnValue(null);

    await expect(authenticateRequest(ctx)).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError when x-api-key is invalid with x-tenant-id', async () => {
    const { authenticateRequest, AuthenticationError } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'invalid-key', 'x-tenant-id': 'test-tenant' });
    mockFindTenantForApiKey.mockReturnValue(null);
    mockGetTenant.mockReturnValue({
      tenantId: 'test-tenant',
      auth: { apiKeys: [] },
    });
    mockValidateApiKey.mockReturnValue({ valid: false, error: 'Invalid API key' });

    await expect(authenticateRequest(ctx)).rejects.toThrow(AuthenticationError);
  });

  it('returns auth context when x-api-key is valid with findTenantForApiKey', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'valid-key' });
    mockListTenants.mockReturnValue([{ tenantId: 'tenant-1' }]);
    mockFindTenantForApiKey.mockReturnValue({
      tenant: { tenantId: 'tenant-1' },
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.tenantId).toBe('tenant-1');
  });

  it('returns auth context when x-api-key is valid with x-tenant-id', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'valid-key', 'x-tenant-id': 'tenant-1' });
    mockFindTenantForApiKey.mockReturnValue(null);
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: { apiKeys: [{ keyHash: 'hash' }] },
    });
    mockValidateApiKey.mockReturnValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.tenantId).toBe('tenant-1');
  });

  it('throws AuthenticationError when bearer token with tenant header but tenant not found', async () => {
    const { authenticateRequest, AuthenticationError } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer some-token', 'x-tenant-id': 'unknown-tenant' });
    mockGetTenant.mockReturnValue(undefined);

    await expect(authenticateRequest(ctx)).rejects.toThrow(AuthenticationError);
  });

  it('returns auth context when bearer token validated via JWT', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer jwt-token', 'x-tenant-id': 'tenant-1' });
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: { jwt: { issuer: 'iss', jwksUri: 'https://jwks' } },
    });
    mockValidateJwt.mockResolvedValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'jwt' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.authMethod).toBe('jwt');
  });

  it('falls through to OAuth when JWT fails', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer oauth-token', 'x-tenant-id': 'tenant-1' });
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: {
        jwt: { issuer: 'iss', jwksUri: 'https://jwks' },
        oauth: { introspectionUrl: 'https://introspect' },
      },
    });
    mockValidateJwt.mockResolvedValue({ valid: false });
    mockIntrospectToken.mockResolvedValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'oauth' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.authMethod).toBe('oauth');
  });

  it('falls through to OIDC when JWT and OAuth fail', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer oidc-token', 'x-tenant-id': 'tenant-1' });
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: {
        jwt: { issuer: 'iss', jwksUri: 'https://jwks' },
        oauth: { introspectionUrl: 'https://introspect' },
        oidc: { issuer: 'https://oidc', jwksUri: 'https://jwks' },
      },
    });
    mockValidateJwt.mockResolvedValue({ valid: false });
    mockIntrospectToken.mockResolvedValue({ valid: false });
    mockValidateOidcIdToken.mockResolvedValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['openid'], authMethod: 'oidc' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.authMethod).toBe('oidc');
  });

  it('throws when all bearer methods fail with tenant header', async () => {
    const { authenticateRequest, AuthenticationError } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer bad-token', 'x-tenant-id': 'tenant-1' });
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: { jwt: { issuer: 'iss', jwksUri: 'https://jwks' } },
    });
    mockValidateJwt.mockResolvedValue({ valid: false });

    await expect(authenticateRequest(ctx)).rejects.toThrow(AuthenticationError);
  });

  it('returns auth context when bearer token validated via multi-tenant JWT', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer jwt-token' });
    mockGetTenant.mockReturnValue(undefined);
    mockListTenants.mockReturnValue([
      {
        tenantId: 'tenant-1',
        auth: { jwt: { issuer: 'iss', jwksUri: 'https://jwks' } },
      },
    ]);
    mockValidateJwt.mockResolvedValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'jwt' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.authMethod).toBe('jwt');
  });

  it('falls through to multi-tenant OIDC when multi-tenant JWT fails', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer oidc-token' });
    mockGetTenant.mockReturnValue(undefined);
    mockListTenants.mockReturnValue([
      {
        tenantId: 'tenant-1',
        auth: {
          jwt: { issuer: 'iss', jwksUri: 'https://jwks' },
          oidc: { issuer: 'https://oidc', jwksUri: 'https://jwks' },
        },
      },
      {
        tenantId: 'tenant-2',
        auth: {
          oidc: { issuer: 'https://oidc2', jwksUri: 'https://jwks2' },
        },
      },
    ]);
    mockValidateJwt.mockResolvedValue({ valid: false });
    mockValidateOidcIdToken.mockResolvedValueOnce({ valid: false }).mockResolvedValueOnce({
      valid: true,
      context: { tenantId: 'tenant-2', scopes: ['openid'], authMethod: 'oidc' },
    });

    const result = await authenticateRequest(ctx);
    expect(result).toBeDefined();
    expect(result?.authMethod).toBe('oidc');
    expect(result?.tenantId).toBe('tenant-2');
  });

  it('throws when all multi-tenant bearer methods fail', async () => {
    const { authenticateRequest, AuthenticationError } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Bearer bad-token' });
    mockGetTenant.mockReturnValue(undefined);
    mockListTenants.mockReturnValue([
      {
        tenantId: 'tenant-1',
        auth: { jwt: { issuer: 'iss', jwksUri: 'https://jwks' } },
      },
    ]);
    mockValidateJwt.mockResolvedValue({ valid: false });

    await expect(authenticateRequest(ctx)).rejects.toThrow(AuthenticationError);
  });

  it('handles authorization header without Bearer prefix', async () => {
    const { authenticateRequest } = await import('./auth-core.js');
    const ctx = makeCtx({ authorization: 'Basic dXNlcjpwYXNz' });
    const result = await authenticateRequest(ctx);
    expect(result).toBeNull();
  });
});

describe('evaluateAuth', () => {
  it('returns deny with AUTH_REQUIRED when no credentials', async () => {
    const { evaluateAuth } = await import('./auth-core.js');
    const ctx = makeCtx();
    const result = await evaluateAuth(ctx);
    expect(result.action).toBe('deny');
    expect(result.status).toBe(401);
  });

  it('returns deny when tenant not found for auth context', async () => {
    const { evaluateAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'valid-key' });
    mockListTenants.mockReturnValue([]);
    mockFindTenantForApiKey.mockReturnValue({
      tenant: { tenantId: 'tenant-1' },
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });
    mockGetTenant.mockReturnValue(undefined);

    const result = await evaluateAuth(ctx);
    expect(result.action).toBe('deny');
    expect(result.status).toBe(401);
    expect(result.error?.code).toBe('TENANT_NOT_FOUND');
  });

  it('returns allow when credentials are valid with x-tenant-id', async () => {
    const { evaluateAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'valid-key', 'x-tenant-id': 'tenant-1' });
    mockFindTenantForApiKey.mockReturnValue(null);
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: { apiKeys: [{ keyHash: 'hash' }] },
    });
    mockValidateApiKey.mockReturnValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });

    const result = await evaluateAuth(ctx);
    expect(result.action).toBe('allow');
    expect(result.authContext?.tenantId).toBe('tenant-1');
  });

  it('returns allow with tenant from auth context when no x-tenant-id', async () => {
    const { evaluateAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'valid-key' });
    mockListTenants.mockReturnValue([{ tenantId: 'tenant-1' }]);
    mockFindTenantForApiKey.mockReturnValue({
      tenant: { tenantId: 'tenant-1' },
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: { apiKeys: [{ keyHash: 'hash' }] },
    });

    const result = await evaluateAuth(ctx);
    expect(result.action).toBe('allow');
  });

  it('handles unexpected error with 500 status', async () => {
    const { evaluateAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'key' });
    mockListTenants.mockImplementation(() => {
      throw new Error('Unexpected DB error');
    });

    const result = await evaluateAuth(ctx);
    expect(result.action).toBe('deny');
    expect(result.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe('evaluateOptionalAuth', () => {
  it('returns auth context when credentials valid', async () => {
    const { evaluateOptionalAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'valid-key', 'x-tenant-id': 'tenant-1' });
    mockFindTenantForApiKey.mockReturnValue(null);
    mockGetTenant.mockReturnValue({
      tenantId: 'tenant-1',
      auth: { apiKeys: [{ keyHash: 'hash' }] },
    });
    mockValidateApiKey.mockReturnValue({
      valid: true,
      context: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });

    const result = await evaluateOptionalAuth(ctx);
    expect(result).toBeDefined();
    expect(result?.tenantId).toBe('tenant-1');
  });

  it('returns undefined when no credentials', async () => {
    const { evaluateOptionalAuth } = await import('./auth-core.js');
    const ctx = makeCtx();
    const result = await evaluateOptionalAuth(ctx);
    expect(result).toBeUndefined();
  });

  it('returns undefined on auth failure (swallows error)', async () => {
    const { evaluateOptionalAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'invalid-key' });
    mockListTenants.mockReturnValue([]);
    mockFindTenantForApiKey.mockReturnValue(null);

    const result = await evaluateOptionalAuth(ctx);
    expect(result).toBeUndefined();
  });

  it('logs unexpected error and returns undefined', async () => {
    const { evaluateOptionalAuth } = await import('./auth-core.js');
    const ctx = makeCtx({ 'x-api-key': 'key' });
    mockListTenants.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const result = await evaluateOptionalAuth(ctx);
    expect(result).toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
