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
import {
  FORGE_DESCRIPTORS,
  MODE_DESCRIPTORS,
  modeForGates,
} from '@latimer-woods-tech/bodygraph';

const execFileP = promisify(execFile);

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

function signatureGatesFromJson(gatesJson) {
  let gates = [];
  try { gates = JSON.parse(gatesJson || '[]'); } catch { return []; }
  if (!Array.isArray(gates)) return [];
  return gates.map((gate) => Number(gate)).filter((gate) => Number.isInteger(gate));
}

// ── Main ───────────────────────────────────────────────────────────────────

const ELEVENLABS_API_KEY = env('ELEVENLABS_API_KEY');
// MUSICAL_MODE can be set explicitly, or derived from SIGNATURE_GATES.
const MUSICAL_MODE = env('MUSICAL_MODE') || modeForGates(signatureGatesFromJson(env('SIGNATURE_GATES', '[]')));
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
const atmoDesc  = FORGE_DESCRIPTORS[FORGE_THEME] ?? FORGE_DESCRIPTORS.self;
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
