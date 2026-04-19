/**
 * mcp-gateway — Zod Schemas
 * Validation schemas for all configuration and request/response types
 */

import { z } from 'zod';

/**
 * JSON-RPC 2.0 request schema
 */
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

/**
 * JSON-RPC 2.0 response schema
 */
export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

/**
 * MCP tool definition schema
 */
export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()).optional(),
    required: z.string().array().optional(),
  }),
});

/**
 * MCP tools/list response schema
 */
export const MCPToolsListSchema = z.object({
  tools: MCPToolSchema.array(),
});

/**
 * MCP tools/call request params schema
 */
export const MCPToolsCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

/**
 * MCP tools/call response content schema
 */
export const MCPToolContentSchema = z.object({
  type: z.enum(['text', 'image', 'resource']),
  text: z.string().optional(),
  data: z.unknown().optional(),
  mimeType: z.string().optional(),
  uri: z.string().optional(),
});

/**
 * MCP tools/call response schema
 */
export const MCPToolsCallResponseSchema = z.object({
  content: MCPToolContentSchema.array(),
  isError: z.boolean().optional(),
});

/**
 * Upstream server schema
 */
export const UpstreamServerSchema = z.object({
  name: z.string().min(1, 'Upstream name is required'),
  url: z.string().url('Invalid upstream URL'),
  weight: z.number().min(0).max(1).default(1),
  timeoutMs: z.number().positive().default(30000).optional(),
});

/**
 * Rate limit configuration schema
 */
export const RateLimitConfigSchema = z.object({
  requestsPerMinute: z.number().positive(),
  requestsPerDay: z.number().positive(),
  burstSize: z.number().positive().optional(),
});

/**
 * Cache strategy schema
 */
export const CacheStrategySchema = z.object({
  tools: z.string().array(),
  ttlSeconds: z.number().positive(),
});

/**
 * Cache configuration schema
 */
export const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttlSeconds: z.number().positive().default(300),
  maxSizeMb: z.number().positive().optional(),
  strategies: CacheStrategySchema.array().optional(),
});

/**
 * Tool allowlist schema
 */
export const ToolAllowlistSchema = z.object({
  mode: z.enum(['allow', 'deny']).default('allow'),
  tools: z.string().array(),
});

/**
 * API key configuration schema
 */
export const ApiKeyConfigSchema = z.object({
  keyHash: z.string().min(1, 'API key hash is required'),
  name: z.string().min(1, 'API key name is required'),
  scopes: z.string().array().default([]),
  expiresAt: z.number().positive().optional(),
});

/**
 * JWT configuration schema
 */
export const JwtConfigSchema = z.object({
  issuer: z.string().url('Invalid issuer URL'),
  audience: z.string().min(1, 'JWT audience is required'),
  jwksUri: z.string().url('Invalid JWKS URI'),
  clockSkewSeconds: z.number().positive().optional(),
});

/**
 * OAuth configuration schema
 */
export const OAuthConfigSchema = z.object({
  introspectionUrl: z.string().url('Invalid introspection URL'),
  clientId: z.string().min(1, 'OAuth client ID is required'),
  clientSecretEnv: z.string().min(1, 'OAuth client secret env var is required'),
  tokenTypeHint: z.string().optional(),
  cacheTtlSeconds: z.number().positive().optional(),
});

/**
 * OIDC configuration schema
 */
export const OidcConfigSchema = z.object({
  issuer: z.string().url('Invalid OIDC issuer URL'),
  audience: z.string().min(1, 'OIDC audience is required'),
  jwksUri: z.string().url('Invalid JWKS URI'),
  clockSkewSeconds: z.number().positive().optional(),
  requireAtHash: z.boolean().optional(),
});

/**
 * Tenant auth configuration schema
 */
export const TenantAuthConfigSchema = z.object({
  apiKeys: ApiKeyConfigSchema.array().optional(),
  jwt: JwtConfigSchema.optional(),
  oauth: OAuthConfigSchema.optional(),
  oidc: OidcConfigSchema.optional(),
});

