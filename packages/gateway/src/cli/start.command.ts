export async function startCommand(args: string[]): Promise<void> {
  const portArg = args.find((_, i) => i > 0 && args[i - 1] === '--port');
  const port = portArg ? Number.parseInt(portArg, 10) : 8080;
  const configArg = args.find((_, i) => i > 0 && args[i - 1] === '--config');
  const config = configArg;
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway v1.0.0');
    return;
  }

  console.log('Starting mcp-gateway...');
  console.log(`  Port: ${port}`);
  if (config) {
    console.log(`  Config: ${config}`);
  }
  console.log('');
  console.log('To start the gateway, run:');
  console.log(`  PORT=${port} node packages/gateway/dist/index.js`);
  if (config) {
    console.log(`  GATEWAY_CONFIG_PATH=${config} node packages/gateway/dist/index.js`);
  }
}
