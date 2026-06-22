import { defineConfig } from 'vitest/config';

/**
 * Admin Studio worker test config.
 *
 * The monorepo root config only includes the `tests/` directory, which
 * silently skipped every co-located unit test under `src/`. This app-local
 * config runs BOTH the integration suite under `tests/` and the co-located
 * `src` unit tests so the worker's own routes/middleware are actually
 * exercised by `npm test`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});
