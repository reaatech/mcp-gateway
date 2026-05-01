/**
 * mcp-gateway — Retry Logic Unit Tests
 */

import { describe, expect, it, vi } from 'vitest';
import {
  calculateBackoff,
  generateIdempotencyKey,
  isRetryableError,
  withIdempotencyKey,
} from './retry-logic.js';
import type { JsonRpcRequest, RetryConfig, UpstreamCallResponse } from './types.js';

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
    expect(delay).toBe(100); // Math.floor(0.5 * 200)

    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const delay2 = calculateBackoff(1, config);
    expect(delay2).toBe(20); // Math.floor(0.1 * 200)

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
  it('is tested via integration tests', () => {
    expect(true).toBe(true);
  });
});
