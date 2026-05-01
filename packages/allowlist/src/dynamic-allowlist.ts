/**
 * mcp-gateway — Dynamic Allowlist Updates
 * Hot-reload support for allowlist changes with version tracking
 */

import { validateAllowlist } from './allowlist-manager.js';
import type { ToolAllowlist } from './types.js';

/**
 * Versioned allowlist entry
 */
interface VersionedAllowlist {
  allowlist: ToolAllowlist;
  version: number;
  updatedAt: Date;
}

const MAX_VERSION_HISTORY = 3;
const allowlistVersions = new Map<string, VersionedAllowlist>();
const allowlistHistory = new Map<string, VersionedAllowlist[]>();

/**
 * Update a tenant's allowlist with version tracking
 */
export function updateAllowlist(
  tenantId: string,
  allowlist: ToolAllowlist,
): { success: boolean; errors?: string[] } {
  const errors = validateAllowlist(allowlist);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const existing = allowlistVersions.get(tenantId);
  const history = allowlistHistory.get(tenantId) ?? [];
  const newEntry: VersionedAllowlist = {
    allowlist,
    version: existing ? existing.version + 1 : 1,
    updatedAt: new Date(),
  };

  if (existing) {
    history.push(existing);
    if (history.length > MAX_VERSION_HISTORY) {
      history.splice(0, history.length - MAX_VERSION_HISTORY);
    }
    allowlistHistory.set(tenantId, history);
  }

  allowlistVersions.set(tenantId, newEntry);
  return { success: true };
}

/**
 * Get current allowlist for a tenant
 */
export function getAllowlist(tenantId: string): ToolAllowlist | undefined {
  return allowlistVersions.get(tenantId)?.allowlist;
}

/**
 * Get allowlist version info for a tenant
 */
export function getAllowlistVersion(
  tenantId: string,
): { version: number; updatedAt: Date } | undefined {
  const entry = allowlistVersions.get(tenantId);
  if (!entry) {
    return undefined;
  }
  return { version: entry.version, updatedAt: entry.updatedAt };
}

/**
 * Rollback to previous allowlist version
 */
export function rollbackAllowlist(tenantId: string): boolean {
  const history = allowlistHistory.get(tenantId);
  if (!history || history.length === 0) {
    return false;
  }
  const previous = history.pop();
  if (!previous) {
    return false;
  }
  allowlistVersions.set(tenantId, previous);
  return true;
}

/**
 * Remove allowlist for a tenant
 */
export function removeAllowlist(tenantId: string): void {
  allowlistVersions.delete(tenantId);
  allowlistHistory.delete(tenantId);
}
