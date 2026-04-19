import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    expect(existsSync(join(process.cwd(), packageJson.bin['mcp-gateway']!))).toBe(true);
  });
});
