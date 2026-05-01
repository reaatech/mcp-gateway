/**
 * mcp-gateway — Gateway Configuration Loader
 * Loads and validates the main gateway configuration from YAML file
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { type GatewayConfig, GatewayConfigSchema } from '../types/schemas.js';
import { env } from './env.js';

const require = createRequire(import.meta.url);

interface YamlLoader {
  load(content: string): unknown;
}

interface FileSystem {
  readFileSync(path: string, encoding: string): string;
  existsSync(path: string): boolean;
}

interface ConfigDependencies {
  yaml?: YamlLoader;
  fs?: FileSystem;
  cwd?: string;
  envOverrides?: Partial<GatewayConfig>;
}

let testDependencies: ConfigDependencies | null = null;

export function setConfigLoaderDependencies(deps: ConfigDependencies): void {
  testDependencies = deps;
}

export function clearConfigLoaderDependencies(): void {
  testDependencies = null;
}

/**
 * Try to load YAML module
 */
function getYaml(deps: ConfigDependencies): YamlLoader | undefined {
  if (deps.yaml) {
    return deps.yaml;
  }
  try {
    return require('js-yaml');
  } catch {
    return undefined;
  }
}

/**
 * Create default gateway configuration
 */
function createDefaultConfig(deps: ConfigDependencies): GatewayConfig {
  const server = {
    host: '0.0.0.0',
    port: deps.envOverrides?.server?.port ?? env.PORT,
    tls: {
      enabled: deps.envOverrides?.server?.tls?.enabled ?? env.TLS_ENABLED,
      ...(env.TLS_CERT_PATH && env.TLS_KEY_PATH
        ? { certPath: env.TLS_CERT_PATH, keyPath: env.TLS_KEY_PATH }
        : {}),
    },
  };

  const redis = deps.envOverrides?.redis ?? {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_PASSWORD ? { passwordEnv: 'REDIS_PASSWORD' } : {}),
    db: env.REDIS_DB,
  };

  const rateLimits = deps.envOverrides?.rateLimits ?? {
    defaultRequestsPerMinute: env.RATE_LIMIT_DEFAULT_RPM,
    defaultRequestsPerDay: env.RATE_LIMIT_DEFAULT_RPD,
    store: env.RATE_LIMIT_STORE,
  };

  const cache = deps.envOverrides?.cache ?? {
    enabled: env.CACHE_ENABLED,
    store: env.CACHE_STORE,
    defaultTtlSeconds: env.CACHE_DEFAULT_TTL,
  };

  const audit = deps.envOverrides?.audit ?? {
    enabled: env.AUDIT_ENABLED,
    storage: env.AUDIT_STORAGE,
    filePath: env.AUDIT_FILE_PATH,
    retentionDays: env.AUDIT_RETENTION_DAYS,
  };

  const observability = deps.envOverrides?.observability ?? {
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || '',
    logLevel: env.LOG_LEVEL,
    serviceName: env.OTEL_SERVICE_NAME,
  };

  return { server, redis, rateLimits, cache, audit, observability };
}

/**
 * Load gateway configuration from YAML file
 */
export function loadGatewayConfig(): GatewayConfig {
  const deps = testDependencies ?? {};
  const fs = deps.fs ?? { readFileSync, existsSync };
  const cwd = deps.cwd ?? process.cwd();

  const configPath = env.GATEWAY_CONFIG_PATH;
  const cwdPath = join(cwd, configPath);

  // Determine which path exists
  const absPath = fs.existsSync(configPath) ? configPath : fs.existsSync(cwdPath) ? cwdPath : null;

  if (!absPath) {
    console.warn(
      `[GatewayConfig] Config file not found at "${configPath}" or "${cwdPath}". Using defaults.`,
    );
    return createDefaultConfig(deps);
  }

  try {
    const yaml = getYaml(deps);
    if (!yaml) {
      console.warn('[GatewayConfig] js-yaml not available. Using defaults.');
      return createDefaultConfig(deps);
    }

    const configContent = fs.readFileSync(absPath, 'utf-8');
    const parsed = yaml.load(configContent);

    // Validate against schema
    const validated = GatewayConfigSchema.parse(parsed);

    // TLS validation: if enabled, must have cert and key paths
    if (validated.server?.tls?.enabled) {
      if (!validated.server.tls.certPath || !validated.server.tls.keyPath) {
        throw new Error('TLS is enabled but certPath or keyPath is missing');
      }
    }

    console.log(`[GatewayConfig] Loaded configuration from ${absPath}`);
    return validated;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[GatewayConfig] Failed to load config from ${absPath}:`, error.message);
    }
    console.warn('[GatewayConfig] Falling back to default configuration');
    return createDefaultConfig(deps);
  }
}

/**
 * Singleton gateway configuration - uses cached value if available
 */
let cachedConfig: GatewayConfig | null = null;

export function getGatewayConfig(): GatewayConfig {
  if (!cachedConfig) {
    cachedConfig = loadGatewayConfig();
  }
  return cachedConfig;
}

/**
 * Reset the cached config (useful for testing)
 */
export function resetGatewayConfig(): void {
  cachedConfig = null;
}
