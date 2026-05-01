/**
 * mcp-gateway — Dynamic Allowlist Unit Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAllowlist,
  getAllowlistVersion,
  removeAllowlist,
  rollbackAllowlist,
  updateAllowlist,
} from './dynamic-allowlist.js';
import type { ToolAllowlist } from './types.js';

describe('Dynamic Allowlist', () => {
  const validAllowlist: ToolAllowlist = {
    mode: 'allow',
    tools: ['tool1', 'tool2'],
  };

  beforeEach(() => {
    removeAllowlist('test-tenant');
  });

  describe('updateAllowlist', () => {
    it('creates new allowlist for tenant', () => {
      const result = updateAllowlist('test-tenant', validAllowlist);
      expect(result.success).toBe(true);
      expect(getAllowlist('test-tenant')).toEqual(validAllowlist);
    });

    it('returns errors for invalid allowlist', () => {
      const invalidAllowlist = { mode: 'invalid' as 'allow', tools: [] };
      const result = updateAllowlist('test-tenant', invalidAllowlist);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('increments version on update', () => {
      updateAllowlist('test-tenant', validAllowlist);
      const v1 = getAllowlistVersion('test-tenant');
      expect(v1?.version).toBe(1);

      updateAllowlist('test-tenant', { mode: 'allow', tools: ['tool3'] });
      const v2 = getAllowlistVersion('test-tenant');
      expect(v2?.version).toBe(2);
    });

    it('tracks updatedAt timestamp', () => {
      const before = new Date();
      updateAllowlist('test-tenant', validAllowlist);
      const version = getAllowlistVersion('test-tenant');
      expect(version?.updatedAt).toBeDefined();
      expect(version?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('getAllowlist', () => {
    it('returns undefined for unknown tenant', () => {
      expect(getAllowlist('unknown-tenant')).toBeUndefined();
    });

    it('returns allowlist after update', () => {
      updateAllowlist('test-tenant', validAllowlist);
      const allowlist = getAllowlist('test-tenant');
      expect(allowlist).toEqual(validAllowlist);
    });
  });

  describe('getAllowlistVersion', () => {
    it('returns undefined for unknown tenant', () => {
      expect(getAllowlistVersion('unknown-tenant')).toBeUndefined();
    });

    it('returns version info after update', () => {
      updateAllowlist('test-tenant', validAllowlist);
      const version = getAllowlistVersion('test-tenant');
      expect(version?.version).toBe(1);
      expect(version?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('rollbackAllowlist', () => {
    it('returns false when no previous version', () => {
      updateAllowlist('test-tenant', validAllowlist);
      const result = rollbackAllowlist('test-tenant');
      expect(result).toBe(false);
    });

    it('rolls back to previous version', () => {
      const v1 = { mode: 'allow' as const, tools: ['tool1'] };
      const v2 = { mode: 'allow' as const, tools: ['tool2'] };

      updateAllowlist('test-tenant', v1);
      updateAllowlist('test-tenant', v2);

      const v2Version = getAllowlistVersion('test-tenant');
      expect(v2Version?.version).toBe(2);

      const result = rollbackAllowlist('test-tenant');
      expect(result).toBe(true);

      const current = getAllowlist('test-tenant');
      expect(current).toEqual(v1);
    });

    it('returns false for unknown tenant', () => {
      const result = rollbackAllowlist('unknown-tenant');
      expect(result).toBe(false);
    });
  });

  describe('removeAllowlist', () => {
    it('removes allowlist for tenant', () => {
      updateAllowlist('test-tenant', validAllowlist);
      removeAllowlist('test-tenant');
      expect(getAllowlist('test-tenant')).toBeUndefined();
    });

    it('handles removing non-existent allowlist', () => {
      expect(() => removeAllowlist('unknown-tenant')).not.toThrow();
    });
  });
});
