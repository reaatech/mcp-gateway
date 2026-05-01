import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTenants, getTenant, reloadTenantFile, removeTenantFile } from './tenant-loader.js';

function writeTenantFile(filePath: string, tenantId: string): void {
  writeFileSync(
    filePath,
    `tenantId: "${tenantId}"
displayName: "Tenant ${tenantId}"
rateLimits:
  requestsPerMinute: 100
  requestsPerDay: 1000
cache:
  enabled: true
  ttlSeconds: 300
allowlist:
  mode: "allow"
  tools:
    - "*"
upstreams:
  - name: "primary"
    url: "https://93.184.216.34"
    weight: 1
`,
    'utf-8',
  );
}

describe('tenant-loader reload behavior', () => {
  let tempDir: string;
  let tenantFile: string;

  beforeEach(() => {
    clearTenants();
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-gateway-tenant-loader-'));
    tenantFile = join(tempDir, 'tenant.yaml');
  });

  afterEach(() => {
    clearTenants();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes stale tenant mapping when the same file changes tenant ID', async () => {
    writeTenantFile(tenantFile, 'tenant-a');
    await reloadTenantFile(tenantFile);
    expect(getTenant('tenant-a')?.tenantId).toBe('tenant-a');

    writeTenantFile(tenantFile, 'tenant-b');
    await reloadTenantFile(tenantFile);

    expect(getTenant('tenant-a')).toBeUndefined();
    expect(getTenant('tenant-b')?.tenantId).toBe('tenant-b');
  });

  it('removes tenant when the backing file is deleted', async () => {
    writeTenantFile(tenantFile, 'tenant-delete');
    await reloadTenantFile(tenantFile);
    expect(getTenant('tenant-delete')?.tenantId).toBe('tenant-delete');

    removeTenantFile(tenantFile);

    expect(getTenant('tenant-delete')).toBeUndefined();
  });
});
