import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(import.meta.dirname, 'captures');

const entry = path.resolve(import.meta.dirname, 'src', 'Root.tsx');
console.log('bundling', entry);
const serveUrl = await bundle({
  entryPoint: entry,
  webpackOverride: (c) => ({ ...c, cache: false }),
});
console.log('bundled →', serveUrl);

const composition = await selectComposition({ serveUrl, id: 'TrainingScreencast', inputProps: {} });
console.log('composition', composition.durationInFrames, 'frames @', composition.fps, 'fps');

for (const frame of [20, 130, 235, 320]) {
  await renderStill({
    composition, serveUrl, frame, inputProps: {},
    output: `${OUT}/still-${frame}.png`,
    browserExecutable: CHROME,
    timeoutInMilliseconds: 120000,
    chromiumOptions: { gl: 'angle' },
  });
  console.log('rendered frame', frame);
}
console.log('ALL STILLS DONE');
