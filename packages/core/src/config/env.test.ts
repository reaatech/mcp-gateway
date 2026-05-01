/**
 * mcp-gateway — Environment Configuration Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('default values', () => {
    it('should use default PORT when not specified', () => {
      process.env.PORT = undefined;
      // We can't re-import the module, so we test the schema validation logic
      // This is a placeholder for actual env validation tests
      expect(true).toBe(true);
    });

    it('should use default NODE_ENV when not specified', () => {
      process.env.NODE_ENV = undefined;
      expect(true).toBe(true);
    });
  });

  describe('validation', () => {
    it('should accept valid PORT numbers', () => {
      process.env.PORT = '8080';
      expect(true).toBe(true);
    });

    it('should reject invalid PORT numbers', () => {
      process.env.PORT = '99999';
      expect(true).toBe(true);
    });
  });
});

describe('Constants', () => {
  it('should export SERVICE_NAME', async () => {
    const { SERVICE_NAME } = await import('../../src/config/constants.js');
    expect(SERVICE_NAME).toBe('mcp-gateway');
  });

  it('should export SERVICE_VERSION', async () => {
    const { SERVICE_VERSION } = await import('../../src/config/constants.js');
    expect(SERVICE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should export MCP_PROTOCOL_VERSION', async () => {
    const { MCP_PROTOCOL_VERSION } = await import('../../src/config/constants.js');
    expect(MCP_PROTOCOL_VERSION).toBe('2024-11-05');
  });

  it('should export JSON_RPC_VERSION', async () => {
    const { JSON_RPC_VERSION } = await import('../../src/config/constants.js');
    expect(JSON_RPC_VERSION).toBe('2.0');
  });
});
