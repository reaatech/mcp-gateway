/**
 * mcp-gateway — Error Handler Middleware Unit Tests
 */

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JSONRPC_ERRORS,
  categoryToErrorCode,
  categoryToHttpStatus,
  error_handlerMiddleware,
  formatJsonRpcError,
} from './error-handler.js';

describe('JSONRPC_ERRORS', () => {
  it('has all required error codes', () => {
    expect(JSONRPC_ERRORS.PARSE_ERROR).toBe(-32700);
    expect(JSONRPC_ERRORS.INVALID_REQUEST).toBe(-32600);
    expect(JSONRPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
    expect(JSONRPC_ERRORS.INVALID_PARAMS).toBe(-32602);
    expect(JSONRPC_ERRORS.INTERNAL_ERROR).toBe(-32603);
    expect(JSONRPC_ERRORS.SERVER_ERROR).toBe(-32000);
  });
});

describe('categoryToErrorCode', () => {
  it('maps validation category to INVALID_PARAMS', () => {
    expect(categoryToErrorCode('validation')).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
  });

  it('maps authentication category to INVALID_REQUEST', () => {
    expect(categoryToErrorCode('authentication')).toBe(JSONRPC_ERRORS.INVALID_REQUEST);
  });

  it('maps authorization category to SERVER_ERROR', () => {
    expect(categoryToErrorCode('authorization')).toBe(JSONRPC_ERRORS.SERVER_ERROR);
  });

  it('maps rate_limit category to SERVER_ERROR', () => {
    expect(categoryToErrorCode('rate_limit')).toBe(JSONRPC_ERRORS.SERVER_ERROR);
  });

  it('maps upstream category to SERVER_ERROR', () => {
    expect(categoryToErrorCode('upstream')).toBe(JSONRPC_ERRORS.SERVER_ERROR);
  });

  it('maps timeout category to SERVER_ERROR', () => {
    expect(categoryToErrorCode('timeout')).toBe(JSONRPC_ERRORS.SERVER_ERROR);
  });

  it('maps internal category to INTERNAL_ERROR', () => {
    expect(categoryToErrorCode('internal')).toBe(JSONRPC_ERRORS.INTERNAL_ERROR);
  });

  it('defaults unknown categories to INTERNAL_ERROR', () => {
    expect(categoryToErrorCode('unknown' as never)).toBe(JSONRPC_ERRORS.INTERNAL_ERROR);
  });
});

describe('categoryToHttpStatus', () => {
  it('maps validation to 400', () => {
    expect(categoryToHttpStatus('validation')).toBe(400);
  });

  it('maps authentication to 401', () => {
    expect(categoryToHttpStatus('authentication')).toBe(401);
  });

  it('maps authorization to 403', () => {
    expect(categoryToHttpStatus('authorization')).toBe(403);
  });

  it('maps rate_limit to 429', () => {
    expect(categoryToHttpStatus('rate_limit')).toBe(429);
  });

  it('maps timeout to 504', () => {
    expect(categoryToHttpStatus('timeout')).toBe(504);
  });

  it('maps upstream to 502', () => {
    expect(categoryToHttpStatus('upstream')).toBe(502);
  });

  it('maps internal to 500', () => {
    expect(categoryToHttpStatus('internal')).toBe(500);
  });
});

describe('formatJsonRpcError', () => {
  it('formats error with all fields', () => {
    const result = formatJsonRpcError(1, -32602, 'Invalid params', { field: 'name' });
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: { field: 'name' },
      },
    });
  });

  it('formats error without optional data', () => {
    const result = formatJsonRpcError('abc', -32601, 'Method not found');
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 'abc',
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  });

  it('handles null id', () => {
    const result = formatJsonRpcError(null, -32700, 'Parse error');
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });
  });
});

describe('error_handlerMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      path: '/mcp',
      headers: {
        'x-request-id': 'test-request-id',
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: { id: 1, method: 'test' },
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('handles categorized error with JSON accept header', () => {
    const error = new Error('Test error') as Error & { category?: string; statusCode?: number };
    error.category = 'validation';
    error.statusCode = 400;

    const middleware = error_handlerMiddleware();
    middleware(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 1,
        error: expect.objectContaining({
          code: -32602,
          message: 'Test error',
          data: expect.objectContaining({ category: 'validation' }),
        }),
      }),
    );
  });

  it('handles uncategorized error as internal', () => {
    const error = new Error('Internal error');

    const middleware = error_handlerMiddleware();
    middleware(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 1,
        error: expect.objectContaining({
          code: -32603,
          message: 'Internal error',
          data: expect.objectContaining({
            category: 'internal',
          }),
        }),
      }),
    );
  });

  it('handles non-JSON accept header', () => {
    const nonJsonReq = {
      path: '/api/other',
      headers: {
        'x-request-id': 'test-request-id',
        accept: 'text/html',
      },
      body: { id: 1, method: 'test' },
    };

    const error = new Error('Not found') as Error & { category?: string; statusCode?: number };
    error.category = 'authorization';
    error.statusCode = 403;

    const middleware = error_handlerMiddleware();
    middleware(error, nonJsonReq as unknown as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Not found',
          category: 'authorization',
        }),
      }),
    );
  });

  it('uses body id from request', () => {
    const customIdReq = {
      path: '/mcp',
      headers: {
        'x-request-id': 'test-request-id',
        accept: 'application/json',
      },
      body: { id: 'custom-id', method: 'test' },
    };

    const error = new Error('Test');

    const middleware = error_handlerMiddleware();
    middleware(error, customIdReq as unknown as Request, mockRes as Response, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-id',
      }),
    );
  });
});
