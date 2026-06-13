/**
 * mcp-gateway — Audit Trail Barrel Exports
 */

// Express middleware
export { auditMiddleware } from './audit.middleware.js';
// Framework-agnostic core
export { type RecordAuditOptions, recordAudit } from './audit-core.js';
export type { AuditLogger } from './audit-logger.js';
export {
  CompositeAuditLogger,
  ConsoleAuditLogger,
  computeEventHash,
  createAuditEvent,
  FileAuditLogger,
  SilentAuditLogger,
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
