/**
 * mcp-gateway — Upstream Selector
 * Load balancing and upstream selection strategies
 */

import type { UpstreamTarget } from './types.js';

/**
 * Round-robin state
 */
let roundRobinIndex = 0;

/**
 * Round-robin load balancing
 */
export function selectRoundRobin(upstreams: UpstreamTarget[]): UpstreamTarget[] {
  if (upstreams.length === 0) {
    return [];
  }

  const sorted = [...upstreams].sort((a, b) => {
    const aIdx = upstreams.indexOf(a);
    const bIdx = upstreams.indexOf(b);
    return (
      ((((aIdx - roundRobinIndex) % upstreams.length) + upstreams.length) % upstreams.length) -
      ((((bIdx - roundRobinIndex) % upstreams.length) + upstreams.length) % upstreams.length)
    );
  });

  roundRobinIndex = (roundRobinIndex + 1) % upstreams.length;
  return sorted;
}

/**
 * Weighted random selection
 */
export function selectWeightedRandom(upstreams: UpstreamTarget[]): UpstreamTarget[] {
  if (upstreams.length === 0) {
    return [];
  }

  const totalWeight = upstreams.reduce((sum, u) => sum + (u.weight ?? 1), 0);
  let random = Math.random() * totalWeight;

  for (const upstream of upstreams) {
    random -= upstream.weight ?? 1;
    if (random <= 0) {
      return [upstream, ...upstreams.filter((u) => u !== upstream)];
    }
  }

  return upstreams;
}

/**
 * Health-based selection (healthy upstreams first)
 */
export function selectByHealth(upstreams: UpstreamTarget[]): UpstreamTarget[] {
  const healthy = upstreams.filter((u) => u.healthy !== false);
  const unhealthy = upstreams.filter((u) => u.healthy === false);
  return [...healthy, ...unhealthy];
}

/**
 * Select upstreams using combined strategy
 */
export function selectUpstreams(
  upstreams: UpstreamTarget[],
  strategy: 'round-robin' | 'weighted' | 'health' = 'weighted',
): UpstreamTarget[] {
  // First filter by health
  const sorted = selectByHealth(upstreams);

  switch (strategy) {
    case 'round-robin':
      return selectRoundRobin(sorted);
    case 'weighted':
      return selectWeightedRandom(sorted);
    default:
      return sorted;
  }
}
