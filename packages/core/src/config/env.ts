/**
 * mcp-gateway — Environment Configuration
 * Zod-validated environment configuration with fail-fast on missing required vars
 */

import { z } from 'zod';

/**
 * Environment schema with validation
 */
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).max(15).default(0),

  // TLS
  TLS_ENABLED: z
    .union([z.boolean(), z.string().transform((v) => v.toLowerCase() === 'true' || v === '1')])
    .default(false),
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),

  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
  OTEL_SERVICE_NAME: z.string().default('mcp-gateway'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Rate Limiting
  RATE_LIMIT_STORE: z.enum(['redis', 'memory']).default('redis'),
  RATE_LIMIT_DEFAULT_RPM: z.coerce.number().positive().default(100),
  RATE_LIMIT_DEFAULT_RPD: z.coerce.number().positive().default(10000),

  // Cache
  CACHE_ENABLED: z
    .union([z.boolean(), z.string().transform((v) => v.toLowerCase() === 'true' || v === '1')])
    .default(true),
  CACHE_STORE: z.enum(['redis', 'memory']).default('redis'),
  CACHE_DEFAULT_TTL: z.coerce.number().positive().default(300),

  // Audit
  AUDIT_ENABLED: z
    .union([z.boolean(), z.string().transform((v) => v.toLowerCase() === 'true' || v === '1')])
    .default(true),
  AUDIT_STORAGE: z.enum(['file', 'database', 'siem']).default('file'),
  AUDIT_FILE_PATH: z.string().default('./logs/audit.json'),
  AUDIT_RETENTION_DAYS: z.coerce.number().positive().default(90),

  // Configuration paths
  TENANT_CONFIG_DIR: z.string().default('./tenants'),
  GATEWAY_CONFIG_PATH: z.string().default('./gateway.yaml'),

  // Auth
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().default('mcp-gateway'),
  JWT_JWKS_URI: z.string().url().optional().or(z.literal('')),
});

/**
 * Type inference from schema
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Fails fast on invalid configuration
 */
function parseEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Environment validation failed:\n${errors}`);
    process.exit(1);
  }

  if (result.data.NODE_ENV === 'production' && result.data.REDIS_HOST === 'localhost') {
    console.warn(
      'WARNING: REDIS_HOST defaults to localhost in production. Set REDIS_HOST for production deployments.',
    );
  }

  return result.data;
}

/**
 * Validated environment configuration
 */
export const env = parseEnv();

/**
 * Check if running in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if running in development
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Check if running in test
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Log configuration summary on startup (non-sensitive info only)
 */
export function logConfigSummary(): void {
  console.log('Configuration:');
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  Port: ${env.PORT}`);
  console.log(`  Rate Limit Store: ${env.RATE_LIMIT_STORE}`);
  console.log(`  Cache Enabled: ${env.CACHE_ENABLED}`);
  console.log(`  Cache Store: ${env.CACHE_STORE}`);
  console.log(`  Audit Enabled: ${env.AUDIT_ENABLED}`);
  console.log(`  TLS Enabled: ${env.TLS_ENABLED}`);
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.log(`  OTel Endpoint: ${env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  }
}
