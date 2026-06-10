/**
 * mcp-gateway — Custom Schema Support
 *
 * Manages per-tool input/output schemas with versioning and caching.
 */

import { getSchemaValidator } from './schema-validator.js';
import type { ValidationResult } from './types.js';
import { JSONRPC_ERRORS } from './types.js';

/**
 * Tool schema metadata
 */
export interface ToolSchemaMetadata {
  /** Tool name */
  toolName: string;
  /** Schema version */
  version: string;
  /** Input JSON Schema */
  inputSchema: Record<string, unknown>;
  /** Output JSON Schema (optional) */
  outputSchema?: Record<string, unknown>;
  /** When this schema was fetched */
  fetchedAt: number;
  /** Schema source (upstream name) */
  source: string;
}

/**
 * Custom schema manager for per-tool schemas
 */
export class CustomSchemaManager {
  private readonly toolSchemas: Map<string, ToolSchemaMetadata>;
  private readonly versionHistory: Map<string, ToolSchemaMetadata[]>;

  constructor() {
    this.toolSchemas = new Map();
    this.versionHistory = new Map();
  }

  /**
   * Register a tool schema
   */
  registerSchema(metadata: ToolSchemaMetadata): void {
    const existing = this.toolSchemas.get(metadata.toolName);

    // Store in version history if there was a previous version
    if (existing) {
      const history = this.versionHistory.get(metadata.toolName) || [];
      history.push(existing);
      this.versionHistory.set(metadata.toolName, history);
    }

    // Cache in schema validator
    const validator = getSchemaValidator();
    validator.cacheToolSchema(metadata.toolName, metadata.inputSchema);

    this.toolSchemas.set(metadata.toolName, metadata);
  }

  /**
   * Get a tool schema
   */
  getSchema(toolName: string): ToolSchemaMetadata | undefined {
    return this.toolSchemas.get(toolName);
  }

  /**
   * Validate tool arguments using registered schema
   */
  validateArguments(toolName: string, arguments_: Record<string, unknown>): ValidationResult {
    const schema = this.toolSchemas.get(toolName);

    if (!schema) {
      return {
        valid: false,
        errors: [
          {
            field: 'tool',
            expected: 'registered tool schema',
            received: toolName,
            message: `No schema registered for tool: ${toolName}`,
          },
        ],
        errorCode: JSONRPC_ERRORS.INVALID_PARAMS,
        errorMessage: 'Tool schema not found',
      };
    }

    const validator = getSchemaValidator();
    return validator.validateToolArguments(toolName, arguments_, schema.inputSchema);
  }

  /**
   * Validate tool output using registered output schema
   */
  validateOutput(toolName: string, output: unknown): ValidationResult {
    const schema = this.toolSchemas.get(toolName);

    if (!schema?.outputSchema) {
      // No output schema registered, skip validation
      return { valid: true, errors: [] };
    }

    const validator = getSchemaValidator();
    const outputValidator = validator.getToolSchema(`output:${toolName}`);

    if (!outputValidator) {
      // Cache the output schema
      validator.cacheToolSchema(`output:${toolName}`, schema.outputSchema);
    }

    return validator.validateToolArguments(
      `output:${toolName}`,
      output as Record<string, unknown>,
      schema.outputSchema,
    );
  }

  /**
   * Check if a tool schema exists
   */
  hasSchema(toolName: string): boolean {
    return this.toolSchemas.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.toolSchemas.keys());
  }

  /**
   * Get version history for a tool
   */
  getVersionHistory(toolName: string): ToolSchemaMetadata[] {
    return this.versionHistory.get(toolName) || [];
  }

  /**
   * Rollback to a previous schema version
   */
  rollback(toolName: string, version: string): boolean {
    const history = this.versionHistory.get(toolName);

    if (!history) {
      return false;
    }

    const previousVersion = history.find((v) => v.version === version);

    if (!previousVersion) {
      return false;
    }

    // Re-register the previous version
    this.registerSchema(previousVersion);
    return true;
  }

  /**
   * Remove a tool schema
   */
  removeSchema(toolName: string): void {
    this.toolSchemas.delete(toolName);
    this.versionHistory.delete(toolName);

    // Clear from validator cache
    const validator = getSchemaValidator();
    validator.clearCache();
  }

  /**
   * Clear all schemas
   */
  clear(): void {
    this.toolSchemas.clear();
    this.versionHistory.clear();

    const validator = getSchemaValidator();
    validator.clearCache();
  }
}

// Singleton instance
let customSchemaManager: CustomSchemaManager | undefined;

/**
 * Get or create the custom schema manager singleton
 */
export function getCustomSchemaManager(): CustomSchemaManager {
  if (!customSchemaManager) {
    customSchemaManager = new CustomSchemaManager();
  }
  return customSchemaManager;
}

/**
 * Reset the custom schema manager (for testing)
 */
export function resetCustomSchemaManager(): void {
  customSchemaManager = undefined;
}
