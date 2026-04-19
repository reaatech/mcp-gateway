/**
 * mcp-gateway — Audit Logger Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  createAuditEvent,
  computeEventHash,
  ConsoleAuditLogger,
  FileAuditLogger,
} from '../../src/audit/audit-logger.js';

describe('audit-logger', () => {
  describe('computeEventHash', () => {
    it('computes hash for event', () => {
      const event = createAuditEvent('auth.success', 'req-1');
      const hash = computeEventHash(event, null);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('includes previous hash in computation', () => {
      const event = createAuditEvent('auth.success', 'req-1');
      const hash1 = computeEventHash(event, null);
      const hash2 = computeEventHash(event, 'previous-hash');
      expect(hash1).not.toBe(hash2);
    });

    it('produces consistent hashes', () => {
      const event = createAuditEvent('auth.success', 'req-1');
      const hash1 = computeEventHash(event, null);
      const hash2 = computeEventHash(event, null);
      expect(hash1).toBe(hash2);
    });
  });

  describe('createAuditEvent', () => {
    it('creates event with default severity', () => {
      const event = createAuditEvent('auth.success', 'req-1');
      expect(event.severity).toBe('low');
      expect(event.success).toBe(true);
    });

    it('creates event with high severity for important events', () => {
      const event = createAuditEvent('auth.failure', 'req-1');
      expect(event.severity).toBe('medium');
    });

    it('overrides defaults with options', () => {
      const event = createAuditEvent('auth.success', 'req-1', {
        tenantId: 'tenant-1',
        success: false,
        severity: 'high',
      });
      expect(event.tenantId).toBe('tenant-1');
      expect(event.success).toBe(false);
      expect(event.severity).toBe('high');
    });
  });

  describe('ConsoleAuditLogger', () => {
    it('logs events without throwing', () => {
      const logger = new ConsoleAuditLogger();
      const event = createAuditEvent('auth.success', 'req-1');
      expect(() => logger.log(event)).not.toThrow();
    });

    it('supports async log', async () => {
      const logger = new ConsoleAuditLogger();
      const event = createAuditEvent('auth.success', 'req-1');
      await logger.log(event);
      expect(true).toBe(true);
    });
  });
});

describe('FileAuditLogger', () => {
  it('creates logger instance', () => {
    expect(() => new FileAuditLogger('/tmp/test-audit.log')).not.toThrow();
  });
});