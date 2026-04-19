/**
 * mcp-gateway — Middleware Pipeline Types
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Pipeline context flows through all middleware
 */
export interface PipelineContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  startTime: number;
  abortController?: AbortController;
  timeoutMs?: number;
  [key: string]: unknown;
}

/**
 * Middleware function signature
 */
export type MiddlewareFn = (
  req: Request,
  res: Response,
  next: NextFunction,
  context: PipelineContext,
) => void | Promise<void>;

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'rate_limit'
  | 'upstream'
  | 'timeout'
  | 'internal';

/**
 * Categorized error with metadata
 */
export interface CategorizedError extends Error {
  category: ErrorCategory;
  statusCode: number;
  details: Record<string, unknown> | undefined;
}

/**
 * Request ID middleware options
 */
export interface RequestIdOptions {
  headerName: string;
  generateId: () => string;
}

/**
 * Logging middleware options
 */
export interface LoggingOptions {
  logger: (data: unknown) => void;
  skipPaths: string[];
}

/**
 * Timeout middleware options
 */
export interface TimeoutOptions {
  timeoutMs: number;
  message: string;
}

/**
 * Create a categorized error
 */
export function createCategorizedError(
  message: string,
  category: ErrorCategory,
  statusCode: number = 500,
  details: Record<string, unknown> | undefined = undefined,
): CategorizedError {
  const error = new Error(message) as CategorizedError;
  error.category = category;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
