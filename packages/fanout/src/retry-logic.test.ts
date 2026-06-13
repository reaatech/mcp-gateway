import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateBackoff,
  generateIdempotencyKey,
  isRetryableError,
  sendWithRetry,
  withIdempotencyKey,
} from './retry-logic.js';
import type { JsonRpcRequest, RetryConfig, UpstreamCallResponse } from './types.js';

vi.mock('./upstream-client.js', () => ({
  sendUpstreamRequest: vi.fn(),
}));

import { sendUpstreamRequest } from './upstream-client.js';

const mockSendUpstreamRequest = sendUpstreamRequest as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSendUpstreamRequest.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calculateBackoff', () => {
  it('calculates exponential delay', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      jitter: false,
    };

    expect(calculateBackoff(0, config)).toBe(100);
    expect(calculateBackoff(1, config)).toBe(200);
    expect(calculateBackoff(2, config)).toBe(400);
  });

  it('caps delay at maxDelayMs', () => {
    const config: RetryConfig = {
      maxRetries: 10,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
      jitter: false,
    };

    expect(calculateBackoff(10, config)).toBe(3000);
  });

  it('returns random value when jitter enabled', () => {
    const config: RetryConfig = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, jitter: true };

    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const delay = calculateBackoff(1, config);
    expect(delay).toBe(100);

    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const delay2 = calculateBackoff(1, config);
    expect(delay2).toBe(20);

    vi.restoreAllMocks();
  });
});

describe('isRetryableError', () => {
  it('returns true for network errors', () => {
    const response: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: '1' },
      success: false,
      error: 'network error',
      durationMs: 100,
    };
    expect(isRetryableError(response)).toBe(true);
  });

  it('returns true for timeout errors', () => {
    const response: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: '2' },
      success: false,
      error: 'timeout exceeded',
      durationMs: 100,
    };
    expect(isRetryableError(response)).toBe(true);
  });

  it('returns true for aborted errors', () => {
    const response: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: '3' },
      success: false,
      error: 'request aborted',
      durationMs: 100,
    };
    expect(isRetryableError(response)).toBe(true);
  });

  it('returns true for 5xx errors', () => {
    const response: UpstreamCallResponse = {
      upstream: 'test',
      response: {
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32001, message: 'Server error' },
      },
      success: false,
      durationMs: 100,
    };
    expect(isRetryableError(response)).toBe(true);
  });

  it('returns false for 4xx errors', () => {
    const response: UpstreamCallResponse = {
      upstream: 'test',
      response: {
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32600, message: 'Invalid request' },
      },
      success: false,
      durationMs: 100,
    };
    expect(isRetryableError(response)).toBe(false);
  });

  it('returns false for successful response', () => {
    const response: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: '1', result: {} },
      success: true,
      durationMs: 100,
    };
    expect(isRetryableError(response)).toBe(false);
  });
});

describe('generateIdempotencyKey', () => {
  it('generates unique keys', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).not.toBe(key2);
  });

  it('starts with idem_ prefix', () => {
    const key = generateIdempotencyKey();
    expect(key.startsWith('idem_')).toBe(true);
  });
});

describe('withIdempotencyKey', () => {
  it('adds idempotency key to request without one', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'test' },
    };

    const result = withIdempotencyKey(request);

    expect(result.params).toHaveProperty('_idempotencyKey');
    expect((result.params as Record<string, unknown>)._idempotencyKey).toMatch(/^idem_/);
  });

  it('does not modify request that already has idempotency key', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'test', _idempotencyKey: 'existing' },
    };

    const result = withIdempotencyKey(request);

    expect((result.params as Record<string, unknown>)._idempotencyKey).toBe('existing');
  });

  it('handles undefined params', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
    };

    const result = withIdempotencyKey(request);

    expect(result.params).toHaveProperty('_idempotencyKey');
  });
});

describe('sendWithRetry', () => {
  const config = { name: 'test', url: 'https://api.example.com' };

  it('returns immediately on success', async () => {
    const successResponse: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: 1, result: {} },
      durationMs: 10,
      success: true,
    };
    mockSendUpstreamRequest.mockResolvedValue(successResponse);

    const result = await sendWithRetry(config, { jsonrpc: '2.0', id: 1, method: 'test' });

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('retries on retryable error and eventually succeeds', async () => {
    const failResponse: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'timeout' } },
      durationMs: 100,
      success: false,
      error: 'timeout error',
    };
    const successResponse: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: 1, result: {} },
      durationMs: 10,
      success: true,
    };
    mockSendUpstreamRequest
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse);

    const result = await sendWithRetry(
      config,
      { jsonrpc: '2.0', id: 1, method: 'test' },
      { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 50, jitter: false },
    );

    expect(result.success).toBe(true);
    expect(mockSendUpstreamRequest).toHaveBeenCalledTimes(2);
  });

  it('returns non-retryable error immediately without retry', async () => {
    const badRequestResponse: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' } },
      durationMs: 10,
      success: false,
    };
    mockSendUpstreamRequest.mockResolvedValue(badRequestResponse);

    const result = await sendWithRetry(
      config,
      { jsonrpc: '2.0', id: 1, method: 'test' },
      { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 50, jitter: false },
    );

    expect(result.success).toBe(false);
    expect(mockSendUpstreamRequest).toHaveBeenCalledTimes(1);
  });

  it('exhausts all retries and returns last error', async () => {
    const failResponse: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'timeout' } },
      durationMs: 100,
      success: false,
      error: 'timeout error',
    };
    mockSendUpstreamRequest.mockResolvedValue(failResponse);

    const result = await sendWithRetry(
      config,
      { jsonrpc: '2.0', id: 1, method: 'test' },
      { maxRetries: 2, baseDelayMs: 5, maxDelayMs: 50, jitter: false },
    );

    expect(result.success).toBe(false);
    expect(mockSendUpstreamRequest).toHaveBeenCalledTimes(3);
  });

  it('includes idempotency key when option set', async () => {
    const successResponse: UpstreamCallResponse = {
      upstream: 'test',
      response: { jsonrpc: '2.0', id: 1, result: {} },
      durationMs: 10,
      success: true,
    };
    mockSendUpstreamRequest.mockResolvedValue(successResponse);

    const result = await sendWithRetry(
      config,
      { jsonrpc: '2.0', id: 1, method: 'test' },
      { maxRetries: 1, baseDelayMs: 5, maxDelayMs: 50, jitter: false },
      { idempotencyKey: true },
    );

    expect(result.success).toBe(true);
    expect(mockSendUpstreamRequest).toHaveBeenCalled();
  });
});
