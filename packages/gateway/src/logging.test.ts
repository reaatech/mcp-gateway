/**
 * mcp-gateway — Logging Middleware Unit Tests
 */

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logUpstreamCall, loggingMiddleware } from './logging.js';
import type { PipelineContext } from './types.js';

describe('loggingMiddleware', () => {
  let mockLogger: ReturnType<typeof vi.fn<(data: unknown) => void>>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockContext: PipelineContext;

  beforeEach(() => {
    mockLogger = vi.fn();
    mockReq = {
      method: 'POST',
      path: '/mcp',
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
    };
    mockRes = {
      statusCode: 200,
      end: vi.fn().mockImplementation(function (this: Response) {
        return this;
      }),
      on: vi.fn(),
    };
    mockNext = vi.fn();
    mockContext = {
      requestId: 'test-req-id',
      tenantId: 'test-tenant',
      startTime: Date.now(),
    };
  });

  it('skips logging for health paths', () => {
    const middleware = loggingMiddleware({ logger: mockLogger, skipPaths: ['/health'] });
    mockReq = { ...mockReq, path: '/health' };

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockLogger).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets up response intercept on other paths', () => {
    const middleware = loggingMiddleware({ logger: mockLogger });

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('uses default options when not specified', () => {
    const middleware = loggingMiddleware();

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('logUpstreamCall', () => {
  it('logs successful upstream call as info', () => {
    const mockLogger = vi.fn();

    logUpstreamCall(mockLogger, {
      requestId: 'req-1',
      tenantId: 'tenant-1',
      upstream: 'primary',
      method: 'tools/call',
      tool: 'test_tool',
      durationMs: 150,
      success: true,
    });

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        requestId: 'req-1',
        upstream: 'primary',
        success: true,
      }),
    );
  });

  it('logs failed upstream call as warn', () => {
    const mockLogger = vi.fn();

    logUpstreamCall(mockLogger, {
      requestId: 'req-1',
      tenantId: 'tenant-1',
      upstream: 'primary',
      method: 'tools/call',
      tool: 'test_tool',
      durationMs: 150,
      success: false,
      error: 'Connection timeout',
    });

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        requestId: 'req-1',
        success: false,
        error: 'Connection timeout',
      }),
    );
  });

  it('logs without optional fields', () => {
    const mockLogger = vi.fn();

    logUpstreamCall(mockLogger, {
      requestId: 'req-1',
      upstream: 'primary',
      method: 'ping',
      durationMs: 50,
      success: true,
    });

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        requestId: 'req-1',
        upstream: 'primary',
        success: true,
      }),
    );
  });
});
