import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { toErrorResponse } from '@latimer-woods-tech/errors';
import {
  createLogger,
  generateRequestId,
  requestTracingMiddleware,
} from '@latimer-woods-tech/logger';
import type { Env } from './env.js';

const SYNTHETIC_EMAIL_RE = /(?:gatecheck_|test_|smoke_|@example\.com)/i;
const KV_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ---------------------------------------------------------------------------
// Stripe signature verification — Web Crypto (no Node crypto), constant-time
// ---------------------------------------------------------------------------

async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!sigHeader) return false;

  let timestamp = '';
  const v1Sigs: string[] = [];

  for (const part of sigHeader.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') timestamp = v;
    if (k === 'v1') v1Sigs.push(v);
  }

  if (!timestamp || v1Sigs.length === 0) return false;

  // Reject timestamps older than 5 minutes (Stripe replay tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );

  const expected = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare — iterate every v1 sig before returning
  return v1Sigs.some(sig => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  });
}

// ---------------------------------------------------------------------------
// Synthetic customer filter
// ---------------------------------------------------------------------------

function isSynthetic(obj: Record<string, unknown>): boolean {
  const meta = obj['metadata'] as Record<string, string> | null | undefined;
  if (meta?.['synthetic'] === 'true') return true;
  if (meta?.['source'] === 'smoke_test') return true;
  const email = (obj['email'] as string | undefined) ?? '';
  return SYNTHETIC_EMAIL_RE.test(email);
}

// ---------------------------------------------------------------------------
// STACK.md-approved fan-out helpers: PostHog + factory_events, Resend
// ---------------------------------------------------------------------------

async function capturePostHogEvent(
  apiKey: string,
  distinctId: string,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const res = await fetchWithTimeout('https://app.posthog.com/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      event: eventName,
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog capture failed (${String(res.status)}): ${text}`);
  }
}

async function insertFactoryEvent(
  db: D1Database,
  eventName: string,
  userId: string | undefined,
  properties: Record<string, unknown>,
): Promise<void> {
  // Mirrors the @latimer-woods-tech/analytics factory_events insert contract.
  await db.prepare(
    `INSERT INTO factory_events (app_id, event, properties, user_id, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind('webhook-fanout', eventName, JSON.stringify(properties), userId ?? null, new Date().toISOString())
    .run();
}

function lifecycleEmailContent(eventName: string): { subject: string; html: string; text: string } {
  if (eventName === 'stripe.invoice.payment_failed') {
    return {
      subject: 'Factory payment needs attention',
      html: '<p>Your Factory payment could not be completed. Please update your billing details to keep your subscription active.</p>',
      text: 'Your Factory payment could not be completed. Please update your billing details to keep your subscription active.',
    };
  }
  if (eventName === 'stripe.customer.subscription.trial_will_end') {
    return {
      subject: 'Your Factory trial is ending soon',
      html: '<p>Your Factory trial is ending soon. Review your account to choose the subscription that fits your work.</p>',
      text: 'Your Factory trial is ending soon. Review your account to choose the subscription that fits your work.',
    };
  }
  if (eventName === 'stripe.customer.subscription.deleted') {
    return {
      subject: 'Factory subscription ended',
      html: '<p>Your Factory subscription has ended. You can reactivate from your account when you are ready.</p>',
      text: 'Your Factory subscription has ended. You can reactivate from your account when you are ready.',
    };
  }
  if (eventName === 'stripe.customer.subscription.created') {
    return {
      subject: 'Factory subscription started',
      html: '<p>Your Factory subscription is active. Thanks for building with Factory.</p>',
      text: 'Your Factory subscription is active. Thanks for building with Factory.',
    };
  }
  return {
    subject: 'Factory account update',
    html: '<p>Your Factory account has a new lifecycle update.</p>',
    text: 'Your Factory account has a new lifecycle update.',
  };
}

async function sendResendLifecycleEmail(
  apiKey: string,
  from: string,
  email: string,
  eventName: string,
  eventProperties: Record<string, unknown>,
): Promise<void> {
  const content = lifecycleEmailContent(eventName);
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [{ name: 'stripe_event', value: eventName }],
      metadata: eventProperties,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend lifecycle email failed (${String(res.status)}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Stripe event routing
// ---------------------------------------------------------------------------

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
]);

const INVOICE_EVENTS = new Set([
  'invoice.paid',
  'invoice.payment_failed',
]);

const ALL_HANDLED_EVENTS = new Set([
  'customer.created',
  'customer.updated',
  ...SUBSCRIPTION_EVENTS,
  ...INVOICE_EVENTS,
]);

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function extractEventProps(event: StripeEvent): Record<string, unknown> {
  const obj = event.data.object;
  const props: Record<string, unknown> = {};

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const status = obj['status'] as string | undefined;
    const items = obj['items'] as { data?: Array<{ plan?: { nickname?: string } }> } | undefined;
    const plan = items?.data?.[0]?.plan?.nickname;
    if (status) props['subscriptionStatus'] = status;
    if (plan) props['subscriptionPlan'] = plan;

    if (event.type === 'customer.subscription.trial_will_end') {
      const trialEnd = obj['trial_end'] as number | undefined;
      if (trialEnd) props['trialEndDate'] = new Date(trialEnd * 1000).toISOString();
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const nextRetry = obj['next_payment_attempt'] as number | undefined;
    if (nextRetry) props['nextRetryDate'] = new Date(nextRetry * 1000).toISOString();
  }

  return props;
}

async function fanOut(env: Env, event: StripeEvent): Promise<void> {
  if (!ALL_HANDLED_EVENTS.has(event.type)) return;

  const obj = event.data.object;

  // Resolve email + customer context from the event shape
  let email: string | undefined;
  let customerId: string | undefined;
  let customerName: string | undefined;

  if (event.type === 'customer.created' || event.type === 'customer.updated') {
    email = obj['email'] as string | undefined;
    customerId = obj['id'] as string | undefined;
    customerName = obj['name'] as string | undefined;
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    email = obj['customer_email'] as string | undefined;
    customerId = obj['customer'] as string | undefined;
    customerName = (obj['metadata'] as Record<string, string> | undefined)?.['customer_name'];
  } else if (INVOICE_EVENTS.has(event.type)) {
    email = obj['customer_email'] as string | undefined;
    customerId = obj['customer'] as string | undefined;
    customerName = obj['customer_name'] as string | undefined;
  }

  if (!email) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: '[webhook-fanout] no email resolved, skipping fan-out',
        eventId: event.id,
        eventType: event.type,
      }),
    );
    return;
  }

  const tasks: Promise<void>[] = [];

  const eventName = `stripe.${event.type}`;
  const eventProps = {
    ...extractEventProps(event),
    stripeEventId: event.id,
    stripeEventType: event.type,
    customerId,
    customerName,
  };
  const distinctId = customerId ?? email;

  tasks.push(
    capturePostHogEvent(env.POSTHOG_API_KEY, distinctId, eventName, eventProps)
      .catch(err => {
        console.error(
          JSON.stringify({ level: 'error', msg: '[posthog] fan-out error', error: err instanceof Error ? err.message : String(err) }),
        );
        throw err;
      }),
  );

  tasks.push(
    insertFactoryEvent(env.FACTORY_EVENTS_DB, eventName, customerId, eventProps)
      .catch(err => {
        console.error(
          JSON.stringify({ level: 'error', msg: '[factory_events] fan-out error', error: err instanceof Error ? err.message : String(err) }),
        );
        throw err;
      }),
  );

  tasks.push(
    sendResendLifecycleEmail(env.RESEND_API_KEY, env.RESEND_FROM, email, eventName, eventProps)
      .catch(err => {
        console.error(
          JSON.stringify({ level: 'error', msg: '[resend] fan-out error', error: err instanceof Error ? err.message : String(err) }),
        );
        throw err;
      }),
  );

  const results = await Promise.allSettled(tasks);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: '[webhook-fanout] fan-out partial failure',
        failedCount: failed.length,
        totalCount: results.length,
        eventId: event.id,
        eventType: event.type,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Hono app — single POST /stripe handler + health
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

