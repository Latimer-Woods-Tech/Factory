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
      // Only the pure, non-React modules carry testable runtime logic. The
      // Remotion composition + components render visual output (verified by
      // full MP4 renders on Cloud Run, not unit tests) and the Root/render
      // entrypoints are thin registration/CLI glue, so they are excluded from
      // the coverage denominator to keep the threshold meaningful.
      include: ['src/chartToScenes.ts', 'src/blueprintSegment.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
