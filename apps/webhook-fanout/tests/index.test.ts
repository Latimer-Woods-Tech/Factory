import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'whsec_test_secret_1234567890abcdef';

async function signPayload(payload: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${hex}`;
}

type KVGetOptions = Parameters<KVNamespace['get']>[1];
type KVPutOptions = Parameters<KVNamespace['put']>[2];

function makeKV(store: Map<string, string> = new Map()): KVNamespace {
  return {
    get: vi.fn(async (key: string, _opts?: KVGetOptions) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: KVPutOptions) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: '' })),
    getWithMetadata: vi.fn(async () => ({ value: null, metadata: null, cacheStatus: null })),
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace = makeKV()): Record<string, unknown> {
  return {
    STRIPE_WEBHOOK_SECRET: TEST_SECRET,
    CHARTMOGUL_API_KEY: 'test-chartmogul-key',
    LOOPS_API_KEY: 'test-loops-key',
    CHARTMOGUL_DATA_SOURCE_UUID: 'ds_test-uuid',
    IDEMPOTENCY_KV: kv,
    ENVIRONMENT: 'test',
  };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => { p.catch(() => {}); }),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function makeStripeEvent(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `evt_test_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: 'cus_test123',
        email: 'user@realcustomer.com',
        name: 'Real User',
        ...extra,
      },
    },
  };
}

async function postStripe(
  payload: string,
  sigHeader: string,
  env: Record<string, unknown>,
): Promise<Response> {
  const req = new Request('https://webhooks.latwoodtech.com/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': sigHeader,
      'content-type': 'application/json',
    },
    body: payload,
  });
  return app.fetch(req, env, makeCtx());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webhook-fanout Worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- Health ----------

  it('GET /health returns 200', async () => {
    const req = new Request('https://webhooks.latwoodtech.com/health');
    const res = await app.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['worker']).toBe('webhook-fanout');
  });

  // ---------- Signature verification ----------

  it('returns 200 for a valid Stripe signature', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const event = makeStripeEvent('customer.created');
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
  });

  it('returns 401 for an invalid Stripe signature', async () => {
    const event = makeStripeEvent('customer.created');
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);

    const res = await postStripe(
      payload,
      `t=${ts},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`,
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when stripe-signature header is missing', async () => {
    const event = makeStripeEvent('customer.created');
    const req = new Request('https://webhooks.latwoodtech.com/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    const res = await app.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  // ---------- Idempotency ----------

  it('deduplicates a replayed event (200 with deduplicated: true)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const kvStore = new Map<string, string>();
    const env = makeEnv(makeKV(kvStore));

    const event = makeStripeEvent('customer.updated');
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    // First request
    const res1 = await postStripe(payload, sigHeader, env);
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as Record<string, unknown>;
    expect(body1['deduplicated']).toBeUndefined();

    // Replay — same event id, same env (same KV store)
    const res2 = await postStripe(payload, sigHeader, env);
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as Record<string, unknown>;
    expect(body2['deduplicated']).toBe(true);
  });

  // ---------- Synthetic filter ----------

  it('drops synthetic customer (metadata.synthetic=true), no fan-out calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const event = makeStripeEvent('customer.created', { metadata: { synthetic: 'true' } });
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['synthetic']).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drops smoke-test sourced customer (metadata.source=smoke_test)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const event = makeStripeEvent('customer.created', { metadata: { source: 'smoke_test' } });
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['synthetic']).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drops customer with synthetic email pattern', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const event = makeStripeEvent('customer.created', { email: 'gatecheck_test@somevendor.com' });
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['synthetic']).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
