import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      // index.ts (Worker entrypoint) and config.ts (static constants) are
      // excluded: the entrypoint requires a live Cloudflare runtime, and
      // the config is pure data with no logic to test.
      exclude: ['src/index.ts', 'src/config.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
