#!/usr/bin/env node
/**
 * plan.mjs — the production cockpit. Turns the registry into an actionable queue:
 * what to render next (by priority), what's stale (rebuild), and what's live but
 * buried (surface). Emits ready-to-run commands.
 *   node scripts/video-registry/plan.mjs [--limit 20] [--family hd-centers]
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(__dirname, '..', '..', 'registry', 'video-registry.json');
const args = process.argv.slice(2);
const limit = Number((args[args.indexOf('--limit') + 1]) || 20);
const familyFilter = args.includes('--family') ? args[args.indexOf('--family') + 1] : null;
const { assets } = JSON.parse(readFileSync(REGISTRY, 'utf8'));

const pool = familyFilter ? assets.filter((a) => a.family === familyFilter) : assets;

// 1. Render queue — unrendered, by priority then family. Dedup by briefKey (one
//    render-brief produces the brief's primary asset).
const todo = pool.filter((a) => a.build.status === 'brief')
  .sort((a, b) => (a.priority - b.priority) || a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
const briefKeys = [...new Set(todo.map((a) => a.briefKey))];

console.log(`\n▶ RENDER QUEUE — ${todo.length} unrendered assets across ${briefKeys.length} briefs\n`);
console.log(`Next ${Math.min(limit, briefKeys.length)} briefs to render (highest priority first):`);
for (const bk of briefKeys.slice(0, limit)) {
  const a = todo.find((x) => x.briefKey === bk);
  console.log(`  P${a.priority} ${a.family.padEnd(22)} ${bk.padEnd(28)} node scripts/render-brief.mjs ${bk}`);
}

// 2. Stale — rebuild
const stale = pool.filter((a) => a.build.status === 'stale');
if (stale.length) {
  console.log(`\n⚠ REBUILD (inputs changed since render) — ${stale.length}:`);
  for (const a of stale.slice(0, limit)) console.log(`  ${a.id.padEnd(34)} ${a.build.rebuildCommand}`);
}

// 3. Live but buried / unsurfaced — surface
const buried = pool.filter((a) => a.build.status === 'live' && (a.destination.surfaces || []).every((s) => (s.depth || 0) >= 3));
const unsurfaced = pool.filter((a) => a.build.status === 'live' && !(a.destination.surfaces || []).length);
console.log(`\n◆ SURFACING — ${unsurfaced.length} live with no surface · ${buried.length} live but buried (depth>=3 taps)`);

// 4. Batch command for the top priority family
const topFamily = briefKeys.length ? todo[0].family : null;
if (topFamily) {
  const fam = [...new Set(todo.filter((a) => a.family === topFamily).map((a) => a.briefKey))];
  console.log(`\n⌁ BATCH the next family (${topFamily}, ${fam.length} briefs):`);
  console.log('  ' + fam.map((bk) => `render-brief.mjs ${bk}`).join('  &&  node scripts/'));
}
console.log('');
