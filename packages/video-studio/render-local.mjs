// ---------------------------------------------------------------------------
// render-local.mjs — local Remotion render harness for visual judgment.
//
// Bundles src/Root.tsx and renders the EnergyBlueprintVideo composition with a
// Projector fixture so the orchestrator can render frames and judge the canonical
// body-graph look. The orchestrator owns visual judgment — this is just a
// reliable, dependency-light entrypoint.
//
// Usage:
//   node render-local.mjs                       # full MP4 -> out/bodygraph-preview.mp4
//   node render-local.mjs --still 1500          # single PNG still at frame 1500
//   node render-local.mjs --out out/foo.mp4     # custom output path
//
// Requires the package's devDependencies installed (npm ci in packages/video-studio).
// ---------------------------------------------------------------------------

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @internal Read the value following `flag`, or `null`. */
function flagOrNull(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

// Projector fixture: a defined G/Throat/Ajna chart with two signature gates.
// definedCenters are PascalCase to match the canonical engine + chartToScenes.
const inputProps = {
  appId: 'prime_self',
  topic: 'Your Pattern Has Always Been Here',
  script:
    'Before you learned to explain yourself, your pattern was already complete. ' +
    'The moment of your birth encoded something specific — a frequency that was yours ' +
    'from the beginning. This is a map of your original pattern: the way energy moves ' +
    'through you, and the way it does not. When you return to what your design actually ' +
    'says, life stops feeling like resistance and starts to flow.',
  narrationUrl: '',
  brandColor: '#7aa2ff',
  brandAccent: '#7aa2ff',
  logoUrl: '',
  forgeTheme: 'self',
  hdType: 'projector',
  // Body-graph fixture (Projector):
  signatureGates: [20, 57],
  scenes: [
    { type: 'arrival', durationFrames: 90, showBodyGraph: false },
    {
      type: 'concept',
      durationFrames: 600,
      text: 'A map of the way energy moves through you.',
      showBodyGraph: true,
      definedCenters: ['G', 'Throat', 'Ajna'],
    },
    { type: 'breath', durationFrames: 120, showBodyGraph: true, definedCenters: ['G', 'Throat', 'Ajna'] },
  ],
};

async function main() {
  const entry = path.join(__dirname, 'src', 'Root.tsx');
  const outDir = path.join(__dirname, 'out');
  await mkdir(outDir, { recursive: true });

  console.log('[render-local] bundling Root.tsx …');
  const serveUrl = await bundle({ entryPoint: entry });

  const composition = await selectComposition({
    serveUrl,
    id: 'EnergyBlueprintVideo',
    inputProps,
  });

  const stillFrame = flagOrNull('--still');
  if (stillFrame !== null) {
    const output = flagOrNull('--out') ?? path.join(outDir, `bodygraph-still-${stillFrame}.png`);
    console.log(`[render-local] rendering still at frame ${stillFrame} -> ${output}`);
    await renderStill({
      composition,
      serveUrl,
      output,
      frame: Number(stillFrame),
      inputProps,
    });
    console.log('[render-local] done:', output);
    return;
  }

  const output = flagOrNull('--out') ?? path.join(outDir, 'bodygraph-preview.mp4');
  console.log(`[render-local] rendering MP4 -> ${output}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    output,
    inputProps,
  });
  console.log('[render-local] done:', output);
}

main().catch((err) => {
  console.error('[render-local] failed:', err);
  process.exit(1);
});
