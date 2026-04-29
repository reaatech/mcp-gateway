/**
 * mcp-gateway — Allowlist Middleware Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { allowlistMiddleware } from '../../src/allowlist/allowlist.middleware.js';
import { setTenant, clearTenants } from '../../src/config/tenant-loader.js';
import type { Request, Response, NextFunction } from 'express';
import type { ToolAllowlist } from '../../src/allowlist/types.js';

describe('allowlistMiddleware', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReq: any;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearTenants();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock } as unknown as Response);

    mockReq = {
      headers: {},
      body: undefined,
      authContext: undefined as unknown as undefined,
    };
    mockRes = {
      status: statusMock as unknown as Response['status'],
      json: jsonMock as unknown as Response['json'],
    };
    mockNext = vi.fn();
  });

  const setupTenant = (tenantId: string, allowlist: ToolAllowlist) => {
    setTenant({
      tenantId,
      displayName: `Test Tenant ${tenantId}`,
      auth: {},
      rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
      allowlist,
      cache: { enabled: false, ttlSeconds: 60 },
      upstreams: [],
    });
    mockReq.authContext = { tenantId };
  };

  describe('extracts tool name from request body', () => {
    it('calls next when authContext is missing', async () => {
      const middleware = allowlistMiddleware();
      mockReq.body = { method: 'tools/call', params: { name: 'some_tool' } };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('calls next when tenant not found', async () => {
      const middleware = allowlistMiddleware();
      mockReq.authContext = { tenantId: 'unknown-tenant' };
      mockReq.body = { method: 'tools/call', params: { name: 'some_tool' } };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('calls next when body is not a tool call', async () => {
      const middleware = allowlistMiddleware();
      mockReq.authContext = { tenantId: 'test-tenant' };
      mockReq.body = { method: 'other/method', params: {} };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('calls next when body is missing params', async () => {
      const middleware = allowlistMiddleware();
      mockReq.authContext = { tenantId: 'test-tenant' };
      mockReq.body = { method: 'tools/call' };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('calls next when tool name is not a string', async () => {
      const middleware = allowlistMiddleware();
      mockReq.authContext = { tenantId: 'test-tenant' };
      mockReq.body = { method: 'tools/call', params: { name: 123 } };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('allowlist enforcement', () => {
    it('returns 403 when tool not in allowlist', async () => {
      const middleware = allowlistMiddleware();
      setupTenant('test-tenant', { mode: 'allow', tools: ['allowed_tool'] });
      mockReq.body = {
        method: 'tools/call',
        params: { name: 'blocked_tool' },
        id: 'req-123',
      };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: -32601,
            message: 'Tool not allowed',
            data: expect.objectContaining({
              tool: 'blocked_tool',
              tenant: 'test-tenant',
            }),
          }),
        })
      );
    });

    it('calls next when tool is allowed', async () => {
      const middleware = allowlistMiddleware();
      setupTenant('test-tenant', { mode: 'allow', tools: ['allowed_tool'] });
      mockReq.body = {
        method: 'tools/call',
        params: { name: 'allowed_tool' },
        id: 'req-123',
      };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('allows wildcard patterns', async () => {
      const middleware = allowlistMiddleware();
      setupTenant('test-tenant', { mode: 'allow', tools: ['glean_*'] });
      mockReq.body = {
        method: 'tools/call',
        params: { name: 'glean_search' },
        id: 'req-123',
      };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('denies tool not matching wildcard', async () => {
      const middleware = allowlistMiddleware();
      setupTenant('test-tenant', { mode: 'allow', tools: ['glean_*'] });
      mockReq.body = {
        method: 'tools/call',
        params: { name: 'other_search' },
        id: 'req-123',
      };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('handles deny mode', async () => {
      const middleware = allowlistMiddleware();
      setupTenant('test-tenant', { mode: 'deny', tools: ['blocked_tool'] });
      mockReq.body = {
        method: 'tools/call',
        params: { name: 'blocked_tool' },
        id: 'req-123',
      };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('allows tool in deny mode when not denied', async () => {
      const middleware = allowlistMiddleware();
      setupTenant('test-tenant', { mode: 'deny', tools: ['blocked_tool'] });
      mockReq.body = {
        method: 'tools/call',
        params: { name: 'allowed_tool' },
        id: 'req-123',
      };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls next when authContext is missing', async () => {
      const middleware = allowlistMiddleware();
      mockReq.body = { method: 'tools/call', params: { name: 'test' } };

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});