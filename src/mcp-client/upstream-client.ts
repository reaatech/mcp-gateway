/**
 * mcp-gateway — Upstream MCP Client
 * Sends JSON-RPC requests to upstream MCP servers
 */

import type { JsonRpcRequest, JsonRpcResponse, UpstreamConfig, UpstreamResponse } from './types.js';
import { validateUpstreamUrlAsync } from '../config/upstream-loader.js';

/**
 * Create a JSON-RPC request
 */
let requestIdCounter = 0;

export function createJsonRpcRequest(
  method: string,
  params?: unknown,
  id?: string | number,
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: id ?? ++requestIdCounter,
    method,
    params,
  };
}

/**
 * Send a request to an upstream MCP server
 */
export async function sendUpstreamRequest(
  config: UpstreamConfig,
  request: JsonRpcRequest,
): Promise<UpstreamResponse> {
  const startTime = Date.now();
  const timeout = config.timeoutMs ?? 30000;

  // Validate URL for SSRF protection before making request
  const urlValidation = await validateUpstreamUrlAsync(config.url);
  if (!urlValidation.valid) {
    const errorMsg = urlValidation.reason ?? 'Invalid upstream URL';
    return {
      upstream: config.name,
      response: {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: errorMsg,
        },
      },
      durationMs: Date.now() - startTime,
      success: false,
      error: errorMsg,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(`${config.url}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const durationMs = Date.now() - startTime;
      return {
        upstream: config.name,
        response: {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: `HTTP ${response.status}: ${response.statusText}`,
          },
        },
        durationMs,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as JsonRpcResponse;
    const durationMs = Date.now() - startTime;

    return {
      upstream: config.name,
      response: data,
      durationMs,
      success: !data.error,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isAbort = error instanceof Error && (error.name === 'AbortError' || error.message === 'The operation was aborted.' || error.message === 'The operation was aborted');
    const message = isAbort ? 'Request timeout' : (error instanceof Error ? error.message : 'Unknown error');

    return {
      upstream: config.name,
      response: {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: message === 'The operation was aborted.' ? 'Request timeout' : message,
        },
      },
      durationMs,
      success: false,
      error: message,
    };
  }
}
