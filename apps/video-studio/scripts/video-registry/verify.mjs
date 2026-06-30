#!/usr/bin/env node
/**
 * verify.mjs — CI gate over the grand video registry. Read-only.
 * Run AFTER build.mjs (build computes drift -> status:'stale'). Fails (exit 1) on:
 *   - schema-ish integrity errors (missing id/fingerprint/duplicate ids)
 *   - stale assets (inputs changed since render) unless --allow-stale
 *   - live assets missing a destination url
 * Always prints the rebuild list so drift is actionable.
 *   node scripts/video-registry/verify.mjs [--allow-stale]
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(__dirname, '..', '..', 'registry', 'video-registry.json');
const allowStale = process.argv.includes('--allow-stale');
const { assets } = JSON.parse(readFileSync(REGISTRY, 'utf8'));

const STATUSES = new Set(['planned', 'brief', 'script', 'narrated', 'rendered', 'qa', 'published', 'live', 'stale', 'retired']);
const TRACKS = new Set(['cinematic', 'screencast']);
const errors = [];
const seen = new Set();
for (const a of assets) {
  if (!a.id) { errors.push('asset missing id'); continue; }
  if (seen.has(a.id)) errors.push(`duplicate id: ${a.id}`);
  seen.add(a.id);
  for (const k of ['source', 'build', 'destination', 'quality', 'meta']) if (!a[k]) errors.push(`${a.id}: missing ${k}`);
  if (!TRACKS.has(a.track)) errors.push(`${a.id}: bad track "${a.track}"`);
  if (!STATUSES.has(a.build?.status)) errors.push(`${a.id}: bad status "${a.build?.status}"`);
  if (!a.build?.inputsFingerprint) errors.push(`${a.id}: missing inputsFingerprint`);
  if (a.build?.status === 'live' && !a.destination?.publicUrl) errors.push(`${a.id}: live but no destination.publicUrl`);
  if (a.build?.status === 'live' && !a.build?.renderedFingerprint && !a.destination?.streamUid) errors.push(`${a.id}: live but no renderedFingerprint`);
}

const stale = assets.filter((a) => a.build.status === 'stale');
if (stale.length) {
  console.log(`\n⚠ ${stale.length} stale assets (inputs changed since render):`);
  for (const a of stale) console.log(`   ${a.id.padEnd(34)} → ${a.build.rebuildCommand}`);
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} integrity errors:`);
  errors.slice(0, 30).forEach((e) => console.error('   ' + e));
  process.exit(1);
}
if (stale.length && !allowStale) {
  console.error(`\n✗ ${stale.length} stale assets need rebuild (pass --allow-stale to permit).`);
  process.exit(1);
}
console.log(`✓ registry verify clean — ${assets.length} assets, ${assets.filter((a) => a.build.status === 'live').length} live, ${stale.length} stale.`);
