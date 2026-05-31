// ---------------------------------------------------------------------------
// @latimer-woods-tech/video-render-service — Energy Blueprint Video Engine
// render service (I1 Slice 1, Wave 2). See
// docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md (§3, §6, §7, D1/D2/D10).
//
// A Node service (Cloud Run, never a Worker — it needs real Chromium + ffmpeg
// via Remotion) that:
//   1. verifies the HMAC-signed RenderRequest (D10) — never processes an
//      unsigned/invalid/stale request;
//   2. builds the modular composition from the resolved `blueprint` segment;
//   3. renders an MP4 with Remotion + ffmpeg and uploads it to a PRIVATE
//      Cloudflare Stream asset (requireSignedURLs — D1);
//   4. signs + POSTs a RenderCallback back to selfprime (D10);
//   5. responds 202 to the caller immediately (the result rides the callback).
//
// This module holds the HTTP layer + orchestration only. The heavy
// Remotion/ffmpeg/R2/Stream work lives behind the injected {@link RenderPipeline}
// seam (see `pipeline.ts`) so this surface stays unit-testable without a real
// render. The word "AI" never appears in any string or log here (governance).
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import {
  RENDER_CONTRACT_VERSION,
  signRenderPayload,
  verifyRenderSignature,
  type RenderCallback,
  type RenderRequest,
  type ResolvedSegment,
} from '@latimer-woods-tech/video';

/**
 * The outcome a {@link RenderPipeline} produces for one render. Mirrors the
 * `ready` fields of {@link RenderCallback}; a thrown error is the `failed` path.
 */
export interface RenderOutcome {
  /** Private Cloudflare Stream UID of the finished, ready asset. */
  streamUid: string;
  /** Final duration in seconds. */
  durationSeconds: number;
  /** Credits the render consumed, if the pipeline computes them. */
  creditsSpent?: number;
}

/**
 * The injectable render seam: takes a verified {@link RenderRequest} and
 * resolves to a {@link RenderOutcome}, or rejects on render/upload failure.
 *
 * The production implementation (Remotion bundle → render → ffmpeg → R2 →
 * private Stream copy → poll) lives in `pipeline.ts`; unit tests inject a mock.
 */
export type RenderPipeline = (request: RenderRequest) => Promise<RenderOutcome>;

/**
 * A POST capable of delivering the signed callback. Defaults to global `fetch`;
 * injected in tests. Mirrors the platform fetch signature.
 */
export type FetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Terminal states a `videoObjectId` can reach (for idempotency). */
export type TerminalState = 'ready' | 'failed';

/**
 * Minimal idempotency store. The default is an in-process {@link Map}; the
 * service documents that exactly-once delivery is also the receiver's job
 * (selfprime rejects a duplicate `videoObjectId` already terminal — D10), so a
 * single-instance in-memory guard is sufficient and correct here.
 */
export interface IdempotencyStore {
  /** Returns the terminal state already recorded for `id`, or `undefined`. */
  get(id: string): TerminalState | undefined;
  /** Marks `id` as in-flight (claims it) — returns false if already claimed. */
  claim(id: string): boolean;
  /** Records the terminal state for `id`. */
  settle(id: string, state: TerminalState): void;
}

/** Builds the default single-instance in-memory {@link IdempotencyStore}. */
export function createMemoryIdempotencyStore(): IdempotencyStore {
  const terminal = new Map<string, TerminalState>();
  const inflight = new Set<string>();
  return {
    get: (id) => terminal.get(id),
    claim: (id) => {
      if (terminal.has(id) || inflight.has(id)) return false;
      inflight.add(id);
      return true;
    },
    settle: (id, state) => {
      inflight.delete(id);
      terminal.set(id, state);
    },
  };
}

/** Dependencies wired into {@link createApp}. */
export interface AppDeps {
  /** Shared HMAC secret (GCP secret `VIDEO_RENDER_HMAC_SECRET`). */
  hmacSecret: string;
  /** The render pipeline (real on Cloud Run, mocked in tests). */
  pipeline: RenderPipeline;
  /** Idempotency store; defaults to in-memory. */
  store?: IdempotencyStore;
  /** Fetch used to POST the signed callback; defaults to global `fetch`. */
  fetch?: FetchFn;
  /**
   * Optional hook awaited after the render is dispatched, letting tests block
   * on the async render + callback. Production passes nothing (fire-and-forget).
   */
  onDispatch?: (promise: Promise<void>) => void;
}

/** @internal Narrow an unknown parsed body to a structurally valid RenderRequest. */
function isRenderRequest(value: unknown): value is RenderRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['version'] !== 'number') return false;
  if (typeof v['videoObjectId'] !== 'string' || v['videoObjectId'].length === 0)
    return false;
  if (typeof v['userId'] !== 'string' || v['userId'].length === 0) return false;
  if (typeof v['callbackUrl'] !== 'string' || v['callbackUrl'].length === 0)
    return false;
  const spec = v['spec'];
  if (typeof spec !== 'object' || spec === null) return false;
  const s = spec as Record<string, unknown>;
  return Array.isArray(s['sources']) && Array.isArray(s['segments']);
}

/**
 * Finds the resolved `blueprint` segment in a request, or `undefined`. Slice 1
 * renders the blueprint source; later slices add the other segment renderers
 * additively (doc §6).
 */
export function findBlueprintSegment(
  request: RenderRequest,
): ResolvedSegment | undefined {
  return request.spec.segments.find((seg) => seg.source === 'blueprint');
}

