/**
 * mcp-gateway — Constants
 * Application-wide constants
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Service metadata
 */
export const SERVICE_NAME = 'mcp-gateway';

/**
 * Service version from package.json
 */
let packageVersion = '1.0.0';
try {
  const packagePath = join(__dirname, '..', '..', 'package.json');
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    packageVersion = pkg.version || '1.0.0';
  }
} catch {
  // Use default version if package.json cannot be read
}

export const SERVICE_VERSION = packageVersion;

/**
 * Default HTTP port
 */
export const DEFAULT_PORT = 8080;

/**
 * Maximum request body size (10MB)
 */
export const MAX_REQUEST_BODY_SIZE = '10mb';

/**
 * Default rate limit values
 */
export const DEFAULT_REQUESTS_PER_MINUTE = 100;
export const DEFAULT_REQUESTS_PER_DAY = 10000;

/**
 * Default cache TTL in seconds
 */
export const DEFAULT_CACHE_TTL_SECONDS = 300;

/**
 * MCP protocol version
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * JSON-RPC version
 */
export const JSON_RPC_VERSION = '2.0';

/**
 * Default timeout for upstream requests in milliseconds
 */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 30000;

/**
 * Default number of retries for failed upstream requests
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Health check endpoints
 */
export const HEALTH_ENDPOINT = '/health';
export const DEEP_HEALTH_ENDPOINT = '/health/deep';

/**
 * MCP endpoint
 */
export const MCP_ENDPOINT = '/mcp';

/**
 * API version prefix
 */
export const API_V1_PREFIX = '/api/v1';
