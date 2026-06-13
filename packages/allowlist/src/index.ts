/**
 * mcp-gateway — Tool Allowlist Barrel Exports
 */

// Express middleware
export { allowlistMiddleware } from './allowlist.middleware.js';
// Framework-agnostic core
export { checkAllowlist } from './allowlist-core.js';
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
