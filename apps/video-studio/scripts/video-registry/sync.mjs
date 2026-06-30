#!/usr/bin/env node
/**
 * sync.mjs — render-completion write-back. Stamps a finished render's output onto
 * the registry and marks it live. Call after render-video.yml produces a video.
 *
 *   node scripts/video-registry/sync.mjs <asset-id|brief-key> --stream <uid>
 *   node scripts/video-registry/sync.mjs getting-started-first-week --r2 training/getting-started.mp4
 *
 * Stamps renderedFingerprint = current inputsFingerprint, so the asset is "fresh"
 * until an input changes (then build.mjs flags it stale again).
 */
import { patchAssets } from './patch.mjs';

const args = process.argv.slice(2);
const match = args[0];
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const stream = get('--stream');
const r2 = get('--r2');
const job = get('--job');
const run = get('--run');
if (!match || (!stream && !r2)) {
  console.error('usage: sync.mjs <asset-id|brief-key> --stream <uid> | --r2 <key> [--job <id>] [--run <url>]');
  process.exit(1);
}

const STREAM = 'https://customer-op4b8eq1uv0ciwqy.cloudflarestream.com';
const R2 = 'https://pub-a39c3cff53fd406383c8ccbe9c1ddf02.r2.dev';
const now = new Date().toISOString();

const n = patchAssets(match, (a) => {
  if (stream) {
    a.destination.host = 'cloudflare-stream';
    a.destination.streamUid = stream;
    a.destination.publicUrl = `${STREAM}/${stream}/manifest/video.m3u8`;
    a.destination.posterUrl = `${STREAM}/${stream}/thumbnails/thumbnail.jpg`;
  } else if (r2) {
    a.destination.host = 'r2';
    a.destination.r2Key = r2;
    a.destination.publicUrl = `${R2}/${r2}`;
  }
  a.build.status = 'live';
  a.build.renderedAt = now;
  a.build.renderedFingerprint = a.build.inputsFingerprint; // baseline for future drift
  if (job) a.build.renderJobId = job;
  if (run) a.build.workflowRun = run;
  a.quality.renderOk = true;
});

console.log(n ? `✓ synced ${n} asset(s) for "${match}" → live` : `⚠ no asset matched "${match}"`);
