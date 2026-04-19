/**
 * mcp-gateway — Audit Trail Barrel Exports
 */

export {
  createAuditEvent,
  ConsoleAuditLogger,
  FileAuditLogger,
  CompositeAuditLogger,
  TamperEvidentLogger,
  computeEventHash,
  verifyAuditChain,
} from './audit-logger.js';
export type { AuditLogger } from './audit-logger.js';

export {
  MemoryAuditStorage,
  FileAuditStorage,
} from './audit-storage.js';

export {
  createAuditQueryService,
} from './audit-query.js';

export {
  getEventTypeConfig,
  getEventSeverity,
  EVENT_TYPE_CONFIGS,
} from './event-types.js';

export type {
  AuditEvent,
  AuditEventType,
  AuditSeverity,
  AuditStorageType,
  AuditStorageConfig,
  AuditQueryParams,
} from './types.js';