/**
 * Tenant configuration schema
 */
export const TenantConfigSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  displayName: z.string().min(1, 'Display name is required'),
  auth: TenantAuthConfigSchema.optional(),
  rateLimits: RateLimitConfigSchema,
  cache: CacheConfigSchema,
  allowlist: ToolAllowlistSchema,
  upstreams: UpstreamServerSchema.array().min(1, 'At least one upstream is required'),
});

/**
 * Gateway server configuration schema
 */
export const GatewayServerConfigSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().min(1).max(65535).default(8080),
  tls: z
    .object({
      enabled: z.boolean().default(false),
      certPath: z.string().optional(),
      keyPath: z.string().optional(),
    })
    .optional(),
});

/**
 * Gateway Redis configuration schema
 */
export const GatewayRedisConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535).default(6379),
  passwordEnv: z.string().optional(),
  db: z.number().min(0).max(15).default(0),
});

/**
 * Gateway rate limit configuration schema
 */
export const GatewayRateLimitConfigSchema = z.object({
  defaultRequestsPerMinute: z.number().positive().default(100),
  defaultRequestsPerDay: z.number().positive().default(10000),
  store: z.enum(['redis', 'memory']).default('redis'),
});

/**
 * Gateway cache configuration schema
 */
export const GatewayCacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  store: z.enum(['redis', 'memory']).default('redis'),
  defaultTtlSeconds: z.number().positive().default(300),
});

/**
 * Gateway audit configuration schema
 */
export const GatewayAuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storage: z.enum(['file', 'database', 'siem']).default('file'),
  filePath: z.string().default('./logs/audit.json'),
  retentionDays: z.number().positive().default(90),
});

/**
 * Gateway observability configuration schema
 */
export const GatewayObservabilityConfigSchema = z.object({
  otelEndpoint: z.string().url().optional().or(z.literal('')),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  serviceName: z.string().default('mcp-gateway'),
});

/**
 * Gateway configuration schema
 */
export const GatewayConfigSchema = z.object({
  server: GatewayServerConfigSchema,
  redis: GatewayRedisConfigSchema.optional(),
  rateLimits: GatewayRateLimitConfigSchema,
  cache: GatewayCacheConfigSchema,
  audit: GatewayAuditConfigSchema,
  observability: GatewayObservabilityConfigSchema,
});

/**
 * Type exports
 */
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type MCPTool = z.infer<typeof MCPToolSchema>;
export type MCPToolsList = z.infer<typeof MCPToolsListSchema>;
export type MCPToolsCallParams = z.infer<typeof MCPToolsCallParamsSchema>;
export type MCPToolContent = z.infer<typeof MCPToolContentSchema>;
export type MCPToolsCallResponse = z.infer<typeof MCPToolsCallResponseSchema>;
export type UpstreamServer = z.infer<typeof UpstreamServerSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type CacheStrategy = z.infer<typeof CacheStrategySchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type ToolAllowlist = z.infer<typeof ToolAllowlistSchema>;
export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>;
export type JwtConfig = z.infer<typeof JwtConfigSchema>;
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;
export type OidcConfig = z.infer<typeof OidcConfigSchema>;
export type TenantAuthConfig = z.infer<typeof TenantAuthConfigSchema>;
export type TenantConfig = z.infer<typeof TenantConfigSchema>;
export type GatewayServerConfig = z.infer<typeof GatewayServerConfigSchema>;
export type GatewayRedisConfig = z.infer<typeof GatewayRedisConfigSchema>;
export type GatewayRateLimitConfig = z.infer<typeof GatewayRateLimitConfigSchema>;
export type GatewayCacheConfig = z.infer<typeof GatewayCacheConfigSchema>;
export type GatewayAuditConfig = z.infer<typeof GatewayAuditConfigSchema>;
export type GatewayObservabilityConfig = z.infer<typeof GatewayObservabilityConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
