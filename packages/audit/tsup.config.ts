import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/fastify.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // Shim import.meta.url in the CJS bundle (audit logger/storage use it via
  // createRequire); without this, requiring the package from CJS throws.
  shims: true,
  tsconfig: './tsconfig.json',
});
