import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules', 'dist', '**/*.d.ts', '**/*.config.ts', 'src/index.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
