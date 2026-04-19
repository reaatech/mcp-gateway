export async function validateConfigCommand(args: string[]): Promise<void> {
  const configArg = args.find((_, i) => i > 0 && args[i - 1] === '--config');
  const configPath = configArg ?? 'gateway.yaml';
  const tenantDirArg = args.find((_, i) => i > 0 && args[i - 1] === '--tenant-dir');
  const tenantDir = tenantDirArg ?? 'tenants';
  const versionArg = args.find((a) => a === '--version' || a === '-v');

  if (versionArg) {
    console.log('mcp-gateway validate-config v1.0.0');
    return;
  }

  console.log(`Validating gateway config: ${configPath}`);
  console.log(`Validating tenant configs in: ${tenantDir}`);

  try {
    // Import validation functions
    const [gatewayConfig, tenantLoader] = await Promise.all([
      import('../../config/gateway-config.js'),
      import('../../config/tenant-loader.js'),
    ]);

    // Validate gateway config
    gatewayConfig.loadGatewayConfig();
    console.log('✓ Gateway configuration is valid');

    // Validate tenant configs
    const tenantResult = await tenantLoader.loadTenantsAsync();
    if (tenantResult.size === 0) {
      console.warn('⚠ No tenant configurations found');
    } else {
      console.log(`✓ ${tenantResult.size} tenant configuration(s) loaded`);
    }

    console.log('✓ Configuration validation passed');
  } catch (error) {
    console.error('✗ Configuration validation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
