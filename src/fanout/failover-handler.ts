/**
 * mcp-gateway — Failover Handler
 * Handles upstream failures with retry logic and circuit breaker integration
 */

import type { UpstreamTarget } from './types.js';

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  lastActivity: number;
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  maxEntries?: number;
  entryTtlMs?: number;
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 5000,
  maxEntries: 1000,
  entryTtlMs: 3600000, // 1 hour
};

let cbConfig: CircuitBreakerConfig = { ...DEFAULT_CB_CONFIG };
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Clean up stale circuit breaker entries
 */
function cleanupStaleEntries(): void {
  const now = Date.now();
  const maxEntries = cbConfig.maxEntries ?? 1000;
  const entryTtlMs = cbConfig.entryTtlMs ?? 3600000;

  // Remove entries that haven't been active for too long
  for (const [key, state] of circuitBreakers.entries()) {
    if (now - state.lastActivity > entryTtlMs) {
      circuitBreakers.delete(key);
    }
  }

  // If still too many entries, remove oldest ones
  if (circuitBreakers.size > maxEntries) {
    const entries = Array.from(circuitBreakers.entries());
    entries.sort((a, b) => a[1].lastActivity - b[1].lastActivity);
    const toRemove = entries.slice(0, entries.length - maxEntries);
    for (const [key] of toRemove) {
      circuitBreakers.delete(key);
    }
  }
}

/**
 * Configure circuit breaker parameters
 */
export function configureCircuitBreaker(config: Partial<CircuitBreakerConfig>): void {
  cbConfig = { ...cbConfig, ...config };
}

/**
 * Get current circuit breaker configuration
 */
export function getCircuitBreakerConfig(): CircuitBreakerConfig {
  return { ...cbConfig };
}

/**
 * Check if circuit breaker is open for an upstream
 */
export function isCircuitOpen(upstreamName: string): boolean {
  const state = circuitBreakers.get(upstreamName);
  if (!state) {return false;}

  if (state.state === 'open') {
    if (Date.now() - state.lastFailure > cbConfig.cooldownMs) {
      circuitBreakers.set(upstreamName, { ...state, state: 'half-open', lastActivity: Date.now() });
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Record a failure for circuit breaker
 */
export function recordFailure(upstreamName: string): void {
  cleanupStaleEntries();

  const existing = circuitBreakers.get(upstreamName) ?? {
    failures: 0,
    lastFailure: 0,
    state: 'closed' as const,
    lastActivity: Date.now(),
  };

  const failures = existing.failures + 1;
  let state: CircuitBreakerState['state'] = existing.state;

  if (existing.state === 'half-open') {
    state = 'open';
  } else if (failures >= cbConfig.failureThreshold) {
    state = 'open';
  }

  circuitBreakers.set(upstreamName, {
    failures,
    lastFailure: Date.now(),
    state,
    lastActivity: Date.now(),
  });
}

/**
 * Record a success for circuit breaker
 */
export function recordSuccess(upstreamName: string): void {
  cleanupStaleEntries();

  circuitBreakers.set(upstreamName, {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
    lastActivity: Date.now(),
  });
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100,
  maxDelayMs: number = 5000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 100, maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Filter out upstreams with open circuit breakers
 */
export function filterHealthyUpstreams(upstreams: UpstreamTarget[]): UpstreamTarget[] {
  return upstreams.filter(u => !isCircuitOpen(u.name));
}

/**
 * Get circuit breaker status for all upstreams
 */
export function getCircuitBreakerStatus(): Map<string, CircuitBreakerState> {
  return new Map(circuitBreakers);
}