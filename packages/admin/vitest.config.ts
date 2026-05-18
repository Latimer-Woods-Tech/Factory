import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // RATCHET: raised for 0.3.1 per factory TECH_DEBT DEBT-006.
      // Raise to lines:90/functions:90/branches:85 once RS256 + JWKS paths
      // gain dedicated coverage.
      thresholds: { lines: 85, functions: 90, branches: 75 },
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
    },
  },
});
