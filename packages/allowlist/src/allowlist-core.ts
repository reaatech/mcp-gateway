/**
 * mcp-gateway — Framework-Agnostic Tool Allowlist Core
 *
 * Reads the tenant from the normalized request context (populated by auth),
 * extracts the requested tool from the JSON-RPC body, and returns an
 * allow/deny decision. Non-tool-call requests, unknown tenants, and requests
 * with no identified tenant pass through unchanged — matching the existing
 * Express behavior.
 */

import type { GatewayDecision, GatewayRequestContext } from '@reaatech/mcp-gateway-core';
import { extractToolName, getTenant, getTenantIdFromContext } from '@reaatech/mcp-gateway-core';
import { checkToolAccess } from './allowlist-manager.js';

/**
 * Framework-agnostic tool allowlist check.
 *
 * - `deny` (403, JSON-RPC `-32601`) when the requested tool is blocked.
 * - `allow` otherwise (including non-tool-call requests).
 */
export function checkAllowlist(ctx: GatewayRequestContext): GatewayDecision {
  // Tenant must come from authenticated state, not a spoofable header.
  const tenantId = getTenantIdFromContext(ctx);
  if (!tenantId) {
    return { action: 'allow' };
  }

  const tenant = getTenant(tenantId);
  if (!tenant) {
    return { action: 'allow' };
  }

  const toolName = ctx.toolName ?? extractToolName(ctx.body) ?? undefined;
  if (!toolName) {
    // Not a tool call — nothing to gate.
    return { action: 'allow' };
  }

  const result = checkToolAccess(toolName, tenant.allowlist);
  if (result.allowed) {
    return { action: 'allow' };
  }

  const id = (ctx.body as Record<string, unknown> | undefined)?.id;
  return {
    action: 'deny',
    status: 403,
    body: {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: 'Tool not allowed',
        data: {
          tool: toolName,
          tenant: tenantId,
          reason: result.reason,
          matchedPattern: result.matchedPattern,
        },
      },
    },
  };
}
