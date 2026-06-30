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
