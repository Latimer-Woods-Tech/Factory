import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  // React/Remotion/Zod are peers supplied by the consuming app or render
  // service; never bundle them into the library output.
  external: ['react', 'remotion', 'zod'],
});
