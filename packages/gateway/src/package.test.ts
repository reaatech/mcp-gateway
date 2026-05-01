import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package metadata', () => {
  it('points main/types/bin to built files that exist', () => {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      main: string;
      types: string;
      bin: Record<string, string>;
    };

    expect(existsSync(join(process.cwd(), packageJson.main))).toBe(true);
    expect(existsSync(join(process.cwd(), packageJson.types))).toBe(true);
    const binPath = (packageJson as { bin: Record<string, string> }).bin['mcp-gateway'];
    expect(existsSync(join(process.cwd(), binPath))).toBe(true);
  });
});
