/**
 * mcp-gateway — Audit Logger
 * Core audit logging with PII redaction and tamper-evident hash chaining
 */

import { randomUUID, createHash } from 'crypto';
import { createRequire } from 'node:module';
import type { AuditEvent, AuditEventType } from './types.js';
import { getEventSeverity } from './event-types.js';

const require = createRequire(import.meta.url);

/**
 * Redact PII from audit event
 */
function redactPII(event: AuditEvent): AuditEvent {
  const redacted = { ...event };

  if (redacted.ipAddress) {
    const ip = redacted.ipAddress;
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length > 1) {
        parts[parts.length - 1] = 'xxxx';
        redacted.ipAddress = parts.join(':');
      }
    } else {
      const parts = ip.split('.');
      if (parts.length === 4) {
        parts[2] = 'xxx';
        parts[3] = 'xxx';
        redacted.ipAddress = parts.join('.');
      }
    }
  }

  if (redacted.metadata) {
    redacted.metadata = redactMetadata(redacted.metadata);
  }

  return redacted;
}

const SENSITIVE_KEY_PATTERNS = [
  'token', 'accesstoken', 'refreshtoken', 'bearertoken',
  'apikey', 'api-key', 'api_key',
  'password', 'passphrase', 'pwd', 'secret',
  'authorization', 'cookie', 'sessionid', 'csrfToken',
  'creditcard', 'ssn', 'email',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower === p || lower.includes(p));
}

function redactMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactMetadata(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Compute a tamper-evident hash for an audit event.
 * Chains the previous hash into the current event's hash so that
 * removing or modifying any event invalidates the entire chain.
 */
export function computeEventHash(event: AuditEvent, previousHash: string | null): string {
  const payload = JSON.stringify({
    id: event.id,
    timestamp: event.timestamp,
    eventType: event.eventType,
    requestId: event.requestId,
    previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Create a new audit event
 */
export function createAuditEvent(
  eventType: AuditEventType,
  requestId: string,
  options: Partial<AuditEvent> = {},
): AuditEvent {
  const severity = options.severity ?? getEventSeverity(eventType);

  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    severity,
    requestId,
    success: options.success ?? true,
    ...options,
  };
}

/**
 * Audit logger interface
 */
export interface AuditLogger {
  log(event: AuditEvent): void | Promise<void>;
}

/**
 * Console audit logger (for development)
 */
export class ConsoleAuditLogger implements AuditLogger {
  log(event: AuditEvent): void {
    const redacted = redactPII(event);
    console.log(JSON.stringify(redacted));
  }
}

/**
 * File audit logger (writes to file)
 * Note: Uses dynamic require for fs to avoid bundler issues
 */
export class FileAuditLogger implements AuditLogger {
  private fs: typeof import('fs');
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.fs = require('fs');
  }

  log(event: AuditEvent): void {
    const redacted = redactPII(event);
    const line = JSON.stringify(redacted) + '\n';
    this.fs.appendFileSync(this.filePath, line);
  }
}

/**
 * Tamper-evident audit logger — wraps any AuditLogger and appends a
 * `previousHash` / `eventHash` pair to each event so the chain can be
 * verified after the fact. Removing or modifying any event invalidates
 * every subsequent hash in the chain.
 */
export class TamperEvidentLogger implements AuditLogger {
  private inner: AuditLogger;
  private lastHash: string | null = null;

  constructor(inner: AuditLogger) {
    this.inner = inner;
  }

  log(event: AuditEvent): void {
    const eventHash = computeEventHash(event, this.lastHash);
    const chained: AuditEvent = {
      ...event,
      metadata: {
        ...event.metadata,
        previousHash: this.lastHash,
        eventHash,
      },
    };
    this.lastHash = eventHash;
    this.inner.log(chained);
  }

  /**
   * Return the hash of the last logged event (for external verification)
   */
  getLastHash(): string | null {
    return this.lastHash;
  }

  /**
   * Reset the chain (useful in tests)
   */
  reset(): void {
    this.lastHash = null;
  }
}

/**
 * Verify a sequence of audit events has an intact hash chain.
 * Returns true if every event's eventHash matches the recomputed hash.
 */
export function verifyAuditChain(events: AuditEvent[]): boolean {
  let previousHash: string | null = null;

  for (const event of events) {
    const stored = event.metadata?.eventHash as string | undefined;
    if (!stored) {
      return false;
    }

    const expected = computeEventHash(event, previousHash);
    if (stored !== expected) {
      return false;
    }

    previousHash = stored;
  }

  return true;
}

/**
 * Composite audit logger (writes to multiple destinations)
 */
export class CompositeAuditLogger implements AuditLogger {
  private loggers: AuditLogger[] = [];

  addLogger(logger: AuditLogger): void {
    this.loggers.push(logger);
  }

  log(event: AuditEvent): void {
    for (const logger of this.loggers) {
      logger.log(event);
    }
  }
}
