interface RateLimitStatusEntry {
  tenantId: string;
  remainingMinute?: number;
  remainingDay?: number;
  limitMinute?: number;
  limitDay?: number;
  resetMinute?: number;
  resetDay?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

function getCommonHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) { headers['x-api-key'] = apiKey; }
  return headers;
}

export async function rateLimitStatusCommand(args: string[]): Promise<void> {
  const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
  const url = urlArg ?? 'http://localhost:8080/api/v1/rate-limits/status';
  const tenantArg = args.find((_, i) => i > 0 && args[i - 1] === '--tenant');
  const query = tenantArg ? `?tenant_id=${encodeURIComponent(tenantArg)}` : '';
  const fullUrl = `${url}${query}`;
  const apiKeyArg = args.find((_, i) => i > 0 && args[i - 1] === '--api-key');
  const apiKey = apiKeyArg ?? process.env.MCP_GATEWAY_API_KEY;
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway rate-limit-status v1.0.0');
    return;
  }

  console.log(`Fetching rate limit status: ${fullUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(fullUrl, { method: 'GET', headers: getCommonHeaders(apiKey), signal: controller.signal });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('✗ Failed to fetch rate limit status:', response.status);
      process.exit(1);
    }

    const data = (await response.json()) as { statuses?: RateLimitStatusEntry[] };
    const statuses = data.statuses ?? [];

    if (statuses.length === 0) {
      console.log('No rate limit state tracked.');
      return;
    }

    console.log(`Rate limit status for ${statuses.length} tenant(s):`);
    for (const status of statuses) {
      console.log(`  - ${status.tenantId}`);
      if (status.limitMinute !== undefined) {
        console.log(`      per-minute: ${status.remainingMinute ?? 0}/${status.limitMinute} remaining`);
      }
      if (status.limitDay !== undefined) {
        console.log(`      per-day:    ${status.remainingDay ?? 0}/${status.limitDay} remaining`);
      }
      if (status.resetMinute !== undefined) {
        console.log(`      resetMinute: ${new Date(status.resetMinute * 1000).toISOString()}`);
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
