/**
 * mcp-gateway — Tool Allowlist Middleware
 * Express middleware that checks tool access before forwarding requests
 */

import type { Request, Response, NextFunction } from 'express';
import { checkToolAccess } from './allowlist-manager.js';
import { getTenant } from '../config/tenant-loader.js';

/**
 * Extract tool name from MCP JSON-RPC request
 */
function extractToolName(body: unknown): string | null {
  if (!body || typeof body !== 'object') {return null;}
  const req = body as Record<string, unknown>;
  if (req.method !== 'tools/call') {return null;}
  const params = req.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== 'object') {return null;}
  const name = (params as Record<string, unknown>).name;
  if (typeof name === 'string') {return name;}
  return null;
}

/**
 * Tool Allowlist middleware
 * Checks if the requested tool is allowed for the tenant
 */
export function allowlistMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get tenant from auth context (not from header - header is spoofable)
    const tenantId = req.authContext?.tenantId;
    if (!tenantId) {
      next();
      return;
    }

    const tenant = getTenant(tenantId);
    if (!tenant) {
      next();
      return;
    }

    // Get allowlist from tenant config
    const allowlist = tenant.allowlist;

    // Extract tool name from request
    const toolName = extractToolName(req.body);

    // If not a tool call, skip allowlist check
    if (!toolName) {
      next();
      return;
    }

    // Check tool access
    const result = checkToolAccess(toolName, allowlist);

    if (!result.allowed) {
      res.status(403).json({
        jsonrpc: '2.0',
        id: (req.body as Record<string, unknown>).id,
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
      });
      return;
    }

    next();
  };
}
