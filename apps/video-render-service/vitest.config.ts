import { defineConfig } from 'vitest/config';

// The render pipeline (Remotion bundle/render, ffmpeg, the Node server
// entrypoint, and the R2/Stream glue) is exercised live on Cloud Run, not in
// unit tests. We unit-test the signed-request HTTP handler with mocked
// render/upload/callback dependencies; the heavy modules are excluded from
// coverage so the gate reflects the logic we actually test.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: [
        'src/server.ts',
        'src/render.ts',
        'src/pipeline.ts',
        'vitest.config.ts',
        'dist/**',
      ],
    },
  },
});
