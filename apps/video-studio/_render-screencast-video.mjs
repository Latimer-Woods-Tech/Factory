import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(import.meta.dirname, 'captures', 'training-getting-started.mp4');

const entry = path.resolve(import.meta.dirname, 'src', 'Root.tsx');
console.log('bundling', entry);
const serveUrl = await bundle({ entryPoint: entry, webpackOverride: (c) => ({ ...c, cache: false }) });
const composition = await selectComposition({ serveUrl, id: 'TrainingScreencast', inputProps: {} });
console.log('rendering', composition.durationInFrames, 'frames @', composition.fps, 'fps');

await renderMedia({
  composition, serveUrl, inputProps: {},
  codec: 'h264',
  audioCodec: 'aac',
  outputLocation: OUT,
  browserExecutable: CHROME,
  timeoutInMilliseconds: 120000,
  chromiumOptions: { gl: 'swiftshader' }, // software raster — cannot GPU-deadlock (handoff §4.5)
  concurrency: 1,
  onProgress: ({ progress }) => process.stdout.write(`\rprogress ${Math.round(progress * 100)}%`),
});
console.log('\nVIDEO DONE →', OUT);
