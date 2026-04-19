/**
 * mcp-gateway — Timeout Middleware
 * Enforces request timeouts with graceful cancellation
 */

import type { Request, Response, NextFunction } from 'express';
import type { PipelineContext, TimeoutOptions } from './types.js';
import { createCategorizedError } from './types.js';

/**
 * Default options
 */
const DEFAULT_OPTIONS: TimeoutOptions = {
  timeoutMs: 30000,
  message: 'Request timeout',
};

/**
 * Timeout middleware
 */
export function timeoutMiddleware(options: Partial<TimeoutOptions> = {}) {
  const { timeoutMs, message } = { ...DEFAULT_OPTIONS, ...options };

  return (_req: Request, res: Response, next: NextFunction, context: PipelineContext): void => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();

      // If response not yet sent, send timeout error
      if (!res.headersSent) {
        const error = createCategorizedError(message, 'timeout', 504, {
          timeoutMs,
        });
        next(error);
      }
    }, timeoutMs);

    const cleanup = () => clearTimeout(timeoutId);
    res.on('finish', cleanup);
    res.on('close', cleanup);

    // Store abort controller in context for upstream calls
    context.abortController = controller;

    // Store timeout in context
    context.timeoutMs = timeoutMs;

    next();
  };
}

/**
 * Execute a function with timeout
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message = 'Operation timeout',
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError')) {
      throw createCategorizedError(message, 'timeout', 504, { timeoutMs });
    }
    throw error;
  }
}
