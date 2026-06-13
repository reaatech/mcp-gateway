import { describe, expect, it, vi } from 'vitest';

vi.mock('@reaatech/mcp-gateway-core', async (importOriginal) => ({
  ...(await importOriginal()),
  buildRequestContext: vi.fn((input) => ({
    method: input.body?.method,
    httpMethod: input.httpMethod,
    path: input.path,
    headers: input.headers,
    getHeader: (name: string) => {
      const h = input.headers as Record<string, string>;
      return h[name] ?? h[name.toLowerCase()];
    },
    body: input.body,
  })),
}));

vi.mock('./auth-core.js', () => ({
  AuthenticationError: class AuthenticationError extends Error {
    constructor(
      message: string,
      public readonly code = 'AUTH_FAILED',
      public readonly statusCode = 401,
    ) {
      super(message);
      this.name = 'AuthenticationError';
    }
  },
  evaluateAuth: vi.fn(),
  evaluateOptionalAuth: vi.fn(),
}));

import { evaluateAuth, evaluateOptionalAuth } from './auth-core.js';

const mockEvaluateAuth = evaluateAuth as ReturnType<typeof vi.fn>;
const mockEvaluateOptionalAuth = evaluateOptionalAuth as ReturnType<typeof vi.fn>;

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    path: '/mcp',
    headers: {},
    body: {},
    ...overrides,
  } as Record<string, unknown>;
}

function mockRes() {
  const state: { statusCode?: number; body?: unknown } = {};
  const res = {
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return res;
    }),
    _state: state,
  };
  return res;
}

describe('authMiddleware', () => {
  it('allows request and attaches authContext when evaluateAuth returns allow', async () => {
    const { authMiddleware } = await import('./auth.middleware.js');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    mockEvaluateAuth.mockResolvedValue({
      action: 'allow',
      authContext: { tenantId: 'tenant-1', scopes: ['tools:*'], authMethod: 'api-key' },
    });

    await authMiddleware()(req as never, res as never, next);

    expect(req.authContext).toBeDefined();
    expect((req.authContext as Record<string, unknown>)?.tenantId).toBe('tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('denies request and sends 401 when evaluateAuth returns deny', async () => {
    const { authMiddleware, AuthenticationError } = await import('./auth.middleware.js');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    const error = new AuthenticationError('Auth required', 'AUTH_REQUIRED');
    mockEvaluateAuth.mockResolvedValue({
      action: 'deny',
      status: 401,
      body: { error: { code: -32001, message: 'Authentication failed' } },
      error,
    });

    await authMiddleware()(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('invokes onFailure callback on deny', async () => {
    const { authMiddleware, AuthenticationError } = await import('./auth.middleware.js');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    const onFailure = vi.fn();

    const error = new AuthenticationError('Bad key', 'AUTH_FAILED');
    mockEvaluateAuth.mockResolvedValue({
      action: 'deny',
      status: 401,
      body: { error: { code: -32001, message: 'Authentication failed' } },
      error,
    });

    await authMiddleware({ onFailure })(req as never, res as never, next);

    expect(onFailure).toHaveBeenCalledWith(error, req);
  });

  it('handles deny without error gracefully', async () => {
    const { authMiddleware } = await import('./auth.middleware.js');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    mockEvaluateAuth.mockResolvedValue({
      action: 'deny',
      status: 403,
      body: { error: { code: -32001, message: 'Forbidden' } },
    });

    await authMiddleware()(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('optionalAuthMiddleware', () => {
  it('attaches authContext when optional auth succeeds', async () => {
    const { optionalAuthMiddleware } = await import('./auth.middleware.js');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    mockEvaluateOptionalAuth.mockResolvedValue({
      tenantId: 'tenant-1',
      scopes: ['tools:*'],
      authMethod: 'api-key',
    });

    await optionalAuthMiddleware()(req as never, res as never, next);

    expect(req.authContext).toBeDefined();
    expect((req.authContext as Record<string, unknown>)?.tenantId).toBe('tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('calls next without authContext when optional auth returns undefined', async () => {
    const { optionalAuthMiddleware } = await import('./auth.middleware.js');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    mockEvaluateOptionalAuth.mockResolvedValue(undefined);

    await optionalAuthMiddleware()(req as never, res as never, next);

    expect(req.authContext).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('requireAuth', () => {
  it('returns authContext when present', async () => {
    const { requireAuth } = await import('./auth.middleware.js');
    const req = mockReq({ authContext: { tenantId: 't', scopes: [], authMethod: 'api-key' } });
    const result = requireAuth(req as never);
    expect(result.tenantId).toBe('t');
  });

  it('throws AuthenticationError when authContext missing', async () => {
    const { requireAuth, AuthenticationError } = await import('./auth.middleware.js');
    const req = mockReq();
    expect(() => requireAuth(req as never)).toThrow(AuthenticationError);
  });
});

describe('getAuth', () => {
  it('returns authContext when present', async () => {
    const { getAuth } = await import('./auth.middleware.js');
    const req = mockReq({ authContext: { tenantId: 't', scopes: [], authMethod: 'api-key' } });
    expect(getAuth(req as never)?.tenantId).toBe('t');
  });

  it('returns undefined when authContext missing', async () => {
    const { getAuth } = await import('./auth.middleware.js');
    const req = mockReq();
    expect(getAuth(req as never)).toBeUndefined();
  });
});
