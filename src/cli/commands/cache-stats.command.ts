interface CacheStatsData {
  hitRate?: number;
  hits?: number;
  misses?: number;
  currentSize?: number;
  maxSize?: number;
  totalKeys?: number;
  evictions?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

function getCommonHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) { headers['x-api-key'] = apiKey; }
  return headers;
}

export async function cacheStatsCommand(args: string[]): Promise<void> {
  const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
  const url = urlArg ?? 'http://localhost:8080/api/v1/cache/stats';
  const apiKeyArg = args.find((_, i) => i > 0 && args[i - 1] === '--api-key');
  const apiKey = apiKeyArg ?? process.env.MCP_GATEWAY_API_KEY;
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway cache-stats v1.0.0');
    return;
  }

  console.log(`Fetching cache stats: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(url, { method: 'GET', headers: getCommonHeaders(apiKey), signal: controller.signal });

    clearTimeout(timeoutId);

    const data = (await response.json()) as CacheStatsData;

    if (response.ok) {
      console.log('Cache Statistics:');
      console.log(`  Hit Rate: ${data.hitRate !== undefined ? (data.hitRate * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`  Total Hits: ${data.hits ?? 'N/A'}`);
      console.log(`  Total Misses: ${data.misses ?? 'N/A'}`);
      console.log(`  Current Size: ${data.currentSize !== undefined ? formatBytes(data.currentSize) : 'N/A'}`);
      console.log(`  Max Size: ${data.maxSize !== undefined ? formatBytes(data.maxSize) : 'N/A'}`);
      console.log(`  Total Keys: ${data.totalKeys ?? 'N/A'}`);
      if (data.evictions !== undefined) {
        console.log(`  Evictions: ${data.evictions}`);
      }
    } else {
      console.error('✗ Failed to fetch cache stats:', response.status);
      process.exit(1);
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

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
