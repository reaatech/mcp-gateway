/**
 * mcp-gateway — Validation Middleware
 *
 * Express middleware for validating MCP JSON-RPC requests.
 */

import type { NextFunction, Request, Response } from 'express';
import { getSchemaValidator } from './schema-validator.js';
import { JSONRPC_ERRORS, type JsonRpcError } from './types.js';

/**
 * Extended Express request with validation context
 */
export interface ValidatedRequest extends Request {
  /** Parsed JSON-RPC body */
  rpcBody?: Record<string, unknown>;
  /** Validation errors if any */
  validationErrors?: JsonRpcError;
}

/**
 * Create validation middleware
 */
export function createValidationMiddleware() {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    // Skip validation for non-POST requests
    if (req.method !== 'POST') {
      next();
      return;
    }

    // Skip validation for non-MCP endpoints
    if (!req.path.startsWith('/mcp')) {
      next();
      return;
    }

    const body = req.body;

    // Check if body is present
    if (!body) {
      req.validationErrors = {
        code: JSONRPC_ERRORS.INVALID_REQUEST,
        message: 'Request body is required',
      };
      sendJsonRpcError(res, req, req.validationErrors);
      return;
    }

    // Validate JSON-RPC structure
    const validator = getSchemaValidator();
    const result = validator.validateJsonRpcRequest(body);

    if (!result.valid) {
      req.validationErrors = {
        code: result.errorCode || JSONRPC_ERRORS.INVALID_REQUEST,
        message: result.errorMessage || 'Invalid Request',
        data: {
          errors: result.errors,
        },
      };
      sendJsonRpcError(res, req, req.validationErrors);
      return;
    }

    // Store validated body for downstream middleware
    req.rpcBody = body as Record<string, unknown>;

    next();
  };
}

/**
 * Validate MCP method-specific parameters
 * This should be called after auth middleware has identified the tenant
 */
export function validateMcpMethod(
  method: string,
  params: unknown,
): { valid: boolean; error?: JsonRpcError } {
  const validator = getSchemaValidator();
  const result = validator.validateMcpRequest(method, params);

  if (!result.valid) {
    return {
      valid: false,
      error: {
        code: result.errorCode || JSONRPC_ERRORS.INVALID_PARAMS,
        message: result.errorMessage || 'Invalid params',
        data: {
          errors: result.errors,
        },
      },
    };
  }

  return { valid: true };
}

/**
 * Validate tool call arguments against a tool schema
 */
export function validateToolCall(
  toolName: string,
  arguments_: Record<string, unknown>,
  toolSchema: Record<string, unknown>,
): { valid: boolean; error?: JsonRpcError } {
  const validator = getSchemaValidator();
  const result = validator.validateToolArguments(toolName, arguments_, toolSchema);

  if (!result.valid) {
    return {
      valid: false,
      error: {
        code: result.errorCode || JSONRPC_ERRORS.INVALID_PARAMS,
        message: result.errorMessage || 'Invalid params',
        data: {
          errors: result.errors,
        },
      },
    };
  }

  return { valid: true };
}

/**
 * Send a JSON-RPC error response
 */
function sendJsonRpcError(res: Response, req: Request, error: JsonRpcError): void {
  // Try to extract the request ID if available
  const id = (req.body as Record<string, unknown>)?.id ?? null;

  res.status(400).json({
    jsonrpc: '2.0',
    id,
    error,
  });
}

/**
 * Format validation errors for JSON-RPC response
 */
export function formatValidationResponse(
  requestId: string | number | null,
  errors: Array<{ field: string; message: string }>,
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: requestId,
    error: {
      code: JSONRPC_ERRORS.INVALID_PARAMS,
      message: 'Invalid params',
      data: {
        errors,
      },
    },
  };
}
