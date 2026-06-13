import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // Shim import.meta.url in the CJS bundle (config loaders use it to locate
  // package.json); without this, requiring the package from CJS throws.
  shims: true,
  tsconfig: './tsconfig.json',
});
