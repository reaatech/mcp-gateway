/**
 * mcp-gateway — Health Checks
 * Liveness, readiness, and deep health checks
 */

import type { ComponentHealth, HealthStatus } from '@reaatech/mcp-gateway-core';
import { SERVICE_VERSION } from '@reaatech/mcp-gateway-core';

/**
 * Probe function signature: returns ComponentHealth or throws
 */
export type HealthProbe = () => Promise<ComponentHealth>;

/**
 * Registry of named health probes
 */
const probes = new Map<string, HealthProbe>();

/**
 * Register a health probe under a component name
 */
export function registerProbe(name: string, probe: HealthProbe): void {
  probes.set(name, probe);
}

/**
 * Remove a registered probe (useful for tests / shutdown)
 */
export function unregisterProbe(name: string): void {
  probes.delete(name);
}

/**
 * Reset all probes (test helper)
 */
export function resetProbes(): void {
  probes.clear();
}

/**
 * Liveness: the process is up. Always healthy unless crashed.
 */
export function getLiveness(): HealthStatus {
  return {
    status: 'healthy',
    version: SERVICE_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    components: {
      process: { status: 'healthy' },
    },
  };
}

/**
 * Readiness: lightweight check — are required components initialized?
 */
export async function getReadiness(): Promise<HealthStatus> {
  const components: Record<string, ComponentHealth> = {};
  let overall: HealthStatus['status'] = 'healthy';

  for (const [name, probe] of probes.entries()) {
    const result = await runProbe(probe);
    components[name] = result;
    if (result.status === 'unhealthy') {
      overall = 'unhealthy';
    } else if (result.status === 'degraded' && overall === 'healthy') {
      overall = 'degraded';
    }
  }

  return {
    status: overall,
    version: SERVICE_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    components,
  };
}

/**
 * Deep health: exhaustive check of all upstream/Redis/etc probes.
 * Same as readiness but intended for operator-facing debugging.
 */
export async function getDeepHealth(): Promise<HealthStatus> {
  return getReadiness();
}

/**
 * Execute a probe and normalize the result
 */
async function runProbe(probe: HealthProbe): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const result = await probe();
    return {
      ...result,
      latencyMs: result.latencyMs ?? Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Build a standard Redis probe
 */
export function createRedisProbe(pingFn: () => Promise<unknown>, timeoutMs = 2000): HealthProbe {
  return async (): Promise<ComponentHealth> => {
    const start = Date.now();
    try {
      await Promise.race([
        pingFn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs),
        ),
      ]);
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Redis unreachable',
        latencyMs: Date.now() - start,
      };
    }
  };
}

/**
 * Build an upstream HTTP probe
 */
export function createUpstreamProbe(url: string, timeoutMs = 2000): HealthProbe {
  return async (): Promise<ComponentHealth> => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return {
          status: 'degraded',
          message: `HTTP ${response.status}`,
          latencyMs,
        };
      }
      return { status: 'healthy', latencyMs };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Upstream unreachable',
        latencyMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
