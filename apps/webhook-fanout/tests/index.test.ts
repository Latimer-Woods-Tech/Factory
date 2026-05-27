import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'whsec_test_secret_1234567890abcdef';
const GH_SECRET = 'gh_webhook_secret_test_abcdef0123';
const CORE_API_URL = 'https://factory-core-api.test';
const INGEST_KEY = 'svc-webhook-fanout-ingest-key-test';

async function signGitHub(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${hex}`;
}

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
type D1BindValue = string | number | null;

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

function makeD1(shouldFail = false): { db: D1Database; binds: D1BindValue[][] } {
  const binds: D1BindValue[][] = [];
  const db = {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((...values: D1BindValue[]) => {
        binds.push(values);
        return {
          run: vi.fn(async () => {
            if (shouldFail) throw new Error('D1 unavailable');
            return { success: true };
          }),
        };
      }),
    })),
  } as unknown as D1Database;
  return { db, binds };
}

function makeEnv(kv: KVNamespace = makeKV(), db: D1Database = makeD1().db): Record<string, unknown> {
  return {
    STRIPE_WEBHOOK_SECRET: TEST_SECRET,
    GH_WEBHOOK_SECRET: GH_SECRET,
    FACTORY_CORE_API_URL: CORE_API_URL,
    FACTORY_CORE_API_INGEST_KEY: INGEST_KEY,
    POSTHOG_KEY: 'test-posthog-key',
    RESEND_API_KEY: 'test-resend-key',
    RESEND_FROM: 'Factory <noreply@latwoodtech.com>',
    CONTACT_NOTIFY_EMAIL: 'aperry@latwoodtech.com',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/test/webhook',
    FACTORY_EVENTS_DB: db,
    IDEMPOTENCY_KV: kv,
    ENVIRONMENT: 'test',
  };
}

function makeCtx(waitUntilPromises: Promise<unknown>[] = []): ExecutionContext {
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => {
      waitUntilPromises.push(p);
      p.catch(() => {});
    }),
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
  ctx: ExecutionContext = makeCtx(),
): Promise<Response> {
  const req = new Request('https://webhooks.latwoodtech.work/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': sigHeader,
      'content-type': 'application/json',
    },
    body: payload,
  });
  return app.fetch(req, env, ctx);
}

async function postContact(
  body: Record<string, unknown>,
  env: Record<string, unknown>,
  ctx: ExecutionContext = makeCtx(),
): Promise<Response> {
  const req = new Request('https://webhooks.latwoodtech.work/contact', {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:4173',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return app.fetch(req, env, ctx);
}

async function postGitHub(
  eventType: string,
  payload: Record<string, unknown>,
  env: Record<string, unknown>,
  ctx: ExecutionContext = makeCtx(),
  opts: { signature?: string; deliveryId?: string } = {},
): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-github-event': eventType,
    'x-github-delivery': opts.deliveryId ?? 'gh-delivery-test-1',
    'x-hub-signature-256': opts.signature ?? (await signGitHub(body, GH_SECRET)),
  };
  const req = new Request('https://webhooks.latwoodtech.work/github', {
    method: 'POST',
    headers,
    body,
  });
  return app.fetch(req, env, ctx);
}

function checkRunPayload(conclusion: string, withPr = true): Record<string, unknown> {
  return {
    action: 'completed',
    check_run: {
      id: 99887766,
      name: 'gate',
      head_sha: 'abc123def456',
      status: 'completed',
      conclusion,
      html_url: 'https://github.com/Latimer-Woods-Tech/Factory/runs/99887766',
      completed_at: '2026-05-26T00:00:00Z',
      pull_requests: withPr ? [{ number: 298 }] : [],
    },
    repository: { full_name: 'Latimer-Woods-Tech/Factory' },
  };
}

function reviewPayload(state: string): Record<string, unknown> {
  return {
    action: 'submitted',
    review: {
      id: 55443322,
      state,
      html_url: 'https://github.com/Latimer-Woods-Tech/Factory/pull/298#pullrequestreview-55443322',
      submitted_at: '2026-05-26T00:01:00Z',
      user: { login: 'adrper79' },
    },
    pull_request: { number: 298 },
    repository: { full_name: 'Latimer-Woods-Tech/Factory' },
  };
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
    const req = new Request('https://webhooks.latwoodtech.work/health');
    const res = await app.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['worker']).toBe('webhook-fanout');
  });

  it('OPTIONS /contact returns CORS headers for allowed origins', async () => {
    const req = new Request('https://webhooks.latwoodtech.work/contact', {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:4173' },
    });
    const res = await app.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4173');
  });

  it('POST /contact fans out to Resend and Slack and rate-limits repeated submissions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const kvStore = new Map<string, string>();
    const waitUntilPromises: Promise<unknown>[] = [];
    const env = makeEnv(makeKV(kvStore));

    const res = await postContact(
      {
        name: 'Andre Perry',
        email: 'andre@example.com',
        message: 'Need to talk about Factory.',
        phone: '706-267-7235',
        website: '',
      },
      env,
      makeCtx(waitUntilPromises),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4173');
    await Promise.all(waitUntilPromises);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.resend.com/emails',
      'https://hooks.slack.com/services/test/webhook',
    ]);

    const secondRes = await postContact(
      {
        name: 'Andre Perry',
        email: 'andre@example.com',
        message: 'Need to talk about Factory.',
        website: '',
      },
      env,
    );
    expect(secondRes.status).toBe(429);
  });

  it('POST /contact validates required fields and ignores honeypot submissions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const invalidRes = await postContact(
      {
        name: '',
        email: 'bad-email',
        message: '',
        website: '',
      },
      makeEnv(),
    );
    expect(invalidRes.status).toBe(400);

    const honeypotRes = await postContact(
      {
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        website: 'https://spam.invalid',
      },
      makeEnv(),
    );
    expect(honeypotRes.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it('fans out to PostHog, factory_events, and Resend only', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'sent_test' }), { status: 200 }),
    );
    const { db, binds } = makeD1();
    const waitUntilPromises: Promise<unknown>[] = [];

    const event = makeStripeEvent('customer.subscription.updated', {
      customer: 'cus_real123',
      customer_email: 'subscriber@realcustomer.com',
      status: 'active',
      items: { data: [{ plan: { nickname: 'Pro' } }] },
    });
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv(makeKV(), db), makeCtx(waitUntilPromises));
    expect(res.status).toBe(200);

    await Promise.all(waitUntilPromises);

    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      'https://app.posthog.com/capture/',
      'https://api.resend.com/emails',
    ]);
    const hosts = urls.map(url => new URL(url).hostname);
    expect(hosts).not.toContain('api.chartmogul.com');
    expect(hosts).not.toContain('app.loops.so');
    expect(binds).toHaveLength(1);
    expect(binds[0]?.[0]).toBe('webhook-fanout');
    expect(binds[0]?.[1]).toBe('stripe.customer.subscription.updated');
    expect(JSON.parse(String(binds[0]?.[2]))).toMatchObject({
      stripeEventId: event.id,
      stripeEventType: 'customer.subscription.updated',
      subscriptionPlan: 'Pro',
      subscriptionStatus: 'active',
    });
    expect(binds[0]?.[3]).toBe('cus_real123');
    expect(new Date(String(binds[0]?.[4])).toISOString()).toBe(binds[0]?.[4]);
  });

  it.each([
    ['invoice.payment_failed', { customer: 'cus_real123', customer_email: 'subscriber@realcustomer.com' }, 'Factory payment needs attention'],
    ['customer.subscription.trial_will_end', { customer: 'cus_real123', customer_email: 'subscriber@realcustomer.com' }, 'Your Factory trial is ending soon'],
    ['customer.subscription.deleted', { customer: 'cus_real123', customer_email: 'subscriber@realcustomer.com' }, 'Factory subscription ended'],
    ['customer.subscription.created', { customer: 'cus_real123', customer_email: 'subscriber@realcustomer.com' }, 'Factory subscription started'],
    ['customer.updated', {}, 'Factory account update'],
  ])('uses the expected Resend subject for %s', async (eventType, extra, expectedSubject) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'sent_test' }), { status: 200 }),
    );
    const waitUntilPromises: Promise<unknown>[] = [];

    const event = makeStripeEvent(eventType, extra);
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv(), makeCtx(waitUntilPromises));
    expect(res.status).toBe(200);

    await Promise.all(waitUntilPromises);

    const resendCall = fetchSpy.mock.calls.find(([url]) => String(url) === 'https://api.resend.com/emails');
    const body = JSON.parse(String(resendCall?.[1]?.body)) as { subject: string; html: string; text: string };
    expect(body.subject).toBe(expectedSubject);
    expect(body.html).toContain('<p>');
    expect(body.text.length).toBeGreaterThan(0);
  });

  it('logs factory_events failures without blocking PostHog or Resend fan-out', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'sent_test' }), { status: 200 }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = makeD1(true);
    const waitUntilPromises: Promise<unknown>[] = [];

    const event = makeStripeEvent('invoice.payment_failed', {
      customer: 'cus_real123',
      customer_email: 'subscriber@realcustomer.com',
      next_payment_attempt: 1_776_000_000,
    });
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sigHeader = await signPayload(payload, TEST_SECRET, ts);

    const res = await postStripe(payload, sigHeader, makeEnv(makeKV(), db), makeCtx(waitUntilPromises));
    expect(res.status).toBe(200);

    await Promise.all(waitUntilPromises);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls.some(([msg]) => String(msg).includes('[factory_events] fan-out error'))).toBe(true);
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

  // ---------- GitHub → gate ingest (P1.6) ----------

  it('translates check_run.completed (success) into a passed ci gate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, event_id: 'evt-1' }), { status: 201 }),
    );
    const waitUntilPromises: Promise<unknown>[] = [];

    const res = await postGitHub('check_run', checkRunPayload('success'), makeEnv(), makeCtx(waitUntilPromises));
    expect(res.status).toBe(200);
    await Promise.all(waitUntilPromises);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${CORE_API_URL}/v1/gates`);
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${INGEST_KEY}`);
    const gate = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(gate).toMatchObject({
      gate_type: 'ci',
      source_system: 'github-actions',
      subject_type: 'pr',
      subject_repo: 'Latimer-Woods-Tech/Factory',
      subject_ref: '298',
      state: 'passed',
      source_event_id: 'gh-delivery-test-1',
      evidence_url: 'https://github.com/Latimer-Woods-Tech/Factory/runs/99887766',
    });
  });

  it.each([
    ['failure', 'failed'],
    ['timed_out', 'failed'],
    ['cancelled', 'skipped'],
    ['stale', 'expired'],
  ])('maps check_run conclusion %s → gate state %s', async (conclusion, expectedState) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const waitUntilPromises: Promise<unknown>[] = [];

    const res = await postGitHub('check_run', checkRunPayload(conclusion), makeEnv(), makeCtx(waitUntilPromises));
    expect(res.status).toBe(200);
    await Promise.all(waitUntilPromises);

    const gate = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(gate['state']).toBe(expectedState);
  });

  it('translates pull_request_review.submitted (approved) into a passed codeowner-review gate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const waitUntilPromises: Promise<unknown>[] = [];

    const res = await postGitHub('pull_request_review', reviewPayload('approved'), makeEnv(), makeCtx(waitUntilPromises));
    expect(res.status).toBe(200);
    await Promise.all(waitUntilPromises);

    const gate = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(gate).toMatchObject({
      gate_type: 'codeowner-review',
      source_system: 'github-review',
      subject_ref: '298',
      state: 'passed',
    });
    expect((gate['evidence_summary'] as Record<string, unknown>)['reviewer']).toBe('adrper79');
  });

  it('maps review changes_requested → failed gate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const waitUntilPromises: Promise<unknown>[] = [];

    await postGitHub('pull_request_review', reviewPayload('changes_requested'), makeEnv(), makeCtx(waitUntilPromises));
    await Promise.all(waitUntilPromises);

    const gate = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(gate['state']).toBe('failed');
  });

  it('ignores review state "commented" (not a gate decision)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const res = await postGitHub('pull_request_review', reviewPayload('commented'), makeEnv());
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>)['ignored']).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores check_run not associated with a PR', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const res = await postGitHub('check_run', checkRunPayload('success', false), makeEnv());
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>)['ignored']).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores unsupported GitHub event types', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const res = await postGitHub('push', { ref: 'refs/heads/main' }, makeEnv());
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>)['ignored']).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid GitHub signature', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const res = await postGitHub('check_run', checkRunPayload('success'), makeEnv(), makeCtx(), {
      signature: 'sha256=deadbeef',
    });
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when X-Hub-Signature-256 header is missing', async () => {
    const body = JSON.stringify(checkRunPayload('success'));
    const req = new Request('https://webhooks.latwoodtech.work/github', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-github-event': 'check_run' },
      body,
    });
    const res = await app.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(401);
  });
});
