/**
 * mcp-gateway — Security Tests
 * Tests for auth bypass, rate limit evasion, and allowlist bypass attempts
 */

import { describe, it, expect } from 'vitest';
import { checkToolAccess } from '../../src/allowlist/allowlist-manager.js';
import { validateApiKey, hashApiKey } from '../../src/auth/api-key-validator.js';
import { validateUpstreamUrl } from '../../src/config/upstream-loader.js';
import { createHash } from 'node:crypto';
import type { TenantConfig } from '../../src/types/schemas.js';

function makeTenantConfig(apiKeys: Array<{ keyHash: string; name: string; scopes: string[]; expiresAt?: number }>): TenantConfig {
  return {
    tenantId: 'test-tenant',
    displayName: 'Test Tenant',
    rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 },
    cache: { enabled: true, ttlSeconds: 300 },
    allowlist: { mode: 'allow', tools: ['*'] },
    upstreams: [{ name: 'primary', url: 'https://upstream.example.com', weight: 1.0 }],
    auth: { apiKeys },
  };
}

describe('Security: Auth Bypass Attempts', () => {
  const validKey = 'my-secret-api-key';
  const validHash = 'sha256:' + createHash('sha256').update(validKey).digest('hex');

  it('rejects empty API key', () => {
    const result = validateApiKey('', makeTenantConfig([{ keyHash: validHash, name: 'test', scopes: ['tools:*'] }]));
    expect(result.valid).toBe(false);
  });

  it('rejects wrong API key', () => {
    const result = validateApiKey('wrong-key', makeTenantConfig([{ keyHash: validHash, name: 'test', scopes: ['tools:*'] }]));
    expect(result.valid).toBe(false);
  });

  it('rejects API key that matches hash prefix only', () => {
    const partialHash = validHash.slice(0, 20);
    const result = validateApiKey(validKey, makeTenantConfig([{ keyHash: partialHash, name: 'test', scopes: ['tools:*'] }]));
    expect(result.valid).toBe(false);
  });

  it('rejects expired API key', () => {
    const result = validateApiKey(validKey, makeTenantConfig([
      { keyHash: validHash, name: 'test', scopes: ['tools:*'], expiresAt: Date.now() - 1000 },
    ]));
    expect(result.valid).toBe(false);
  });

  it('case sensitivity: different case key does not match', () => {
    const result = validateApiKey(validKey.toUpperCase(), makeTenantConfig([
      { keyHash: validHash, name: 'test', scopes: ['tools:*'] },
    ]));
    expect(result.valid).toBe(false);
  });

  it('does not match key against a different tenant hash', () => {
    const otherHash = 'sha256:' + createHash('sha256').update('other-key').digest('hex');
    const result = validateApiKey(validKey, makeTenantConfig([
      { keyHash: otherHash, name: 'other-key', scopes: ['tools:*'] },
    ]));
    expect(result.valid).toBe(false);
  });

  it('rejects when no API keys are configured', () => {
    const config = makeTenantConfig([]);
    config.auth = { apiKeys: [] };
    const result = validateApiKey('any-key', config);
    expect(result.valid).toBe(false);
  });
});

describe('Security: SSRF Protection', () => {
  it('rejects localhost URLs', () => {
    expect(validateUpstreamUrl('http://localhost:3000').valid).toBe(false);
    expect(validateUpstreamUrl('https://localhost').valid).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    expect(validateUpstreamUrl('http://127.0.0.1:3000').valid).toBe(false);
  });

  it('rejects private IP 10.x.x.x', () => {
    expect(validateUpstreamUrl('http://10.0.0.1').valid).toBe(false);
    expect(validateUpstreamUrl('http://10.255.255.255').valid).toBe(false);
  });

  it('rejects private IP 172.16.x.x', () => {
    expect(validateUpstreamUrl('http://172.16.0.1').valid).toBe(false);
    expect(validateUpstreamUrl('http://172.31.255.255').valid).toBe(false);
  });

  it('rejects private IP 192.168.x.x', () => {
    expect(validateUpstreamUrl('http://192.168.0.1').valid).toBe(false);
    expect(validateUpstreamUrl('http://192.168.1.1').valid).toBe(false);
  });

  it('rejects link-local 169.254.x.x', () => {
    expect(validateUpstreamUrl('http://169.254.0.1').valid).toBe(false);
  });

  it('rejects non-HTTP protocols (ftp)', () => {
    expect(validateUpstreamUrl('ftp://example.com').valid).toBe(false);
  });

  it('rejects file:// protocol', () => {
    expect(validateUpstreamUrl('file:///etc/passwd').valid).toBe(false);
  });

  it('accepts valid public HTTPS URLs', () => {
    expect(validateUpstreamUrl('https://mcp-server.example.com').valid).toBe(true);
  });

  it('accepts valid public HTTP URLs', () => {
    expect(validateUpstreamUrl('http://mcp-server.example.com').valid).toBe(true);
  });
});

describe('Security: Allowlist Bypass Attempts', () => {
  const allowMode = { mode: 'allow' as const, tools: ['glean_*', 'serval_query'] };

  it('blocks tool not in allowlist', () => {
    const result = checkToolAccess('admin_delete', allowMode);
    expect(result.allowed).toBe(false);
  });

  it('blocks tool with path traversal-like name', () => {
    const result = checkToolAccess('../glean_search', allowMode);
    expect(result.allowed).toBe(false);
  });

  it('blocks tool with case variation when pattern is exact', () => {
    const strict = { mode: 'allow' as const, tools: ['serval_query'] };
    const result = checkToolAccess('SERVAL_QUERY', strict);
    expect(result.allowed).toBe(false);
  });

  it('blocks empty tool name', () => {
    const result = checkToolAccess('', allowMode);
    expect(result.allowed).toBe(false);
  });

  it('in deny mode, blocks listed tools', () => {
    const denyMode = { mode: 'deny' as const, tools: ['admin_*'] };
    const result = checkToolAccess('admin_delete_all', denyMode);
    expect(result.allowed).toBe(false);
  });

  it('in deny mode, allows non-listed tools', () => {
    const denyMode = { mode: 'deny' as const, tools: ['admin_*'] };
    const result = checkToolAccess('glean_search', denyMode);
    expect(result.allowed).toBe(true);
  });

  it('no allowlist means default allow', () => {
    const noList = { mode: 'allow' as const, tools: [] };
    const result = checkToolAccess('any_tool', noList);
    expect(result.allowed).toBe(true);
  });

  it('wildcard allowlist allows all tools', () => {
    const wildcard = { mode: 'allow' as const, tools: ['*'] };
    const result = checkToolAccess('dangerous_tool', wildcard);
    expect(result.allowed).toBe(true);
  });

  it('allows exact tool match', () => {
    const result = checkToolAccess('serval_query', allowMode);
    expect(result.allowed).toBe(true);
  });

  it('allows wildcard prefix match', () => {
    const result = checkToolAccess('glean_search', allowMode);
    expect(result.allowed).toBe(true);
  });
});

describe('Security: Input Validation', () => {
  it('hashApiKey produces consistent SHA-256 hashes', () => {
    const hash1 = hashApiKey('test-key');
    const hash2 = hashApiKey('test-key');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different keys produce different hashes', () => {
    const hash1 = hashApiKey('key-a');
    const hash2 = hashApiKey('key-b');
    expect(hash1).not.toBe(hash2);
  });
});
