/**
 * mcp-gateway — Error Handler Middleware
 * Centralized error handling with JSON-RPC error formatting
 */

import { logger } from '@reaatech/mcp-gateway-core';
import type { NextFunction, Request, Response } from 'express';
import type { CategorizedError, ErrorCategory } from './types.js';

/**
 * JSON-RPC error codes
 */
export const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
};

/**
 * Map error category to JSON-RPC error code
 */
export function categoryToErrorCode(category: ErrorCategory): number {
  switch (category) {
    case 'validation':
      return JSONRPC_ERRORS.INVALID_PARAMS;
    case 'authentication':
      return JSONRPC_ERRORS.INVALID_REQUEST;
    case 'authorization':
      return JSONRPC_ERRORS.SERVER_ERROR;
    case 'rate_limit':
      return JSONRPC_ERRORS.SERVER_ERROR;
    case 'upstream':
      return JSONRPC_ERRORS.SERVER_ERROR;
    case 'timeout':
      return JSONRPC_ERRORS.SERVER_ERROR;
    default:
      return JSONRPC_ERRORS.INTERNAL_ERROR;
  }
}

/**
 * Map error category to HTTP status code
 */
export function categoryToHttpStatus(category: ErrorCategory): number {
  switch (category) {
    case 'validation':
      return 400;
    case 'authentication':
      return 401;
    case 'authorization':
      return 403;
    case 'rate_limit':
      return 429;
    case 'timeout':
      return 504;
    case 'upstream':
      return 502;
    default:
      return 500;
  }
}

/**
 * Format error as JSON-RPC response
 */
export function formatJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: Record<string, unknown>,
): object {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
}

/**
 * Error handler middleware
 */
export function error_handlerMiddleware() {
  return (
    err: Error | CategorizedError,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const category = (err as CategorizedError).category ?? 'internal';
    const statusCode = (err as CategorizedError).statusCode ?? categoryToHttpStatus(category);
    const code = categoryToErrorCode(category);
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.error(
      {
        requestId,
        category,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      'request error',
    );

    const id = (req.body as { id?: string | number })?.id ?? null;

    if (req.path === '/mcp') {
      res.status(statusCode).json(
        formatJsonRpcError(id, code, err.message, {
          category,
          ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
        }),
      );
      return;
    }

    res.status(statusCode).json({
      error: {
        message: err.message,
        category,
        requestId,
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
      },
    });
  };
}
