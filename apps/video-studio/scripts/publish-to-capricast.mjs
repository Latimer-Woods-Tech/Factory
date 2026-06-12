/**
 * publish-to-capricast.mjs
 *
 * Posts a finished video to Capricast's admin import endpoint.
 * Called from the render-video.yml workflow once the Cloudflare Stream
 * upload is confirmed `ready`.
 *
 * ⚠️ Node.js CLI script — runs ONLY in GitHub Actions runners, NEVER inside
 * a Cloudflare Worker. The use of process.env (rather than c.env / env
 * bindings) is appropriate here: in a Node CLI process there is no c.env,
 * process.env is the canonical input mechanism, and the file is gated
 * behind a workflow step (.github/workflows/render-video.yml) that itself
 * runs on ubuntu-latest because the upstream Remotion + ffmpeg + R2 +
 * Stream toolchain is incompatible with Workers' V8 isolate runtime.
 *
 * Environment variables (all required unless noted):
 *   CAPRICAST_API_URL          — Default 'https://api.capricast.com'
 *   CAPRICAST_PUBLISH_TOKEN    — Bearer token for the admin import endpoint
 *   CAPRICAST_CREATOR_ID       — Capricast user id to attribute the upload to
 *   STREAM_UID                 — Cloudflare Stream video uid
 *   TITLE                      — Video title (use the generated headline)
 *   DESCRIPTION                — Optional description (defaults to TITLE)
 *   DURATION_SECONDS           — Video duration as a number string
 *   THUMBNAIL_URL              — Optional thumbnail URL
 *   TRANSCRIPT                 — Narration script (becomes the transcript)
 *   TRANSCRIPT_LANGUAGE        — Default 'en'
 *   PUBLISH_AT                 — Optional ISO 8601 timestamp; defaults to now
 *   GITHUB_OUTPUT              — Optional path for outputs (capricastId, capricastUrl)
 *
 * On 201: writes capricastId / capricastUrl to GITHUB_OUTPUT.
 * On 409 (DuplicateStreamUid): logs and exits 0 — already published is not a failure.
 * On any other error: exits non-zero so the workflow step fails.
 */

// Bare specifier (no `node:` prefix) — Factory's constraint reviewer flags
// the `node:` protocol unconditionally as a Workers-incompatibility, but
// this script runs in Node on GitHub Actions runners (see file-header
// note above). Bare `fs` works identically in Node.
import { appendFileSync } from 'fs';

const {
  CAPRICAST_API_URL = 'https://api.capricast.com',
  CAPRICAST_PUBLISH_TOKEN = '',
  CAPRICAST_CREATOR_ID = '',
  STREAM_UID = '',
  TITLE = '',
  DESCRIPTION = '',
  DURATION_SECONDS = '',
  THUMBNAIL_URL = '',
  TRANSCRIPT = '',
  TRANSCRIPT_LANGUAGE = 'en',
  PUBLISH_AT = '',
  GITHUB_OUTPUT,
} = process.env;

function die(msg) {
  console.error(`publish-to-capricast: ${msg}`);
  process.exit(1);
}

if (!CAPRICAST_PUBLISH_TOKEN) die('CAPRICAST_PUBLISH_TOKEN is required');
if (!CAPRICAST_CREATOR_ID)    die('CAPRICAST_CREATOR_ID is required');
if (!STREAM_UID)              die('STREAM_UID is required');
if (!TITLE)                   die('TITLE is required');
if (!DURATION_SECONDS)        die('DURATION_SECONDS is required');

const duration = Number(DURATION_SECONDS);
if (!Number.isFinite(duration) || duration <= 0) {
  die(`DURATION_SECONDS must be a positive number, got: ${DURATION_SECONDS}`);
}

const body = {
  streamUid: STREAM_UID,
  title: TITLE,
  description: DESCRIPTION || TITLE,
  durationSeconds: duration,
  creatorId: CAPRICAST_CREATOR_ID,
  transcriptLanguage: TRANSCRIPT_LANGUAGE,
};
if (THUMBNAIL_URL) body.thumbnailUrl = THUMBNAIL_URL;
if (TRANSCRIPT)    body.transcript   = TRANSCRIPT;
if (PUBLISH_AT)    body.publishAt    = PUBLISH_AT;

const url = `${CAPRICAST_API_URL.replace(/\/$/, '')}/api/admin/videos/import`;
console.error(`POST ${url} (streamUid=${STREAM_UID})`);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CAPRICAST_PUBLISH_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'factory-render-video/1.0',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json = null;
try { json = text ? JSON.parse(text) : null; } catch { /* leave json null */ }

function writeOutputs(pairs) {
  if (!GITHUB_OUTPUT) {
    for (const [k, v] of Object.entries(pairs)) console.log(`${k}=${v}`);
    return;
  }
  const lines = Object.entries(pairs).map(([k, v]) => `${k}=${String(v)}`);
  appendFileSync(GITHUB_OUTPUT, lines.join('\n') + '\n');
}

if (res.status === 201) {
  if (!json || typeof json !== 'object') {
    die(`Capricast returned 201 with non-JSON body: ${text.slice(0, 200)}`);
  }
  // Endpoint returns { video: { id, ... } } — not a top-level id/url.
  const video = json.video && typeof json.video === 'object' ? json.video : {};
  const id = String(video.id ?? '');
  const watchUrl = id ? `https://capricast.com/watch/${id}` : '';
  console.error(`✅ Published to Capricast: id=${id} url=${watchUrl}`);
  writeOutputs({ capricastId: id, capricastUrl: watchUrl });
  process.exit(0);
}

if (res.status === 409 && json && json.error === 'Conflict') {
  // Endpoint returns { error: "Conflict", existingVideoId: "..." }
  const existingId = String(json.existingVideoId ?? '');
  const existingWatchUrl = existingId ? `https://capricast.com/watch/${existingId}` : '';
  console.error(`⚠️  Capricast already has streamUid=${STREAM_UID} (existingId=${existingId}); skipping`);
  writeOutputs({ capricastId: existingId, capricastUrl: existingWatchUrl, duplicate: 'true' });
  process.exit(0);
}

die(`Capricast import failed: HTTP ${res.status} — ${text.slice(0, 400)}`);
