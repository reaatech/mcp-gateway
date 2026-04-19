/**
 * mcp-gateway — Audit Event Type Definitions
 * Defines severity and metadata for each event type
 */

import type { AuditEventType, AuditSeverity } from './types.js';

/**
 * Event type configuration
 */
interface EventTypeConfig {
  severity: AuditSeverity;
  description: string;
  requiresAuth: boolean;
}

/**
 * Event type configurations
 */
export const EVENT_TYPE_CONFIGS: Record<AuditEventType, EventTypeConfig> = {
  'auth.success': {
    severity: 'low',
    description: 'Successful authentication',
    requiresAuth: false,
  },
  'auth.failure': {
    severity: 'medium',
    description: 'Failed authentication attempt',
    requiresAuth: false,
  },
  'auth.logout': {
    severity: 'low',
    description: 'User logged out',
    requiresAuth: true,
  },
  'auth.token_refresh': {
    severity: 'low',
    description: 'Token refresh',
    requiresAuth: true,
  },
  'rate_limit.exceeded': {
    severity: 'medium',
    description: 'Rate limit exceeded',
    requiresAuth: true,
  },
  'allowlist.denied': {
    severity: 'high',
    description: 'Tool access denied by allowlist',
    requiresAuth: true,
  },
  'tool.executed': {
    severity: 'low',
    description: 'Tool execution completed',
    requiresAuth: true,
  },
  'tool.blocked': {
    severity: 'high',
    description: 'Tool execution blocked',
    requiresAuth: true,
  },
  'cache.hit': {
    severity: 'low',
    description: 'Cache hit',
    requiresAuth: true,
  },
  'cache.miss': {
    severity: 'low',
    description: 'Cache miss',
    requiresAuth: true,
  },
  'upstream.error': {
    severity: 'high',
    description: 'Upstream server error',
    requiresAuth: true,
  },
  'config.changed': {
    severity: 'critical',
    description: 'Configuration changed',
    requiresAuth: false,
  },
  'tenant.created': {
    severity: 'high',
    description: 'Tenant created',
    requiresAuth: false,
  },
  'tenant.deleted': {
    severity: 'high',
    description: 'Tenant deleted',
    requiresAuth: false,
  },
};

/**
 * Get configuration for an event type
 */
export function getEventTypeConfig(eventType: AuditEventType): EventTypeConfig {
  return EVENT_TYPE_CONFIGS[eventType];
}

/**
 * Get severity for an event type
 */
export function getEventSeverity(eventType: AuditEventType): AuditSeverity {
  return EVENT_TYPE_CONFIGS[eventType]?.severity ?? 'low';
}
