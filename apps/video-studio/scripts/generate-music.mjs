#!/usr/bin/env node
// ---------------------------------------------------------------------------
// generate-music.mjs — ElevenLabs Music generation with R2 caching.
//
// Generates a 90-second instrumental music bed keyed to a musical mode (from
// the Atom Registry) and an optional forge atmosphere. Checks R2 first — if
// a track already exists for this mode it returns the cached URL immediately
// (no API call). Only generates when the cache is cold.
//
// Inputs (env):
//   ELEVENLABS_API_KEY   — ElevenLabs API key
//   MUSICAL_MODE         — Lydian | Dorian | Phrygian | ... (from atom-registry)
//   FORGE_THEME          — chronos | eros | aether | lux | phoenix | self
//   CF_ACCOUNT_ID        — Cloudflare account id (for R2 endpoint)
//   R2_ACCESS_KEY_ID     — R2 S3-compat access key
//   R2_SECRET_ACCESS_KEY — R2 S3-compat secret
//   R2_BUCKET_NAME       — R2 bucket
//   R2_PUBLIC_DOMAIN     — public R2 domain (pub-xxx.r2.dev)
//   MUSIC_DURATION_S     — (optional) track length in seconds, default 90
//   FORCE_REGENERATE     — (optional) set to "1" to bypass cache
//
// Output: prints the R2 public URL to stdout (no trailing newline).
// Exit 0 on success, non-zero on failure.
// ---------------------------------------------------------------------------

import { createWriteStream } from 'node:fs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// ── Mode → prompt descriptor ───────────────────────────────────────────────
// Matches MODE_DESCRIPTORS in atom-registry.ts (kept in sync manually —
// this script runs in Node.js, the package is built separately).

const MODE_DESCRIPTORS = {
  Lydian:     'Lydian mode, dreamy and otherworldly, raised fourth gives a floating quality, airy and celestial, wonder and inspiration',
  Ionian:     'major scale, bright and clear, uplifting confidence, radiant and manifesting, directional warmth',
  Mixolydian: 'Mixolydian mode, bluesy and powerful, major with a flattened seventh, soulful and driving willpower',
  Dorian:     'Dorian mode, earthy and soulful, minor with a raised sixth, rolling and grounded, sustaining life-force',
  Phrygian:   'Phrygian mode, dark and instinctual, ancient and primal, tense but alive, visceral immunity',
  Aeolian:    'natural minor scale, melancholic and introspective, emotional depth, wave-like and yearning',
  Locrian:    'Locrian mode, dissonant and pressured, tense grounding force, primal urgency, earthbound drive',
  Pentatonic: 'pentatonic scale, universal and open, timeless and unadorned, clean resonance, pure will',
};

// Forge → atmospheric color for the music prompt
const FORGE_ATMOSPHERE = {
  chronos: 'minimalist neoclassical, contemplative piano and strings, slow clockwork pulse, restrained and spacious',
  eros:    'warm romantic ambient, solo cello and soft strings, tender and intimate, lush reverb',
  aether:  'ethereal ambient, airy shimmering pads, glassy bell textures, floating drone with subtle movement',
  lux:     'luminous cinematic ambient, slowly rising warm strings, soft glockenspiel, hopeful and radiant',
  phoenix: 'epic cinematic underscore, swelling strings and low brass, slow crescendo, sense of rebirth',
  self:    'ambient cinematic underscore, warm analog synth pad, intimate and grounded, gentle felt piano',
};

const UNDERSCORE_CONSTRAINTS =
  'instrumental only, no vocals, no lead melody, no four-on-the-floor drums, ' +
  'low to mid energy, designed to sit under spoken narration at -18 to -22 dB, ' +
  'slow evolution, loopable, cinematic underscore for voiceover';

// ── Helpers ────────────────────────────────────────────────────────────────

function env(key, fallback = '') {
  return process.env[key] ?? fallback;
}

function log(...args) {
  process.stderr.write(`[generate-music] ${args.join(' ')}\n`);
}

function die(msg) {
  process.stderr.write(`[generate-music][FATAL] ${msg}\n`);
  process.exit(1);
}

// Check R2 for a cached track using aws s3 head-object (returns exit 0 if exists).
async function r2Exists(key, endpoint) {
  try {
    await execFileP('aws', [
      's3api', 'head-object',
      '--bucket', env('R2_BUCKET_NAME'),
      '--key', key,
      '--endpoint-url', endpoint,
    ], { env: { ...process.env } });
    return true;
  } catch {
    return false;
  }
}

async function r2Upload(localPath, key, endpoint) {
  await execFileP('aws', [
    's3', 'cp', localPath,
    `s3://${env('R2_BUCKET_NAME')}/${key}`,
    '--endpoint-url', endpoint,
    '--content-type', 'audio/mpeg',
  ], { env: { ...process.env } });
}

// ── Gate → center → mode (mirrors GATE_TO_CENTER + CENTER_TO_MUSICAL_MODE) ─
// Kept in sync with atom-registry.ts; duplicated here so this script runs in
// Node.js without building the bodygraph package first.

const CENTER_GATES = {
  Head:        [61, 63, 64],
  Ajna:        [4, 11, 17, 24, 43, 47],
  Throat:      [8, 12, 16, 20, 23, 31, 33, 35, 45, 56, 62],
  G:           [1, 2, 7, 10, 13, 15, 25, 46],
  Heart:       [21, 26, 40, 51],
  SolarPlexus: [6, 22, 30, 36, 37, 49, 55],
  Sacral:      [3, 5, 9, 14, 27, 29, 34, 42, 59],
  Spleen:      [18, 28, 32, 44, 48, 50, 57],
  Root:        [19, 38, 39, 41, 52, 53, 54, 58, 60],
};

