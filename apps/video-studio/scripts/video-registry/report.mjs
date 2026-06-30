#!/usr/bin/env node
/**
 * report.mjs — coverage dashboard over the grand video registry.
 * Read-only. Shows where videos exist, where the holes are, and what's buried.
 *   node scripts/video-registry/report.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(__dirname, '..', '..', 'registry', 'video-registry.json');
const { assets, generatedAt } = JSON.parse(readFileSync(REGISTRY, 'utf8'));

const count = (arr, key) => arr.reduce((m, a) => ((m[key(a)] = (m[key(a)] || 0) + 1), m), {});
const pct = (n, d) => d ? `${Math.round((n / d) * 100)}%` : '—';
const live = assets.filter((a) => a.build.status === 'live');

console.log(`\nGRAND VIDEO REGISTRY — ${assets.length} assets · generated ${generatedAt}\n`);

console.log('By status:', JSON.stringify(count(assets, (a) => a.build.status)));
console.log('By track: ', JSON.stringify(count(assets, (a) => a.track)));

console.log('\nCoverage by family (live / total):');
const fams = [...new Set(assets.map((a) => a.family))].sort();
for (const f of fams) {
  const fa = assets.filter((a) => a.family === f);
  const l = fa.filter((a) => a.build.status === 'live').length;
  const st = fa.filter((a) => a.build.status === 'stale').length;
  console.log(`  ${f.padEnd(26)} ${String(l).padStart(3)}/${String(fa.length).padEnd(4)} ${pct(l, fa.length).padStart(4)}${st ? `   ⚠ ${st} stale` : ''}`);
}

const holes = {
  stale: assets.filter((a) => a.build.status === 'stale'),
  liveNoSurface: live.filter((a) => !(a.destination.surfaces || []).length),
  liveNoVerify: live.filter((a) => a.quality.verifiedHttp == null),
  renderedNoQuality: assets.filter((a) => ['rendered', 'live'].includes(a.build.status) && a.quality.renderOk == null),
};
console.log('\nHoles:');
console.log(`  stale (need rebuild):          ${holes.stale.length}`);
console.log(`  live but NOT surfaced in app:  ${holes.liveNoSurface.length}  ← discoverability gap`);
console.log(`  live but never curl-verified:  ${holes.liveNoVerify.length}`);
console.log(`  rendered but unscored quality: ${holes.renderedNoQuality.length}`);

if (holes.stale.length) {
  console.log('\nRebuild list:');
  for (const a of holes.stale.slice(0, 20)) console.log(`  ${a.id.padEnd(34)} ${a.build.rebuildCommand}`);
}
console.log('');
