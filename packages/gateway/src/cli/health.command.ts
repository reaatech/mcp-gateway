interface HealthData {
  status?: string;
  uptime?: number;
  timestamp?: string;
  upstreams?: { healthy: number; total: number };
  redis?: { connected: boolean };
}

const DEFAULT_TIMEOUT_MS = 5000;

export async function healthCommand(args: string[]): Promise<void> {
  const urlArg = args.find((_, i) => i > 0 && args[i - 1] === '--url');
  const url = urlArg ?? 'http://localhost:8080/health';
  const deep = args.includes('--deep');
  const apiKeyArg = args.find((_, i) => i > 0 && args[i - 1] === '--api-key');
  const apiKey = apiKeyArg ?? process.env.MCP_GATEWAY_API_KEY;
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway health v1.0.0');
    return;
  }

  const healthUrl = deep ? url.replace('/health', '/health/deep') : url;

  console.log(`Checking health: ${healthUrl}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = (await response.json()) as HealthData;

    if (response.ok) {
      console.log('✓ Gateway is healthy');
      console.log(`  Status: ${data.status || 'ok'}`);
      if (data.uptime !== undefined) {
        console.log(`  Uptime: ${data.uptime}s`);
      }
      if (data.timestamp) {
        console.log(`  Timestamp: ${data.timestamp}`);
      }
      if (deep && data.upstreams) {
        console.log(`  Upstreams: ${data.upstreams.healthy}/${data.upstreams.total} healthy`);
      }
      if (deep && data.redis) {
        console.log(`  Redis: ${data.redis.connected ? 'connected' : 'disconnected'}`);
      }
    } else {
      console.error('✗ Gateway returned non-OK status:', response.status);
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
