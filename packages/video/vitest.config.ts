import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
      },
      include: ['src/**'],
      // engine-types.ts is type-only (no runtime code emitted), so it has no
      // statements to cover; excluding it keeps the threshold meaningful.
      exclude: ['src/**/*.test.ts', 'src/engine-types.ts'],
    },
  },
});
