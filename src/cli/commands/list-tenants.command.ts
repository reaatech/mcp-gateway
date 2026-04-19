interface TenantSummary {
  tenantId: string;
  displayName: string;
  upstreams?: number;
  rateLimits?: { requestsPerMinute?: number; requestsPerDay?: number };
}

const DEFAULT_TIMEOUT_MS = 5000;

function getCommonHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) { headers['x-api-key'] = apiKey; }
  return headers;
}

export async function listTenantsCommand(args: string[]): Promise<void> {
  const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
  const url = urlArg ?? 'http://localhost:8080/api/v1/tenants';
  const apiKeyArg = args.find((_, i) => i > 0 && args[i - 1] === '--api-key');
  const apiKey = apiKeyArg ?? process.env.MCP_GATEWAY_API_KEY;
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway list-tenants v1.0.0');
    return;
  }

  console.log(`Listing tenants: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(url, { method: 'GET', headers: getCommonHeaders(apiKey), signal: controller.signal });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('✗ Failed to fetch tenants:', response.status);
      process.exit(1);
    }

    const data = (await response.json()) as { tenants?: TenantSummary[] };
    const tenants = data.tenants ?? [];

    if (tenants.length === 0) {
      console.log('No tenants configured.');
      return;
    }

    console.log(`Found ${tenants.length} tenant(s):`);
    for (const tenant of tenants) {
      console.log(`  - ${tenant.tenantId} (${tenant.displayName})`);
      if (tenant.upstreams !== undefined) {
        console.log(`      upstreams: ${tenant.upstreams}`);
      }
      if (tenant.rateLimits) {
        const rpm = tenant.rateLimits.requestsPerMinute ?? 'N/A';
        const rpd = tenant.rateLimits.requestsPerDay ?? 'N/A';
        console.log(`      limits: ${rpm}/min, ${rpd}/day`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`✗ Request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    } else {
      console.error('✗ Failed to reach gateway:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}
