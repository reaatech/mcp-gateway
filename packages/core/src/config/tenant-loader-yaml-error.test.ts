import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('node:module', () => ({
  createRequire: () => (id: string) => {
    if (id === 'js-yaml') {
      throw new Error('Module not found');
    }
    throw new Error(`Unexpected require: ${id}`);
  },
}));

describe('tenant-loader yaml require failures', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadTenants returns empty when yaml module unavailable', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['tenant.yaml'] as unknown as never);

    const { loadTenants } = await import('./tenant-loader.js');
    const result = loadTenants();

    expect(result.size).toBe(0);
  });

  it('loadTenantsAsync returns empty when yaml module unavailable', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['tenant.yaml'] as unknown as never);

    const { loadTenantsAsync } = await import('./tenant-loader.js');
    const result = await loadTenantsAsync();

    expect(result.size).toBe(0);
  });

  it('reloadTenantFile handles yaml module unavailable', async () => {
    vi.mocked(readFileSync).mockReturnValue('some content');

    const { reloadTenantFile, getTenant } = await import('./tenant-loader.js');
    await reloadTenantFile('/test/tenant.yaml');

    expect(getTenant('whatever')).toBeUndefined();
  });
});
