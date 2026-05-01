/**
 * mcp-gateway — Request/Response Logging Middleware
 * Structured JSON logging for all requests and responses
 */

import type { NextFunction, Request, Response } from 'express';
import type { LoggingOptions, PipelineContext } from './types.js';

/**
 * Default options
 */
const DEFAULT_OPTIONS: LoggingOptions = {
  logger: (data) => console.log(JSON.stringify(data)),
  skipPaths: ['/health'],
};

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  requestId: string;
  tenantId: string | undefined;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent: string | undefined;
  ip: string | undefined;
  [key: string]: unknown;
}

/**
 * Request/response logging middleware
 */
export function loggingMiddleware(options: Partial<LoggingOptions> = {}) {
  const { logger, skipPaths } = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction, context: PipelineContext): void => {
    if (skipPaths?.includes(req.path)) {
      next();
      return;
    }

    const startTime = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        requestId: context.requestId,
        tenantId: context.tenantId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      };

      logger(entry);
    });

    next();
  };
}

/**
 * Log upstream call
 */
export function logUpstreamCall(
  logger: (data: unknown) => void,
  data: {
    requestId: string;
    tenantId?: string;
    upstream: string;
    method: string;
    tool?: string;
    durationMs: number;
    success: boolean;
    error?: string;
  },
): void {
  logger({
    timestamp: new Date().toISOString(),
    level: data.success ? 'info' : 'warn',
    requestId: data.requestId,
    tenantId: data.tenantId,
    upstream: data.upstream,
    method: data.method,
    tool: data.tool,
    durationMs: data.durationMs,
    success: data.success,
    error: data.error,
  });
}
