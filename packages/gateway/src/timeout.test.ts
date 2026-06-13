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

  it('calls next with timeout error when timeout fires and headers not sent', () => {
    vi.useFakeTimers();
    const middleware = timeoutMiddleware({ timeoutMs: 100, message: 'Request timeout' });

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockNext).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(mockNext).toHaveBeenCalledTimes(2);
    const errorArg = (mockNext as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(errorArg).toBeDefined();
    expect(errorArg.message).toBe('Request timeout');
    expect(errorArg.statusCode).toBe(504);
    expect(errorArg.category).toBe('timeout');

    vi.useRealTimers();
  });

  it('does not call next with timeout error when headers already sent', () => {
    vi.useFakeTimers();
    mockRes.headersSent = true;
    const middleware = timeoutMiddleware({ timeoutMs: 100 });

    middleware(mockReq as Request, mockRes as Response, mockNext, mockContext);

    expect(mockNext).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(mockNext).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
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

  it('throws categorized timeout error on AbortError', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('AbortError'), { name: 'AbortError' }));

    await expect(withTimeout(operation, 100, 'Op timeout')).rejects.toMatchObject({
      message: 'Op timeout',
      category: 'timeout',
      statusCode: 504,
    });
  });
});
