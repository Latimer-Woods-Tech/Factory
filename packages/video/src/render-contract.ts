// ---------------------------------------------------------------------------
// Energy Blueprint Video Engine — signed render request/callback contract
// (I1 Slice 0, doc §7 + decision D10)
//
// The selfprime → render-service request and the render-service → selfprime
// callback are both signed with the same HMAC-SHA256 scheme and protected by a
// ±5-minute replay window. `videoObjectId` is the idempotency key.
//
// This module is Web-Crypto only (globalThis.crypto.subtle) so it runs
// unchanged in Cloudflare Workers (selfprime) and Node 20+ (the Cloud Run
// render service). No Node built-ins, no Buffer.
// ---------------------------------------------------------------------------

import type { VideoFormat, VideoSource } from './engine-types.js';

/**
 * A single segment, fully resolved by selfprime before enqueue: cacheable refs
 * plus fresh props and authored narration text (doc §7). The render service
 * consumes these directly — it does no data gathering or narration authoring.
 */
export interface ResolvedSegment {
  /** The source this segment renders. */
  source: VideoSource;
  /** Whether this segment's output may be cached/reused. */
  cacheable: boolean;
  /** Render props for the Remotion composition. */
  props: Record<string, unknown>;
  /** Narration text authored by selfprime (D6). */
  narrationText: string;
}

/**
 * The signed request selfprime sends to the render service (doc §7, D10).
 *
 * {@link RenderRequest.videoObjectId} doubles as the idempotency key: the
 * render service must reject a duplicate id already in a terminal state.
 */
export interface RenderRequest {
  /**
   * Contract version (see {@link RENDER_CONTRACT_VERSION}). Lets the render
   * service reject or adapt to a request shape it does not understand instead
   * of silently mis-rendering. Covered by the signature (it is in the body).
   */
  version: number;
  /** Video-object identifier; also the idempotency key. */
  videoObjectId: string;
  /** Owning user identifier (UUID). */
  userId: string;
  /** HTTPS URL the render service POSTs the signed {@link RenderCallback} to. */
  callbackUrl: string;
  /** The fully resolved render recipe. */
  spec: {
    /** Sources included, in order. */
    sources: VideoSource[];
    /** Output format. */
    format: VideoFormat;
    /** Resolved segments (cacheable refs + fresh props + narration). */
    segments: ResolvedSegment[];
    /** Optional brand accent color (hex). */
    brandColor?: string;
    /** Optional brand logo URL. */
    logoUrl?: string;
  };
}

/**
 * The signed callback the render service sends back to selfprime (doc §7, D10).
 * Uses the identical signing scheme as {@link RenderRequest}.
 */
export interface RenderCallback {
  /**
   * Contract version (see {@link RENDER_CONTRACT_VERSION}); mirrors
   * {@link RenderRequest.version} so selfprime can reject an unknown callback
   * shape. Covered by the signature.
   */
  version: number;
  /** Video-object identifier this result is for (the idempotency key). */
  videoObjectId: string;
  /** Terminal render outcome. */
  status: 'ready' | 'failed';
  /** Cloudflare Stream UID when `status === 'ready'`. */
  streamUid?: string;
  /** Final duration in seconds when `status === 'ready'`. */
  durationSeconds?: number;
  /** Credits actually spent (informational; selfprime owns the ledger). */
  creditsSpent?: number;
  /** Human-readable reason when `status === 'failed'`. */
  failureReason?: string;
}

/**
 * Documented GCP Secret Manager name for the shared HMAC secret. The secret
 * itself is provisioned later (not in Slice 0) and injected at runtime — never
 * hard-coded. Both selfprime and the render service read it under this name.
 */
export const RENDER_HMAC_SECRET_NAME = 'VIDEO_RENDER_HMAC_SECRET';

/**
 * Current version of the signed render request/callback contract. Stamped on
 * every {@link RenderRequest} and {@link RenderCallback}; bumped only when the
 * payload shape changes in a non-additive way.
 */
export const RENDER_CONTRACT_VERSION = 1;

/**
 * Replay tolerance for signed payloads: a signature is rejected as `'stale'`
 * when `|now - timestamp|` exceeds this many seconds (±5 minutes, D10).
 */
export const RENDER_REPLAY_TOLERANCE_SECONDS = 300;

/**
 * Reasons {@link verifyRenderSignature} can reject a payload.
 *
 * - `bad_signature` — recomputed HMAC does not match the provided signature.
 * - `stale` — timestamp is outside the replay tolerance window.
 * - `malformed` — a required input was missing, empty, or not a valid timestamp.
 */
export type VerifyFailureReason = 'bad_signature' | 'stale' | 'malformed';

