import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/fastify.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  tsconfig: './tsconfig.json',
});
