import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4 no longer excludes dist by default, and the tsc build compiles the tests there too.
    include: ['src/**/*.test.ts'],
  },
});
