/**
 * mcp-gateway — Middleware Pipeline
 * Orchestrates middleware execution with context propagation
 */

import type { NextFunction, Request, Response } from 'express';
import type { MiddlewareFn, PipelineContext } from './types.js';

/**
 * Middleware pipeline orchestrator
 */
export class Pipeline {
  private middleware: MiddlewareFn[] = [];

  /**
   * Add middleware to the pipeline
   */
  use(fn: MiddlewareFn): Pipeline {
    this.middleware.push(fn);
    return this;
  }

  /**
   * Create Express middleware that runs the pipeline
   */
  handler(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const context: PipelineContext = {
        requestId: (req.headers['x-request-id'] as string) || '',
        startTime: Date.now(),
      };

      this.execute(0, req, res, next, context);
    };
  }

  /**
   * Execute middleware in sequence
   */
  private execute(
    index: number,
    req: Request,
    res: Response,
    next: NextFunction,
    context: PipelineContext,
  ): void {
    // All middleware executed - call Express next
    if (index >= this.middleware.length) {
      next();
      return;
    }

    const fn = this.middleware[index];
    if (!fn) {
      next();
      return;
    }

    // Create a next function that continues the pipeline
    const continuePipeline = (err?: unknown) => {
      if (err) {
        next(err);
      } else {
        this.execute(index + 1, req, res, next, context);
      }
    };

    try {
      const result = fn(req, res, continuePipeline, context);

      // Handle async middleware
      if (result instanceof Promise) {
        result.catch((err) => next(err));
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get the number of middleware in the pipeline
   */
  size(): number {
    return this.middleware.length;
  }

  /**
   * Clear all middleware
   */
  clear(): void {
    this.middleware = [];
  }
}

/**
 * Create a new pipeline instance
 */
export function createPipeline(): Pipeline {
  return new Pipeline();
}
