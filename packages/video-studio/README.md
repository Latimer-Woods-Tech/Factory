# @latimer-woods-tech/video-studio

Reusable Remotion composition library for the **Energy Blueprint Video Engine**
(seam I1). This package holds the `EnergyBlueprintVideo` composition, its scene
components, the pure `chartToScenes()` blueprint→scenes mapper, and the
`blueprint` segment renderer that implements the `SegmentRenderer` contract from
[`@latimer-woods-tech/video`](../video).

It is consumed by:

- **`apps/video-studio`** — the Remotion project bundled by the scheduled-content
  render workflow (`render-video.yml`).
- **The Cloud Run render service** (Wave 2) — the dedicated Node + Chromium +
  ffmpeg executor for all per-user personal renders.

## Layering

- `blueprint-types.ts` and `chartToScenes.ts` are **pure** (no React, Remotion,
  or Node built-ins) so they unit-test anywhere and are safe to import from the
  segment renderer.
- The composition (`compositions/`) and scene components (`components/`) are
  React/Remotion TSX, verified by full MP4 renders on Cloud Run rather than unit
  tests.
- `render.ts` and `Root.tsx` are thin Remotion registration/CLI glue (Node APIs
  permitted; they run in the render service / CI, never in a Worker).

`react`, `remotion`, and `zod` are peer dependencies supplied by the consuming
app or render service — never bundled into the library output.

## Exports

See `src/index.ts`. The notable entry points are:

- `EnergyBlueprintVideo`, `blueprintSchema`, `EnergyBlueprintProps`
- `chartToScenes`, `BlueprintSegmentData`, `deriveForgeTheme`
- `renderBlueprintSegment` — the `'blueprint'` `SegmentRenderer`
- the shared types/constants (`HdType`, `ForgeTheme`, `BlueprintScene`,
  `TYPE_COLORS`, `DEFAULT_BRAND_COLOR`)

## No "AI" in copy

Per platform governance, no user-facing string in this package (narration,
on-screen text, scene labels) uses the word "AI". The blueprint segment never
synthesises narration — selfprime authors it (decision D6).
