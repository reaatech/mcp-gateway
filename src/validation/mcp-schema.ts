/**
 * mcp-gateway — MCP Protocol JSON Schemas
 * 
 * Defines JSON Schema definitions for MCP protocol messages
 * based on the Model Context Protocol specification.
 */

/**
 * JSON-RPC 2.0 base schema
 */
export const jsonRpcRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method'],
  properties: {
    jsonrpc: {
      type: 'string',
      const: '2.0',
    },
    id: {
      oneOf: [{ type: 'string' }, { type: 'number' }],
    },
    method: {
      type: 'string',
      minLength: 1,
    },
    params: {
      oneOf: [{ type: 'object' }, { type: 'array' }],
    },
  },
  additionalProperties: false,
} as const;

/**
 * MCP initialize request schema
 */
export const initializeRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method', 'params'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'initialize' },
    params: {
      type: 'object',
      required: ['protocolVersion', 'clientInfo'],
      properties: {
        protocolVersion: { type: 'string' },
        capabilities: { type: 'object' },
        clientInfo: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

/**
 * MCP tools/call request schema (base structure)
 */
export const toolsCallRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method', 'params'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'tools/call' },
    params: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        arguments: { type: 'object' },
      },
    },
  },
} as const;

/**
 * MCP tools/list request schema
 */
export const toolsListRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'tools/list' },
    params: { type: 'object' },
  },
} as const;

/**
 * MCP resources/list request schema
 */
export const resourcesListRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'resources/list' },
    params: { type: 'object' },
  },
} as const;

/**
 * MCP resources/read request schema
 */
export const resourcesReadRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method', 'params'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'resources/read' },
    params: {
      type: 'object',
      required: ['uri'],
      properties: {
        uri: { type: 'string' },
      },
    },
  },
} as const;

/**
 * MCP prompts/list request schema
 */
export const promptsListRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'prompts/list' },
    params: { type: 'object' },
  },
} as const;

/**
 * MCP prompts/get request schema
 */
export const promptsGetRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method', 'params'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'prompts/get' },
    params: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        arguments: { type: 'object' },
      },
    },
  },
} as const;

/**
 * MCP notifications/initialized schema
 */
export const notificationsInitializedSchema = {
  type: 'object',
  required: ['jsonrpc', 'method'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
    method: { type: 'string', const: 'notifications/initialized' },
    params: { type: 'object' },
  },
} as const;

/**
 * MCP shutdown schema
 */
export const shutdownRequestSchema = {
  type: 'object',
  required: ['jsonrpc', 'id', 'method'],
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string', const: 'shutdown' },
    params: { type: 'object' },
  },
} as const;

/**
 * Map of MCP method names to their request schemas
 */
export const mcpMethodSchemas: Record<string, Record<string, unknown>> = {
  initialize: initializeRequestSchema,
  'tools/call': toolsCallRequestSchema,
  'tools/list': toolsListRequestSchema,
  'resources/list': resourcesListRequestSchema,
  'resources/read': resourcesReadRequestSchema,
  'prompts/list': promptsListRequestSchema,
  'prompts/get': promptsGetRequestSchema,
  'notifications/initialized': notificationsInitializedSchema,
  'shutdown': shutdownRequestSchema,
};

/**
 * Valid MCP method names
 */
export const validMcpMethods = Object.keys(mcpMethodSchemas);
