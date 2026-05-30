/**
 * post-render-artifacts.mjs
 *
 * Records the outputs of a successful video render in the Factory admin
 * read-layer by POSTing one `factory_artifacts` row per artifact to
 * factory-core-api's `POST /v1/artifacts` ingest endpoint.
 *
 * Called from render-video.yml AFTER the render + upload + Capricast publish
 * have all succeeded — so an artifact row only ever describes a video that
 * genuinely exists. Admin Build Plan P1.7 (Phase A walking skeleton).
 *
 * ⚠️ Node.js CLI script — runs ONLY in GitHub Actions runners, NEVER inside a
 * Cloudflare Worker. Using process.env (rather than c.env / env bindings) is
 * appropriate: in a Node CLI process there is no c.env, process.env is the
 * canonical input mechanism, and the file is gated behind a workflow step
 * (.github/workflows/render-video.yml) that itself runs on ubuntu-latest
 * because the upstream Remotion + ffmpeg + R2 + Stream toolchain is
 * incompatible with the Workers V8 isolate runtime.
 *
 * Auth (Case 1 — no factory-core-api change needed). The render workflow has
 * GitHub OIDC (`id-token: write`), so it mints a scoped JWT exactly like the
 * constraints gate (_app-constraints-gate.yml): exchange the OIDC token at
 * `/v1/auth/token` for `{ "audience": "artifacts-video" }`, then send the
 * resulting JWT as `Authorization: Bearer <jwt>` to `/v1/artifacts`. The
 * endpoint accepts any `aud` beginning with `artifacts-`.
 *
 * Best-effort by design. The render is already a success by the time this
 * runs; a read-layer write failure must NOT fail the render job. This script
 * logs loudly and surfaces every non-2xx, but always exits 0. The workflow
 * step additionally sets `continue-on-error: true` as a second safety net.
 *
 * Idempotency. Each artifact carries a stable `source_event_id` of
 * `render-<JOB_ID>-<artifact_type>`, so a retried workflow run dedupes
 * server-side (the endpoint returns the original event with HTTP 200 instead
 * of inserting a duplicate).
 *
 * Environment variables (all required unless noted):
 *   FACTORY_CORE_API_URL              — factory-core-api base URL. If unset, the
 *                                       script logs a notice and exits 0 (the
 *                                       ingest path is simply skipped).
 *   ACTIONS_ID_TOKEN_REQUEST_TOKEN    — GitHub OIDC request token (auto-set when
 *                                       the job has `id-token: write`).
 *   ACTIONS_ID_TOKEN_REQUEST_URL      — GitHub OIDC request URL (auto-set).
 *   JOB_ID                            — schedule-worker job id (idempotency key seed).
 *   APP_ID                            — Factory application id (e.g. prime_self).
 *   STREAM_UID                        — Cloudflare Stream video uid.
 *   GITHUB_REPOSITORY                 — owner/name (auto-set by Actions).
 *   RUN_URL                           — workflow run URL (artifact producer_ref).
 *   VIDEO_URL          (optional)     — R2 public URL of the final MP4.
 *   NARRATION_URL      (optional)     — R2 public URL of the narration MP3.
 *   THUMBNAIL_URL      (optional)     — Cloudflare Stream thumbnail URL.
 *   TRANSCRIPT         (optional)     — narration text (recorded as a data: URI).
 *   DURATION_SECONDS   (optional)     — video/audio duration in seconds.
 */

const {
  FACTORY_CORE_API_URL = '',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN = '',
  ACTIONS_ID_TOKEN_REQUEST_URL = '',
  JOB_ID = '',
  APP_ID = '',
  STREAM_UID = '',
  GITHUB_REPOSITORY = '',
  RUN_URL = '',
  VIDEO_URL = '',
  NARRATION_URL = '',
  THUMBNAIL_URL = '',
  TRANSCRIPT = '',
  DURATION_SECONDS = '',
} = process.env;

const TAG = 'post-render-artifacts';

/** Logs a warning to stderr; never throws, never exits non-zero. */
function warn(msg) {
  console.error(`::warning::${TAG}: ${msg}`);
}

/** Logs an informational notice. */
function notice(msg) {
  console.error(`${TAG}: ${msg}`);
}

// The render already succeeded; an unconfigured read-layer endpoint just means
// "skip the catalog write". Exit cleanly so the render job stays green.
if (!FACTORY_CORE_API_URL) {
  notice('FACTORY_CORE_API_URL not set — skipping factory_artifacts ingest.');
  process.exit(0);
}
if (!ACTIONS_ID_TOKEN_REQUEST_TOKEN || !ACTIONS_ID_TOKEN_REQUEST_URL) {
  warn('GitHub OIDC token request env not present (need id-token: write) — skipping ingest.');
  process.exit(0);
}
if (!JOB_ID) {
  warn('JOB_ID not set — cannot derive a stable source_event_id; skipping ingest.');
  process.exit(0);
}