/** @internal Lowercase hex-encode a byte array without Buffer. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/** @internal Import a UTF-8 secret as an HMAC-SHA256 signing key. */
async function importKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * @internal Compute the canonical hex HMAC-SHA256 over the timestamp-bound
 * signed string `${timestamp}.${rawBody}`. Binding the timestamp into the
 * signed content means the replay window cannot be forged independently of the
 * signature, while the raw body remains fully covered.
 */
async function computeSignature(
  rawBody: string,
  secret: string,
  timestamp: string,
): Promise<string> {
  const key = await importKey(secret);
  const signedString = `${timestamp}.${rawBody}`;
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedString),
  );
  return toHex(new Uint8Array(sig));
}

/**
 * @internal Constant-time comparison of two hex signature strings. Compares
 * the hex characters code-by-code with an accumulated XOR; mismatched length
 * short-circuits to `false` so timing does not leak the position of the first
 * difference for equal-length inputs.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Signs a render payload with HMAC-SHA256 over `${timestamp}.${rawBody}`,
 * returning the hex signature and the unix-seconds timestamp used.
 *
 * Pass {@link signRenderPayload}'s `timestamp` for deterministic tests; it
 * defaults to the current time (unix seconds, as a string).
 *
 * @example
 * ```ts
 * const body = JSON.stringify(renderRequest);
 * const { signature, timestamp } = await signRenderPayload({ rawBody: body, secret });
 * // → headers: X-Signature: signature, X-Timestamp: timestamp
 * ```
 */
export async function signRenderPayload(args: {
  /** The exact request/callback body bytes that will be transmitted. */
  rawBody: string;
  /** Shared HMAC secret (from {@link RENDER_HMAC_SECRET_NAME}). */
  secret: string;
  /** Optional unix-seconds timestamp (string); defaults to now. */
  timestamp?: string;
}): Promise<{ signature: string; timestamp: string }> {
  const timestamp =
    args.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = await computeSignature(args.rawBody, args.secret, timestamp);
  return { signature, timestamp };
}

/**
 * Verifies a signed render payload (doc §7, D10).
 *
 * Performs, in order: (a) malformed-input rejection (missing/empty fields or a
 * non-numeric timestamp → `'malformed'`); (b) replay-window check
 * (`|now - timestamp| > toleranceSeconds` → `'stale'`); (c) constant-time HMAC
 * comparison (mismatch → `'bad_signature'`).
 *
 * Replay protection here is limited to the time window — a fresh, validly
 * signed payload replayed inside the window verifies as `valid: true`.
 * Exactly-once delivery is the idempotency layer's job: the receiver rejects a
 * duplicate `videoObjectId` already in a terminal state.
 *
 * Inject `nowMs` for deterministic tests; it defaults to `Date.now()`.
 *
 * @example
 * ```ts
 * const res = await verifyRenderSignature({
 *   rawBody, signature, timestamp, secret,
 * });
 * if (!res.valid) reject(res.reason);
 * ```
 */
export async function verifyRenderSignature(args: {
  /** The received raw body bytes, exactly as transmitted. */
  rawBody: string;
  /** The received `X-Signature` hex string. */
  signature: string;
  /** The received `X-Timestamp` (unix seconds, string). */
  timestamp: string;
  /** Shared HMAC secret (from {@link RENDER_HMAC_SECRET_NAME}). */
  secret: string;
  /** Replay tolerance in seconds; defaults to {@link RENDER_REPLAY_TOLERANCE_SECONDS}. */
  toleranceSeconds?: number;
  /** Injected current time in ms for deterministic tests; defaults to `Date.now()`. */
  nowMs?: number;
}): Promise<{ valid: true } | { valid: false; reason: VerifyFailureReason }> {
  const {
    rawBody,
    signature,
    timestamp,
    secret,
    toleranceSeconds = RENDER_REPLAY_TOLERANCE_SECONDS,
    nowMs = Date.now(),
  } = args;

  // (a) Malformed / missing inputs.
  if (
    typeof rawBody !== 'string' ||
    typeof signature !== 'string' ||
    signature.length === 0 ||
    typeof timestamp !== 'string' ||
    timestamp.length === 0 ||
    typeof secret !== 'string' ||
    secret.length === 0
  ) {
    return { valid: false, reason: 'malformed' };
  }

  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds) || !/^-?\d+$/.test(timestamp)) {
    return { valid: false, reason: 'malformed' };
  }

  // (b) Replay window.
  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > toleranceSeconds) {
    return { valid: false, reason: 'stale' };
  }

  // (c) Constant-time signature comparison.
  const expected = await computeSignature(rawBody, secret, timestamp);
  if (!constantTimeEqual(expected, signature)) {
    return { valid: false, reason: 'bad_signature' };
  }

  return { valid: true };
}
