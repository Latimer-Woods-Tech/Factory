// ---------------------------------------------------------------------------
// Reusable hardened render harness for the video-studio Remotion comps.
//
// Encodes the lessons paid for in blood (2026-06-30): heavy, particle-dense
// frames GPU-DEADLOCK under `renderMedia` with concurrency>1 + gl:'angle' —
// the render hangs FOREVER with no error and no progress. Stills of the same
// frame render fine. See docs/planning/training-videos-handoff.md §4.
//
// This harness:
//   • defaults heavy comps to gl:'swiftshader' + concurrency:1 (cannot GPU-
//     deadlock; ~12–15min/segment but reliable),
//   • installs a STALL WATCHDOG that aborts via makeCancelSignal() if frame
//     progress stops for `stallMs` — so a wedged render fails fast instead of
//     hanging for hours,
//   • uses system Chrome (chrome-headless-shell flakes on this box).
//
// Usage:
//   import { renderSafe } from './_render-lib.mjs';
//   await renderSafe({ composition, serveUrl, inputProps, output, heavy: true,
//                      muted: true, frameRange: [a, b], onLog: console.log });
// ---------------------------------------------------------------------------
import { renderMedia, makeCancelSignal } from '@remotion/renderer';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/**
 * Render a Remotion media file with the hardened defaults + a stall watchdog.
 *
 * @param {object}   o
 * @param {object}   o.composition  selectComposition() result
 * @param {string}   o.serveUrl     bundle() result
 * @param {object}   o.inputProps
 * @param {string}   o.output       outputLocation
 * @param {boolean} [o.heavy=true]  particle/effect-dense comp → swiftshader+concurrency:1
 * @param {boolean} [o.muted=false]
 * @param {string}  [o.codec='h264']
 * @param {[number,number]} [o.frameRange]
 * @param {number}  [o.crf=23]    x264 constant-rate-factor. Remotion's default
 *                                (18) makes 4-min cuts balloon to 170MB+, which
 *                                is undeliverable by email/watch page. 23 is
 *                                near-visually-lossless at roughly half the size.
 * @param {number}  [o.stallMs=180000]  abort if no frame progress for this long
 * @param {(msg:string)=>void} [o.onLog]
 */
export async function renderSafe({
  composition, serveUrl, inputProps, output,
  heavy = true, muted = false, codec = 'h264', frameRange, crf = 23,
  stallMs = 180000, onLog = () => {},
}) {
  const { cancelSignal, cancel } = makeCancelSignal();
  let last = Date.now();
  let stalled = false;
  const watch = setInterval(() => {
    if (Date.now() - last > stallMs) {
      stalled = true;
      onLog(`STALL: no frame progress for ${Math.round((Date.now() - last) / 1000)}s — aborting render`);
      clearInterval(watch);
      cancel();
    }
  }, 5000);

  try {
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec,
      muted,
      crf,
      ...(frameRange ? { frameRange } : {}),
      outputLocation: output,
      browserExecutable: CHROME,
      timeoutInMilliseconds: 60000,
      // The load-bearing fix: software raster + single tab for heavy comps.
      chromiumOptions: { gl: heavy ? 'swiftshader' : 'angle' },
      concurrency: heavy ? 1 : 2,
      cancelSignal,
      onProgress: ({ progress }) => {
        last = Date.now();
        onLog(`  ${output.split('/').pop()} ${Math.round(progress * 100)}%`);
      },
    });
  } catch (e) {
    if (stalled) throw new Error(`render stalled and was aborted after ${stallMs}ms: ${output}`);
    throw e;
  } finally {
    clearInterval(watch);
  }
}