const CENTER_TO_MODE = {
  Head: 'Lydian', Ajna: 'Lydian', Throat: 'Ionian', G: 'Ionian',
  Heart: 'Mixolydian', Sacral: 'Dorian', Spleen: 'Phrygian',
  SolarPlexus: 'Aeolian', Root: 'Locrian',
};

function modeFromGates(gatesJson) {
  let gates = [];
  try { gates = JSON.parse(gatesJson || '[]'); } catch { return 'Ionian'; }
  if (!Array.isArray(gates) || gates.length === 0) return 'Ionian';
  for (const [center, list] of Object.entries(CENTER_GATES)) {
    if (list.includes(Number(gates[0]))) return CENTER_TO_MODE[center] ?? 'Ionian';
  }
  return 'Ionian';
}

// ── Main ───────────────────────────────────────────────────────────────────

const ELEVENLABS_API_KEY = env('ELEVENLABS_API_KEY');
// MUSICAL_MODE can be set explicitly, or derived from SIGNATURE_GATES.
const MUSICAL_MODE = env('MUSICAL_MODE') || modeFromGates(env('SIGNATURE_GATES', '[]'));
const FORGE_THEME  = env('FORGE_THEME', 'self');
const DURATION_S         = Math.max(30, Math.min(600, Number(env('MUSIC_DURATION_S', '90'))));
const FORCE              = env('FORCE_REGENERATE') === '1';

if (!ELEVENLABS_API_KEY) die('ELEVENLABS_API_KEY is not set');
if (!env('CF_ACCOUNT_ID')) die('CF_ACCOUNT_ID is not set');
if (!env('R2_ACCESS_KEY_ID')) die('R2_ACCESS_KEY_ID is not set');
if (!env('R2_BUCKET_NAME')) die('R2_BUCKET_NAME is not set');
if (!env('R2_PUBLIC_DOMAIN')) die('R2_PUBLIC_DOMAIN is not set');

// Set S3-compat creds for aws cli
process.env.AWS_ACCESS_KEY_ID     = env('R2_ACCESS_KEY_ID');
process.env.AWS_SECRET_ACCESS_KEY = env('R2_SECRET_ACCESS_KEY');
process.env.AWS_DEFAULT_REGION    = 'auto';

const R2_ENDPOINT    = `https://${env('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
const R2_PUBLIC_URL  = `https://${env('R2_PUBLIC_DOMAIN')}`;
const CACHE_KEY      = `sybil-music/modes/${MUSICAL_MODE.toLowerCase()}.mp3`;
const CACHE_URL      = `${R2_PUBLIC_URL}/${CACHE_KEY}`;

// Check cache first
if (!FORCE) {
  log(`checking R2 cache: ${CACHE_KEY}`);
  const exists = await r2Exists(CACHE_KEY, R2_ENDPOINT);
  if (exists) {
    log(`cache hit → ${CACHE_URL}`);
    process.stdout.write(CACHE_URL);
    process.exit(0);
  }
  log('cache miss — generating via ElevenLabs Music API');
}

// Build the prompt: modal character + forge atmosphere + underscore constraints
const modeDesc  = MODE_DESCRIPTORS[MUSICAL_MODE] ?? MODE_DESCRIPTORS.Ionian;
const atmoDesc  = FORGE_ATMOSPHERE[FORGE_THEME]  ?? FORGE_ATMOSPHERE.self;
const prompt    = `${atmoDesc}, ${modeDesc}, ${UNDERSCORE_CONSTRAINTS}`;

log(`mode=${MUSICAL_MODE} forge=${FORGE_THEME} duration=${DURATION_S}s`);
log(`prompt: ${prompt.slice(0, 120)}…`);

// Call ElevenLabs Music API
// POST /v1/music — body: { prompt, music_length_ms, model_id }
// Response: audio/mpeg bytes streamed directly.
const body = JSON.stringify({
  prompt,
  music_length_ms: DURATION_S * 1000,
  model_id: 'music_v2',
  output_format: 'mp3_44100_128',
});

const resp = await fetch('https://api.elevenlabs.io/v1/music', {
  method: 'POST',
  headers: {
    'xi-api-key':   ELEVENLABS_API_KEY,
    'content-type': 'application/json',
    'accept':       'audio/mpeg',
  },
  body,
});

if (!resp.ok) {
  const text = await resp.text().catch(() => '');
  die(`ElevenLabs Music API returned HTTP ${resp.status}: ${text.slice(0, 300)}`);
}

// Stream response to a temp file, then upload to R2
const tmpPath = `/tmp/music-${MUSICAL_MODE.toLowerCase()}-${Date.now()}.mp3`;
log(`streaming audio → ${tmpPath}`);

const fileStream = createWriteStream(tmpPath);
await pipeline(Readable.fromWeb(resp.body), fileStream);

// Verify minimum file size (a valid 30s MP3 is at least ~100 KB at 128kbps)
const { size } = await import('node:fs').then(m => m.promises.stat(tmpPath));
if (size < 50_000) {
  await unlink(tmpPath).catch(() => {});
  die(`Generated file too small (${size} bytes) — API may have returned an error as audio`);
}

log(`uploading ${size} bytes → R2 ${CACHE_KEY}`);
await r2Upload(tmpPath, CACHE_KEY, R2_ENDPOINT);
await unlink(tmpPath).catch(() => {});

log(`✅ cached → ${CACHE_URL}`);
process.stdout.write(CACHE_URL);
