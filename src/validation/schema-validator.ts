/**
 * mcp-gateway — Schema Validator
 * 
 * Core JSON Schema validation engine using AJV for MCP messages.
 */

import Ajv from 'ajv';
import type { ValidationResult, ValidationError, SchemaCacheEntry } from './types.js';
import { jsonRpcRequestSchema, mcpMethodSchemas } from './mcp-schema.js';
import { JSONRPC_ERRORS } from './types.js';

type ValidateFunction = (data: unknown) => boolean;
type AjvErrorObject = {
  keyword: string;
  instancePath: string;
  schemaPath?: string;
  params: Record<string, unknown>;
  message?: string;
  schema?: unknown;
  data?: unknown;
  parentSchema?: Record<string, unknown>;
};

/**
 * Default cache TTL: 5 minutes
 */
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Schema cache for compiled validators
 */
class SchemaValidator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly ajv: any;
  private readonly schemaCache: Map<string, SchemaCacheEntry>;

  constructor() {
    this.ajv = new (Ajv as unknown as { new (opts: object): unknown })({
      allErrors: true,
      verbose: true,
      coerceTypes: false,
      useDefaults: false,
    });

    // Compile and cache JSON-RPC base schema
    this.ajv.compile(jsonRpcRequestSchema);

    // Compile and cache MCP method schemas
    for (const [, schema] of Object.entries(mcpMethodSchemas)) {
      this.ajv.compile(schema);
    }

    this.schemaCache = new Map();
  }

  /**
   * Validate a JSON-RPC request
   */
  validateJsonRpcRequest(request: unknown): ValidationResult {
    if (!request || typeof request !== 'object') {
      return {
        valid: false,
        errors: [
          {
            field: 'root',
            expected: 'object',
            received: typeof request,
            message: 'Request must be a JSON object',
          },
        ],
        errorCode: JSONRPC_ERRORS.INVALID_REQUEST,
        errorMessage: 'Invalid Request',
      };
    }

    const validate = this.ajv.compile(jsonRpcRequestSchema);
    const valid = validate(request);

    if (valid) {
      return { valid: true, errors: [] };
    }

    return this.formatErrors(validate.errors as AjvErrorObject[] || []);
  }

  /**
   * Validate an MCP method request
   */
  validateMcpRequest(method: string, params: unknown): ValidationResult {
    const schema = mcpMethodSchemas[method];

    if (!schema) {
      return {
        valid: false,
        errors: [
          {
            field: 'method',
            expected: `one of [${Object.keys(mcpMethodSchemas).join(', ')}]`,
            received: method,
            message: `Unknown MCP method: ${method}`,
          },
        ],
        errorCode: JSONRPC_ERRORS.METHOD_NOT_FOUND,
        errorMessage: 'Method not found',
      };
    }

    const validate = this.ajv.compile(schema);
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    };

    const valid = validate(request);

    if (valid) {
      return { valid: true, errors: [] };
    }

    return this.formatErrors(validate.errors as AjvErrorObject[] || []);
  }

  /**
   * Validate tool arguments against a tool schema
   */
  validateToolArguments(
    toolName: string,
    arguments_: Record<string, unknown>,
    toolSchema: Record<string, unknown>,
  ): ValidationResult {
    const cacheKey = `tool:${toolName}`;
    const cached = this.schemaCache.get(cacheKey);

    // Check if cache entry is expired
    if (cached && Date.now() - cached.cachedAt > cached.ttl) {
      this.schemaCache.delete(cacheKey);
    }

    let validator = this.schemaCache.get(cacheKey)?.validator as ValidateFunction | undefined;

    if (!validator) {
      validator = this.ajv.compile(toolSchema) as unknown as ValidateFunction;
      this.schemaCache.set(cacheKey, {
        schema: toolSchema,
        cachedAt: Date.now(),
        ttl: DEFAULT_CACHE_TTL,
        validator: validator as unknown,
      });
    }

    const valid = validator(arguments_);

    if (valid) {
      return { valid: true, errors: [] };
    }

    return this.formatErrors((validator as { errors?: AjvErrorObject[] }).errors || [], 'arguments');
  }

  /**
   * Cache a tool schema
   */
  cacheToolSchema(
    toolName: string,
    schema: Record<string, unknown>,
    ttl?: number,
  ): void {
    const cacheKey = `tool:${toolName}`;
    const validator = this.ajv.compile(schema);

    this.schemaCache.set(cacheKey, {
      schema,
      cachedAt: Date.now(),
      ttl: ttl ?? DEFAULT_CACHE_TTL,
      validator: validator as unknown,
    });
  }

  /**
   * Get a cached tool schema
   */
  getToolSchema(toolName: string): Record<string, unknown> | undefined {
    const cacheKey = `tool:${toolName}`;
    const entry = this.schemaCache.get(cacheKey);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.cachedAt > entry.ttl) {
      this.schemaCache.delete(cacheKey);
      return undefined;
    }

    return entry.schema;
  }

  /**
   * Clear the schema cache
   */
  clearCache(): void {
    this.schemaCache.clear();
  }

  /**
   * Format AJV errors into our ValidationError format
   */
  private formatErrors(
    errors: AjvErrorObject[],
    defaultField = 'params',
  ): ValidationResult {
    const validationErrors: ValidationError[] = errors.map((error) => {
      const field = error.instancePath
        ? error.instancePath.slice(1) // Remove leading slash
        : defaultField;

      let expected = error.schema as string;
      if (typeof expected === 'object') {
        expected = JSON.stringify(expected);
      }

      const received = error.data !== undefined ? typeof error.data : 'undefined';

      return {
        field: field || 'root',
        expected: error.message || String(expected),
        received,
        message: this.buildErrorMessage(error, field),
      };
    });

    return {
      valid: false,
      errors: validationErrors,
      errorCode: JSONRPC_ERRORS.INVALID_PARAMS,
      errorMessage: 'Invalid params',
    };
  }

  /**
   * Build a human-readable error message from AJV error
   */
  private buildErrorMessage(error: AjvErrorObject, field: string): string {
    const { keyword, params, message } = error;

    switch (keyword) {
      case 'required':
        return `Missing required field: ${(params as { missingProperty: string }).missingProperty}`;

      case 'type':
        return `Field "${field}" must be of type ${(params as { type: string }).type}, got ${error.data !== undefined ? typeof error.data : 'undefined'}`;

      case 'additionalProperties':
        return `Unknown field: ${(params as { additionalProperty: string }).additionalProperty}`;

      case 'minLength':
        return `Field "${field}" must be at least ${(params as { limit: number }).limit} characters`;

      case 'const':
        return `Field "${field}" must be exactly "${params}"`;

      default:
        return message || `Validation failed for field "${field}"`;
    }
  }
}

// Singleton instance
let schemaValidator: SchemaValidator | undefined;

/**
 * Get or create the schema validator singleton
 */
export function getSchemaValidator(): SchemaValidator {
  if (!schemaValidator) {
    schemaValidator = new SchemaValidator();
  }
  return schemaValidator;
}

/**
 * Reset the schema validator (for testing)
 */
export function resetSchemaValidator(): void {
  schemaValidator = undefined;
}

export { SchemaValidator };
