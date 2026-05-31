/**
 * Remotion render entry point for `@latimer-woods-tech/video-studio`.
 *
 * Bundles this package's `Root.tsx` (the `EnergyBlueprintVideo` composition) and
 * renders an MP4. Invoked by the Cloud Run render service (Wave 2) for per-user
 * personal renders; the same CLI shape is reused by the scheduled-content
 * workflow when it targets the blueprint composition.
 *
 * Node-only glue (uses `node:path`, `process`): it runs in the render service /
 * CI, never inside a Cloudflare Worker.
 *
 * Usage:
 *   node -r ts-node/register src/render.ts \
 *     --composition EnergyBlueprintVideo \
 *     --props '{"appId":"prime_self","topic":"…", ...}' \
 *     --output /tmp/output.mp4
 *
 * Environment variables (fallback when the matching flag is absent):
 *   COMPOSITION_ID  — composition id (e.g. EnergyBlueprintVideo)
 *   PROPS_JSON      — JSON-encoded composition props
 *   OUTPUT_PATH     — Absolute path for the rendered MP4
 */

import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/** @internal Read a required env var, throwing a clear error when unset. */
function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing environment variable: ${key}`);
  return val;
}

/** @internal Return the value following `flag` in argv, or `null` if absent. */
function flagOrNull(flag: string): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1] ?? null;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

async function render(): Promise<void> {
  // Prefer CLI flags; fall back to env vars for workflow compatibility
  const compositionId =
    flagOrNull('--composition') ?? getEnv('COMPOSITION_ID');
  const propsJson =
    flagOrNull('--props') ?? getEnv('PROPS_JSON');
  const outputPath =
    flagOrNull('--output') ?? getEnv('OUTPUT_PATH');

  console.log(`[render] Composition: ${compositionId}`);
  console.log(`[render] Output: ${outputPath}`);

  let inputProps: Record<string, unknown>;
  try {
    inputProps = JSON.parse(propsJson) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON in props: ${propsJson}`);
  }

  // Bundle the Remotion project
  const entry = path.resolve(__dirname, 'Root.tsx');
  console.log(`[render] Bundling ${entry}…`);

  const bundleLocation = await bundle({
    entryPoint: entry,
    webpackOverride: (config) => config,
  });

  console.log(`[render] Bundle ready at ${bundleLocation}`);

  // Select the composition
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  console.log(
    `[render] Rendering ${String(composition.durationInFrames)} frames at ${String(composition.fps)} fps…`,
  );

  // Render to MP4
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r[render] ${String(Math.round(progress * 100))}%`);
    },
  });

  process.stdout.write('\n');
  console.log(`[render] Done → ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

render().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[render] FATAL: ${message}`);
  process.exit(1);
});
