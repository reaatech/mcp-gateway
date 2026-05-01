/**
 * mcp-gateway — Audit Query Interface
 * Query and export audit logs
 */

import type { AuditEvent, AuditQueryParams } from './types.js';

/**
 * Audit query service
 */
export interface AuditQueryService {
  query(params: AuditQueryParams): AuditEvent[];
  count(params: AuditQueryParams): number;
  exportCSV(params: AuditQueryParams): string;
}

/**
 * Create a query service backed by storage
 */
function escapeCsvValue(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.startsWith('=') ||
    value.startsWith('+') ||
    value.startsWith('-') ||
    value.startsWith('@')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const MAX_EXPORT_LIMIT = 100000;

export function createAuditQueryService(storage: {
  query(params: AuditQueryParams): AuditEvent[];
  count?: () => number;
}): AuditQueryService {
  return {
    query(params: AuditQueryParams): AuditEvent[] {
      return storage.query(params);
    },

    count(params: AuditQueryParams): number {
      // Query with max limit to get all matching
      const all = storage.query({ ...params, limit: MAX_EXPORT_LIMIT, offset: 0 });
      return all.length;
    },

    exportCSV(params: AuditQueryParams): string {
      const events = storage.query({ ...params, limit: MAX_EXPORT_LIMIT, offset: 0 });

      const headers = [
        'timestamp',
        'eventType',
        'severity',
        'tenantId',
        'userId',
        'requestId',
        'tool',
        'upstream',
        'success',
        'durationMs',
      ];

      const rows = events.map((e) => [
        escapeCsvValue(e.timestamp),
        escapeCsvValue(e.eventType),
        escapeCsvValue(e.severity),
        escapeCsvValue(e.tenantId ?? ''),
        escapeCsvValue(e.userId ?? ''),
        escapeCsvValue(e.requestId),
        escapeCsvValue(e.tool ?? ''),
        escapeCsvValue(e.upstream ?? ''),
        e.success ? 'true' : 'false',
        e.durationMs?.toString() ?? '',
      ]);

      const csvRows = [headers.join(','), ...rows.map((r) => r.join(','))];
      return csvRows.join('\n');
    },
  };
}
