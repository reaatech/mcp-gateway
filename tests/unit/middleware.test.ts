/**
 * mcp-gateway — Middleware Pipeline Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { createPipeline } from '../../src/middleware/pipeline.js';
import { request_idMiddleware } from '../../src/middleware/request-id.js';
import { loggingMiddleware, logUpstreamCall } from '../../src/middleware/logging.js';
import { categoryToErrorCode, categoryToHttpStatus, formatJsonRpcError, JSONRPC_ERRORS } from '../../src/middleware/error-handler.js';
import { createCategorizedError } from '../../src/middleware/types.js';
import { withTimeout } from '../../src/middleware/timeout.js';

function createMockReq(headers: Record<string, string> = {}, body = {}, path = '/mcp', method = 'POST') {
  return {
    headers: { ...headers },
    body,
    path,
    method,
    get: (name: string) => headers[name.toLowerCase()],
    ip: '127.0.0.1',
  };
}

function createMockRes() {
  const res: Record<string, unknown> = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    _json: null as unknown,
    _ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      (this.headers as Record<string, string>)[name] = value;
      return this;
    },
    json(data: unknown) {
      this._json = data;
      this._ended = true;
      return this;
    },
    end(_chunk?: unknown, _encoding?: unknown) {
      this._ended = true;
      return this;
    },
    on(_event: string, _handler: () => void) {
      return this;
    },
  };
  return res as unknown as { statusCode: number; headers: Record<string, string>; _json: unknown; _ended: boolean; status: (code: number) => unknown; setHeader: (name: string, value: string) => unknown; json: (data: unknown) => unknown; end: (chunk?: unknown, encoding?: unknown) => unknown; on: (event: string, handler: () => void) => unknown };
}

describe('pipeline', () => {
  it('creates empty pipeline', () => {
    const pipeline = createPipeline();
    expect(pipeline.size()).toBe(0);
  });

  it('adds middleware', () => {
    const pipeline = createPipeline();
    const middleware = (_req: unknown, _res: unknown, next: () => void) => next();
    pipeline.use(middleware);
    expect(pipeline.size()).toBe(1);
  });

  it('clears middleware', () => {
    const pipeline = createPipeline();
    pipeline.use((_req: unknown, _res: unknown, next: () => void) => next());
    pipeline.use((_req: unknown, _res: unknown, next: () => void) => next());
    expect(pipeline.size()).toBe(2);
    pipeline.clear();
    expect(pipeline.size()).toBe(0);
  });

  it('executes middleware in order', () => {
    const pipeline = createPipeline();
    const order: number[] = [];

    pipeline.use((_req, _res, next) => { order.push(1); next(); });
    pipeline.use((_req, _res, next) => { order.push(2); next(); });
    pipeline.use((_req, _res, next) => { order.push(3); next(); });

    const handler = pipeline.handler();
    const req = createMockReq();
    const res = createMockRes();
    const next = () => {};

    handler(req as unknown as import('express').Request, res as unknown as import('express').Response, next);

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('request-id middleware', () => {
  it('generates request ID when not provided', () => {
    const middleware = request_idMiddleware();
    const req = createMockReq();
    const res = createMockRes();
    const context = { requestId: '', startTime: 0 };

    middleware(req as unknown as import('express').Request, res as unknown as import('express').Response, () => {}, context as unknown as import('../../src/middleware/types.js').PipelineContext);

    expect(context.requestId).toBeDefined();
    expect(context.requestId.length).toBeGreaterThan(0);
    expect(res.headers['x-request-id']).toBe(context.requestId);
  });

  it('uses provided request ID', () => {
    const middleware = request_idMiddleware();
    const req = createMockReq({ 'x-request-id': 'custom-id-123' });
    const res = createMockRes();
    const context = { requestId: '', startTime: 0 };

    middleware(req as unknown as import('express').Request, res as unknown as import('express').Response, () => {}, context as unknown as import('../../src/middleware/types.js').PipelineContext);

    expect(context.requestId).toBe('custom-id-123');
    expect(res.headers['x-request-id']).toBe('custom-id-123');
  });
});

describe('error-handler', () => {
  describe('categoryToErrorCode', () => {
    it('maps validation to INVALID_PARAMS', () => {
      expect(categoryToErrorCode('validation')).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
    });

    it('maps authentication to INVALID_REQUEST', () => {
      expect(categoryToErrorCode('authentication')).toBe(JSONRPC_ERRORS.INVALID_REQUEST);
    });

    it('maps authorization to SERVER_ERROR', () => {
      expect(categoryToErrorCode('authorization')).toBe(JSONRPC_ERRORS.SERVER_ERROR);
    });

    it('maps rate_limit to SERVER_ERROR', () => {
      expect(categoryToErrorCode('rate_limit')).toBe(JSONRPC_ERRORS.SERVER_ERROR);
    });

    it('maps internal to INTERNAL_ERROR', () => {
      expect(categoryToErrorCode('internal')).toBe(JSONRPC_ERRORS.INTERNAL_ERROR);
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
    it('formats error without data', () => {
      const error = formatJsonRpcError('1', -32600, 'Invalid Request');
      expect(error).toEqual({
        jsonrpc: '2.0',
        id: '1',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });
    });

    it('formats error with data', () => {
      const error = formatJsonRpcError('2', -32602, 'Invalid params', { field: 'query' });
      expect(error).toEqual({
        jsonrpc: '2.0',
        id: '2',
        error: {
          code: -32602,
          message: 'Invalid params',
          data: { field: 'query' },
        },
      });
    });

    it('handles null id', () => {
      const error = formatJsonRpcError(null, -32700, 'Parse Error');
      expect(error).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse Error',
        },
      });
    });
  });

  describe('createCategorizedError', () => {
    it('creates error with category', () => {
      const error = createCategorizedError('Test error', 'validation', 400, { field: 'name' });
      expect(error.message).toBe('Test error');
      expect(error.category).toBe('validation');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'name' });
    });

    it('uses default status code', () => {
      const error = createCategorizedError('Test error', 'internal');
      expect(error.statusCode).toBe(500);
    });
  });
});

describe('timeout', () => {
  describe('withTimeout', () => {
    it('completes within timeout', async () => {
      const result = await withTimeout(
        async () => 'success',
        1000,
        'Timeout',
      );
      expect(result).toBe('success');
    });

    it('throws on timeout', async () => {
      await expect(
        withTimeout(
          async (signal) => {
            return new Promise((resolve, reject) => {
              const timeoutId = setTimeout(() => resolve('late'), 500);
              signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                const error = new Error('AbortError');
                error.name = 'AbortError';
                reject(error);
              });
            });
          },
          50,
          'Operation timeout',
        ),
      ).rejects.toThrow('Operation timeout');
    });

    it('passes through non-timeout errors', async () => {
      await expect(
        withTimeout(
          async () => {
            throw new Error('Custom error');
          },
          1000,
          'Timeout',
        ),
      ).rejects.toThrow('Custom error');
    });
  });
});

describe('logging middleware', () => {
  it('logs request with proper format', () => {
    const logs: unknown[] = [];
    const logger = (data: unknown) => logs.push(data);
    const middleware = loggingMiddleware({ logger });

    const req = createMockReq({}, {}, '/mcp', 'POST');
    const res = createMockRes();
    const context = { requestId: 'req-123', tenantId: 'tenant-1', authContext: {} };

    middleware(
      req as unknown as import('express').Request,
      res as unknown as import('express').Response,
      () => {},
      context as unknown as import('../../src/middleware/types.js').PipelineContext,
    );

    expect(logs).toHaveLength(0);
  });

  it('skips logging for health endpoint', () => {
    const logs: unknown[] = [];
    const logger = (data: unknown) => logs.push(data);
    const middleware = loggingMiddleware({ logger });

    const req = createMockReq({}, {}, '/health', 'GET');
    const res = createMockRes();
    const context = { requestId: 'req-123', tenantId: undefined, authContext: undefined };

    middleware(
      req as unknown as import('express').Request,
      res as unknown as import('express').Response,
      () => {},
      context as unknown as import('../../src/middleware/types.js').PipelineContext,
    );

    expect(logs).toHaveLength(0);
  });

  it('logUpstreamCall formats log entry correctly', () => {
    const logs: unknown[] = [];
    const logger = (data: unknown) => logs.push(data);

    logUpstreamCall(logger, {
      requestId: 'req-456',
      tenantId: 'tenant-2',
      upstream: 'primary',
      method: 'tools/call',
      tool: 'test_tool',
      durationMs: 150,
      success: true,
    });

    expect(logs).toHaveLength(1);
    const entry = logs[0] as Record<string, unknown>;
    expect(entry.requestId).toBe('req-456');
    expect(entry.tenantId).toBe('tenant-2');
    expect(entry.upstream).toBe('primary');
    expect(entry.success).toBe(true);
    expect(entry.level).toBe('info');
  });

  it('logUpstreamCall uses warn level on failure', () => {
    const logs: unknown[] = [];
    const logger = (data: unknown) => logs.push(data);

    logUpstreamCall(logger, {
      requestId: 'req-789',
      upstream: 'secondary',
      method: 'tools/call',
      durationMs: 200,
      success: false,
      error: 'Connection refused',
    });

    const entry = logs[0] as Record<string, unknown>;
    expect(entry.level).toBe('warn');
    expect(entry.error).toBe('Connection refused');
  });
});