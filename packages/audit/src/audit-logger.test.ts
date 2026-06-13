/**
 * mcp-gateway — Audit Logger Unit Tests
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CompositeAuditLogger,
  ConsoleAuditLogger,
  computeEventHash,
  createAuditEvent,
  FileAuditLogger,
  SilentAuditLogger,
  TamperEvidentLogger,
  verifyAuditChain,
} from './audit-logger.js';

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
  let tempFile: string;

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), `audit-logger-test-${Date.now()}.log`);
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  });

  it('creates logger instance', () => {
    expect(() => new FileAuditLogger('/tmp/test-audit.log')).not.toThrow();
  });

  it('writes event to file', () => {
    const logger = new FileAuditLogger(tempFile);
    const event = createAuditEvent('auth.success', 'req-1', { tenantId: 'tenant-a' });

    logger.log(event);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.eventType).toBe('auth.success');
    expect(parsed.requestId).toBe('req-1');
    expect(parsed.tenantId).toBe('tenant-a');
  });

  it('writes redacted event removing sensitive metadata', () => {
    const logger = new FileAuditLogger(tempFile);
    const event = createAuditEvent('auth.success', 'req-1', {
      metadata: { apiKey: 'sk-12345', email: 'test@example.com', normalField: 'visible' },
    });

    logger.log(event);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.metadata.apiKey).toBe('[REDACTED]');
    expect(parsed.metadata.normalField).toBe('visible');
  });

  it('redacts IPv4 address', () => {
    const logger = new FileAuditLogger(tempFile);
    const event = createAuditEvent('auth.success', 'req-1', {
      ipAddress: '192.168.1.1',
    });

    logger.log(event);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.ipAddress).toBe('192.168.xxx.xxx');
  });

  it('redacts IPv6 address', () => {
    const logger = new FileAuditLogger(tempFile);
    const event = createAuditEvent('auth.success', 'req-1', {
      ipAddress: '2001:db8::1',
    });

    logger.log(event);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.ipAddress).toBe('2001:db8::xxxx');
  });

  it('redacts nested sensitive metadata', () => {
    const logger = new FileAuditLogger(tempFile);
    const event = createAuditEvent('auth.success', 'req-1', {
      metadata: {
        user: { email: 'user@example.com', name: 'John' },
        credentials: { password: 'secret123', token: 'abc' },
      },
    });

    logger.log(event);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.metadata.user.email).toBe('[REDACTED]');
    expect(parsed.metadata.user.name).toBe('John');
    expect(parsed.metadata.credentials.password).toBe('[REDACTED]');
    expect(parsed.metadata.credentials.token).toBe('[REDACTED]');
  });
});

describe('SilentAuditLogger', () => {
  it('logs without throwing', () => {
    const logger = new SilentAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1');
    expect(() => logger.log(event)).not.toThrow();
  });

  it('supports async log', async () => {
    const logger = new SilentAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1');
    expect(() => logger.log(event)).not.toThrow();
  });
});

describe('TamperEvidentLogger', () => {
  class CapturingLogger {
    events: import('./types.js').AuditEvent[] = [];
    log(event: import('./types.js').AuditEvent): void {
      this.events.push(event);
    }
  }

  it('chains events with hashes', () => {
    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    const event1 = createAuditEvent('auth.success', 'req-1');
    const event2 = createAuditEvent('auth.failure', 'req-2');

    logger.log(event1);
    logger.log(event2);

    expect(inner.events).toHaveLength(2);
    expect(inner.events[0]?.metadata?.previousHash).toBeNull();
    expect(inner.events[0]?.metadata?.eventHash).toBeDefined();
    expect(inner.events[1]?.metadata?.previousHash).toBe(inner.events[0]?.metadata?.eventHash);
    expect(inner.events[1]?.metadata?.eventHash).toBeDefined();
    expect(inner.events[1]?.metadata?.eventHash).not.toBe(inner.events[0]?.metadata?.eventHash);
  });

  it('getLastHash returns last hash', () => {
    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    expect(logger.getLastHash()).toBeNull();

    const event = createAuditEvent('auth.success', 'req-1');
    logger.log(event);

    expect(logger.getLastHash()).toBe(inner.events[0]?.metadata?.eventHash);
  });

  it('reset clears the chain', () => {
    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    const event1 = createAuditEvent('auth.success', 'req-1');
    const event2 = createAuditEvent('auth.success', 'req-2');

    logger.log(event1);
    logger.reset();

    expect(logger.getLastHash()).toBeNull();

    logger.log(event2);
    expect(inner.events[1]?.metadata?.previousHash).toBeNull();
  });

  it('supports async log', async () => {
    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    const event = createAuditEvent('auth.success', 'req-1');
    await logger.log(event);

    expect(inner.events).toHaveLength(1);
  });
});

describe('verifyAuditChain', () => {
  it('returns true for a valid chain', () => {
    class CapturingLogger {
      events: import('./types.js').AuditEvent[] = [];
      log(event: import('./types.js').AuditEvent): void {
        this.events.push(event);
      }
    }

    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    logger.log(createAuditEvent('auth.success', 'req-1'));
    logger.log(createAuditEvent('auth.failure', 'req-2'));

    expect(verifyAuditChain(inner.events)).toBe(true);
  });

  it('returns false when eventHash is missing', () => {
    const events = [createAuditEvent('auth.success', 'req-1')];
    expect(verifyAuditChain(events)).toBe(false);
  });

  it('returns false for tampered chain', () => {
    class CapturingLogger {
      events: import('./types.js').AuditEvent[] = [];
      log(event: import('./types.js').AuditEvent): void {
        this.events.push(event);
      }
    }

    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    logger.log(createAuditEvent('auth.success', 'req-1'));

    const tampered = {
      ...(inner.events[0] as import('./types.js').AuditEvent),
      eventType: 'auth.failure' as const,
    };
    const result = verifyAuditChain([tampered]);
    expect(result).toBe(false);
  });

  it('returns true for single event chain', () => {
    class CapturingLogger {
      events: import('./types.js').AuditEvent[] = [];
      log(event: import('./types.js').AuditEvent): void {
        this.events.push(event);
      }
    }

    const inner = new CapturingLogger();
    const logger = new TamperEvidentLogger(inner);

    logger.log(createAuditEvent('auth.success', 'req-1'));

    expect(verifyAuditChain(inner.events)).toBe(true);
  });
});

describe('CompositeAuditLogger', () => {
  it('logs to multiple destinations', () => {
    const events1: import('./types.js').AuditEvent[] = [];
    const events2: import('./types.js').AuditEvent[] = [];
    const logger1 = {
      log: (e: import('./types.js').AuditEvent) => {
        events1.push(e);
      },
    };
    const logger2 = {
      log: (e: import('./types.js').AuditEvent) => {
        events2.push(e);
      },
    };

    const composite = new CompositeAuditLogger();
    composite.addLogger(logger1);
    composite.addLogger(logger2);

    const event = createAuditEvent('auth.success', 'req-1');
    composite.log(event);

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it('does not throw with no loggers', () => {
    const composite = new CompositeAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1');
    expect(() => composite.log(event)).not.toThrow();
  });

  it('supports async log', async () => {
    const events: import('./types.js').AuditEvent[] = [];
    const logger = {
      log: (e: import('./types.js').AuditEvent) => {
        events.push(e);
      },
    };

    const composite = new CompositeAuditLogger();
    composite.addLogger(logger);

    const event = createAuditEvent('auth.success', 'req-1');
    await composite.log(event);

    expect(events).toHaveLength(1);
  });
});

describe('ConsoleAuditLogger PII redaction', () => {
  it('redacts IPv4 address via console.log', () => {
    const spy = vi.spyOn(console, 'log');
    const logger = new ConsoleAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1', {
      ipAddress: '10.0.0.1',
    });

    logger.log(event);

    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.ipAddress).toBe('10.0.xxx.xxx');
    spy.mockRestore();
  });

  it('redacts IPv6 address via console.log', () => {
    const spy = vi.spyOn(console, 'log');
    const logger = new ConsoleAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1', {
      ipAddress: '::1',
    });

    logger.log(event);

    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.ipAddress).toBe('::xxxx');
    spy.mockRestore();
  });

  it('redacts sensitive metadata keys', () => {
    const spy = vi.spyOn(console, 'log');
    const logger = new ConsoleAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1', {
      metadata: { password: 'hunter2', token: 'abc123', safeField: 'hello' },
    });

    logger.log(event);

    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.metadata.password).toBe('[REDACTED]');
    expect(logged.metadata.token).toBe('[REDACTED]');
    expect(logged.metadata.safeField).toBe('hello');
    spy.mockRestore();
  });

  it('does not modify event without ip or metadata', () => {
    const spy = vi.spyOn(console, 'log');
    const logger = new ConsoleAuditLogger();
    const event = createAuditEvent('auth.success', 'req-1');

    logger.log(event);

    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.eventType).toBe('auth.success');
    expect(logged.requestId).toBe('req-1');
    spy.mockRestore();
  });
});
