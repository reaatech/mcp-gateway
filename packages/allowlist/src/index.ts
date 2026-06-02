/**
 * mcp-gateway — Tool Allowlist Barrel Exports
 */

export { allowlistMiddleware } from './allowlist.middleware.js';
export {
  checkToolAccess,
  matchesPattern,
  validateAllowlist,
} from './allowlist-manager.js';

export {
  getAllowlist,
  getAllowlistVersion,
  removeAllowlist,
  rollbackAllowlist,
  updateAllowlist,
} from './dynamic-allowlist.js';

export type {
  AllowlistCheckResult,
  AllowlistMode,
  ToolAllowlist,
} from './types.js';
