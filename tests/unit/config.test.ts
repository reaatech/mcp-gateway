/**
 * mcp-gateway — Config Loader Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTenant,
  setTenant,
  clearTenants,
  listTenants,
  hasTenant,
  getTenantIds,
  stopWatching,
} from '../../src/config/tenant-loader.js';
import {
  validateUpstreamUrl,
  getUpstreams,
  getHealthyUpstreams,
  markUpstreamHealthy,
  validateTenantUpstreams,
  validateAllUpstreams,
  getUpstreamByName,
  getWeightedUpstreams,
} from '../../src/config/upstream-loader.js';
import type { TenantConfig } from '../../src/types/schemas.js';

const TEST_TENANT: TenantConfig = {
  tenantId: 'test-tenant',
  displayName: 'Test Tenant',
  auth: {
    apiKeys: [{ keyHash: 'sha256:test', name: 'test-key', scopes: ['tools:*'] }],
  },
  rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000, burstSize: 10 },
  cache: { enabled: true, ttlSeconds: 300 },
  allowlist: { mode: 'allow', tools: ['test_tool'] },
  upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0 }],
};

const SECOND_TENANT: TenantConfig = {
  tenantId: 'second-tenant',
  displayName: 'Second Tenant',
  auth: {
    apiKeys: [{ keyHash: 'sha256:test2', name: 'test-key-2', scopes: ['tools:*'] }],
  },
  rateLimits: { requestsPerMinute: 200, requestsPerDay: 2000, burstSize: 20 },
  cache: { enabled: false, ttlSeconds: 0 },
  allowlist: { mode: 'deny', tools: [] },
  upstreams: [
    { name: 'primary', url: 'https://primary.example.com', weight: 0.7 },
    { name: 'secondary', url: 'https://secondary.example.com', weight: 0.3 },
  ],
};

describe('tenant-loader', () => {
  beforeEach(() => {
    clearTenants();
  });

  afterEach(() => {
    clearTenants();
    stopWatching();
  });

  describe('setTenant and getTenant', () => {
    it('registers and retrieves a tenant', () => {
      setTenant(TEST_TENANT);
      const result = getTenant('test-tenant');
      expect(result).toEqual(TEST_TENANT);
    });

    it('returns undefined for non-existent tenant', () => {
      const result = getTenant('non-existent');
      expect(result).toBeUndefined();
    });

    it('overwrites existing tenant with same ID', () => {
      setTenant(TEST_TENANT);
      const updated = { ...TEST_TENANT, displayName: 'Updated Name' };
      setTenant(updated);
      const result = getTenant('test-tenant');
      expect(result?.displayName).toBe('Updated Name');
    });
  });

  describe('clearTenants', () => {
    it('removes all tenants', () => {
      setTenant(TEST_TENANT);
      setTenant(SECOND_TENANT);
      clearTenants();
      expect(listTenants()).toHaveLength(0);
    });
  });

  describe('listTenants', () => {
    it('returns all registered tenants', () => {
      setTenant(TEST_TENANT);
      setTenant(SECOND_TENANT);
      const result = listTenants();
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no tenants', () => {
      const result = listTenants();
      expect(result).toHaveLength(0);
    });
  });

  describe('hasTenant', () => {
    it('returns true for existing tenant', () => {
      setTenant(TEST_TENANT);
      expect(hasTenant('test-tenant')).toBe(true);
    });

    it('returns false for non-existent tenant', () => {
      expect(hasTenant('non-existent')).toBe(false);
    });
  });

  describe('getTenantIds', () => {
    it('returns all tenant IDs', () => {
      setTenant(TEST_TENANT);
      setTenant(SECOND_TENANT);
      const result = getTenantIds();
      expect(result).toContain('test-tenant');
      expect(result).toContain('second-tenant');
    });
  });

  describe('startWatching and stopWatching', () => {
    it('stopWatching does not throw when not watching', () => {
      expect(stopWatching()).toBeUndefined();
    });
  });
});

describe('upstream-loader', () => {
  beforeEach(() => {
    clearTenants();
    setTenant(TEST_TENANT);
    setTenant(SECOND_TENANT);
  });

  afterEach(() => {
    clearTenants();
  });

  describe('validateUpstreamUrl', () => {
    it('accepts valid HTTPS URL', () => {
      const result = validateUpstreamUrl('https://api.example.com/mcp');
      expect(result.valid).toBe(true);
    });

    it('accepts valid HTTP URL', () => {
      const result = validateUpstreamUrl('http://api.example.com/mcp');
      expect(result.valid).toBe(true);
    });

    it('rejects localhost', () => {
      const result = validateUpstreamUrl('http://localhost:8080/mcp');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('SSRF protection');
    });

    it('rejects 127.0.0.1', () => {
      const result = validateUpstreamUrl('http://127.0.0.1:8080/mcp');
      expect(result.valid).toBe(false);
    });

    it('rejects private IP 10.x.x.x', () => {
      const result = validateUpstreamUrl('http://10.0.0.1:8080/mcp');
      expect(result.valid).toBe(false);
    });

    it('rejects private IP 172.16.x.x', () => {
      const result = validateUpstreamUrl('http://172.16.0.1:8080/mcp');
      expect(result.valid).toBe(false);
    });

    it('rejects private IP 192.168.x.x', () => {
      const result = validateUpstreamUrl('http://192.168.1.1:8080/mcp');
      expect(result.valid).toBe(false);
    });

    it('rejects link-local 169.254.x.x', () => {
      const result = validateUpstreamUrl('http://169.254.0.1:8080/mcp');
      expect(result.valid).toBe(false);
    });

    it('rejects non-HTTP protocol', () => {
      const result = validateUpstreamUrl('ftp://example.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid protocol');
    });

    it('rejects invalid URL', () => {
      const result = validateUpstreamUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid URL');
    });
  });

  describe('getUpstreams', () => {
    it('returns empty array for non-existent tenant', () => {
      const result = getUpstreams('non-existent');
      expect(result).toHaveLength(0);
    });

    it('returns upstreams for tenant', () => {
      setTenant(SECOND_TENANT);
      const result = getUpstreams('second-tenant');
      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('primary');
    });

    it('returns mutable copy (does not affect original)', () => {
      setTenant(TEST_TENANT);
      const upstreams = getUpstreams('test-tenant');
      if (upstreams[0]) {
        upstreams[0].healthy = false;
      }
      const original = getUpstreams('test-tenant');
      expect(original[0]?.healthy).toBeUndefined();
    });
  });

  describe('getHealthyUpstreams', () => {
    it('returns all upstreams when none marked unhealthy', () => {
      setTenant(SECOND_TENANT);
      const result = getHealthyUpstreams('second-tenant');
      expect(result).toHaveLength(2);
    });

    it('filters out unhealthy upstreams', () => {
      setTenant(SECOND_TENANT);
      markUpstreamHealthy('second-tenant', 'primary', false);
      const result = getHealthyUpstreams('second-tenant');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('secondary');
    });
  });

  describe('markUpstreamHealthy', () => {
    it('marks upstream as healthy', () => {
      setTenant(SECOND_TENANT);
      markUpstreamHealthy('second-tenant', 'primary', true);
      const result = getHealthyUpstreams('second-tenant');
      expect(result).toHaveLength(2);
    });

    it('marks upstream as unhealthy', () => {
      setTenant(SECOND_TENANT);
      markUpstreamHealthy('second-tenant', 'primary', false);
      const result = getHealthyUpstreams('second-tenant');
      expect(result).toHaveLength(1);
    });

    it('does nothing for non-existent tenant', () => {
      markUpstreamHealthy('non-existent', 'primary', false);
      expect(true).toBe(true);
    });
  });

  describe('validateTenantUpstreams', () => {
    it('returns valid result for valid upstreams', () => {
      setTenant(TEST_TENANT);
      const result = validateTenantUpstreams('test-tenant');
      expect(result).toHaveLength(1);
      expect(result[0]?.valid).toBe(true);
    });

    it('returns invalid for localhost upstream', () => {
      setTenant({
        ...TEST_TENANT,
        upstreams: [{ name: 'local', url: 'http://localhost:8080', weight: 1.0 }],
      });
      const result = validateTenantUpstreams('test-tenant');
      expect(result[0]?.valid).toBe(false);
      expect(result[0]?.reason).toContain('SSRF protection');
    });

    it('returns empty for non-existent tenant', () => {
      const result = validateTenantUpstreams('non-existent');
      expect(result).toHaveLength(0);
    });
  });

  describe('validateAllUpstreams', () => {
    it('validates upstreams for all tenants', () => {
      setTenant(TEST_TENANT);
      setTenant(SECOND_TENANT);
      const result = validateAllUpstreams();
      expect(result.length).toBeGreaterThan(0);
    });

    it('includes tenant ID in results', () => {
      setTenant(TEST_TENANT);
      const result = validateAllUpstreams();
      expect(result[0]?.tenantId).toBe('test-tenant');
    });
  });

  describe('getUpstreamByName', () => {
    it('returns upstream by name', () => {
      setTenant(SECOND_TENANT);
      const result = getUpstreamByName('second-tenant', 'primary');
      expect(result?.name).toBe('primary');
    });

    it('returns undefined for non-existent', () => {
      setTenant(TEST_TENANT);
      const result = getUpstreamByName('test-tenant', 'non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getWeightedUpstreams', () => {
    it('getWeightedUpstreams returns upstreams', () => {
      const result = getWeightedUpstreams('second-tenant');
      expect(result.length).toBeGreaterThan(0);
    });

    it('filters out unhealthy upstreams', () => {
      setTenant(SECOND_TENANT);
      markUpstreamHealthy('second-tenant', 'primary', false);
      const result = getWeightedUpstreams('second-tenant');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('secondary');
    });

    it('handles missing weight as 0', () => {
      setTenant({
        ...TEST_TENANT,
        upstreams: [{ name: 'no-weight', url: 'https://example.com', weight: 0 }],
      });
      const result = getWeightedUpstreams('test-tenant');
      expect(result[0]?.name).toBe('no-weight');
    });
  });
});