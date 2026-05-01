/**
 * mcp-gateway — Response Aggregator
 * Implements aggregation strategies for fan-out responses
 */

import type { AggregationStrategy, FanOutResult, UpstreamResponse } from './types.js';

/**
 * First-success strategy: return first valid response, cancel others
 */
function aggregateFirstSuccess(responses: UpstreamResponse[]): FanOutResult {
  const successful = responses.find((r) => r.success);
  return {
    strategy: 'first-success',
    upstreamsContacted: responses.length,
    successful: responses.filter((r) => r.success).length,
    failed: responses.filter((r) => !r.success).length,
    responses,
    finalResponse: successful?.response,
  };
}

/**
 * All-wait strategy: wait for all responses, merge results
 */
function aggregateAllWait(responses: UpstreamResponse[]): FanOutResult {
  const successfulResponses = responses.filter((r) => r.success).map((r) => r.response);

  // Merge content from all successful responses
  let mergedContent: unknown = null;
  if (successfulResponses.length > 0) {
    const contents = successfulResponses
      .filter(
        (r): r is { content: unknown[] } => typeof r === 'object' && r !== null && 'content' in r,
      )
      .map((r) => r.content)
      .filter(Array.isArray);

    if (contents.length > 0) {
      mergedContent = { content: contents.flat() };
    } else {
      // Use first successful response as-is
      mergedContent = successfulResponses[0];
    }
  }

  return {
    strategy: 'all-wait',
    upstreamsContacted: responses.length,
    successful: responses.filter((r) => r.success).length,
    failed: responses.filter((r) => !r.success).length,
    responses,
    finalResponse: mergedContent,
  };
}

/**
 * Majority-vote strategy: return consensus from multiple upstreams
 */
function aggregateMajorityVote(responses: UpstreamResponse[]): FanOutResult {
  const successful = responses.filter((r) => r.success);

  if (successful.length === 0) {
    return {
      strategy: 'majority-vote',
      upstreamsContacted: responses.length,
      successful: 0,
      failed: responses.length,
      responses,
    };
  }

  // Simple majority: if more than half succeeded, use first successful response
  if (successful.length > responses.length / 2) {
    const firstResponse = successful[0];
    if (!firstResponse) {
      return {
        strategy: 'majority-vote',
        upstreamsContacted: responses.length,
        successful: successful.length,
        failed: responses.filter((r) => !r.success).length,
        responses,
      };
    }
    return {
      strategy: 'majority-vote',
      upstreamsContacted: responses.length,
      successful: successful.length,
      failed: responses.filter((r) => !r.success).length,
      responses,
      finalResponse: firstResponse.response,
    };
  }

  // No majority - return error
  return {
    strategy: 'majority-vote',
    upstreamsContacted: responses.length,
    successful: successful.length,
    failed: responses.filter((r) => !r.success).length,
    responses,
  };
}

/**
 * Aggregate responses based on strategy
 */
export function aggregateResponses(
  responses: UpstreamResponse[],
  strategy: AggregationStrategy,
): FanOutResult {
  switch (strategy) {
    case 'first-success':
      return aggregateFirstSuccess(responses);
    case 'all-wait':
      return aggregateAllWait(responses);
    case 'majority-vote':
      return aggregateMajorityVote(responses);
    default:
      return aggregateFirstSuccess(responses);
  }
}
