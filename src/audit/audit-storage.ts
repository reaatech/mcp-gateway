/**
 * mcp-gateway — Audit Storage
 * Storage backends for audit logs
 */

import type { AuditEvent, AuditQueryParams } from './types.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * In-memory storage for audit events (development/testing)
 */
export class MemoryAuditStorage {
  private events: AuditEvent[] = [];
  private maxEvents: number;

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }

  store(event: AuditEvent): void {
    this.events.push(event);
    // Trim oldest if over limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  query(params: AuditQueryParams): AuditEvent[] {
    let results = [...this.events];

    if (params.tenantId) {
      results = results.filter(e => e.tenantId === params.tenantId);
    }
    if (params.eventType) {
      results = results.filter(e => e.eventType === params.eventType);
    }
    if (params.requestId) {
      results = results.filter(e => e.requestId === params.requestId);
    }
    if (params.userId) {
      results = results.filter(e => e.userId === params.userId);
    }
    if (params.tool) {
      results = results.filter(e => e.tool === params.tool);
    }
    if (params.success !== undefined) {
      results = results.filter(e => e.success === params.success);
    }
    if (params.startTime) {
      const start = new Date(params.startTime).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (params.endTime) {
      const end = new Date(params.endTime).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  clear(): void {
    this.events = [];
  }

  count(): number {
    return this.events.length;
  }
}

/**
 * File-based storage for audit events with log rotation support
 */
export class FileAuditStorage {
  private fs: typeof import('fs');
  private filePath: string;
  private maxFileSizeBytes: number;
  private retentionDays: number;
  private lastPurgeMs = 0;
  private static readonly PURGE_INTERVAL_MS = 3600000;

  constructor(filePath: string, options?: { maxFileSizeBytes?: number; retentionDays?: number }) {
    this.filePath = filePath;
    this.maxFileSizeBytes = options?.maxFileSizeBytes ?? 50 * 1024 * 1024;
    this.retentionDays = options?.retentionDays ?? 90;
    this.fs = require('fs');

    if (!this.fs.existsSync(filePath)) {
      const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
      if (dir && !this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
      }
      this.fs.writeFileSync(filePath, '');
    }
  }

  store(event: AuditEvent): void {
    this.rotateIfNeeded();
    const now = Date.now();
    if (now - this.lastPurgeMs > FileAuditStorage.PURGE_INTERVAL_MS) {
      this.purgeOldEvents();
      this.lastPurgeMs = now;
    }
    const line = JSON.stringify(event) + '\n';
    try {
      this.fs.appendFileSync(this.filePath, line);
    } catch (_err) {
      // Gracefully handle write failure
    }
  }

  query(params: AuditQueryParams): AuditEvent[] {
    const content = this.fs.readFileSync(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l);
    const events: AuditEvent[] = lines.map(l => JSON.parse(l));

    let results = events;

    if (params.tenantId) {
      results = results.filter(e => e.tenantId === params.tenantId);
    }
    if (params.eventType) {
      results = results.filter(e => e.eventType === params.eventType);
    }
    if (params.requestId) {
      results = results.filter(e => e.requestId === params.requestId);
    }
    if (params.userId) {
      results = results.filter(e => e.userId === params.userId);
    }
    if (params.tool) {
      results = results.filter(e => e.tool === params.tool);
    }
    if (params.success !== undefined) {
      results = results.filter(e => e.success === params.success);
    }
    if (params.startTime) {
      const start = new Date(params.startTime).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (params.endTime) {
      const end = new Date(params.endTime).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Rotate the log file if it exceeds maxFileSizeBytes.
   * Renames the current file to <path>.1 (overwriting previous backup).
   */
  private rotateIfNeeded(): void {
    try {
      if (!this.fs.existsSync(this.filePath)) {
        return;
      }
      const stats = this.fs.statSync(this.filePath);
      if (stats.size >= this.maxFileSizeBytes) {
        const backupPath = `${this.filePath}.1`;
        if (this.fs.existsSync(backupPath)) {
          this.fs.unlinkSync(backupPath);
        }
        this.fs.renameSync(this.filePath, backupPath);
        this.fs.writeFileSync(this.filePath, '');
      }
    } catch {
      // If rotation fails, continue writing to current file
    }
  }

  /**
   * Purge events older than retentionDays from the file.
   */
  private purgeOldEvents(): void {
    try {
      if (this.retentionDays <= 0) {
        return;
      }
      if (!this.fs.existsSync(this.filePath)) {
        return;
      }

      const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
      const content = this.fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      const recent = lines.filter(l => {
        try {
          const event = JSON.parse(l) as AuditEvent;
          return new Date(event.timestamp).getTime() >= cutoff;
        } catch {
          return true;
        }
      });

      if (recent.length < lines.length) {
        this.fs.writeFileSync(this.filePath, recent.join('\n') + '\n');
      }
    } catch {
      // If purge fails, continue with existing file
    }
  }
}
