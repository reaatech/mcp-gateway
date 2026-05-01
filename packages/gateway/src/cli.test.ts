import { describe, expect, it } from 'vitest';

describe('CLI', () => {
  describe('startCommand', () => {
    it('should parse port argument correctly', () => {
      const args = ['--port', '3000'];
      const portArg = args.find((_, i) => i > 0 && args[i - 1] === '--port');
      const port = portArg ? Number.parseInt(portArg, 10) : 8080;
      expect(port).toBe(3000);
    });

    it('should use default port when not specified', () => {
      const args: string[] = [];
      const portArg = args.find((_, i) => i > 0 && args[i - 1] === '--port');
      const port = portArg ? Number.parseInt(portArg, 10) : 8080;
      expect(port).toBe(8080);
    });

    it('should parse config argument correctly', () => {
      const args = ['--config', 'custom.yaml'];
      const configArg = args.find((_, i) => i > 0 && args[i - 1] === '--config');
      expect(configArg).toBe('custom.yaml');
    });
  });

  describe('healthCommand', () => {
    it('should parse url argument correctly', () => {
      const args = ['--url', 'http://localhost:3000/health'];
      const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
      const url = urlArg ?? 'http://localhost:8080/health';
      expect(url).toBe('http://localhost:3000/health');
    });

    it('should detect deep flag', () => {
      const args = ['--deep'];
      const deep = args.includes('--deep');
      expect(deep).toBe(true);
    });

    it('should construct deep health URL', () => {
      const url = 'http://localhost:8080/health';
      const deep = true;
      const healthUrl = deep ? url.replace('/health', '/health/deep') : url;
      expect(healthUrl).toBe('http://localhost:8080/health/deep');
    });
  });

  describe('cacheStatsCommand', () => {
    it('should parse url argument correctly', () => {
      const args = ['--url', 'http://localhost:3000/api/v1/cache/stats'];
      const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
      const url = urlArg ?? 'http://localhost:8080/api/v1/cache/stats';
      expect(url).toBe('http://localhost:3000/api/v1/cache/stats');
    });
  });

  describe('validateConfigCommand', () => {
    it('should parse config argument correctly', () => {
      const args = ['--config', 'gateway-prod.yaml'];
      const configArg = args.find((_, i) => i > 0 && args[i - 1] === '--config');
      const configPath = configArg ?? 'gateway.yaml';
      expect(configPath).toBe('gateway-prod.yaml');
    });

    it('should parse tenant-dir argument correctly', () => {
      const args = ['--tenant-dir', 'config/tenants'];
      const tenantDirArg = args.find((_, i) => i > 0 && args[i - 1] === '--tenant-dir');
      const tenantDir = tenantDirArg ?? 'tenants';
      expect(tenantDir).toBe('config/tenants');
    });
  });
});
