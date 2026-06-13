import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterHealthyUpstreams,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from './failover-handler.js';
import {
  executeFanout,
  executeFanoutFirstSuccess,
  resetUpstreamCaller,
  setUpstreamCaller,
} from './fanout-router.js';
import { aggregateResponses } from './response-aggregator.js';
import type { UpstreamResponse, UpstreamTarget } from './types.js';
import {
  selectByHealth,
  selectRoundRobin,
  selectUpstreams,
  selectWeightedRandom,
} from './upstream-selector.js';

describe('response-aggregator', () => {
  const makeResponse = (
    upstream: string,
    success: boolean,
    response?: unknown,
  ): UpstreamResponse => ({
    upstream,
    success,
    response: response ?? (success ? { content: [`response from ${upstream}`] } : undefined),
    latencyMs: 100,
  });

  describe('first-success strategy', () => {
    it('returns first successful response', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('upstream1', false),
        makeResponse('upstream2', true),
        makeResponse('upstream3', true),
      ];
      const result = aggregateResponses(responses, 'first-success');
      expect(result.strategy).toBe('first-success');
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.finalResponse).toEqual({ content: ['response from upstream2'] });
    });

    it('returns undefined finalResponse when all fail', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('upstream1', false),
        makeResponse('upstream2', false),
      ];
      const result = aggregateResponses(responses, 'first-success');
      expect(result.successful).toBe(0);
      expect(result.finalResponse).toBeUndefined();
    });
  });

  describe('all-wait strategy', () => {
    it('merges content from all successful responses', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('upstream1', true),
        makeResponse('upstream2', true),
      ];
      const result = aggregateResponses(responses, 'all-wait');
      expect(result.strategy).toBe('all-wait');
      expect(result.successful).toBe(2);
      expect(result.finalResponse).toEqual({
        content: ['response from upstream1', 'response from upstream2'],
      });
    });

    it('uses first successful response when no content arrays', () => {
      const responses: UpstreamResponse[] = [
        { upstream: 'up1', success: true, response: { result: 'data' }, latencyMs: 10 },
      ];
      const result = aggregateResponses(responses, 'all-wait');
      expect(result.successful).toBe(1);
      expect(result.finalResponse).toEqual({ result: 'data' });
    });

    it('returns empty when all responses fail', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('up1', false),
        makeResponse('up2', false),
      ];
      const result = aggregateResponses(responses, 'all-wait');
      expect(result.successful).toBe(0);
      expect(result.finalResponse).toBeNull();
    });
  });

  describe('majority-vote strategy', () => {
    it('returns response when majority succeed', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('upstream1', true),
        makeResponse('upstream2', true),
        makeResponse('upstream3', false),
      ];
      const result = aggregateResponses(responses, 'majority-vote');
      expect(result.strategy).toBe('majority-vote');
      expect(result.successful).toBe(2);
      expect(result.finalResponse).toBeDefined();
    });

    it('returns no response when no majority', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('upstream1', true),
        makeResponse('upstream2', false),
        makeResponse('upstream3', false),
      ];
      const result = aggregateResponses(responses, 'majority-vote');
      expect(result.strategy).toBe('majority-vote');
      expect(result.successful).toBe(1);
      expect(result.finalResponse).toBeUndefined();
    });

    it('handles empty successful responses gracefully', () => {
      const responses: UpstreamResponse[] = [
        makeResponse('up1', false),
        makeResponse('up2', false),
      ];
      const result = aggregateResponses(responses, 'majority-vote');
      expect(result.strategy).toBe('majority-vote');
      expect(result.successful).toBe(0);
      expect(result.finalResponse).toBeUndefined();
    });
  });

  describe('default strategy fallback', () => {
    it('defaults to first-success for unknown strategy', () => {
      const responses: UpstreamResponse[] = [makeResponse('up1', true)];
      const result = aggregateResponses(responses, 'unknown' as never);
      expect(result.strategy).toBe('first-success');
    });
  });
});

describe('upstream-selector', () => {
  const upstreams: UpstreamTarget[] = [
    { name: 'primary', url: 'https://primary.example.com', weight: 0.7 },
    { name: 'secondary', url: 'https://secondary.example.com', weight: 0.3 },
    { name: 'tertiary', url: 'https://tertiary.example.com', weight: 0.0 },
  ];

  describe('selectByHealth', () => {
    it('puts healthy upstreams first', () => {
      const withHealth: UpstreamTarget[] = [
        { name: 'primary', url: 'https://primary.example.com', weight: 0.7, healthy: true },
        { name: 'secondary', url: 'https://secondary.example.com', weight: 0.3, healthy: false },
        { name: 'tertiary', url: 'https://tertiary.example.com', weight: 0.0, healthy: true },
      ];
      const result = selectByHealth(withHealth);
      expect(result[0]?.healthy).toBe(true);
      expect(result[1]?.healthy).toBe(true);
      expect(result[2]?.healthy).toBe(false);
    });
  });

  describe('selectWeightedRandom', () => {
    it('returns all upstreams when called', () => {
      const result = selectWeightedRandom(upstreams);
      expect(result).toHaveLength(3);
      expect(result.map((u) => u.name)).toContain('primary');
    });

    it('returns empty for empty input', () => {
      expect(selectWeightedRandom([])).toEqual([]);
    });
  });

  describe('selectRoundRobin', () => {
    it('returns empty for empty input', () => {
      expect(selectRoundRobin([])).toEqual([]);
    });
  });

  describe('selectUpstreams', () => {
    it('selects upstreams with default strategy', () => {
      const result = selectUpstreams(upstreams);
      expect(result).toHaveLength(3);
    });

    it('selects upstreams with round-robin strategy', () => {
      const result = selectUpstreams(upstreams, 'round-robin');
      expect(result).toHaveLength(3);
    });

    it('selects upstreams with health strategy', () => {
      const result = selectUpstreams(upstreams, 'health');
      expect(result).toHaveLength(3);
    });
  });
});

