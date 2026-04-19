/**
 * mcp-gateway — MCP Client Types
 */

/**
 * Health status for upstream servers
 */
export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

/**
 * Upstream server configuration
 */
export interface UpstreamConfig {
  name: string;
  url: string;
  weight?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * JSON-RPC request structure
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response structure
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC error structure
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  maxConnectionsPerHost: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

/**
 * Upstream client response
 */
export interface UpstreamResponse {
  upstream: string;
  response: JsonRpcResponse;
  durationMs: number;
  success: boolean;
  error?: string;
}
