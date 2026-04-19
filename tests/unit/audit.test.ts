/**
 * mcp-gateway — Audit Trail Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAuditEvent, ConsoleAuditLogger } from '../../src/audit/audit-logger.js';
import { MemoryAuditStorage } from '../../src/audit/audit-storage.js';
import { createAuditQueryService } from '../../src/audit/audit-query.js';
import { getEventSeverity, EVENT_TYPE_CONFIGS } from '../../src/audit/event-types.js';

describe('audit-logger', () => {
  describe('createAuditEvent', () => {
    it('creates event with required fields', () => {
      const event = createAuditEvent('auth.success', 'req-123');
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.eventType).toBe('auth.success');
      expect(event.requestId).toBe('req-123');
      expect(event.success).toBe(true);
    });

    it('includes optional fields', () => {
      const event = createAuditEvent('tool.executed', 'req-456', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        tool: 'glean_search',
        durationMs: 123,
      });
      expect(event.tenantId).toBe('tenant-1');
      expect(event.tool).toBe('glean_search');
      expect(event.durationMs).toBe(123);
    });
  });

  describe('ConsoleAuditLogger', () => {
    it('logs events to console', () => {
      const logger = new ConsoleAuditLogger();
      const event = createAuditEvent('auth.success', 'req-test');
      // Should not throw
      expect(() => logger.log(event)).not.toThrow();
    });
  });
});

describe('MemoryAuditStorage', () => {
  let storage: MemoryAuditStorage;

  beforeEach(() => {
    storage = new MemoryAuditStorage(100);
  });

  it('stores and retrieves events', () => {
    const event = createAuditEvent('auth.success', 'req-1');
    storage.store(event);

    const results = storage.query({});
    expect(results).toHaveLength(1);
    expect(results[0]?.requestId).toBe('req-1');
  });

  it('filters by tenantId', () => {
    storage.store(createAuditEvent('auth.success', 'req-1', { tenantId: 'tenant-a' }));
    storage.store(createAuditEvent('auth.success', 'req-2', { tenantId: 'tenant-b' }));

    const results = storage.query({ tenantId: 'tenant-a' });
    expect(results).toHaveLength(1);
    expect(results[0]?.tenantId).toBe('tenant-a');
  });

  it('filters by eventType', () => {
    storage.store(createAuditEvent('auth.success', 'req-1'));
    storage.store(createAuditEvent('auth.failure', 'req-2'));

    const results = storage.query({ eventType: 'auth.success' });
    expect(results).toHaveLength(1);
    expect(results[0]?.eventType).toBe('auth.success');
  });

  it('filters by success', () => {
    storage.store(createAuditEvent('auth.success', 'req-1', { success: true }));
    storage.store(createAuditEvent('auth.failure', 'req-2', { success: false }));

    const results = storage.query({ success: false });
    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
  });

  it('applies pagination', () => {
    for (let i = 0; i < 10; i++) {
      storage.store(createAuditEvent('auth.success', `req-${i}`));
    }

    const page1 = storage.query({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = storage.query({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
  });

  it('respects max capacity', () => {
    const smallStorage = new MemoryAuditStorage(5);
    for (let i = 0; i < 10; i++) {
      smallStorage.store(createAuditEvent('auth.success', `req-${i}`));
    }
    expect(smallStorage.count()).toBe(5);
  });
});

describe('audit-query', () => {
  let storage: MemoryAuditStorage;
  let queryService: ReturnType<typeof createAuditQueryService>;

  beforeEach(() => {
    storage = new MemoryAuditStorage(100);
    queryService = createAuditQueryService(storage);

    storage.store(createAuditEvent('auth.success', 'req-1', { tenantId: 'tenant-a' }));
    storage.store(createAuditEvent('auth.failure', 'req-2', { tenantId: 'tenant-a' }));
    storage.store(createAuditEvent('tool.executed', 'req-3', { tenantId: 'tenant-b', tool: 'glean_search' }));
  });

  it('queries events', () => {
    const results = queryService.query({});
    expect(results).toHaveLength(3);
  });

  it('counts events', () => {
    const count = queryService?.count({ tenantId: 'tenant-a' });
    expect(count).toBe(2);
  });

  it('exports CSV', () => {
    const csv = queryService.exportCSV({});
    expect(csv).toContain('timestamp,eventType,severity');
    expect(csv).toContain('auth.success');
  });
});

describe('event-types', () => {
  it('returns severity for all event types', () => {
    for (const eventType of Object.keys(EVENT_TYPE_CONFIGS) as Array<keyof typeof EVENT_TYPE_CONFIGS>) {
      const severity = getEventSeverity(eventType);
      expect(['low', 'medium', 'high', 'critical']).toContain(severity);
    }
  });

  it('returns config for auth.success', () => {
    const config = EVENT_TYPE_CONFIGS['auth.success'];
    expect(config.severity).toBe('low');
    expect(config.requiresAuth).toBe(false);
  });

  it('returns config for allowlist.denied', () => {
    const config = EVENT_TYPE_CONFIGS['allowlist.denied'];
    expect(config.severity).toBe('high');
    expect(config.requiresAuth).toBe(true);
  });
});
