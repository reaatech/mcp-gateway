/**
 * mcp-gateway — Tool Allowlist Manager
 * Manages per-tenant tool allowlists with wildcard pattern matching
 */

import type { AllowlistCheckResult, ToolAllowlist } from './types.js';

/**
 * Convert a wildcard pattern to a RegExp
 * Supports * (any chars) and ? (single char)
 */
function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/**
 * Check if a tool name matches a pattern
 */
export function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern === toolName) {
    return true;
  }
  const regex = wildcardToRegex(pattern);
  return regex.test(toolName);
}

/**
 * Check if a tool is allowed by the allowlist
 */
export function checkToolAccess(
  toolName: string,
  allowlist: ToolAllowlist | undefined,
): AllowlistCheckResult {
  if (!allowlist || !allowlist.tools || allowlist.tools.length === 0) {
    // No allowlist configured - default allow
    return { allowed: true, reason: 'No allowlist configured' };
  }

  const { mode, tools } = allowlist;

  for (const pattern of tools) {
    if (matchesPattern(toolName, pattern)) {
      if (mode === 'allow') {
        return { allowed: true, matchedPattern: pattern };
      }
      return {
        allowed: false,
        reason: `Tool '${toolName}' is blocked by pattern '${pattern}'`,
        matchedPattern: pattern,
      };
    }
  }

  // No pattern matched
  if (mode === 'allow') {
    return { allowed: false, reason: `Tool '${toolName}' is not in the allowed list` };
  }
  return { allowed: true, reason: 'Tool not matched by any deny pattern' };
}

/**
 * Validate allowlist configuration
 */
export function validateAllowlist(allowlist: ToolAllowlist): string[] {
  const errors: string[] = [];

  if (!allowlist.mode || !['allow', 'deny'].includes(allowlist.mode)) {
    errors.push("Allowlist mode must be 'allow' or 'deny'");
  }

  if (!Array.isArray(allowlist.tools)) {
    errors.push('Allowlist tools must be an array');
  } else if (allowlist.tools.length === 0) {
    errors.push('Allowlist tools array must not be empty');
  }

  return errors;
}
