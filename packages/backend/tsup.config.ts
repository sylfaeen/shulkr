import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: process.env.NODE_ENV !== 'production',
  noExternal: ['@shulkr/shared'],
  external: ['better-sqlite3', 'bcrypt'],
});
