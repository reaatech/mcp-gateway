/**
 * mcp-gateway — Validation Module Exports
 */

// Custom Schema Manager
export {
  CustomSchemaManager,
  getCustomSchemaManager,
  resetCustomSchemaManager,
} from './custom-schemas.js';

// MCP Protocol Schemas
export * from './mcp-schema.js';

// Schema Validator
export {
  getSchemaValidator,
  resetSchemaValidator,
  SchemaValidator,
} from './schema-validator.js';
// Types
export * from './types.js';

// Validation Middleware
export {
  createValidationMiddleware,
  formatValidationResponse,
  type ValidatedRequest,
  validateMcpMethod,
  validateToolCall,
} from './validation.middleware.js';
