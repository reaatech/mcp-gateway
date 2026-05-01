/**
 * mcp-gateway — Timeout Middleware Unit Tests
 */

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { timeoutMiddleware, withTimeout } from './timeout.js';
import type { PipelineContext } from './types.js';

describe('timeoutMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockContext: PipelineContext;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      headersSent: false,
      on: vi.fn(),
    };
    mockNext = vi.fn();
    mockContext = {
      requestId: 'test-req-id',
      startTime: Date.now(),
    } as PipelineContext;
  });

  it('sets abort controller and timeout on context', () => {
    const middleware = timeoutMiddleware({ timeoutMs: 5000 });

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockContext.abortController).toBeDefined();
    expect(mockContext.timeoutMs).toBe(5000);
    expect(mockNext).toHaveBeenCalled();
  });

  it('uses default timeout when not specified', () => {
    const middleware = timeoutMiddleware();

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockContext.timeoutMs).toBe(30000);
    expect(mockNext).toHaveBeenCalled();
  });

  it('clears timeout on response finish', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const middleware = timeoutMiddleware({ timeoutMs: 5000 });

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    // Simulate response finish event
    const finishHandler = (mockRes.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'finish',
    )?.[1];
    if (finishHandler) {
      finishHandler();
    }

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

describe('withTimeout', () => {
  it('returns result when operation completes within timeout', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withTimeout(operation, 5000, 'Test timeout');

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });

  it('propagates non-abort errors from operation', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Original error'));

    await expect(withTimeout(operation, 5000, 'Test timeout')).rejects.toThrow('Original error');
  });

  it('clears timeout when operation completes', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const operation = vi.fn().mockResolvedValue('success');

    await withTimeout(operation, 10000, 'Test timeout');

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
