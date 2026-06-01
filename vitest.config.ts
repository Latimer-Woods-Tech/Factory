import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration for Factory monorepo integration tests (tests/ dir).
 * Individual packages and apps have their own vitest.config.ts files with coverage.
 */
export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 90, functions: 90, branches: 85 },
      include: ['apps/admin-studio/src/**', 'packages/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
    },
  },
});
