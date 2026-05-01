/**
 * mcp-gateway — Schema Validation Types
 */

/**
 * Validation error details
 */
export interface ValidationError {
  /** Field path that failed validation */
  field: string;
  /** Expected type or schema */
  expected: string;
  /** Actual value type received */
  received: string;
  /** Human-readable message */
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors if any */
  errors: ValidationError[];
  /** Error code for JSON-RPC response */
  errorCode?: number;
  /** Error message for JSON-RPC response */
  errorMessage?: string;
}

/**
 * Schema cache entry
 */
export interface SchemaCacheEntry {
  /** The JSON Schema */
  schema: Record<string, unknown>;
  /** When this schema was cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttl: number;
  /** Compiled validator function */
  validator?: unknown;
}

/**
 * JSON-RPC 2.0 request structure
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

/**
 * JSON-RPC 2.0 response structure
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 error structure
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP protocol methods
 */
export const MCP_METHODS = {
  INITIALIZE: 'initialize',
  INITIALIZED: 'notifications/initialized',
  SHUTDOWN: 'shutdown',
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
} as const;

export type MCPMethod = (typeof MCP_METHODS)[keyof typeof MCP_METHODS];

/**
 * JSON-RPC error codes
 */
export const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RATE_LIMIT_EXCEEDED: -32000,
  TOOL_NOT_ALLOWED: -32001,
} as const;
