// ---------------------------------------------------------------------------
// render.ts — Remotion render glue for the Cloud Run render service.
//
// Bundles the `EnergyBlueprintVideo` composition shipped in
// `@latimer-woods-tech/video-studio` (its `src/Root.tsx`) and renders an MP4 to
// a local path, mirroring the proven `.github/workflows/render-video.yml`
// approach (Remotion → MP4) but invoked in-process by the render service.
//
// Node-only (real Chromium via Remotion) — runs on Cloud Run, never a Worker.
// Excluded from unit coverage; exercised by the live Cloud Run E2E.
// ---------------------------------------------------------------------------

import { createRequire } from 'node:module';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { EnergyBlueprintProps } from '@latimer-woods-tech/video-studio';

const require = createRequire(import.meta.url);

/**
 * Resolves the absolute path to the video-studio Remotion Root entry. The
 * package ships its `src/` (see its `files`), so the bundler compiles the TSX
 * directly — matching how render-video.yml renders from `src/Root.tsx`.
 */
function resolveRootEntry(): string {
  // Resolve via the package's published entry, then swap to the Root source the
  // package ships alongside it. `require.resolve` honours the file: install.
  return require.resolve('@latimer-woods-tech/video-studio/src/Root.tsx');
}

/** The Remotion composition id registered in the video-studio Root. */
export const COMPOSITION_ID = 'EnergyBlueprintVideo';

/**
 * Renders the `EnergyBlueprintVideo` composition to `outputPath` (MP4, H.264).
 *
 * @param props - The assembled {@link EnergyBlueprintProps} for this render.
 * @param outputPath - Absolute path the MP4 is written to.
 */
export async function renderBlueprintMp4(
  props: EnergyBlueprintProps,
  outputPath: string,
): Promise<void> {
  const entry = resolveRootEntry();
  const inputProps = props as unknown as Record<string, unknown>;

  const serveUrl = await bundle({
    entryPoint: entry,
    webpackOverride: (config) => config,
  });

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
  });
}
