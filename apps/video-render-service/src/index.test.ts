// Unit tests for the signed render handler. Remotion/ffmpeg/Stream/R2 are never
// invoked — the render pipeline is mocked. We assert the contract: valid signed
// request → 202 + a signed callback POST; tampered signature → 401 bad_signature;
// stale timestamp → 401 stale; wrong version → 400; render failure → signed
// `failed` callback; duplicate → 409.

import { describe, it, expect, vi } from 'vitest';
import {
  RENDER_CONTRACT_VERSION,
  signRenderPayload,
  verifyRenderSignature,
  type RenderRequest,
} from '@latimer-woods-tech/video';
import {
  createApp,
  type FetchFn,
  type RenderOutcome,
  type RenderPipeline,
} from './index.js';

const SECRET = 'test-hmac-secret-value';

function buildRequest(overrides: Partial<RenderRequest> = {}): RenderRequest {
  return {
    version: RENDER_CONTRACT_VERSION,
    videoObjectId: 'vo_123',
    userId: 'u_456',
    callbackUrl: 'https://api.selfprime.net/api/internal/video/callback',
    spec: {
      sources: ['blueprint'],
      format: 'full_film',
      segments: [
        {
          source: 'blueprint',
          cacheable: true,
          props: {
            blueprint: { hdType: 'projector', definedCenters: ['G', 'Throat'] },
          },
          narrationText: 'You were built to guide.',
        },
      ],
      brandColor: '#c9a84c',
    },
    ...overrides,
  };
}

/** A fetch double that records the single callback POST it receives. */
function recordingFetch(status = 200): {
  fetchImpl: FetchFn;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchFn = (input, init) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response('{}', { status }));
  };
  return { fetchImpl, calls };
}

/** Posts a signed render request to the app and returns the Response. */
async function postSigned(
  app: ReturnType<typeof createApp>,
  request: RenderRequest,
  opts: { secret?: string; tamper?: boolean; timestamp?: string } = {},
): Promise<Response> {
  const rawBody = JSON.stringify(request);
  const { signature, timestamp } = await signRenderPayload({
    rawBody,
    secret: opts.secret ?? SECRET,
    ...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
  });
  const sig = opts.tamper ? `${signature.slice(0, -1)}0` : signature;
  return app.request('/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sig,
      'X-Timestamp': timestamp,
    },
    body: rawBody,
  });
}

describe('GET /health', () => {
  it('returns 200 {status:ok}', async () => {
    const app = createApp({ hmacSecret: SECRET, pipeline: vi.fn() });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /render — happy path', () => {
  it('accepts a valid signed request (202) and POSTs a signed ready callback', async () => {
    const outcome: RenderOutcome = {
      streamUid: 'stream_abc',
      durationSeconds: 75,
    };
    const pipeline: RenderPipeline = vi.fn().mockResolvedValue(outcome);
    const { fetchImpl, calls } = recordingFetch();
    const dispatched: Array<Promise<void>> = [];

    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      fetch: fetchImpl,
      onDispatch: (p) => dispatched.push(p),
    });

    const res = await postSigned(app, buildRequest());
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: 'accepted' });

    // Await the async render + callback.
    await Promise.all(dispatched);

    expect(pipeline).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('no callback call recorded');
    expect(call.url).toBe(
      'https://api.selfprime.net/api/internal/video/callback',
    );

    // The callback body is signed and verifies with the shared secret.
    const headers = new Headers(call.init?.headers);
    const body = String(call.init?.body);
    const verdict = await verifyRenderSignature({
      rawBody: body,
      signature: headers.get('X-Signature') ?? '',
      timestamp: headers.get('X-Timestamp') ?? '',
      secret: SECRET,
    });
    expect(verdict).toEqual({ valid: true });

    const callback = JSON.parse(body) as Record<string, unknown>;
    expect(callback).toMatchObject({
      version: RENDER_CONTRACT_VERSION,
      videoObjectId: 'vo_123',
      status: 'ready',
      streamUid: 'stream_abc',
      durationSeconds: 75,
    });
  });

  it('forwards creditsSpent in the ready callback when the pipeline reports it', async () => {
    const pipeline: RenderPipeline = vi.fn().mockResolvedValue({
      streamUid: 'stream_xyz',
      durationSeconds: 75,
      creditsSpent: 3,
    });
    const { fetchImpl, calls } = recordingFetch();
    const dispatched: Array<Promise<void>> = [];
    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      fetch: fetchImpl,
      onDispatch: (p) => dispatched.push(p),
    });
    const res = await postSigned(app, buildRequest());
    expect(res.status).toBe(202);
    await Promise.all(dispatched);
    const call = calls[0];
    if (!call) throw new Error('no callback recorded');
    const callback = JSON.parse(String(call.init?.body)) as Record<
      string,
      unknown
    >;
    expect(callback['creditsSpent']).toBe(3);
  });
});

describe('POST /render — signature failures', () => {
  it('rejects a tampered signature with 401 bad_signature', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const res = await postSigned(app, buildRequest(), { tamper: true });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'bad_signature' });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('rejects a stale timestamp with 401 stale', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const res = await postSigned(app, buildRequest(), { timestamp: staleTs });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'stale' });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('rejects a missing signature with 401 malformed', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const res = await app.request('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest()),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'malformed' });
    expect(pipeline).not.toHaveBeenCalled();
  });
});

