// ---------------------------------------------------------------------------
// generate-background.mjs
//
// Generates a bespoke cinematic background for the EnergyBlueprintVideo, keyed
// to the forge theme, via Cloudflare Workers AI (FLUX-1-schnell), and caches it
// in R2. Mirrors generate-music.mjs: cache-by-key so each forge's background is
// generated once and reused (bounded cost), and emits the R2 public URL on
// stdout for the render step to pass as `backgroundUrl`.
//
// Why Cloudflare Workers AI (not Vertex Imagen): the GCP project is under an AI
// Platform billing/dunning hold (403), while CF Workers AI is on the same
// account the render already uses for Stream/R2 and is not gated.
//
// Inputs (env): FORGE_THEME, CF_ACCOUNT_ID, CF_API_TOKEN, R2_* (as music script)
//   [FORCE_REGENERATE=1] to bypass the cache.
// Output (stdout): the R2 public URL of the background JPEG.
// ---------------------------------------------------------------------------
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);
const env = (k, d = '') => process.env[k] ?? d;
const log = (...a) => process.stderr.write(`[generate-background] ${a.join(' ')}\n`);
const die = (m) => { process.stderr.write(`[generate-background][FATAL] ${m}\n`); process.exit(1); };

// Forge → cinematic visual prompt. Each forge gets a distinct premium look that
// matches its musical/atmospheric character (sibling of FORGE_DESCRIPTORS).
const FORGE_VISUAL = {
  lux:     'dark moody cinematic spiritual atmosphere, deep indigo and near-black space, a single soft shaft of warm golden light entering from the upper-left corner through faint haze, vast dark negative space across the centre and right, faint distant stars, deep shadows, restrained contemplative and premium, NO bright central sun, NO blown-out highlights',
  chronos: 'minimalist neoclassical cosmic environment, slow contemplative cool blue-grey nebula, faint concentric clockwork rings of light, restrained and spacious, deep stillness, subtle starfield',
  eros:    'warm romantic abstract environment, tender rose-gold light blooming through soft mist, lush flowing organic forms, intimate and enveloping, deep crimson and amber, gentle bokeh',
  aether:  'ethereal airy abstract environment, glassy shimmering pale silver-blue mist, floating crystalline light motes, celestial and weightless, high soft haze, faint distant stars',
  phoenix: 'epic cinematic abstract environment, embers and crimson-gold light rising through dark smoke, dramatic swelling glow, sense of rebirth and ascension, deep black and fire-orange',
  self:    'ambient cosmic deep-space environment, warm grounded starfield, soft golden core glow in vast intimate darkness, gentle nebula dust, calm and infinite',
};

const COMMON = 'premium film still, cinematic lighting, photographic depth, no text, no words, no letters, no people, no figures, abstract, atmospheric, 8k';

const FORGE_THEME = env('FORGE_THEME', 'self').toLowerCase();

if (!env('CF_ACCOUNT_ID')) die('CF_ACCOUNT_ID is not set');
if (!env('CF_API_TOKEN') && !env('CLOUDFLARE_API_TOKEN')) die('CF_API_TOKEN is not set');
if (!env('R2_ACCESS_KEY_ID')) die('R2_ACCESS_KEY_ID is not set');
if (!env('R2_BUCKET_NAME')) die('R2_BUCKET_NAME is not set');
if (!env('R2_PUBLIC_DOMAIN')) die('R2_PUBLIC_DOMAIN is not set');

process.env.AWS_ACCESS_KEY_ID = env('R2_ACCESS_KEY_ID');
process.env.AWS_SECRET_ACCESS_KEY = env('R2_SECRET_ACCESS_KEY');
process.env.AWS_DEFAULT_REGION = 'auto';

const ACCOUNT = env('CF_ACCOUNT_ID');
const TOKEN = env('CF_API_TOKEN') || env('CLOUDFLARE_API_TOKEN');
const R2_ENDPOINT = `https://${ACCOUNT}.r2.cloudflarestorage.com`;
const R2_PUBLIC_URL = `https://${env('R2_PUBLIC_DOMAIN')}`;
const CACHE_KEY = `backgrounds/forge/${FORGE_THEME}.jpg`;
const CACHE_URL = `${R2_PUBLIC_URL}/${CACHE_KEY}`;
const FORCE = env('FORCE_REGENERATE') === '1';

async function r2Exists(key) {
  try {
    await execFileP('aws', ['s3api', 'head-object', '--bucket', env('R2_BUCKET_NAME'), '--key', key, '--endpoint-url', R2_ENDPOINT], { env: { ...process.env } });
    return true;
  } catch { return false; }
}

async function r2Upload(localPath, key) {
  await execFileP('aws', ['s3', 'cp', localPath, `s3://${env('R2_BUCKET_NAME')}/${key}`, '--endpoint-url', R2_ENDPOINT, '--content-type', 'image/jpeg'], { env: { ...process.env } });
}

if (!FORCE && (await r2Exists(CACHE_KEY))) {
  log(`cache hit → ${CACHE_URL}`);
  process.stdout.write(CACHE_URL);
  process.exit(0);
}

const prompt = `${FORGE_VISUAL[FORGE_THEME] ?? FORGE_VISUAL.self}, ${COMMON}`;
log(`forge=${FORGE_THEME} cache miss — generating via CF Workers AI FLUX`);
log(`prompt: ${prompt.slice(0, 120)}…`);

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps: 8 }),
  },
).catch((e) => die(`FLUX request failed: ${e.message}`));

if (!res.ok) die(`FLUX returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
const json = await res.json();
const b64 = json?.result?.image;
if (typeof b64 !== 'string') die(`FLUX response had no image: ${JSON.stringify(json).slice(0, 200)}`);

const imageBytes = Buffer.from(b64, 'base64');
const tmpRoot = await mkdtemp(join(tmpdir(), 'video-studio-bg-'));
const tmp = join(tmpRoot, 'background.jpg');
await writeFile(tmp, imageBytes);
log(`generated ${Math.round(imageBytes.length / 1024)}KB → uploading to R2`);
try {
  await r2Upload(tmp, CACHE_KEY);
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}
log(`uploaded → ${CACHE_URL}`);
process.stdout.write(CACHE_URL);
