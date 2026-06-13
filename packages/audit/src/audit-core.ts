/**
 * mcp-gateway — Framework-Agnostic Audit Core
 *
 * Builds an {@link AuditEvent} from a normalized request context and an
 * allow/deny decision, then writes it to a sink. Express and Fastify adapters
 * are thin wrappers over {@link recordAudit}. The default sink is silent (no
 * stdout writes) so hosts that reserve stdout for the MCP JSON-RPC stream are
 * unaffected unless a real logger is supplied.
 */

import type { GatewayDecision, GatewayRequestContext } from '@reaatech/mcp-gateway-core';
import { getTenantIdFromContext } from '@reaatech/mcp-gateway-core';
import type { AuditLogger } from './audit-logger.js';
import { createAuditEvent, SilentAuditLogger } from './audit-logger.js';
import type { AuditEvent, AuditEventType } from './types.js';

const DEFAULT_LOGGER = new SilentAuditLogger();

export interface RecordAuditOptions {
  /** Sink for the event. Defaults to a silent (no-op) logger. */
  logger?: AuditLogger;
  /** Override the event type. Defaults based on the decision outcome. */
  eventType?: AuditEventType;
  /** Extra metadata to attach to the event. */
  metadata?: Record<string, unknown>;
  /** Request duration in milliseconds, if known. */
  durationMs?: number;
}

/**
 * Resolve the event type for a recorded request when not explicitly provided.
 */
function defaultEventType(decision: GatewayDecision): AuditEventType {
  return decision.action === 'deny' ? 'tool.blocked' : 'tool.executed';
}

/**
 * Record an audit event for a request + decision. Returns the event that was
 * written, so callers/tests can inspect it.
 */
export function recordAudit(
  ctx: GatewayRequestContext,
  decision: GatewayDecision,
  options: RecordAuditOptions = {},
): AuditEvent {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const requestId = ctx.getHeader('x-request-id') ?? 'unknown';

  const event = createAuditEvent(options.eventType ?? defaultEventType(decision), requestId, {
    tenantId: getTenantIdFromContext(ctx),
    tool: ctx.toolName,
    success: decision.action === 'allow',
    durationMs: options.durationMs,
    ...(options.metadata ? { metadata: options.metadata } : {}),
  });

  void logger.log(event);
  return event;
}
