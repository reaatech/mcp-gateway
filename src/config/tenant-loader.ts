/**
 * mcp-gateway — Tenant Configuration Loader
 * Loads tenant configs from YAML files with hot-reload support
 */

import { readFileSync, existsSync, readdirSync, watch, FSWatcher } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { TenantConfigSchema, type TenantConfig } from '../types/schemas.js';
import { env } from './env.js';
import { logger } from '../observability/logger.js';
import { validateUpstreamUrl, validateUpstreamUrlAsync } from './upstream-loader.js';

const require = createRequire(import.meta.url);

/**
 * In-memory tenant registry
 */
const tenants = new Map<string, TenantConfig>();
const tenantFiles = new Map<string, string>();

/**
 * File watcher instance
 */
let watcher: FSWatcher | undefined;

/**
 * Try to load YAML module
 */
function getYaml(): { load: (content: string) => unknown } | undefined {
  try {
    return require('js-yaml');
  } catch {
    return undefined;
  }
}

/**
 * Load a single tenant configuration from a YAML file
 */
function loadTenantFile(filePath: string): TenantConfig | undefined {
  const yaml = getYaml();
  if (!yaml) {
    logger.warn('[TenantLoader] js-yaml not available');
    return undefined;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content);
    const validated = TenantConfigSchema.parse(parsed);

    for (const upstream of validated.upstreams) {
      const urlValidation = validateUpstreamUrl(upstream.url);
      if (!urlValidation.valid) {
        logger.error({
          filePath,
          tenantId: validated.tenantId,
          upstream: upstream.name,
          url: upstream.url,
          reason: urlValidation.reason,
        }, '[TenantLoader] Upstream URL failed SSRF validation');
        return undefined;
      }
    }

    return validated;
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ err: error, filePath }, '[TenantLoader] Failed to load tenant file');
    }
    return undefined;
  }
}

async function loadTenantFileAsync(filePath: string): Promise<TenantConfig | undefined> {
  const yaml = getYaml();
  if (!yaml) {
    logger.warn('[TenantLoader] js-yaml not available');
    return undefined;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content);
    const validated = TenantConfigSchema.parse(parsed);

    for (const upstream of validated.upstreams) {
      const urlValidation = await validateUpstreamUrlAsync(upstream.url);
      if (!urlValidation.valid) {
        logger.error({
          filePath,
          tenantId: validated.tenantId,
          upstream: upstream.name,
          url: upstream.url,
          reason: urlValidation.reason,
        }, '[TenantLoader] Upstream URL failed SSRF validation');
        return undefined;
      }
    }

    return validated;
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ err: error, filePath }, '[TenantLoader] Failed to load tenant file');
    }
    return undefined;
  }
}

function unregisterTenantFile(filePath: string): void {
  const previousTenantId = tenantFiles.get(filePath);
  tenantFiles.delete(filePath);
  if (previousTenantId) {
    tenants.delete(previousTenantId);
    logger.info({ tenantId: previousTenantId, filePath }, '[TenantLoader] Removed tenant');
  }
}

export async function reloadTenantFile(filePath: string): Promise<void> {
  const tenant = await loadTenantFileAsync(filePath);
  if (!tenant) {
    unregisterTenantFile(filePath);
    return;
  }

  const previousTenantId = tenantFiles.get(filePath);
  if (previousTenantId && previousTenantId !== tenant.tenantId) {
    tenants.delete(previousTenantId);
    logger.info(
      { previousTenantId, tenantId: tenant.tenantId, filePath },
      '[TenantLoader] Replaced tenant after config identity change',
    );
  }

  tenantFiles.set(filePath, tenant.tenantId);
  tenants.set(tenant.tenantId, tenant);
  logger.info({ tenantId: tenant.tenantId }, '[TenantLoader] Reloaded tenant');
}

export function removeTenantFile(filePath: string): void {
  unregisterTenantFile(filePath);
}

/**
 * Load all tenant configurations from the configured directory
 */
