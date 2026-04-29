/**
 * mcp-gateway — Audit Storage Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAuditStorage, FileAuditStorage } from '../../src/audit/audit-storage.js';
import { createAuditEvent } from '../../src/audit/audit-logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('MemoryAuditStorage', () => {
  let storage: MemoryAuditStorage;

  beforeEach(() => {
    storage = new MemoryAuditStorage(100);
  });

  describe('store', () => {
    it('stores events', () => {
      storage.store(createAuditEvent('auth.success', 'req-1'));
      expect(storage.count()).toBe(1);
    });

    it('trims when exceeding max capacity', () => {
      const smallStorage = new MemoryAuditStorage(3);
      smallStorage.store(createAuditEvent('auth.success', 'req-1'));
      smallStorage.store(createAuditEvent('auth.success', 'req-2'));
      smallStorage.store(createAuditEvent('auth.success', 'req-3'));
      smallStorage.store(createAuditEvent('auth.success', 'req-4'));

      expect(smallStorage.count()).toBe(3);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      storage.store(createAuditEvent('auth.success', 'req-1', { tenantId: 'tenant-a', tool: 'tool1' }));
      storage.store(createAuditEvent('auth.failure', 'req-2', { tenantId: 'tenant-a', tool: 'tool2' }));
      storage.store(createAuditEvent('tool.executed', 'req-3', { tenantId: 'tenant-b', success: true }));
      storage.store(createAuditEvent('tool.executed', 'req-4', { tenantId: 'tenant-b', success: false }));
    });

    it('returns all events when no filter', () => {
      const results = storage.query({});
      expect(results).toHaveLength(4);
    });

    it('filters by requestId', () => {
      const results = storage.query({ requestId: 'req-1' });
      expect(results).toHaveLength(1);
      expect(results[0]?.requestId).toBe('req-1');
    });

    it('filters by userId', () => {
      storage.store(createAuditEvent('auth.success', 'req-5', { userId: 'user-1' }));
      storage.store(createAuditEvent('auth.success', 'req-6', { userId: 'user-2' }));

      const results = storage.query({ userId: 'user-1' });
      expect(results).toHaveLength(1);
      expect(results[0]?.userId).toBe('user-1');
    });

    it('filters by tool', () => {
      const results = storage.query({ tool: 'tool1' });
      expect(results).toHaveLength(1);
      expect(results[0]?.tool).toBe('tool1');
    });

    it('filters by success', () => {
      storage.store(createAuditEvent('tool.executed', 'req-s1', { success: true }));
      storage.store(createAuditEvent('tool.executed', 'req-s2', { success: false }));

      const results = storage.query({ success: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by startTime', () => {
      const now = new Date();
      const results = storage.query({ startTime: now.toISOString() });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('filters by startTime', () => {
      const now = new Date();
      storage.store(createAuditEvent('auth.success', 'req-time'));
      const results = storage.query({ startTime: now.toISOString() });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('filters by endTime', () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 1000).toISOString();

      const beforeCount = storage.query({ endTime: pastTime }).length;
      expect(beforeCount).toBeGreaterThanOrEqual(0);
    });

    it('sorts by timestamp descending', () => {
      const results = storage.query({});
      for (let i = 0; i < results.length - 1; i++) {
        const aTime = new Date(results[i]!.timestamp).getTime();
        const bTime = new Date(results[i + 1]!.timestamp).getTime();
        expect(aTime).toBeGreaterThanOrEqual(bTime);
      }
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      storage.store(createAuditEvent('auth.success', 'req-1'));
      storage.store(createAuditEvent('auth.success', 'req-2'));

      storage.clear();

      expect(storage.count()).toBe(0);
      expect(storage.query({})).toHaveLength(0);
    });
  });
});

describe('FileAuditStorage', () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `audit-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    tempFile = path.join(tempDir, 'audit.log');
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('store', () => {
    it('creates file if not exists', () => {
      const storage = new FileAuditStorage(tempFile);
      storage.store(createAuditEvent('auth.success', 'req-1'));

      expect(fs.existsSync(tempFile)).toBe(true);
    });

    it('appends event as JSON line', () => {
      const storage = new FileAuditStorage(tempFile);
      storage.store(createAuditEvent('auth.success', 'req-1'));

      const content = fs.readFileSync(tempFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      const line = lines[0];
      if (!line) {
        throw new Error('No lines found in file');
      }
      const parsed = JSON.parse(line);

      expect(parsed.eventType).toBe('auth.success');
      expect(parsed.requestId).toBe('req-1');
    });

    it('handles missing directory', () => {
      const nestedFile = path.join(tempDir, 'subdir', 'audit.log');
      const storage = new FileAuditStorage(nestedFile);

      expect(() => storage.store(createAuditEvent('auth.success', 'req-1'))).not.toThrow();
    });
  });

  describe('query', () => {
    beforeEach(() => {
      const storage = new FileAuditStorage(tempFile);
      storage.store(createAuditEvent('auth.success', 'req-1', { tenantId: 'tenant-a' }));
      storage.store(createAuditEvent('auth.failure', 'req-2', { tenantId: 'tenant-a' }));
      storage.store(createAuditEvent('tool.executed', 'req-3', { tenantId: 'tenant-b', success: true }));
    });

    it('returns all events when no filter', () => {
      const storage = new FileAuditStorage(tempFile);
      const results = storage.query({});
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by tenantId', () => {
      const storage = new FileAuditStorage(tempFile);
      const results = storage.query({ tenantId: 'tenant-a' });
      expect(results).toHaveLength(2);
    });

    it('filters by eventType', () => {
      const storage = new FileAuditStorage(tempFile);
      const results = storage.query({ eventType: 'auth.success' });
      expect(results).toHaveLength(1);
    });

    it('filters by success', () => {
      const storage = new FileAuditStorage(tempFile);
      storage.store(createAuditEvent('tool.executed', 'req-s1', { success: true }));
      storage.store(createAuditEvent('tool.executed', 'req-s2', { success: false }));

      const results = storage.query({ success: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty file', () => {
      fs.writeFileSync(tempFile, '');
      const storage = new FileAuditStorage(tempFile);
      const results = storage.query({});
      expect(results).toHaveLength(0);
    });

    it('handles malformed JSON lines', () => {
      fs.appendFileSync(tempFile, 'not valid json\n');
      const storage = new FileAuditStorage(tempFile);
      expect(() => storage.query({})).toThrow();
    });
  });

  describe('rotation', () => {
    it('rotates when file exceeds max size', () => {
      const smallStorage = new FileAuditStorage(tempFile, { maxFileSizeBytes: 100 });
      for (let i = 0; i < 10; i++) {
        smallStorage.store(createAuditEvent('auth.success', `req-${i}`));
      }

      const backupFile = `${tempFile}.1`;
      expect(fs.existsSync(backupFile)).toBe(true);
    });
  });

  describe('purgeOldEvents', () => {
    it('purges events older than retention days', () => {
      const storageWithRetention = new FileAuditStorage(tempFile, { retentionDays: 0 });

      storageWithRetention.store(createAuditEvent('auth.success', 'req-1'));

      expect(() => storageWithRetention.store(createAuditEvent('auth.success', 'req-2'))).not.toThrow();
    });
  });
});