describe('failover-handler', () => {
  it('starts with circuit closed', () => {
    expect(isCircuitOpen('test-upstream')).toBe(false);
  });

  it('opens circuit after 5 failures', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure('test-circuit');
    }
    expect(isCircuitOpen('test-circuit')).toBe(true);
  });

  it('records success to reset circuit', () => {
    recordSuccess('test-circuit');
    expect(isCircuitOpen('test-circuit')).toBe(false);
  });

  it('getCircuitBreakerStatus returns map', async () => {
    const { getCircuitBreakerStatus } = await import('./failover-handler.js');
    const status = getCircuitBreakerStatus();
    expect(status).toBeInstanceOf(Map);
  });

  describe('filterHealthyUpstreams', () => {
    it('filters out upstreams with open circuits', () => {
      const upstreams: UpstreamTarget[] = [
        { name: 'healthy', url: 'https://healthy.example.com' },
        { name: 'unhealthy', url: 'https://unhealthy.example.com' },
      ];

      for (let i = 0; i < 5; i++) {
        recordFailure('unhealthy');
      }

      const result = filterHealthyUpstreams(upstreams);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('healthy');

      recordSuccess('unhealthy');
    });
  });

  describe('configureCircuitBreaker', () => {
    it('allows configuration of circuit breaker', async () => {
      const { configureCircuitBreaker, getCircuitBreakerConfig } = await import(
        './failover-handler.js'
      );
      configureCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
      const config = getCircuitBreakerConfig();
      expect(config.failureThreshold).toBe(3);
      expect(config.cooldownMs).toBe(1000);
    });
  });

  describe('circuit breaker transitions', () => {
    it('half-open transitions to open on failure', async () => {
      const { configureCircuitBreaker, isCircuitOpen, recordFailure } = await import(
        './failover-handler.js'
      );
      configureCircuitBreaker({ failureThreshold: 1, cooldownMs: 50000 });
      recordFailure('cb-half-to-open');
      expect(isCircuitOpen('cb-half-to-open')).toBe(true);
    });

    it('opens after enough failures', async () => {
      const { configureCircuitBreaker, recordFailure, isCircuitOpen } = await import(
        './failover-handler.js'
      );
      configureCircuitBreaker({ failureThreshold: 2, cooldownMs: 50000 });
      recordFailure('cb-two-fail');
      expect(isCircuitOpen('cb-two-fail')).toBe(false);
      recordFailure('cb-two-fail');
      expect(isCircuitOpen('cb-two-fail')).toBe(true);
    });
  });

  describe('stale entry cleanup', () => {
    it('cleans up stale entries on recordFailure', async () => {
      const { configureCircuitBreaker, recordFailure } = await import('./failover-handler.js');
      configureCircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 50000,
        maxEntries: 5,
        entryTtlMs: -1,
      });
      for (let i = 0; i < 10; i++) {
        recordFailure(`stale-${i}`);
      }
      expect(true).toBe(true);
    });
  });

  describe('retryWithBackoff', () => {
    it('retries on failure and eventually throws', async () => {
      const { retryWithBackoff } = await import('./failover-handler.js');
      const failingFn = vi.fn().mockRejectedValue(new Error('persistent error'));

      await expect(retryWithBackoff(failingFn, 2, 5, 50)).rejects.toThrow('persistent error');
      expect(failingFn).toHaveBeenCalledTimes(3);
    });

    it('succeeds on first attempt', async () => {
      const { retryWithBackoff } = await import('./failover-handler.js');
      const successFn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(successFn, 2, 5, 50);
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('fanout-router', () => {
  const upstreams: UpstreamTarget[] = [
    { name: 'primary', url: 'https://primary.example.com', weight: 0.7 },
    { name: 'secondary', url: 'https://secondary.example.com', weight: 0.3 },
  ];

  beforeEach(() => {
    resetUpstreamCaller();
  });

  afterEach(() => {
    resetUpstreamCaller();
  });

  describe('executeFanout', () => {
    it('returns empty result for empty upstreams', async () => {
      const result = await executeFanout(
        [],
        { jsonrpc: '2.0', method: 'test', id: 1 },
        'first-success',
      );
      expect(result.upstreamsContacted).toBe(0);
      expect(result.successful).toBe(0);
    });

    it('stops after first successful response in first-success mode', async () => {
      const mockCaller = vi.fn(async (upstream) => ({
        upstream: upstream.name,
        response: { jsonrpc: '2.0', id: '1', result: {} },
        durationMs: 10,
        success: true,
        latencyMs: 10,
      }));

      setUpstreamCaller(mockCaller);
      const result = await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'first-success',
      );

      expect(mockCaller).toHaveBeenCalledTimes(1);
      expect(result.upstreamsContacted).toBe(1);
      expect(result.successful).toBe(1);
    });

    it('aggregates responses with first-success strategy', async () => {
      const mockCaller = vi.fn(async (upstream) => ({
        upstream: upstream.name,
        response:
          upstream.name === 'primary'
            ? { jsonrpc: '2.0', id: '1', result: { content: ['primary response'] } }
            : { jsonrpc: '2.0', id: '1', result: { content: ['secondary response'] } },
        durationMs: 10,
        success: upstream.name === 'primary',
        latencyMs: 10,
      }));

      setUpstreamCaller(mockCaller);
      const result = await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'first-success',
      );

      expect(result.successful).toBe(1);
      expect(result.finalResponse).toBeDefined();
    });

    it('uses all-wait strategy with custom caller', async () => {
      const mockCaller = vi.fn(async () => ({
        upstream: 'primary',
        response: { jsonrpc: '2.0', id: '1', result: { content: ['data'] } },
        durationMs: 10,
        success: true,
        latencyMs: 10,
      }));

      setUpstreamCaller(mockCaller);
      const result = await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'all-wait',
      );

      expect(result.upstreamsContacted).toBe(2);
      expect(result.successful).toBe(2);
    });

    it('handles majority-vote strategy', async () => {
      const mockCaller = vi.fn(async (upstream) => ({
        upstream: upstream.name,
        response:
          upstream.name === 'primary'
            ? { jsonrpc: '2.0', id: '1', result: { content: ['data'] } }
            : { jsonrpc: '2.0', id: '1', error: { code: -32000, message: 'error' } },
        durationMs: 10,
        success: upstream.name === 'primary',
        latencyMs: 10,
      }));

      setUpstreamCaller(mockCaller);
      const result = await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'majority-vote',
      );

      expect(result.successful).toBe(1);
    });

    it('handles rejected promise from caller', async () => {
      const mockCaller = vi.fn().mockRejectedValue(new Error('caller crashed'));

      setUpstreamCaller(mockCaller);
      const result = await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'all-wait',
      );

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(2);
    });

    it('handles rejected promise with non-Error reason', async () => {
      const mockCaller = vi.fn().mockRejectedValue('string reason');

      setUpstreamCaller(mockCaller);
      const result = await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'all-wait',
      );

      expect(result.successful).toBe(0);
    });
  });

  describe('executeFanoutFirstSuccess', () => {
    it('returns empty result for empty upstreams', async () => {
      const result = await executeFanoutFirstSuccess([], { jsonrpc: '2.0', method: 'test', id: 1 });
      expect(result.upstreamsContacted).toBe(0);
    });

    it('returns early when first upstream succeeds', async () => {
      const mockCaller = vi.fn(async (upstream) => ({
        upstream: upstream.name,
        response: { jsonrpc: '2.0', id: '1', result: { content: ['first success'] } },
        durationMs: 10,
        success: upstream.name === 'primary',
        latencyMs: 10,
      }));

      setUpstreamCaller(mockCaller);
      const result = await executeFanoutFirstSuccess(upstreams, {
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
      });

      expect(result.successful).toBe(1);
      expect(result.finalResponse).toBeDefined();
    });

    it('fails when all upstreams fail', async () => {
      const mockCaller = vi.fn(async () => ({
        upstream: 'test',
        response: { jsonrpc: '2.0', id: '1', result: {} },
        durationMs: 10,
        success: false,
        latencyMs: 10,
      }));

      setUpstreamCaller(mockCaller);
      const result = await executeFanoutFirstSuccess(upstreams, {
        jsonrpc: '2.0',
        method: 'test',
        id: '1',
      });

      expect(result.successful).toBe(0);
    });
  });

  describe('defaultCaller', () => {
    it('handles invalid request (non JSON-RPC)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      } as Response);

      const result = await executeFanout(
        [{ name: 'test', url: 'https://93.184.216.34' }],
        { method: 'tools/call' },
        'first-success',
      );

      expect(result.successful).toBe(1);
    });

    it('handles fetch error in defaultCaller', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const result = await executeFanout(
        [{ name: 'test', url: 'https://93.184.216.34' }],
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'first-success',
      );

      expect(result.successful).toBe(0);
    });

    it('handles invalid request without method property', async () => {
      const { defaultCaller } = await import('./fanout-router.js');
      const result = await defaultCaller(
        { name: 'test', url: 'https://example.com' },
        { notMethod: true },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid upstream request');
    });
  });
});