describe('POST /render — contract + shape', () => {
  it('rejects an unknown contract version with 400', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const res = await postSigned(
      app,
      buildRequest({ version: RENDER_CONTRACT_VERSION + 1 }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'unknown_contract_version',
    });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('rejects a request without a blueprint segment with 400', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const req = buildRequest();
    req.spec.segments = [];
    const res = await postSigned(app, req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_blueprint_segment' });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('rejects a structurally invalid body with 400 malformed_request', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const rawBody = JSON.stringify({ not: 'a render request' });
    const { signature, timestamp } = await signRenderPayload({
      rawBody,
      secret: SECRET,
    });
    const res = await app.request('/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp,
      },
      body: rawBody,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'malformed_request' });
  });
});

describe('POST /render — render failure', () => {
  it('emits a signed failed callback when the pipeline throws', async () => {
    const pipeline: RenderPipeline = vi
      .fn()
      .mockRejectedValue(new Error('remotion blew up'));
    const { fetchImpl, calls } = recordingFetch();
    const dispatched: Array<Promise<void>> = [];
    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      fetch: fetchImpl,
      onDispatch: (p) => dispatched.push(p),
    });

    const res = await postSigned(app, buildRequest());
    expect(res.status).toBe(202);
    await Promise.all(dispatched);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('no callback recorded');
    const body = String(call.init?.body);
    const callback = JSON.parse(body) as Record<string, unknown>;
    expect(callback).toMatchObject({
      version: RENDER_CONTRACT_VERSION,
      videoObjectId: 'vo_123',
      status: 'failed',
      failureReason: 'remotion blew up',
    });
    // The failed callback is signed too.
    const headers = new Headers(call.init?.headers);
    const verdict = await verifyRenderSignature({
      rawBody: body,
      signature: headers.get('X-Signature') ?? '',
      timestamp: headers.get('X-Timestamp') ?? '',
      secret: SECRET,
    });
    expect(verdict).toEqual({ valid: true });
  });
});

describe('POST /render — default deps + delivery resilience', () => {
  it('uses the default in-memory store and global fetch when none are injected', async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;
    try {
      const pipeline: RenderPipeline = vi
        .fn()
        .mockResolvedValue({ streamUid: 's', durationSeconds: 75 });
      // No fetch, no store, no onDispatch — defaults all exercised.
      const app = createApp({ hmacSecret: SECRET, pipeline });
      const res = await postSigned(app, buildRequest());
      expect(res.status).toBe(202);
      // Allow the fire-and-forget render + callback to settle.
      await new Promise((r) => setTimeout(r, 20));
      expect(pipeline).toHaveBeenCalledOnce();
      expect(calls).toContain(
        'https://api.selfprime.net/api/internal/video/callback',
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('does not throw when callback delivery returns a non-2xx', async () => {
    const pipeline: RenderPipeline = vi
      .fn()
      .mockResolvedValue({ streamUid: 's', durationSeconds: 75 });
    const { fetchImpl } = recordingFetch(500); // callback endpoint rejects
    const dispatched: Array<Promise<void>> = [];
    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      fetch: fetchImpl,
      onDispatch: (p) => dispatched.push(p),
    });
    const res = await postSigned(app, buildRequest());
    expect(res.status).toBe(202);
    // The async tail swallows the delivery error (logged, not thrown).
    await expect(Promise.all(dispatched)).resolves.toBeDefined();
  });

  it('swallows a thrown (network) callback delivery error', async () => {
    const pipeline: RenderPipeline = vi
      .fn()
      .mockResolvedValue({ streamUid: 's', durationSeconds: 75 });
    const throwingFetch: FetchFn = () =>
      Promise.reject(new Error('ECONNREFUSED'));
    const dispatched: Array<Promise<void>> = [];
    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      fetch: throwingFetch,
      onDispatch: (p) => dispatched.push(p),
    });
    const res = await postSigned(app, buildRequest());
    expect(res.status).toBe(202);
    await expect(Promise.all(dispatched)).resolves.toBeDefined();
  });

  it('rejects a signed-but-non-JSON body with 400 malformed_json', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const app = createApp({ hmacSecret: SECRET, pipeline });
    const rawBody = 'this is not json';
    const { signature, timestamp } = await signRenderPayload({
      rawBody,
      secret: SECRET,
    });
    const res = await app.request('/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp,
      },
      body: rawBody,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'malformed_json' });
  });
});

describe('POST /render — internal error handling', () => {
  it('returns 500 internal_error when the idempotency store throws', async () => {
    const pipeline: RenderPipeline = vi.fn();
    const throwingStore = {
      get: () => {
        throw new Error('store exploded');
      },
      claim: () => true,
      settle: () => undefined,
    };
    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      store: throwingStore,
    });
    const res = await postSigned(app, buildRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
    expect(pipeline).not.toHaveBeenCalled();
  });
});

describe('POST /render — idempotency', () => {
  it('rejects a duplicate videoObjectId already terminal with 409', async () => {
    const pipeline: RenderPipeline = vi
      .fn()
      .mockResolvedValue({ streamUid: 's', durationSeconds: 75 });
    const { fetchImpl } = recordingFetch();
    const dispatched: Array<Promise<void>> = [];
    const app = createApp({
      hmacSecret: SECRET,
      pipeline,
      fetch: fetchImpl,
      onDispatch: (p) => dispatched.push(p),
    });

    const first = await postSigned(app, buildRequest());
    expect(first.status).toBe(202);
    await Promise.all(dispatched);

    const second = await postSigned(app, buildRequest());
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ status: 'duplicate' });
    // Pipeline ran exactly once.
    expect(pipeline).toHaveBeenCalledOnce();
  });
});
