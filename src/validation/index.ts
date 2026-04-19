/**
 * mcp-gateway — Validation Module Exports
 */

// Types
export * from './types.js';

// MCP Protocol Schemas
export * from './mcp-schema.js';

// Schema Validator
export {
  SchemaValidator,
  getSchemaValidator,
  resetSchemaValidator,
} from './schema-validator.js';

// Custom Schema Manager
export {
  CustomSchemaManager,
  getCustomSchemaManager,
  resetCustomSchemaManager,
} from './custom-schemas.js';

// Validation Middleware
export {
  createValidationMiddleware,
  validateMcpMethod,
  validateToolCall,
  formatValidationResponse,
  type ValidatedRequest,
} from './validation.middleware.js';
