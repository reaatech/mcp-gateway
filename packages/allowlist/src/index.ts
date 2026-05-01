/**
 * mcp-gateway — Tool Allowlist Barrel Exports
 */

export {
  checkToolAccess,
  matchesPattern,
  validateAllowlist,
} from './allowlist-manager.js';

export { allowlistMiddleware } from './allowlist.middleware.js';

export {
  updateAllowlist,
  getAllowlist,
  getAllowlistVersion,
  rollbackAllowlist,
  removeAllowlist,
} from './dynamic-allowlist.js';

export type {
  AllowlistMode,
  ToolAllowlist,
  AllowlistCheckResult,
} from './types.js';
