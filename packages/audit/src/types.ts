/**
 * mcp-gateway — Audit Trail Types
 */

/**
 * Audit event types
 */
export type AuditEventType =
  | 'auth.success'
  | 'auth.failure'
  | 'auth.logout'
  | 'auth.token_refresh'
  | 'rate_limit.exceeded'
  | 'allowlist.denied'
  | 'tool.executed'
  | 'tool.blocked'
  | 'cache.hit'
  | 'cache.miss'
  | 'upstream.error'
  | 'config.changed'
  | 'tenant.created'
  | 'tenant.deleted';

/**
 * Audit event severity levels
 */
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Audit event structure
 */
export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  tenantId?: string;
  userId?: string;
  requestId: string;
  tool?: string;
  upstream?: string;
  success: boolean;
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Storage backend types
 */
export type AuditStorageType = 'file' | 'database' | 'siem';

/**
 * Storage configuration
 */
export interface AuditStorageConfig {
  type: AuditStorageType;
  filePath?: string;
  retentionDays?: number;
  maxFileSize?: number;
}

/**
 * Query parameters for audit log search
 */
export interface AuditQueryParams {
  tenantId?: string;
  eventType?: AuditEventType;
  requestId?: string;
  userId?: string;
  tool?: string;
  startTime?: string;
  endTime?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}
