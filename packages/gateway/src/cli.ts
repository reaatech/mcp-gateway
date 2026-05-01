#!/usr/bin/env node
import { cacheStatsCommand } from './cli/cache-stats.command.js';
import { healthCommand } from './cli/health.command.js';
import { listTenantsCommand } from './cli/list-tenants.command.js';
import { listUpstreamsCommand } from './cli/list-upstreams.command.js';
import { rateLimitStatusCommand } from './cli/rate-limit-status.command.js';
import { startCommand } from './cli/start.command.js';
import { validateConfigCommand } from './cli/validate-config.command.js';

export interface CliDependencies {
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  exit?: (code: number) => void;
  args?: string[];
}

let testDependencies: CliDependencies | null = null;

export function setCliDependencies(deps: CliDependencies): void {
  testDependencies = deps;
}

export function clearCliDependencies(): void {
  testDependencies = null;
}

function getDependencies(): CliDependencies {
  return testDependencies ?? {};
}

function printHelp(stdout: (msg: string) => void): void {
  stdout(`
mcp-gateway — Production MCP gateway

Usage: mcp-gateway <command> [options]

Commands:
  start               Start the gateway server
  validate-config     Validate gateway configuration
  health              Check gateway health (add --deep for full probes)
  cache-stats         Show cache statistics
  list-tenants        List configured tenants
  list-upstreams      List upstream servers (--tenant <id>)
  rate-limit-status   Show rate limit status (--tenant <id>)
  help                Show this help message

Examples:
  mcp-gateway start --port 8080
  mcp-gateway validate-config --config gateway.yaml
  mcp-gateway health --url http://localhost:8080 --deep
  mcp-gateway cache-stats --url http://localhost:8080
  mcp-gateway list-tenants
  mcp-gateway list-upstreams --tenant acme-corp
  mcp-gateway rate-limit-status --tenant acme-corp
`);
}

export async function runCli(args: string[]): Promise<{ code: number; error?: string }> {
  const deps = getDependencies();
  const stdout = deps.stdout ?? console.log;
  const stderr = deps.stderr ?? console.error;

  const command = args[0];

  switch (command) {
    case 'start':
      await startCommand(args.slice(1));
      return { code: 0 };
    case 'validate-config':
      await validateConfigCommand(args.slice(1));
      return { code: 0 };
    case 'health':
      await healthCommand(args.slice(1));
      return { code: 0 };
    case 'cache-stats':
      await cacheStatsCommand(args.slice(1));
      return { code: 0 };
    case 'list-tenants':
      await listTenantsCommand(args.slice(1));
      return { code: 0 };
    case 'list-upstreams':
      await listUpstreamsCommand(args.slice(1));
      return { code: 0 };
    case 'rate-limit-status':
      await rateLimitStatusCommand(args.slice(1));
      return { code: 0 };
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp(stdout);
      return { code: 0 };
    default: {
      const errMsg = `Unknown command: ${command}`;
      stderr(errMsg);
      printHelp(stdout);
      return { code: 1, error: errMsg };
    }
  }
}

async function main(): Promise<void> {
  const deps = getDependencies();
  const cliArgs = deps.args ?? process.argv.slice(2);
  const result = await runCli(cliArgs);
  if (result.code !== 0) {
    process.exit(result.code);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
