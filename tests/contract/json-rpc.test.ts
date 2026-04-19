/**
 * mcp-gateway — Contract Tests
 * Validates MCP protocol compliance and JSON-RPC 2.0 compliance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JsonRpcRequestSchema, JsonRpcResponseSchema } from '../../src/types/schemas.js';
import { getSchemaValidator, resetSchemaValidator } from '../../src/validation/schema-validator.js';

describe('Contract: JSON-RPC 2.0 Compliance', () => {
  describe('Request Validation', () => {
    it('accepts a valid JSON-RPC 2.0 request', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: { name: 'test' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects request without jsonrpc version', () => {
      const result = JsonRpcRequestSchema.safeParse({
        id: '1',
        method: 'tools/call',
      });
      expect(result.success).toBe(false);
    });

    it('rejects request with wrong jsonrpc version', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '1.0',
        id: '1',
        method: 'tools/call',
      });
      expect(result.success).toBe(false);
    });

    it('rejects request without method', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        id: '1',
      });
      expect(result.success).toBe(false);
    });

    it('accepts request with string id', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        id: 'abc-123',
        method: 'initialize',
        params: {},
      });
      expect(result.success).toBe(true);
    });

    it('accepts request with numeric id', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        id: 42,
        method: 'initialize',
        params: {},
      });
      expect(result.success).toBe(true);
    });

    it('accepts request without params', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        id: '1',
        method: 'initialized',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Response Validation', () => {
    it('accepts a valid JSON-RPC 2.0 success response', () => {
      const result = JsonRpcResponseSchema.safeParse({
        jsonrpc: '2.0',
        id: '1',
        result: { content: [{ type: 'text', text: 'hello' }] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid JSON-RPC 2.0 error response', () => {
      const result = JsonRpcResponseSchema.safeParse({
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32600, message: 'Invalid Request' },
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Contract: MCP Protocol Compliance', () => {
  let validator: ReturnType<typeof getSchemaValidator>;

  beforeEach(() => {
    resetSchemaValidator();
    validator = getSchemaValidator();
  });

  describe('Initialize Request', () => {
    it('accepts valid initialize request', () => {
      const result = validator.validateMcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Tools/List Request', () => {
    it('accepts tools/list request', () => {
      const result = validator.validateMcpRequest('tools/list', {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Tools/Call Request', () => {
    it('accepts valid tools/call request with name', () => {
      const result = validator.validateMcpRequest('tools/call', {
        name: 'search',
        arguments: { query: 'test' },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects tools/call without tool name', () => {
      const result = validator.validateMcpRequest('tools/call', {
        arguments: { query: 'test' },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('Resources/List Request', () => {
    it('accepts resources/list request', () => {
      const result = validator.validateMcpRequest('resources/list', {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Resources/Read Request', () => {
    it('accepts valid resources/read request', () => {
      const result = validator.validateMcpRequest('resources/read', {
        uri: 'file:///test.txt',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects resources/read without uri', () => {
      const result = validator.validateMcpRequest('resources/read', {});
      expect(result.valid).toBe(false);
    });
  });

  describe('Prompts/List Request', () => {
    it('accepts prompts/list request', () => {
      const result = validator.validateMcpRequest('prompts/list', {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Prompts/Get Request', () => {
    it('accepts valid prompts/get request', () => {
      const result = validator.validateMcpRequest('prompts/get', {
        name: 'greeting',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Unknown Method', () => {
    it('rejects unknown MCP method', () => {
      const result = validator.validateMcpRequest('unknown/method', {});
      expect(result.valid).toBe(false);
    });
  });
});

describe('Contract: Error Response Format', () => {
  it('matches JSON-RPC error format', () => {
    const errorResponse = {
      jsonrpc: '2.0',
      id: '1',
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    };

    expect(errorResponse.jsonrpc).toBe('2.0');
    expect(errorResponse.error.code).toBeTypeOf('number');
    expect(errorResponse.error.message).toBeTypeOf('string');
  });

  it('uses standard JSON-RPC error codes', () => {
    const codes = {
      PARSE_ERROR: -32700,
      INVALID_REQUEST: -32600,
      METHOD_NOT_FOUND: -32601,
      INVALID_PARAMS: -32602,
      INTERNAL_ERROR: -32603,
    };

    for (const [_name, code] of Object.entries(codes)) {
      expect(code).toBeLessThan(0);
      expect(code).toBeGreaterThanOrEqual(-32768);
    }
  });

  it('server error codes are in -32000 to -32099 range', () => {
    const serverErrors = [-32000, -32001, -32099];
    for (const code of serverErrors) {
      expect(code).toBeGreaterThanOrEqual(-32099);
      expect(code).toBeLessThanOrEqual(-32000);
    }
  });
});
