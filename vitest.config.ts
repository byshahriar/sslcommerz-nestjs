import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Barrels re-export; there is nothing in them to cover.
      exclude: ['src/**/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
