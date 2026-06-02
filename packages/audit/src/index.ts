/**
 * mcp-gateway — Audit Trail Barrel Exports
 */

export type { AuditLogger } from './audit-logger.js';
export {
  CompositeAuditLogger,
  ConsoleAuditLogger,
  computeEventHash,
  createAuditEvent,
  FileAuditLogger,
  TamperEvidentLogger,
  verifyAuditChain,
} from './audit-logger.js';
export { createAuditQueryService } from './audit-query.js';
export {
  FileAuditStorage,
  MemoryAuditStorage,
} from './audit-storage.js';

export {
  EVENT_TYPE_CONFIGS,
  getEventSeverity,
  getEventTypeConfig,
} from './event-types.js';

export type {
  AuditEvent,
  AuditEventType,
  AuditQueryParams,
  AuditSeverity,
  AuditStorageConfig,
  AuditStorageType,
} from './types.js';