/**
 * Signs and POSTs a {@link RenderCallback} to `callbackUrl` (D10). The body is
 * signed exactly as received (HMAC over `${timestamp}.${rawBody}`) so selfprime
 * verifies it with the identical scheme. Throws on a non-2xx response so the
 * caller can log/observe a delivery failure.
 */
export async function sendCallback(args: {
  callbackUrl: string;
  callback: RenderCallback;
  hmacSecret: string;
  fetchImpl: FetchFn;
}): Promise<void> {
  const rawBody = JSON.stringify(args.callback);
  const { signature, timestamp } = await signRenderPayload({
    rawBody,
    secret: args.hmacSecret,
  });
  let res: Response;
  try {
    res = await args.fetchImpl(args.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp,
      },
      body: rawBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`callback POST to ${args.callbackUrl} threw: ${message}`);
  }
  if (!res.ok) {
    throw new Error(
      `callback POST to ${args.callbackUrl} returned HTTP ${String(res.status)}`,
    );
  }
}

/**
 * Runs the render and delivers the terminal callback. Always settles the
 * idempotency store and always attempts a signed callback (ready or failed) —
 * this is the async tail of a 202-accepted request. Credit refund/grant logic
 * is selfprime's, driven by the `failed` callback; the render service only
 * reports the outcome.
 */
async function runAndCallback(args: {
  request: RenderRequest;
  deps: Required<Pick<AppDeps, 'hmacSecret' | 'pipeline' | 'store' | 'fetch'>>;
}): Promise<void> {
  const { request } = args;
  const { hmacSecret, pipeline, store, fetch: fetchImpl } = args.deps;
  let callback: RenderCallback;
  try {
    const outcome = await pipeline(request);
    callback = {
      version: RENDER_CONTRACT_VERSION,
      videoObjectId: request.videoObjectId,
      status: 'ready',
      streamUid: outcome.streamUid,
      durationSeconds: outcome.durationSeconds,
      ...(outcome.creditsSpent !== undefined
        ? { creditsSpent: outcome.creditsSpent }
        : {}),
    };
    store.settle(request.videoObjectId, 'ready');
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    callback = {
      version: RENDER_CONTRACT_VERSION,
      videoObjectId: request.videoObjectId,
      status: 'failed',
      failureReason,
    };
    store.settle(request.videoObjectId, 'failed');
    // Cloud Run only persists logs that reach stdout/stderr.
    console.error(
      `[render] ${request.videoObjectId} failed: ${failureReason}`,
    );
  }
  try {
    await sendCallback({
      callbackUrl: request.callbackUrl,
      callback,
      hmacSecret,
      fetchImpl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[render] ${request.videoObjectId} callback delivery failed: ${message}`,
    );
  }
}

/**
 * Builds the render-service Hono app.
 *
 * Routes:
 *   - `GET /health` → 200 `{ status: 'ok' }`.
 *   - `POST /render` → the signed render endpoint (D10): verify signature →
 *     parse + version-check → idempotency claim → 202; the render + signed
 *     callback run asynchronously.
 *
 * The HMAC secret is required; the render pipeline and (optional) fetch/store
 * are injected so the handler is fully unit-testable without a real render.
 */
export function createApp(deps: AppDeps): Hono {
  const store = deps.store ?? createMemoryIdempotencyStore();
  const fetchImpl = deps.fetch ?? (globalThis.fetch as FetchFn);
  const resolved = {
    hmacSecret: deps.hmacSecret,
    pipeline: deps.pipeline,
    store,
    fetch: fetchImpl,
  };

  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.post('/render', async (c) => {
    // (a) Verify the signature over the RAW body before any parsing.
    const rawBody = await c.req.text();
    const signature = c.req.header('X-Signature') ?? '';
    const timestamp = c.req.header('X-Timestamp') ?? '';
    const verdict = await verifyRenderSignature({
      rawBody,
      signature,
      timestamp,
      secret: deps.hmacSecret,
    });
    if (!verdict.valid) {
      return c.json({ error: verdict.reason }, 401);
    }

    // Parse only after the signature is trusted.
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'malformed_json' }, 400);
    }
    if (!isRenderRequest(parsed)) {
      return c.json({ error: 'malformed_request' }, 400);
    }
    const request = parsed;

    // (b) Reject a contract version this service does not understand.
    if (request.version !== RENDER_CONTRACT_VERSION) {
      return c.json(
        {
          error: 'unknown_contract_version',
          expected: RENDER_CONTRACT_VERSION,
          received: request.version,
        },
        400,
      );
    }

    // Slice 1 renders the blueprint segment; require it to be present.
    if (!findBlueprintSegment(request)) {
      return c.json({ error: 'missing_blueprint_segment' }, 400);
    }

    // (c) Idempotency: reject a videoObjectId already terminal or in-flight.
    const existing = store.get(request.videoObjectId);
    if (existing !== undefined) {
      return c.json(
        { status: 'duplicate', videoObjectId: request.videoObjectId, state: existing },
        409,
      );
    }
    if (!store.claim(request.videoObjectId)) {
      return c.json(
        { status: 'in_progress', videoObjectId: request.videoObjectId },
        409,
      );
    }

    // Dispatch the render + signed callback asynchronously; reply 202 now.
    const work = runAndCallback({ request, deps: resolved });
    if (deps.onDispatch) {
      deps.onDispatch(work);
    } else {
      // Surface late failures to Cloud Run logs without unhandled rejections.
      void work.catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[render] dispatch error: ${message}`);
      });
    }

    return c.json(
      { status: 'accepted', videoObjectId: request.videoObjectId },
      202,
    );
  });

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : 'internal_error';
    console.error(`[render] unhandled error: ${message}`);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
