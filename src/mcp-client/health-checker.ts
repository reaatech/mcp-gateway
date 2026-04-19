/**
 * mcp-gateway — Health Checker
 * Periodic health checks for upstream servers
 */

import type { UpstreamConfig, HealthStatus, HealthCheckConfig } from './types.js';
import { createJsonRpcRequest, sendUpstreamRequest } from './upstream-client.js';

/**
 * Default health check configuration
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  intervalMs: 30000,
  timeoutMs: 5000,
  unhealthyThreshold: 3,
  healthyThreshold: 2,
};

/**
 * Health status for an upstream
 */
export interface UpstreamHealth {
  name: string;
  url: string;
  status: HealthStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheck: number | undefined;
  lastError: string | undefined;
}

/**
 * Health checker for upstream servers
 */
export class HealthChecker {
  private healthStatus = new Map<string, UpstreamHealth>();
  private config: HealthCheckConfig;
  private intervals: ReturnType<typeof setInterval>[] = [];

  constructor(config: HealthCheckConfig = DEFAULT_HEALTH_CHECK_CONFIG) {
    this.config = config;
  }

  /**
   * Initialize health status for upstreams
   */
  init(upstreams: UpstreamConfig[]): void {
    for (const upstream of upstreams) {
      this.healthStatus.set(upstream.name, {
        name: upstream.name,
        url: upstream.url,
        status: 'unknown',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastCheck: undefined,
        lastError: undefined,
      });
    }
  }

  /**
   * Start periodic health checks
   */
  start(upstreams: UpstreamConfig[]): void {
    this.init(upstreams);

    // Run initial health check
    for (const upstream of upstreams) {
      this.checkHealth(upstream).catch(console.error);
    }

    // Schedule periodic checks
    const intervalId = setInterval(() => {
      for (const upstream of upstreams) {
        this.checkHealth(upstream).catch(console.error);
      }
    }, this.config.intervalMs);

    this.intervals.push(intervalId);
  }

  /**
   * Stop health checks and clear all intervals
   * Should be called during application shutdown to prevent memory leaks
   */
  stop(): void {
    for (const intervalId of this.intervals) {
      clearInterval(intervalId);
    }
    this.intervals = [];
  }

  /**
   * Alias for stop() - follows same pattern as other gateway components
   */
  close(): void {
    this.stop();
  }

  /**
   * Check health of a single upstream
   */
  private async checkHealth(config: UpstreamConfig): Promise<void> {
    const health = this.healthStatus.get(config.name);
    if (!health) {return;}

    const request = createJsonRpcRequest('ping');
    const healthConfig: UpstreamConfig = { ...config, timeoutMs: this.config.timeoutMs };

    try {
      const response = await sendUpstreamRequest(healthConfig, request);

      if (response.success) {
        health.consecutiveSuccesses++;
        health.consecutiveFailures = 0;
        health.lastError = undefined;

        if (health.consecutiveSuccesses >= this.config.healthyThreshold) {
          health.status = 'healthy';
        }
      } else {
        health.consecutiveFailures++;
        health.consecutiveSuccesses = 0;
        health.lastError = response.error;

        if (health.consecutiveFailures >= this.config.unhealthyThreshold) {
          health.status = 'unhealthy';
        }
      }
    } catch (error) {
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;
      health.lastError = error instanceof Error ? error.message : 'Unknown error';

      if (health.consecutiveFailures >= this.config.unhealthyThreshold) {
        health.status = 'unhealthy';
      }
    }

    health.lastCheck = Date.now();
  }

  /**
   * Get health status for all upstreams
   */
  getStatus(): Map<string, UpstreamHealth> {
    return new Map(this.healthStatus);
  }

  /**
   * Get health status for a specific upstream
   */
  getUpstreamStatus(name: string): UpstreamHealth | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * Check if an upstream is healthy
   */
  isHealthy(name: string): boolean {
    const health = this.healthStatus.get(name);
    return health?.status === 'healthy';
  }

  /**
   * Get all healthy upstreams
   */
  getHealthyUpstreams(upstreams: UpstreamConfig[]): UpstreamConfig[] {
    return upstreams.filter(u => this.isHealthy(u.name));
  }
}
