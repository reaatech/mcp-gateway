/**
 * mcp-gateway — Request ID Middleware
 * Generates and propagates unique request IDs
 */

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { PipelineContext, RequestIdOptions } from './types.js';

/**
 * Default options
 */
const DEFAULT_OPTIONS: RequestIdOptions = {
  headerName: 'x-request-id',
  generateId: () => randomUUID(),
};

/**
 * Request ID middleware factory
 */
export function request_idMiddleware(options: Partial<RequestIdOptions> = {}) {
  const { headerName, generateId } = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction, context: PipelineContext): void => {
    // Get or generate request ID
    const requestId = (req.headers[headerName.toLowerCase()] as string) || generateId();

    // Store in context
    context.requestId = requestId;
    context.startTime = Date.now();

    // Set on response
    res.setHeader(headerName, requestId);

    // Also set on request object for downstream access
    req.headers[headerName.toLowerCase()] = requestId;

    next();
  };
}
