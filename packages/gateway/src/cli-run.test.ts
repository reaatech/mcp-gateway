/**
 * mcp-gateway — CLI Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('prints help when -h flag provided', async () => {
      setCliDependencies({
        stdout: (msg) => stdoutOutput.push(msg),
        stderr: (msg) => stderrOutput.push(msg),
        exit: (_code) => {
          /* noop for tests */
        },
        args: ['-h'],
      });

      const result = await runCli(['-h']);

      expect(result.code).toBe(0);
    });
  });

  describe('command dispatching', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
          headers: new Headers(),
        }),
      );
    });

    afterEach(() => {
      clearCliDependencies();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('dispatches to start command', async () => {
      const result = await runCli(['start']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to start command with custom port', async () => {
      const result = await runCli(['start', '--port', '9090']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to health command', async () => {
      const result = await runCli(['health']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to cache-stats command', async () => {
      const result = await runCli(['cache-stats']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to list-tenants command', async () => {
      const result = await runCli(['list-tenants']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to list-upstreams command', async () => {
      const result = await runCli(['list-upstreams']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to rate-limit-status command', async () => {
      const result = await runCli(['rate-limit-status']);
      expect(result).toEqual({ code: 0 });
    });

    it('dispatches to validate-config command', async () => {
      const result = await runCli(['validate-config']);
      expect(result).toEqual({ code: 0 });
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
