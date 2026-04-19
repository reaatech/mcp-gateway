interface UpstreamSummary {
  name: string;
  url: string;
  tenantId?: string;
  weight?: number;
  healthy?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

function getCommonHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) { headers['x-api-key'] = apiKey; }
  return headers;
}

export async function listUpstreamsCommand(args: string[]): Promise<void> {
  const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
  const url = urlArg ?? 'http://localhost:8080/api/v1/upstreams';
  const tenantArg = args.find((_, i) => i > 0 && args[i - 1] === '--tenant');
  const query = tenantArg ? `?tenant_id=${encodeURIComponent(tenantArg)}` : '';
  const fullUrl = `${url}${query}`;
  const apiKeyArg = args.find((_, i) => i > 0 && args[i - 1] === '--api-key');
  const apiKey = apiKeyArg ?? process.env.MCP_GATEWAY_API_KEY;
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway list-upstreams v1.0.0');
    return;
  }

  console.log(`Listing upstreams: ${fullUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(fullUrl, { method: 'GET', headers: getCommonHeaders(apiKey), signal: controller.signal });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('✗ Failed to fetch upstreams:', response.status);
      process.exit(1);
    }

    const data = (await response.json()) as { upstreams?: UpstreamSummary[] };
    const upstreams = data.upstreams ?? [];

    if (upstreams.length === 0) {
      console.log('No upstreams configured.');
      return;
    }

    console.log(`Found ${upstreams.length} upstream(s):`);
    for (const upstream of upstreams) {
      const health = upstream.healthy === false ? 'UNHEALTHY' : 'healthy';
      const tenant = upstream.tenantId ? ` [tenant=${upstream.tenantId}]` : '';
      console.log(`  - ${upstream.name}${tenant}`);
      console.log(`      url: ${upstream.url}`);
      console.log(`      weight: ${upstream.weight ?? 1}, timeout: ${upstream.timeoutMs ?? 'default'}, status: ${health}`);
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
