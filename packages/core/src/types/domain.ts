/**
 * mcp-gateway — Domain Types
 * Core domain types for the gateway
 */

/**
 * Authentication context extracted from request
 */
export interface AuthContext {
  /** Tenant identifier */
  tenantId: string;
  /** User identifier (if available) */
  userId?: string;
  /** Authentication method used */
  authMethod: 'api-key' | 'jwt' | 'oauth' | 'oidc' | 'none';
  /** Scopes/permissions granted */
  scopes: string[];
  /** API key name (if API key auth) */
  keyName?: string;
  /** Token expiration timestamp (if applicable) */
  expiresAt?: number;
}

/**
 * Rate limit configuration per tenant
 */
export interface RateLimitCfg {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  /** Maximum requests per day */
  requestsPerDay: number;
  /** Burst size for token bucket */
  burstSize?: number;
}

/**
 * Cache configuration per tenant
 */
export interface CacheCfg {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Default TTL in seconds */
  ttlSeconds: number;
  /** Maximum cache size in MB */
  maxSizeMb?: number;
  /** Per-tool cache strategies */
  strategies?: CacheStrat[];
}

/**
 * Cache strategy for specific tools
 */
export interface CacheStrat {
  /** Tool name patterns to match */
  tools: string[];
  /** TTL for matched tools */
  ttlSeconds: number;
}

/**
 * Upstream MCP server definition
 */
export interface UpstreamSrv {
  /** Unique name for this upstream */
  name: string;
  /** URL of the upstream MCP server */
  url: string;
  /** Weight for load balancing (0.0-1.0) */
  weight: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Whether this upstream is currently healthy */
  healthy?: boolean;
  /** Number of consecutive failures */
  failures?: number;
}

/**
 * Tool allowlist configuration
 */
export interface ToolAllowlistCfg {
  /** Allowlist mode: 'allow' = only listed tools allowed, 'deny' = listed tools blocked */
  mode: 'allow' | 'deny';
  /** Tool name patterns (supports wildcards) */
  tools: string[];
}

/**
 * Tenant configuration
 */
export interface TenantCfg {
  /** Unique tenant identifier */
  tenantId: string;
  /** Human-readable display name */
  displayName: string;
  /** Authentication configuration */
  auth?: TenantAuthCfg;
  /** Rate limiting configuration */
  rateLimits: RateLimitCfg;
  /** Cache configuration */
  cache: CacheCfg;
  /** Tool allowlist configuration */
  allowlist: ToolAllowlistCfg;
  /** Upstream server definitions */
  upstreams: UpstreamSrv[];
}

/**
 * Tenant authentication configuration
 */
export interface TenantAuthCfg {
  /** API key configurations */
  apiKeys?: ApiKeyCfg[];
  /** JWT validation configuration */
  jwt?: JwtCfg;
  /** OAuth2 introspection configuration */
  oauth?: OAuthCfg;
  /** OIDC configuration */
  oidc?: OidcCfg;
}

/**
 * API key configuration
 */
export interface ApiKeyCfg {
  /** SHA-256 hash of the API key */
  keyHash: string;
  /** Human-readable key name */
  name: string;
  /** Scopes granted to this key */
  scopes: string[];
  /** Key expiration timestamp (optional) */
  expiresAt?: number;
}

/**
 * JWT validation configuration
 */
export interface JwtCfg {
  /** Expected issuer */
  issuer: string;
  /** Expected audience */
  audience: string;
  /** JWKS URI for key discovery */
  jwksUri: string;
}

/**
 * OAuth2 token introspection configuration
 */
export interface OAuthCfg {
  /** Introspection endpoint URL */
  introspectionUrl: string;
  /** Client ID for introspection */
  clientId: string;
  /** Client secret (from env var) */
  clientSecretEnv: string;
}

/**
 * OIDC configuration
 */
export interface OidcCfg {
  /** OIDC issuer */
  issuer: string;
  /** Expected audience */
  audience: string;
  /** JWKS URI */
  jwksUri: string;
}

/**
 * Gateway request after validation
 */
export interface GatewayRequest {
  /** Unique request ID */
  requestId: string;
  /** JSON-RPC ID */
  id: string | number;
  /** JSON-RPC method */
  method: string;
  /** JSON-RPC params */
  params?: unknown;
  /** Authentication context */
  auth: AuthContext;
  /** Timestamp when request was received */
  receivedAt: Date;
  /** Tool name (for tools/call methods) */
  toolName?: string;
  /** Tool arguments (for tools/call methods) */
  toolArgs?: Record<string, unknown>;
}

/**
 * Gateway response with metadata
 */
export interface GatewayResponse {
  /** JSON-RPC ID */
  id: string | number;
  /** Response result */
  result?: unknown;
  /** Error (if any) */
  error?: JsonRpcError;
  /** Request ID for tracing */
  requestId: string;
  /** Whether response was from cache */
  cached: boolean;
  /** Cache key (if cached) */
  cacheKey?: string;
  /** Fan-out results (if applicable) */
  fanout?: FanOutResult;
  /** Duration in milliseconds */
  durationMs: number;
  /** Upstream that served the request */
  upstream?: string;
}

/**
 * JSON-RPC error
 */
export interface JsonRpcError {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Additional error data */
  data?: unknown;
}

/**
 * Audit log entry
 */
export interface AuditEvent {
  /** Event timestamp */
  timestamp: Date;
  /** Event type */
  eventType: string;
  /** Tenant identifier */
  tenantId: string;
  /** User identifier (if available) */
  userId?: string;
  /** Request ID */
  requestId: string;
  /** Tool name (if applicable) */
  tool?: string;
  /** Whether the action was successful */
  success: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Whether response was cached */
  cacheHit?: boolean;
  /** Upstream server (if applicable) */
  upstream?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Fan-out aggregation result
 */
export interface FanOutResult {
  /** Number of upstreams contacted */
  upstreamsContacted: number;
  /** Number of successful responses */
  successful: number;
  /** Number of failed responses */
  failed: number;
  /** Aggregation strategy used */
  strategy: 'first-success' | 'all-wait' | 'majority-vote';
  /** Latencies per upstream in milliseconds */
  latenciesMs: Record<string, number | null>;
  /** Errors from failed upstreams */
  errors?: Record<string, string>;
}

/**
 * Health check status
 */
export interface HealthStatus {
  /** Overall health status */
  status: 'healthy' | 'unhealthy' | 'degraded';
  /** Service version */
  version: string;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Component health statuses */
  components: Record<string, ComponentHealth>;
}

/**
 * Individual component health
 */
export interface ComponentHealth {
  /** Component status */
  status: 'healthy' | 'unhealthy' | 'degraded';
  /** Status message */
  message?: string;
  /** Response time in milliseconds */
  latencyMs?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current cache size in bytes */
  sizeBytes: number;
  /** Number of items in cache */
  itemCount: number;
  /** Hit rate (0.0-1.0) */
  hitRate: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Tenant identifier */
  tenantId: string;
  /** Requests remaining in current minute */
  remainingMinute: number;
  /** Requests remaining in current day */
  remainingDay: number;
  /** Limit per minute */
  limitMinute: number;
  /** Limit per day */
  limitDay: number;
  /** Reset timestamp for minute limit */
  resetMinute: number;
  /** Reset timestamp for day limit */
  resetDay: number;
}
