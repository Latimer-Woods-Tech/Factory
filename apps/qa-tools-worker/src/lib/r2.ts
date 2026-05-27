/**
 * R2 storage helpers for qa-tools-worker.
 *
 * Handles screenshot upload (base64 PNG → R2) and presigned URL generation.
 * R2 keys follow the pattern: qa-tools/{appId}/{runId}/{filename}
 *
 * Lifecycle policy (configure via wrangler r2 bucket lifecycle):
 *   - Objects older than 90 days are auto-deleted.
 */

import { InternalError } from '@latimer-woods-tech/errors';

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/** Builds the R2 key prefix for a given run. */
export function buildR2Prefix(appId: string, runId: string): string {
  return `qa-tools/${appId}/${runId}`;
}

/** Builds the R2 key for a desktop full-page screenshot. */
export function buildScreenshotKey(appId: string, runId: string, name = 'desktop-full'): string {
  return `${buildR2Prefix(appId, runId)}/${name}.png`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Uploads a base64-encoded PNG to R2.
 * Returns the R2 object key on success.
 */
export async function uploadScreenshot(
  bucket: R2Bucket,
  key: string,
  base64Data: string,
): Promise<string> {
  // Decode base64 → Uint8Array in Workers-compatible way (no Buffer)
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: { uploadedAt: new Date().toISOString() },
  });

  return key;
}

/**
 * Uploads multiple screenshots from a VisualReviewResult's viewports array.
 * Returns a map of viewport name → R2 key.
 */
export async function uploadViewportScreenshots(
  bucket: R2Bucket,
  appId: string,
  runId: string,
  viewports: Array<{ viewport: string; screenshotBase64: string }>,
): Promise<Record<string, string>> {
  const keys: Record<string, string> = {};
  for (const vp of viewports) {
    const key = buildScreenshotKey(appId, runId, `${vp.viewport}-full`);
    await uploadScreenshot(bucket, key, vp.screenshotBase64);
    keys[vp.viewport] = key;
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Presigned URL generation
// ---------------------------------------------------------------------------

/**
 * Generates a presigned URL for an R2 object (24h expiry).
 * Returns null if the object does not exist.
 */
export async function getPresignedUrl(
  bucket: R2Bucket,
  key: string,
  expirationSeconds = 86_400,
): Promise<string | null> {
  // R2 bindings in Workers support createMultipartUpload, get, put, delete, head,
  // and list — but NOT presigned URL generation natively from Workers bindings.
  // For now, return a non-public internal URL reference.
  // TODO: Use the R2 public domain (custom domain) when configured, or generate
  //       presigned URLs via REST API from a scheduled task.
  const obj = await bucket.head(key);
  if (!obj) return null;
  // Placeholder: returns the key until presigned URL support is wired
  // Replace with: `https://${R2_PUBLIC_DOMAIN}/${key}` once domain is attached
  void expirationSeconds;
  return `r2://${key}`;
}

/**
 * Deletes all objects under a run's R2 prefix.
 * Called during run deletion (Phase 5+).
 */
export async function deleteRunArtifacts(bucket: R2Bucket, prefix: string): Promise<void> {
  const listed = await bucket.list({ prefix });
  if (listed.objects.length === 0) return;

  const keys = listed.objects.map((obj) => obj.key);
  await bucket.delete(keys);

  if (!listed.truncated) return;

  // Handle pagination for runs with many artifacts
  let cursor = listed.cursor;
  while (cursor) {
    const next = await bucket.list({ prefix, cursor });
    if (next.objects.length > 0) {
      await bucket.delete(next.objects.map((obj) => obj.key));
    }
    if (!next.truncated) break;
    cursor = next.cursor;
  }
}

/**
 * Stores a JSON result blob in R2 for archival / export.
 * Key: qa-tools/{appId}/{runId}/results.json
 */
export async function storeResultsJson(
  bucket: R2Bucket,
  appId: string,
  runId: string,
  data: unknown,
): Promise<string> {
  const key = `${buildR2Prefix(appId, runId)}/results.json`;
  const body = JSON.stringify(data, null, 2);
  await bucket.put(key, body, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { runId, appId, storedAt: new Date().toISOString() },
  });
  return key;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Validates base64 string length to prevent abuse (max 10 MB decoded). */
export function validateScreenshotBase64(b64: string): void {
  const decodedSizeBytes = (b64.length * 3) / 4;
  const MAX_BYTES = 10 * 1024 * 1024;
  if (decodedSizeBytes > MAX_BYTES) {
    throw new InternalError(`Screenshot base64 exceeds 10 MB limit (${String(Math.round(decodedSizeBytes / 1024 / 1024))} MB)`);
  }
}