export function loadTenants(): Map<string, TenantConfig> {
  const configDir = env.TENANT_CONFIG_DIR;
  const absoluteDir = resolve(process.cwd(), configDir);

  // Clear existing tenants
  tenants.clear();
  tenantFiles.clear();

  if (!existsSync(absoluteDir)) {
    logger.warn({ dir: absoluteDir }, '[TenantLoader] Tenant config directory not found');
    return tenants;
  }

  try {
    const files = readdirSync(absoluteDir).filter(
      (file) => file.endsWith('.yaml') || file.endsWith('.yml'),
    );

    for (const file of files) {
      const filePath = join(absoluteDir, file);
      const tenant = loadTenantFile(filePath);
      if (tenant) {
        tenants.set(tenant.tenantId, tenant);
        tenantFiles.set(filePath, tenant.tenantId);
        logger.info({ tenantId: tenant.tenantId, displayName: tenant.displayName }, '[TenantLoader] Loaded tenant');
      }
    }

    logger.info({ count: tenants.size, dir: absoluteDir }, '[TenantLoader] Loaded tenants');
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ err: error, dir: absoluteDir }, '[TenantLoader] Failed to read directory');
    }
  }

  return tenants;
}

/**
 * Start watching for tenant config changes (hot-reload)
 */
export function startWatching(): void {
  if (watcher) {
    return; // Already watching
  }

  const configDir = env.TENANT_CONFIG_DIR;
  const absoluteDir = resolve(process.cwd(), configDir);

  if (!existsSync(absoluteDir)) {
    return;
  }

  watcher = watch(absoluteDir, { persistent: false }, (eventType, filename) => {
    if (!filename || (!filename.endsWith('.yaml') && !filename.endsWith('.yml'))) {
      return;
    }

    logger.info({ eventType, filename }, '[TenantLoader] Config change detected');

    if (eventType === 'change' || eventType === 'rename') {
      const filePath = join(absoluteDir, filename);
      if (existsSync(filePath)) {
        void reloadTenantFile(filePath);
        return;
      }
      removeTenantFile(filePath);
    }
  });

  logger.info({ dir: absoluteDir }, '[TenantLoader] Started watching for changes');
}

/**
 * Stop watching for config changes
 */
export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = undefined;
    logger.info('[TenantLoader] Stopped watching for changes');
  }
}

/**
 * Get a tenant configuration by ID
 */
export function getTenant(tenantId: string): TenantConfig | undefined {
  return tenants.get(tenantId);
}

/**
 * Register a tenant in the in-memory registry (primarily for tests and programmatic setup)
 */
export function setTenant(tenant: TenantConfig): void {
  tenants.set(tenant.tenantId, tenant);
}

/**
 * Remove all tenants from the in-memory registry (primarily for tests)
 */
export function clearTenants(): void {
  tenants.clear();
  tenantFiles.clear();
}

/**
 * List all tenant configurations
 */
export function listTenants(): TenantConfig[] {
  return Array.from(tenants.values());
}

/**
 * Check if a tenant exists
 */
export function hasTenant(tenantId: string): boolean {
  return tenants.has(tenantId);
}

/**
 * Get all tenant IDs
 */
export function getTenantIds(): string[] {
  return Array.from(tenants.keys());
}

export async function loadTenantsAsync(): Promise<Map<string, TenantConfig>> {
  const configDir = env.TENANT_CONFIG_DIR;
  const absoluteDir = resolve(process.cwd(), configDir);

  tenants.clear();
  tenantFiles.clear();

  if (!existsSync(absoluteDir)) {
    logger.warn({ dir: absoluteDir }, '[TenantLoader] Tenant config directory not found');
    return tenants;
  }

  try {
    const files = readdirSync(absoluteDir).filter(
      (file) => file.endsWith('.yaml') || file.endsWith('.yml'),
    );

    for (const file of files) {
      const filePath = join(absoluteDir, file);
      const tenant = await loadTenantFileAsync(filePath);
      if (tenant) {
        tenants.set(tenant.tenantId, tenant);
        tenantFiles.set(filePath, tenant.tenantId);
        logger.info(
          { tenantId: tenant.tenantId, displayName: tenant.displayName },
          '[TenantLoader] Loaded tenant',
        );
      }
    }

    logger.info({ count: tenants.size, dir: absoluteDir }, '[TenantLoader] Loaded tenants');
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ err: error, dir: absoluteDir }, '[TenantLoader] Failed to read directory');
    }
  }

  return tenants;
}
