/**
 * mcp-gateway — Fan-out Router Unit Tests
 */

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
import { selectByHealth, selectUpstreams, selectWeightedRandom } from './upstream-selector.js';

describe('response-aggregator', () => {
  const makeResponse = (upstream: string, success: boolean): UpstreamResponse => ({
    upstream,
    success,
    response: success ? { content: [`response from ${upstream}`] } : undefined,
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
  });

  describe('selectUpstreams', () => {
    it('selects upstreams with default strategy', () => {
      const result = selectUpstreams(upstreams);
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

  describe('filterHealthyUpstreams', () => {
    it('filters out upstreams with open circuits', () => {
      const upstreams: UpstreamTarget[] = [
        { name: 'healthy', url: 'https://healthy.example.com' },
        { name: 'unhealthy', url: 'https://unhealthy.example.com' },
      ];

      // Make unhealthy circuit open
      for (let i = 0; i < 5; i++) {
        recordFailure('unhealthy');
      }

      const result = filterHealthyUpstreams(upstreams);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('healthy');

      // Cleanup
      recordSuccess('unhealthy');
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

    it('uses defaultCaller when no override', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      } as unknown as Response;
      global.fetch = vi.fn(async () => mockResponse);

      await executeFanout(
        [{ name: 'test', url: 'https://93.184.216.34' }],
        { jsonrpc: '2.0', method: 'test', id: '1' },
        'first-success',
        5000,
      );

      expect(global.fetch).toHaveBeenCalled();
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

  describe('setUpstreamCaller', () => {
    it('allows overriding the upstream caller', async () => {
      const customCaller = vi.fn(async () => ({
        upstream: 'custom',
        response: { jsonrpc: '2.0', id: '1', result: { custom: true } },
        durationMs: 1,
        success: true,
        latencyMs: 1,
      }));

      setUpstreamCaller(customCaller);
      await executeFanout(upstreams, { jsonrpc: '2.0', method: 'test', id: '1' }, 'first-success');

      expect(customCaller).toHaveBeenCalled();
      resetUpstreamCaller();
    });
  });

  describe('toJsonRpcRequest', () => {
    it('passes through valid JSON-RPC request', async () => {
      const mockCaller = vi.fn(async (upstream, request) => {
        const req = request as { jsonrpc: string; method: string; id: string | number };
        expect(req.jsonrpc).toBe('2.0');
        expect(req.method).toBe('tools/call');
        return {
          upstream: upstream.name,
          response: { jsonrpc: '2.0', id: req.id, result: {} },
          durationMs: 10,
          success: true,
          latencyMs: 10,
        };
      });

      setUpstreamCaller(mockCaller);
      await executeFanout(
        upstreams,
        { jsonrpc: '2.0', method: 'tools/call', id: '1', params: {} },
        'first-success',
      );

      expect(mockCaller).toHaveBeenCalled();
      resetUpstreamCaller();
    });
  });
});
