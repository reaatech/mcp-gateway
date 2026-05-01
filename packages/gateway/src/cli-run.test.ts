/**
 * mcp-gateway — CLI Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearCliDependencies, runCli, setCliDependencies } from './cli.js';

describe('CLI', () => {
  let stdoutOutput: string[] = [];
  let stderrOutput: string[] = [];

  beforeEach(() => {
    clearCliDependencies();
    stdoutOutput = [];
    stderrOutput = [];
  });

  afterEach(() => {
    clearCliDependencies();
  });

  describe('runCli', () => {
    it('prints help when no command provided', async () => {
      setCliDependencies({
        stdout: (msg) => stdoutOutput.push(msg),
        stderr: (msg) => stderrOutput.push(msg),
        args: [],
      });

      const result = await runCli([]);

      expect(result.code).toBe(0);
      expect(stdoutOutput.some((o) => o.includes('mcp-gateway'))).toBe(true);
    });

    it('prints help when help command provided', async () => {
      setCliDependencies({
        stdout: (msg) => stdoutOutput.push(msg),
        stderr: (msg) => stderrOutput.push(msg),
        exit: (_code) => {
          /* noop for tests */
        },
        args: ['help'],
      });

      const result = await runCli(['help']);

      expect(result.code).toBe(0);
      expect(stdoutOutput.some((o) => o.includes('Usage'))).toBe(true);
    });

    it('prints help when --help flag provided', async () => {
      setCliDependencies({
        stdout: (msg) => stdoutOutput.push(msg),
        stderr: (msg) => stderrOutput.push(msg),
        exit: (_code) => {
          /* noop for tests */
        },
        args: ['--help'],
      });

      const result = await runCli(['--help']);

      expect(result.code).toBe(0);
    });

    it('returns error for unknown command', async () => {
      setCliDependencies({
        stdout: (msg) => stdoutOutput.push(msg),
        stderr: (msg) => stderrOutput.push(msg),
        exit: (_code) => {
          /* noop for tests */
        },
        args: ['unknown-cmd'],
      });

      const result = await runCli(['unknown-cmd']);

      expect(result.code).toBe(1);
      expect(result.error).toBeDefined();
    });
  });

  describe('help output', () => {
    it('includes all command descriptions', async () => {
      setCliDependencies({
        stdout: (msg) => stdoutOutput.push(msg),
        stderr: (msg) => stderrOutput.push(msg),
        exit: (_code) => {
          /* noop for tests */
        },
        args: ['--help'],
      });

      await runCli(['--help']);

      const output = stdoutOutput.join('');
      expect(output).toContain('start');
      expect(output).toContain('health');
      expect(output).toContain('cache-stats');
      expect(output).toContain('list-tenants');
      expect(output).toContain('list-upstreams');
      expect(output).toContain('rate-limit-status');
    });
  });
});
