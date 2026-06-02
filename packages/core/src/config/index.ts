/**
 * mcp-gateway — Configuration Barrel Export
 * Central export point for all configuration modules
 */

export type { GatewayConfig, TenantConfig, UpstreamServer } from '../types/schemas.js';
// Constants
export * from './constants.js';
export type { EnvConfig } from './env.js';
// Environment configuration (always loaded first)
export { env, isDevelopment, isProduction, isTest, logConfigSummary } from './env.js';
// Gateway configuration
export {
  clearConfigLoaderDependencies,
  getGatewayConfig,
  loadGatewayConfig,
  resetGatewayConfig,
  setConfigLoaderDependencies,
} from './gateway-config.js';
// Tenant loader
export {
  clearTenants,
  getTenant,
  getTenantIds,
  hasTenant,
  listTenants,
  loadTenants,
  loadTenantsAsync,
  reloadTenantFile,
  removeTenantFile,
  setTenant,
  startWatching,
  stopWatching,
} from './tenant-loader.js';
// Upstream loader
export {
  getHealthyUpstreams,
  getUpstreamByName,
  getUpstreams,
  getWeightedUpstreams,
  markUpstreamHealthy,
  validateAllUpstreams,
  validateTenantUpstreams,
  validateUpstreamUrl,
  validateUpstreamUrlAsync,
} from './upstream-loader.js';
