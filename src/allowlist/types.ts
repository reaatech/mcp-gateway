/**
 * mcp-gateway — Tool Allowlist Types
 */

/**
 * Allowlist mode: 'allow' = only listed tools allowed (default deny),
 * 'deny' = listed tools blocked (default allow)
 */
export type AllowlistMode = 'allow' | 'deny';

/**
 * Tool allowlist configuration from tenant config
 */
export interface ToolAllowlist {
  mode: AllowlistMode;
  tools: string[];
}

/**
 * Result of an allowlist check
 */
export interface AllowlistCheckResult {
  allowed: boolean;
  reason?: string;
  matchedPattern?: string;
}
