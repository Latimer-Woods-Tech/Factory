#!/usr/bin/env node
/**
 * gen-manifest.mjs — generate client/data/video-manifest.js FROM the registry.
 * The app's gate-video manifest becomes a projection of the grand matrix, so the
 * tracker and the app can never drift. Writes to --out, else a local preview.
 *   node scripts/video-registry/gen-manifest.mjs --out "/path/to/client/data/video-manifest.js"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(__dirname, '..', '..', 'registry', 'video-registry.json');
const args = process.argv.slice(2);
const outArg = (() => { const i = args.indexOf('--out'); return i >= 0 ? args[i + 1] : null; })();
const out = outArg ? resolve(outArg) : join(resolve(__dirname, '..', '..'), 'registry', 'video-manifest.generated.js');

const { assets } = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const STREAM = 'https://customer-op4b8eq1uv0ciwqy.cloudflarestream.com';

// Serialize to single-quoted JS literal with trailing commas (HumanDesign ESLint style).
function toSingleQuotedJs(value, depth = 0) {
  const pad = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map((v) => `${inner}${toSingleQuotedJs(v, depth + 1)},`);
    return `[\n${items.join('\n')}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  const lines = entries.map(([k, v]) => `${inner}'${k}': ${toSingleQuotedJs(v, depth + 1)},`);
  return `{\n${lines.join('\n')}\n${pad}}`;
}

// Canonical pick-a-pile variant display (same across all gates).
const VARIANT = {
  gift:     { label: '✦ Gift',     prompt: 'Does this land? Drop a ✦ if this is you.' },
  shadow:   { label: '◈ Shadow',   prompt: 'Caught yourself here before? Tell me where.' },
  practice: { label: '◉ Practice', prompt: 'Try it today. Come back and tell me what shifted.' },
  mirror:   { label: '◎ Mirror',   prompt: 'Who in your life does this explain? Tag the feeling.' },
};
const ORDER = ['gift', 'shadow', 'practice', 'mirror'];

const byGate = {};
for (const a of assets) {
  const m = /^gate-concept-(\d+)$/.exec(a.briefKey);
  if (!m) continue;
  const n = Number(m[1]);
  (byGate[n] ||= {})[a.variant || 'gift'] = a;
}

const GATE_VIDEOS = {};
for (let n = 1; n <= 64; n++) {
  const g = byGate[n];
  if (!g) continue;
  const gift = g.gift;
  GATE_VIDEOS[n] = {
    streamUid: gift?.destination?.streamUid || null,
    forge: gift?.source?.forge || null,
    variants: ORDER.map((v) => ({
      id: v,
      label: VARIANT[v].label,
      streamUid: g[v]?.destination?.streamUid || null,
      prompt: VARIANT[v].prompt,
      ...(g[v]?.destination?.streamUid ? { active: true } : {}),
    })),
    participationPrompt: VARIANT.gift.prompt,
  };
}

const body = `/**
 * client/data/video-manifest.js
 * GENERATED from apps/video-studio/registry/video-registry.json — do not edit by hand.
 * Regenerate: node scripts/video-registry/gen-manifest.mjs --out <this file>
 */

export const GATE_VIDEOS = ${JSON.stringify(GATE_VIDEOS, null, 2)};

/**
 * @param {number|string} gateNum
 * @returns {{ streamUid: string|null, forge: string|null, variants: Array, participationPrompt: string }|null}
 */
export function getGateVideo(gateNum) {
  return GATE_VIDEOS[parseInt(gateNum, 10)] || null;
}
`;

writeFileSync(out, body);
const liveGates = Object.values(GATE_VIDEOS).filter((g) => g.streamUid).length;
console.log(`✓ generated video-manifest.js (${Object.keys(GATE_VIDEOS).length} gates, ${liveGates} with live streamUid) → ${out}`);
if (!outArg) console.log('  (preview only — pass --out <client/data/video-manifest.js> to replace the live file)');

// ── Generic resolver: every LIVE asset by id, for curriculum sourceRefs ({kind:'video', id}) ──
const assetsOutArg = (() => { const i = args.indexOf('--assets-out'); return i >= 0 ? args[i + 1] : null; })();
const assetsOut = assetsOutArg ? resolve(assetsOutArg) : join(resolve(__dirname, '..', '..'), 'registry', 'video-assets.generated.js');
const VIDEO_ASSETS = {};
for (const a of assets) {
  if (a.build.status !== 'live') continue;
  VIDEO_ASSETS[a.id] = {
    title: a.element,
    discipline: a.discipline,
    family: a.family,
    forge: a.source?.forge || null,
    host: a.destination.host,
    streamUid: a.destination.streamUid || null,
    r2Url: a.destination.host === 'r2' ? a.destination.publicUrl : null,
    hls: a.destination.streamUid ? `${STREAM}/${a.destination.streamUid}/manifest/video.m3u8` : null,
    posterUrl: a.destination.posterUrl || null,
  };
}
const assetsBody = `/**
 * client/data/video-assets.js
 * GENERATED from apps/video-studio/registry/video-registry.json — do not edit by hand.
 * Resolves a curriculum video sourceRef ({ kind: 'video', id }) to a playable asset.
 * Regenerate: node scripts/video-registry/gen-manifest.mjs --assets-out <this file>
 */

export const VIDEO_ASSETS = ${toSingleQuotedJs(VIDEO_ASSETS)};

/** @param {string} id  asset id, e.g. 'center-concept-g--gift' */
export function getVideoAsset(id) {
  return VIDEO_ASSETS[id] || null;
}
`;
writeFileSync(assetsOut, assetsBody);
console.log(`✓ generated video-assets.js (${Object.keys(VIDEO_ASSETS).length} live assets) → ${assetsOut}`);
