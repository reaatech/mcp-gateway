/**
 * mcp-gateway — Configuration Barrel Export
 * Central export point for all configuration modules
 */

// Environment configuration (always loaded first)
export { env, isProduction, isDevelopment, isTest, logConfigSummary } from './env.js';
export type { EnvConfig } from './env.js';

// Constants
export * from './constants.js';

// Gateway configuration
export { getGatewayConfig, loadGatewayConfig, setConfigLoaderDependencies, clearConfigLoaderDependencies, resetGatewayConfig } from './gateway-config.js';
export type { GatewayConfig } from '../types/schemas.js';

// Tenant loader
export {
  loadTenants,
  loadTenantsAsync,
  startWatching,
  stopWatching,
  getTenant,
  listTenants,
  hasTenant,
  getTenantIds,
  reloadTenantFile,
  removeTenantFile,
} from './tenant-loader.js';
export type { TenantConfig } from '../types/schemas.js';

// Upstream loader
export {
  validateUpstreamUrl,
  validateUpstreamUrlAsync,
  getUpstreams,
  getHealthyUpstreams,
  markUpstreamHealthy,
  validateTenantUpstreams,
  validateAllUpstreams,
  getUpstreamByName,
  getWeightedUpstreams,
} from './upstream-loader.js';
export type { UpstreamServer } from '../types/schemas.js';
