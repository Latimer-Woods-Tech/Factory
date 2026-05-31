// ---------------------------------------------------------------------------
// server.ts — Cloud Run entrypoint for the render service.
//
// Reads secrets from the environment (injected by Cloud Run from GCP Secret
// Manager — never hard-coded), wires the production render pipeline into the
// Hono app, and serves it. Listens on $PORT (Cloud Run sets 8080).
// ---------------------------------------------------------------------------

import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import { createRenderPipeline } from './pipeline.js';

/**
 * @internal Read a required env var or throw a clear startup error.
 *
 * GCP Secret Manager values are sometimes stored with a leading UTF-8 BOM or a
 * trailing newline (Windows editors / `echo`). Read raw, those corrupt URLs and
 * headers — e.g. a BOM on `CF_ACCOUNT_ID` makes the Stream API path invalid and
 * `/copy` returns HTTP 400. Strip the leading BOM and trim, matching
 * `scripts/fetch_gcp_secrets.sh` (the documented BOM trap).
 */
function requireEnv(key: string): string {
  const raw = process.env[key];
  if (!raw) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const value = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim();
  if (!value) {
    throw new Error(`Environment variable is empty after trim: ${key}`);
  }
  return value;
}

const port = Number(process.env['PORT']) || 8080;

const pipeline = createRenderPipeline({
  video: {
    CF_ACCOUNT_ID: requireEnv('CF_ACCOUNT_ID'),
    CF_STREAM_TOKEN: requireEnv('CF_STREAM_TOKEN'),
  },
  r2: {
    accountId: requireEnv('R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requireEnv('R2_BUCKET_NAME'),
    publicDomain: requireEnv('R2_PUBLIC_DOMAIN'),
  },
});

const app = createApp({
  hmacSecret: requireEnv('VIDEO_RENDER_HMAC_SECRET'),
  pipeline,
});

serve({ fetch: app.fetch, port });
// Cloud Run captures stdout; announce readiness for log-based health visibility.
console.log(`[render] video-render-service listening on :${String(port)}`);