const requestTracing = requestTracingMiddleware() as unknown as MiddlewareHandler<{ Bindings: Env }>;
app.use('*', requestTracing);

app.get('/health', c =>
  c.json({
    status: 'ok',
    worker: 'webhook-fanout',
    ts: new Date().toISOString(),
    env: c.env.ENVIRONMENT ?? 'production',
  }),
);

app.post('/stripe', async c => {
  const requestId = c.get('requestId') ?? generateRequestId();
  const log = createLogger({
    workerId: 'webhook-fanout',
    requestId,
    environment: (c.env.ENVIRONMENT ?? 'production') as 'development' | 'staging' | 'production',
  });

  // 1. Read raw body — must precede any JSON parsing to preserve HMAC payload
  const rawBody = await c.req.text();
  const sigHeader = c.req.header('stripe-signature') ?? null;

  // 2. Verify Stripe HMAC-SHA256 signature (constant-time)
  const valid = await verifyStripeSignature(rawBody, sigHeader, c.env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    log.warn('Stripe signature verification failed', { hasHeader: sigHeader !== null });
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // 3. Parse event
  const event = JSON.parse(rawBody) as StripeEvent;
  log.info('Received Stripe event', { eventId: event.id, eventType: event.type });

  // 4. Idempotency check (7-day KV TTL — Stripe replays for up to a few days)
  const kvKey = `evt:${event.id}`;
  const seen = await c.env.IDEMPOTENCY_KV.get(kvKey);
  if (seen !== null) {
    log.info('Deduplicated event', { eventId: event.id });
    return c.json({ ok: true, deduplicated: true });
  }
  await c.env.IDEMPOTENCY_KV.put(kvKey, '1', { expirationTtl: KV_TTL_SECONDS });

  // 5. Synthetic customer filter — belt-and-suspenders; Stripe metadata is source of truth
  if (isSynthetic(event.data.object)) {
    log.info('Synthetic event dropped', { eventId: event.id, eventType: event.type });
    return c.json({ ok: true, synthetic: true });
  }

  // 6. Async fan-out — respond to Stripe <<5 s, continue work in background
  c.executionCtx.waitUntil(
    fanOut(c.env, event).catch(err =>
      log.error('Fan-out top-level error', err, { eventId: event.id, eventType: event.type }),
    ),
  );

  return c.json({ ok: true });
});

app.onError((err, c) => {
  const response = toErrorResponse(err);
  const status = (response.error?.status ?? 500) as 200 | 400 | 401 | 403 | 404 | 500;
  return c.json(response, status);
});

export default app;