const apiBase = FACTORY_CORE_API_URL.replace(/\/$/, '');
const observedAt = new Date().toISOString();
const durationSeconds = Number(DURATION_SECONDS);
const durationMs =
  Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.round(durationSeconds * 1000)
    : undefined;

/** Exchanges the GitHub OIDC token for a scoped JWT (`aud: artifacts-video`). */
async function mintScopedToken() {
  const oidcRes = await fetch(`${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=factory-core-api`, {
    headers: { Authorization: `bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  });
  if (!oidcRes.ok) {
    throw new Error(`OIDC token request returned HTTP ${oidcRes.status}`);
  }
  const oidcJson = await oidcRes.json();
  const oidcToken = oidcJson?.value;
  if (!oidcToken || typeof oidcToken !== 'string') {
    throw new Error('OIDC token response missing "value"');
  }

  const scopedRes = await fetch(`${apiBase}/v1/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${oidcToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience: 'artifacts-video' }),
  });
  const scopedText = await scopedRes.text();
  if (!scopedRes.ok) {
    throw new Error(`/v1/auth/token returned HTTP ${scopedRes.status} — ${scopedText.slice(0, 300)}`);
  }
  let scopedJson = null;
  try {
    scopedJson = scopedText ? JSON.parse(scopedText) : null;
  } catch {
    throw new Error(`/v1/auth/token returned non-JSON body: ${scopedText.slice(0, 200)}`);
  }
  const token = scopedJson?.token;
  if (!token || typeof token !== 'string') {
    throw new Error('/v1/auth/token response missing "token"');
  }
  return token;
}

/**
 * POSTs a single artifact row. Returns true on a 2xx, false otherwise.
 * Never throws — failures are logged and reported to the caller.
 */
async function postArtifact(jwt, artifact) {
  const sourceEventId = `render-${JOB_ID}-${artifact.artifact_type}`;
  const body = {
    artifact_type: artifact.artifact_type,
    producer_type: 'video-pipeline',
    producer_ref: RUN_URL || `job:${JOB_ID}`,
    source_event_id: sourceEventId,
    uri: artifact.uri,
    observed_at: observedAt,
    metadata: { job_id: JOB_ID, stream_uid: STREAM_UID, app_id: APP_ID },
  };
  if (APP_ID) body.subject_app = APP_ID;
  if (GITHUB_REPOSITORY) body.subject_repo = GITHUB_REPOSITORY;
  if (STREAM_UID) body.subject_ref = STREAM_UID;
  if (artifact.mime_type) body.mime_type = artifact.mime_type;
  if (artifact.duration_ms !== undefined) body.duration_ms = artifact.duration_ms;

  let res;
  try {
    res = await fetch(`${apiBase}/v1/artifacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'User-Agent': 'factory-render-video/1.0',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    warn(`${artifact.artifact_type}: request failed — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  if (res.status >= 200 && res.status < 300) {
    notice(`✓ ${artifact.artifact_type} recorded (HTTP ${res.status}, source_event_id=${sourceEventId})`);
    return true;
  }
  const text = await res.text().catch(() => '');
  warn(`${artifact.artifact_type}: ingest returned HTTP ${res.status} — ${text.slice(0, 300)}`);
  return false;
}

// Build the artifact list from whichever outputs the render produced. Each is
// optional so a partial pipeline still records what it has.
const artifacts = [];
if (VIDEO_URL) {
  artifacts.push({ artifact_type: 'video', uri: VIDEO_URL, mime_type: 'video/mp4', duration_ms: durationMs });
}
if (NARRATION_URL) {
  artifacts.push({ artifact_type: 'audio', uri: NARRATION_URL, mime_type: 'audio/mpeg', duration_ms: durationMs });
}
if (THUMBNAIL_URL) {
  artifacts.push({ artifact_type: 'thumbnail', uri: THUMBNAIL_URL, mime_type: 'image/jpeg' });
}
if (TRANSCRIPT) {
  // Transcript text is recorded inline as a data: URI (small; passes the
  // endpoint's URI-scheme check). The transcript also lives on the Capricast
  // watch page; this row just makes it discoverable from the read layer.
  const encoded = encodeURIComponent(TRANSCRIPT);
  artifacts.push({ artifact_type: 'transcript', uri: `data:text/plain,${encoded}`, mime_type: 'text/plain' });
}

if (artifacts.length === 0) {
  warn('No artifact URLs present in the environment — nothing to record.');
  process.exit(0);
}

let jwt;
try {
  jwt = await mintScopedToken();
} catch (err) {
  warn(`could not mint scoped JWT — skipping ingest: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
}

let recorded = 0;
for (const artifact of artifacts) {
  const ok = await postArtifact(jwt, artifact);
  if (ok) recorded += 1;
}

notice(`recorded ${recorded}/${artifacts.length} artifact(s) for job ${JOB_ID}.`);
// Best-effort: always exit 0 so a read-layer hiccup never fails the render.
process.exit(0);
