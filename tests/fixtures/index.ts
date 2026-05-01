/**
 * mcp-gateway — Test Fixtures
 * Reusable test data and helpers
 */

import { createHash } from 'node:crypto';

export const TEST_API_KEY = 'test-api-key-12345';
export const TEST_API_KEY_HASH = `sha256:${createHash('sha256').update(TEST_API_KEY).digest('hex')}`;

export const TEST_TENANT_ID = 'test-tenant';
export const TEST_REQUEST_ID = 'req-test-123';

export const validJsonRpcRequest = (overrides: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0',
  id: '1',
  method: 'tools/call',
  params: {
    name: 'glean_search',
    arguments: { query: 'test query' },
  },
  ...overrides,
});

export const validJsonRpcResponse = (overrides: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0',
  id: '1',
  result: {
    content: [{ type: 'text', text: 'test response' }],
  },
  ...overrides,
});

export const testTenantConfig = {
  tenantId: TEST_TENANT_ID,
  displayName: 'Test Tenant',
  rateLimits: {
    requestsPerMinute: 100,
    requestsPerDay: 10000,
  },
  cache: {
    enabled: true,
    ttlSeconds: 300,
  },
  allowlist: {
    mode: 'allow' as const,
    tools: ['glean_*', 'serval_*', 'test_tool'],
  },
  upstreams: [
    {
      name: 'primary',
      url: 'https://mcp-server-1.example.com',
      weight: 0.7,
      timeoutMs: 30000,
    },
    {
      name: 'secondary',
      url: 'https://mcp-server-2.example.com',
      weight: 0.3,
      timeoutMs: 30000,
    },
  ],
};

export const testTenantYaml = `
tenant_id: "test-tenant"
display_name: "Test Tenant"

rate_limits:
  requests_per_minute: 100
  requests_per_day: 10000

allowlist:
  mode: "allow"
  tools:
    - "glean_*"
    - "serval_*"

cache:
  enabled: true
  ttl_seconds: 300

upstreams:
  - name: "primary"
    url: "https://mcp-server-1.example.com"
    weight: 0.7
  - name: "secondary"
    url: "https://mcp-server-2.example.com"
    weight: 0.3
`;

export const mockAuthContext = {
  tenantId: TEST_TENANT_ID,
  userId: 'user-123',
  authMethod: 'api-key' as const,
  scopes: ['tools:*'],
  keyName: 'test-key',
};

export const mockFanOutResponse = {
  upstream: 'primary',
  response: validJsonRpcResponse(),
  durationMs: 123,
  success: true,
  latencyMs: 123,
};
