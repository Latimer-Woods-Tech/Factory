#!/usr/bin/env node
/**
 * sync-cloud.mjs — harvest finished cloud renders into the registry.
 * Scans recent successful render-video.yml runs, reads BRIEF_KEY + Stream uid from
 * each log, and marks the matching asset live (idempotent). Run repeatedly as a
 * batch completes.
 *   node scripts/video-registry/sync-cloud.mjs [--repo Latimer-Woods-Tech/Factory] [--limit 20]
 */
import { execSync } from 'node:child_process';
import { patchAssets } from './patch.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const REPO = arg('--repo', 'Latimer-Woods-Tech/Factory');
const LIMIT = Number(arg('--limit', '24'));
const STREAM = 'https://customer-op4b8eq1uv0ciwqy.cloudflarestream.com';
const now = () => new Date().toISOString();

const runs = JSON.parse(execSync(
  `gh run list --repo ${REPO} --workflow render-video.yml --status completed --limit ${LIMIT} --json databaseId,conclusion`,
  { encoding: 'utf8' },
)).filter((r) => r.conclusion === 'success');

const setLive = (uid) => (a) => {
  if (a.destination.streamUid === uid && a.build.status === 'live') return; // already synced
  a.destination.host = 'cloudflare-stream';
  a.destination.streamUid = uid;
  a.destination.publicUrl = `${STREAM}/${uid}/manifest/video.m3u8`;
  a.destination.posterUrl = `${STREAM}/${uid}/thumbnails/thumbnail.jpg`;
  a.build.status = 'live';
  a.build.renderedAt = now();
  a.build.renderedFingerprint = a.build.inputsFingerprint;
  a.quality.renderOk = true;
};

let synced = 0;
for (const r of runs) {
  let log;
  try { log = execSync(`gh run view ${r.databaseId} --repo ${REPO} --log`, { encoding: 'utf8', maxBuffer: 2e8 }); } catch { continue; }
  const bk = (log.match(/BRIEF_KEY:\s*([a-z0-9-]+)/i) || [])[1];
  const uid = (log.match(/Stream uid:\s*([a-f0-9]{24,})/i) || [])[1];
  if (!bk || !uid) continue;
  // a render produces one clip for the brief's primary (gift) variant; fall back to the single asset.
  let n = patchAssets(`${bk}--gift`, setLive(uid));
  if (!n) n = patchAssets(bk, setLive(uid));
  if (n) { synced += n; console.log(`  ✓ ${bk}  ←  ${uid}  (${n} asset)`); }
}
console.log(synced ? `\n✓ synced ${synced} asset(s) from cloud renders.` : 'no new completed renders to sync.');
