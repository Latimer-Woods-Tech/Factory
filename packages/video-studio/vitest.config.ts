import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Resolve @latimer-woods-tech/* package aliases to their source so vitest can
// find them without a pre-built dist (mirrors the tsconfig.internal-packages
// paths that tsc uses, but Vite/Vitest needs the alias explicitly).
const MONOREPO_ROOT = resolve(__dirname, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@latimer-woods-tech/bodygraph': resolve(MONOREPO_ROOT, 'packages/bodygraph/src/index.ts'),
      '@latimer-woods-tech/video': resolve(MONOREPO_ROOT, 'packages/video/src/index.ts'),
    },
  },
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
