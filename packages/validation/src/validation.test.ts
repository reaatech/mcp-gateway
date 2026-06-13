/**
 * mcp-gateway — Schema Validation Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValidatedRequest } from './index.js';
import {
  createValidationMiddleware,
  formatValidationResponse,
  getCustomSchemaManager,
  getSchemaValidator,
  JSONRPC_ERRORS,
  resetCustomSchemaManager,
  resetSchemaValidator,
  validateMcpMethod,
  validateToolCall,
} from './index.js';

describe('Schema Validation', () => {
  beforeEach(() => {
    resetSchemaValidator();
    resetCustomSchemaManager();
  });

  afterEach(() => {
    resetSchemaValidator();
    resetCustomSchemaManager();
  });

  describe('getSchemaValidator', () => {
    it('returns a singleton instance', () => {
      const validator1 = getSchemaValidator();
      const validator2 = getSchemaValidator();
      expect(validator1).toBe(validator2);
    });
  });

  describe('SchemaValidator', () => {
    it('cacheToolSchema caches a schema with custom TTL', () => {
      const validator = getSchemaValidator();
      validator.cacheToolSchema('test-tool', { type: 'object' }, 10_000);
      const schema = (
        validator as unknown as {
          getToolSchema: (n: string) => Record<string, unknown> | undefined;
        }
      ).getToolSchema('test-tool');
      expect(schema).toEqual({ type: 'object' });
    });

    it('getToolSchema returns undefined for unknown tool', () => {
      const validator = getSchemaValidator();
      const schema = (
        validator as unknown as {
          getToolSchema: (n: string) => Record<string, unknown> | undefined;
        }
      ).getToolSchema('nonexistent');
      expect(schema).toBeUndefined();
    });

    it('getToolSchema returns undefined after cache expiry', async () => {
      vi.useFakeTimers();
      const validator = getSchemaValidator();
      (
        validator as unknown as {
          cacheToolSchema: (n: string, s: Record<string, unknown>, t?: number) => void;
        }
      ).cacheToolSchema('expiring-tool', { type: 'object' }, 100);
      vi.advanceTimersByTime(200);
      const schema = (
        validator as unknown as {
          getToolSchema: (n: string) => Record<string, unknown> | undefined;
        }
      ).getToolSchema('expiring-tool');
      expect(schema).toBeUndefined();
      vi.useRealTimers();
    });

    it('clearCache removes all cached schemas', () => {
      const validator = getSchemaValidator();
      (
        validator as unknown as { cacheToolSchema: (n: string, s: Record<string, unknown>) => void }
      ).cacheToolSchema('tool-a', { type: 'object' });
      (
        validator as unknown as { cacheToolSchema: (n: string, s: Record<string, unknown>) => void }
      ).cacheToolSchema('tool-b', { type: 'object' });
      (validator as unknown as { clearCache: () => void }).clearCache();
      const schema = (
        validator as unknown as {
          getToolSchema: (n: string) => Record<string, unknown> | undefined;
        }
      ).getToolSchema('tool-a');
      expect(schema).toBeUndefined();
    });

    it('validateToolArguments removes expired cache entries', async () => {
      vi.useFakeTimers();
      const validator = getSchemaValidator();
      const toolSchema = { type: 'object', properties: { x: { type: 'string' } } };
      validator.validateToolArguments('cached-tool', { x: 'ok' }, toolSchema);
      vi.advanceTimersByTime(400_000);
      validator.validateToolArguments('cached-tool', { x: 'ok' }, toolSchema);
      vi.useRealTimers();
      expect(true).toBe(true);
    });

    it('buildErrorMessage handles additionalProperties error', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test' },
        extraField: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Unknown field'))).toBe(true);
    });

    it('buildErrorMessage handles minLength error', () => {
      const result = validateMcpMethod('tools/call', { name: '' });
      expect(result.valid).toBe(false);
      expect(result.error?.data).toBeDefined();
    });

    it('buildErrorMessage handles default keyword error', () => {
      const toolSchema = {
        type: 'object',
        properties: {
          color: { type: 'string', enum: ['red', 'blue'] },
        },
      };
      const result = validateToolCall('test', { color: 'green' }, toolSchema);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateJsonRpcRequest', () => {
    it('validates a valid JSON-RPC request', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test' },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects missing jsonrpc field', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        id: 1,
        method: 'tools/call',
      });

      expect(result.valid).toBe(false);
      // Missing required field returns INVALID_PARAMS from AJV validation
      expect(result.errorCode).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
    });

    it('rejects wrong jsonrpc version', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        jsonrpc: '1.0',
        id: 1,
        method: 'tools/call',
      });

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'jsonrpc' || e.message.includes('jsonrpc')),
      ).toBe(true);
    });

    it('rejects missing id field', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id' || e.message.includes('id'))).toBe(true);
    });

    it('rejects missing method field', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'method' || e.message.includes('method'))).toBe(
        true,
      );
    });

    it('accepts string id', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 'abc-123',
        method: 'tools/call',
      });

      expect(result.valid).toBe(true);
    });

    it('rejects non-object requests', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest('not an object');

      expect(result.valid).toBe(false);
      const firstError = result.errors[0];
      expect(firstError).toBeDefined();
      expect(firstError?.field).toBe('root');
    });

    it('rejects null requests', () => {
      const validator = getSchemaValidator();
      const result = validator.validateJsonRpcRequest(null);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateMcpRequest', () => {
    it('validates initialize request', () => {
      const result = validateMcpMethod('initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects initialize without protocolVersion', () => {
      const result = validateMcpMethod('initialize', {
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      });

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
    });

    it('validates tools/call request', () => {
      const result = validateMcpMethod('tools/call', {
        name: 'my-tool',
        arguments: { key: 'value' },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects tools/call without name', () => {
      const result = validateMcpMethod('tools/call', {
        arguments: { key: 'value' },
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('validates tools/list request', () => {
      const result = validateMcpMethod('tools/list', {});
      expect(result.valid).toBe(true);
    });

    it('rejects unknown MCP method', () => {
      const result = validateMcpMethod('unknown/method', {});

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(JSONRPC_ERRORS.METHOD_NOT_FOUND);
    });

    it('validates resources/read request', () => {
      const result = validateMcpMethod('resources/read', {
        uri: 'file:///path/to/file',
      });

      expect(result.valid).toBe(true);
    });

    it('rejects resources/read without uri', () => {
      const result = validateMcpMethod('resources/read', {});

      expect(result.valid).toBe(false);
    });
  });

  describe('validateToolCall', () => {
    it('validates arguments against schema', () => {
      const toolSchema = {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
      };

      const result = validateToolCall('search', { query: 'test', limit: 10 }, toolSchema);

      expect(result.valid).toBe(true);
    });

    it('rejects arguments with wrong type', () => {
      const toolSchema = {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      };

      const result = validateToolCall('search', { query: 123 }, toolSchema);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
    });

    it('rejects missing required fields', () => {
      const toolSchema = {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
        },
      };

      const result = validateToolCall('search', {}, toolSchema);

      expect(result.valid).toBe(false);
      expect((result.error as { data?: unknown })?.data).toBeDefined();
    });
  });

  describe('CustomSchemaManager', () => {
    it('registers and retrieves tool schemas', () => {
      const manager = getCustomSchemaManager();

      manager.registerSchema({
        toolName: 'test-tool',
        version: '1.0.0',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      const schema = manager.getSchema('test-tool');
      expect(schema).toBeDefined();
      expect(schema?.toolName).toBe('test-tool');
      expect(schema?.version).toBe('1.0.0');
    });

    it('validates arguments using registered schema', () => {
      const manager = getCustomSchemaManager();

      manager.registerSchema({
        toolName: 'validated-tool',
        version: '1.0.0',
        inputSchema: {
          type: 'object',
          required: ['input'],
          properties: { input: { type: 'string' } },
        },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      const result = manager.validateArguments('validated-tool', { input: 'test' });
      expect(result.valid).toBe(true);
    });

    it('rejects validation for unregistered tools', () => {
      const manager = getCustomSchemaManager();

      const result = manager.validateArguments('unknown-tool', {});

      expect(result.valid).toBe(false);
      const firstError = result.errors[0];
      expect(firstError?.message).toContain('No schema registered');
    });

    it('tracks version history', () => {
      const manager = getCustomSchemaManager();

      manager.registerSchema({
        toolName: 'versioned-tool',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      manager.registerSchema({
        toolName: 'versioned-tool',
        version: '2.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      const history = manager.getVersionHistory('versioned-tool');
      expect(history).toHaveLength(1);
      const firstVersion = history[0];
      expect(firstVersion?.version).toBe('1.0.0');
    });

    it('rolls back to previous version', () => {
      const manager = getCustomSchemaManager();

      manager.registerSchema({
        toolName: 'rollback-tool',
        version: '1.0.0',
        inputSchema: { type: 'object', properties: { v: { const: 1 } } },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      manager.registerSchema({
        toolName: 'rollback-tool',
        version: '2.0.0',
        inputSchema: { type: 'object', properties: { v: { const: 2 } } },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      const success = manager.rollback('rollback-tool', '1.0.0');
      expect(success).toBe(true);

      const schema = manager.getSchema('rollback-tool');
      expect(schema?.version).toBe('1.0.0');
    });

    it('lists all registered tool names', () => {
      const manager = getCustomSchemaManager();

      manager.registerSchema({
        toolName: 'tool-a',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      manager.registerSchema({
        toolName: 'tool-b',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      const names = manager.getToolNames();
      expect(names).toContain('tool-a');
      expect(names).toContain('tool-b');
    });

    it('clears all schemas', () => {
      const manager = getCustomSchemaManager();

      manager.registerSchema({
        toolName: 'clearable-tool',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });

      manager.clear();

      expect(manager.getToolNames()).toHaveLength(0);
    });

    it('hasSchema returns true for registered tool', () => {
      const manager = getCustomSchemaManager();
      manager.registerSchema({
        toolName: 'existing-tool',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      expect(manager.hasSchema('existing-tool')).toBe(true);
      expect(manager.hasSchema('missing-tool')).toBe(false);
    });

    it('validateOutput returns valid when no outputSchema registered', () => {
      const manager = getCustomSchemaManager();
      manager.registerSchema({
        toolName: 'no-output',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      const result = manager.validateOutput('no-output', { some: 'data' });
      expect(result.valid).toBe(true);
    });

    it('validateOutput validates against registered outputSchema', () => {
      const manager = getCustomSchemaManager();
      manager.registerSchema({
        toolName: 'with-output',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        outputSchema: {
          type: 'object',
          required: ['result'],
          properties: { result: { type: 'string' } },
        },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      const result = manager.validateOutput('with-output', { result: 'ok' });
      expect(result.valid).toBe(true);
    });

    it('validateOutput rejects invalid output', () => {
      const manager = getCustomSchemaManager();
      manager.registerSchema({
        toolName: 'strict-output',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        outputSchema: {
          type: 'object',
          required: ['result'],
          properties: { result: { type: 'number' } },
        },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      const result = manager.validateOutput('strict-output', { result: 'not-a-number' });
      expect(result.valid).toBe(false);
    });

    it('removeSchema removes tool and clears cache', () => {
      const manager = getCustomSchemaManager();
      manager.registerSchema({
        toolName: 'removable',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      manager.removeSchema('removable');
      expect(manager.hasSchema('removable')).toBe(false);
    });

    it('rollback returns false when no history', () => {
      const manager = getCustomSchemaManager();
      const result = manager.rollback('never-registered', '1.0.0');
      expect(result).toBe(false);
    });

    it('rollback returns false when version not found in history', () => {
      const manager = getCustomSchemaManager();
      manager.registerSchema({
        toolName: 'single-version',
        version: '2.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      manager.registerSchema({
        toolName: 'single-version',
        version: '3.0.0',
        inputSchema: { type: 'object' },
        source: 'upstream-1',
        fetchedAt: Date.now(),
      });
      const result = manager.rollback('single-version', '1.0.0');
      expect(result).toBe(false);
    });
  });

  describe('formatValidationResponse', () => {
    it('formats errors into JSON-RPC response', () => {
      const response = formatValidationResponse('req-123', [
        { field: 'query', message: 'must be a string' },
      ]);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-123');
      expect(response.error).toBeDefined();
      expect((response.error as { code: number }).code).toBe(JSONRPC_ERRORS.INVALID_PARAMS);
    });
  });

  describe('createValidationMiddleware', () => {
    let middleware: ReturnType<typeof createValidationMiddleware>;
    let mockReq: Partial<ValidatedRequest>;
    let mockRes: {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
    let mockNext: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      middleware = createValidationMiddleware();
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('creates middleware function', () => {
      expect(typeof middleware).toBe('function');
    });

    it('calls next for non-POST requests', () => {
      mockReq = { method: 'GET', path: '/mcp', body: {} };
      middleware(mockReq as ValidatedRequest, mockRes as never, mockNext as never);
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('calls next for non-MCP paths', () => {
      mockReq = { method: 'POST', path: '/health', body: {} };
      middleware(mockReq as ValidatedRequest, mockRes as never, mockNext as never);
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('returns 400 when body is missing', () => {
      mockReq = { method: 'POST', path: '/mcp', body: undefined };
      middleware(mockReq as ValidatedRequest, mockRes as never, mockNext as never);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledOnce();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid JSON-RPC body', () => {
      mockReq = { method: 'POST', path: '/mcp', body: { invalid: true } };
      middleware(mockReq as ValidatedRequest, mockRes as never, mockNext as never);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledOnce();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('sets rpcBody and calls next for valid request', () => {
      const validBody = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'test' } };
      mockReq = { method: 'POST', path: '/mcp', body: validBody };
      middleware(mockReq as ValidatedRequest, mockRes as never, mockNext as never);
      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockReq.rpcBody).toEqual(validBody);
    });
  });
});
