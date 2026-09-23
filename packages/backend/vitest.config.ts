import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    testTimeout: 5000,
    pool: 'threads',
    poolOptions: {
      threads: {
        // Each test file gets its own worker (default), giving each its own module-level singletons (incl. the in-memory SQLite handle).
        isolate: true,
      },
    },
  },
  resolve: {
    alias: [
      // Order matters: longest-prefix matches must come first.
      { find: /^@shulkr\/backend\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
      { find: /^@shulkr\/backend$/, replacement: resolve(__dirname, 'src') },
      { find: /^@shulkr\/shared\/(.*)$/, replacement: resolve(__dirname, '../shared/src/$1') },
      { find: /^@shulkr\/shared$/, replacement: resolve(__dirname, '../shared/src') },
    ],
  },
});
