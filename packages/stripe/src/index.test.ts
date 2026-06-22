import { Hono } from 'hono';
import type Stripe from 'stripe';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createDb } from '@latimer-woods-tech/neon';

import {
  calculatePlatformFee,
  connectAccountFromEvent,
  createCheckoutSession,
  createConnectAccount,
  createConnectOnboardingLink,
  createPortalSession,
  createStripeClient,
  getConnectAccountStatus,
  getSubscription,
  mapConnectAccount,
  priceToTier,
  stripeWebhookHandler,
  transferOrIdempotent,
  validateWebhook,
  type StripeKVCache,
  type SubscriptionStatus,
} from './index';

vi.mock('@latimer-woods-tech/neon', async (importOriginal) => {
  const real = await importOriginal<typeof import('@latimer-woods-tech/neon')>();
  return { ...real, createDb: vi.fn() };
});

interface FakeSubscription {
  status: Stripe.Subscription.Status;
  cancel_at_period_end: boolean;
  customer: string;
  items: { data: Array<{ price: { id: string }; current_period_end: number }> };
}

function buildSubscription(overrides: Partial<FakeSubscription> = {}): Stripe.Subscription {
  return {
    status: 'active',
    cancel_at_period_end: false,
    customer: 'cus_123',
    items: {
      data: [
        {
          price: { id: 'price_pro' },
          current_period_end: 1_700_000_000,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function buildEvent(
  type: Stripe.Event.Type,
  subscription: Stripe.Subscription,
  previous_attributes?: Record<string, unknown>,
): Stripe.Event {
  return {
    id: 'evt_test',
    type,
    data: {
      object: subscription,
      previous_attributes,
    },
  } as unknown as Stripe.Event;
}

/** Produces a valid `stripe-signature` header value for the given body and secret. */
async function signBody(body: string, secret = 'whsec_test'): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
  const sig = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${sig}`;
}

function buildStripeMock(overrides: Record<string, unknown> = {}) {
  const subscriptionsList = vi.fn();
  const checkoutCreate = vi.fn();
  const portalCreate = vi.fn();
  const client = {
    subscriptions: { list: subscriptionsList },
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    ...overrides,
  } as unknown as Stripe;
  return { client, subscriptionsList, checkoutCreate, portalCreate };
}

describe('createStripeClient', () => {
  it('throws when secretKey is missing', () => {
    expect(() => createStripeClient('')).toThrow('Stripe secret key is required');
  });

  it('returns a Stripe client when given a key', () => {
    const client = createStripeClient('sk_test_123');
    expect(client).toBeDefined();
    expect(typeof client.subscriptions.list).toBe('function');
  });
});

describe('validateWebhook', () => {
  it('throws when stripe-signature header is missing', async () => {
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    await expect(validateWebhook(request, 'whsec_test')).rejects.toThrow(
      'Missing stripe-signature header',
    );
  });

  it('throws when signature has no timestamp component', async () => {
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'v1=abc123' },
    });
    await expect(validateWebhook(request, 'whsec_test')).rejects.toThrow(
      'Invalid stripe-signature format',
    );
  });

  it('throws when signature has no v1 component', async () => {
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)}` },
    });
    await expect(validateWebhook(request, 'whsec_test')).rejects.toThrow(
      'Invalid stripe-signature format',
    );
  });

  it('throws when timestamp is outside the 300-second tolerance window', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400;
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': `t=${staleTimestamp},v1=abc` },
    });
    await expect(validateWebhook(request, 'whsec_test')).rejects.toThrow(
      'outside tolerance window',
    );
  });

  it('throws when the HMAC signature does not match', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': `t=${timestamp},v1=deadbeefdeadbeef` },
    });
    await expect(validateWebhook(request, 'whsec_test')).rejects.toThrow(
      'Stripe webhook signature mismatch',
    );
  });

  it('throws on invalid JSON after a valid signature', async () => {
    const body = 'not-valid-json';
    const sig = await signBody(body);
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': sig },
    });
    await expect(validateWebhook(request, 'whsec_test')).rejects.toThrow(
      'Invalid webhook payload JSON',
    );
  });

  it('returns the parsed event for a correctly signed request', async () => {
    const event = buildEvent('customer.subscription.created', buildSubscription());
    const body = JSON.stringify(event);
    const sig = await signBody(body);
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': sig },
    });
    const result = await validateWebhook(request, 'whsec_test');
    expect(result.type).toBe('customer.subscription.created');
    expect((result.data.object as Stripe.Subscription).customer).toBe('cus_123');
  });
});

describe('getSubscription', () => {
  it('returns normalized status for an active subscription', async () => {
    const { client, subscriptionsList } = buildStripeMock();
    subscriptionsList.mockResolvedValue({ data: [buildSubscription()] });

    const status = await getSubscription('cus_123', client);

    expect(status.status).toBe('active');
    expect(status.tier).toBe('price_pro');
    expect(status.cancelAtPeriodEnd).toBe(false);
    expect(status.customerId).toBe('cus_123');
  });

  it('returns "none" when the customer has no subscriptions', async () => {
    const { client, subscriptionsList } = buildStripeMock();
    subscriptionsList.mockResolvedValue({ data: [] });

    const status = await getSubscription('cus_456', client);
    expect(status.status).toBe('none');
    expect(status.tier).toBe('none');
  });

  it('returns "canceled" status', async () => {
    const { client, subscriptionsList } = buildStripeMock();
    subscriptionsList.mockResolvedValue({
      data: [buildSubscription({ status: 'canceled' })],
    });

    const status = await getSubscription('cus_123', client);
    expect(status.status).toBe('canceled');
  });

  it('falls back to "none" for unrecognized statuses', async () => {
    const { client, subscriptionsList } = buildStripeMock();
    subscriptionsList.mockResolvedValue({
      data: [buildSubscription({ status: 'incomplete' })],
    });

    const status = await getSubscription('cus_123', client);
    expect(status.status).toBe('none');
  });

  it('reads current_period_end from the subscription when item lacks it', async () => {
    const { client, subscriptionsList } = buildStripeMock();
    const sub = buildSubscription();
    delete (sub.items.data[0] as unknown as Record<string, unknown>).current_period_end;
    (sub as unknown as Record<string, unknown>).current_period_end = 1700000000;
    subscriptionsList.mockResolvedValue({ data: [sub] });

    const status = await getSubscription('cus_123', client);
    expect(status.currentPeriodEnd.getTime()).toBe(1700000000 * 1000);
  });

  it('defaults currentPeriodEnd to epoch when no source is numeric', async () => {
    const { client, subscriptionsList } = buildStripeMock();
    const sub = buildSubscription();
    (sub.items.data[0] as unknown as Record<string, unknown>).current_period_end = 'oops';
    subscriptionsList.mockResolvedValue({ data: [sub] });

    const status = await getSubscription('cus_123', client);
    expect(status.currentPeriodEnd.getTime()).toBe(0);
  });
});

describe('createCheckoutSession', () => {
  it('throws ValidationError when priceId is empty (factory#343 guard)', async () => {
    const { client } = buildStripeMock();
    await expect(
      createCheckoutSession({
        priceId: '',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow('Stripe price ID is required');
  });

  it('throws ValidationError when priceId lacks price_ prefix (factory#343 guard)', async () => {
    const { client } = buildStripeMock();
    await expect(
      createCheckoutSession({
        priceId: 'prod_something',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow('priceId must be a valid Stripe price ID');
  });

  it('calls Stripe with the correct params and returns the URL', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_1' });

    const url = await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      idempotencyKey: 'test-idem',
    });

    expect(url).toBe('https://checkout.stripe.com/sess_1');
    expect(checkoutCreate).toHaveBeenCalledWith(
      {
        mode: 'subscription',
        customer: 'cus_123',
        success_url: 'https://app/ok',
        cancel_url: 'https://app/cancel',
        line_items: [{ price: 'price_pro', quantity: 1 }],
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) as string }),
    );
  });

  it('throws when Stripe does not return a URL', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: null });

    await expect(
      createCheckoutSession({
        priceId: 'price_pro',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow('Stripe did not return a checkout URL');
  });

  it('throws when priceId is blank', async () => {
    const { client, checkoutCreate } = buildStripeMock();

    await expect(
      createCheckoutSession({
        priceId: '   ',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow('Stripe price ID is required');

    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('throws before calling Stripe when priceId is an unresolved placeholder', async () => {
    const { client, checkoutCreate } = buildStripeMock();

    await expect(
      createCheckoutSession({
        priceId: 'price_xxxxxxxxxxxxx',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow('Stripe price ID must be configured with a real Stripe price');

    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('wraps Stripe no such price failures as validation errors', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockRejectedValue(
      Object.assign(new Error("No such price: 'price_missing'"), {
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
      }),
    );

    await expect(
      createCheckoutSession({
        priceId: 'price_missing',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow('Stripe price ID is not recognized by Stripe');
  });

  it('rethrows unrelated Stripe resource-missing errors', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockRejectedValue(
      Object.assign(new Error("No such customer: 'cus_missing'"), {
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
      }),
    );

    await expect(
      createCheckoutSession({
        priceId: 'price_pro',
        customerId: 'cus_123',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel',
        stripeClient: client,
        idempotencyKey: 'test-idem',
      }),
    ).rejects.toThrow("No such customer: 'cus_missing'");
  });

  it('passes mode:"payment" for one-time purchases', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_2' });

    const url = await createCheckoutSession({
      priceId: 'price_once',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      mode: 'payment',
      idempotencyKey: 'test-idem',
    });

    expect(url).toBe('https://checkout.stripe.com/sess_2');
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'payment' }),
      expect.objectContaining({ idempotencyKey: expect.any(String) as string }),
    );
  });

  it('passes idempotencyKey as a request option', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_3' });

    await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      idempotencyKey: 'idem_abc123',
    });

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.any(Object),
      { idempotencyKey: 'idem_abc123' },
    );
  });

  it('never passes payment_method_types — dynamic payment methods only', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_4' });

    await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      idempotencyKey: 'test-idem',
    });

    const callArgs = checkoutCreate.mock.calls as Array<[Record<string, unknown>]>;
    expect(callArgs[0]?.[0]).not.toHaveProperty('payment_method_types');
  });

  it('passes metadata when provided', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_5' });

    await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      metadata: { userId: 'u_42', tier: 'pro' },
      idempotencyKey: 'test-idem',
    });

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: 'u_42', tier: 'pro' } }),
      expect.objectContaining({ idempotencyKey: expect.any(String) as string }),
    );
  });

  it('omits metadata when not provided', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_6' });

    await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      idempotencyKey: 'test-idem',
    });

    expect(checkoutCreate).toHaveBeenCalledWith(
      {
        mode: 'subscription',
        customer: 'cus_123',
        success_url: 'https://app/ok',
        cancel_url: 'https://app/cancel',
        line_items: [{ price: 'price_pro', quantity: 1 }],
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) as string }),
    );
  });
});

describe('createPortalSession', () => {
  it('returns the portal URL', async () => {
    const { client, portalCreate } = buildStripeMock();
    portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/portal_1' });

    const url = await createPortalSession({
      customerId: 'cus_123',
      returnUrl: 'https://app/account',
      stripeClient: client,
    });

    expect(url).toBe('https://billing.stripe.com/portal_1');
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app/account',
    });
  });

  it('throws when Stripe does not return a URL', async () => {
    const { client, portalCreate } = buildStripeMock();
    portalCreate.mockResolvedValue({ url: null });

    await expect(
      createPortalSession({
        customerId: 'cus_123',
        returnUrl: 'https://app/account',
        stripeClient: client,
      }),
    ).rejects.toThrow('Stripe did not return a portal URL');
  });
});

describe('stripeWebhookHandler', () => {
  /** Builds a simple in-memory KV mock. */
  function buildKVMock(): StripeKVCache & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
      store,
      get(key: string) { return Promise.resolve(store.get(key) ?? null); },
      put(key: string, value: string) { store.set(key, value); return Promise.resolve(); },
    };
  }

  function buildApp(
    opts: Omit<Parameters<typeof stripeWebhookHandler>[0], 'kvCache'>,
    kvCache: StripeKVCache = buildKVMock(),
  ) {
    const app = new Hono();
    app.post('/webhooks/stripe', stripeWebhookHandler({ ...opts, kvCache }));
    return app;
  }

  it('routes subscription.created to the correct handler', async () => {
    const subscription = buildSubscription();
    const event = buildEvent('customer.subscription.created', subscription);
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { created } });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });

    expect(response.status).toBe(200);
    expect(created).toHaveBeenCalledTimes(1);
    const status = created.mock.calls[0]?.[0];
    expect(status?.customerId).toBe('cus_123');
  });

  it('classifies subscription.deleted as canceled', async () => {
    const event = buildEvent('customer.subscription.deleted', buildSubscription({ status: 'canceled' }));
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const canceled = vi.fn(() => Promise.resolve());
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { canceled } });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });

    expect(response.status).toBe(200);
    expect(canceled).toHaveBeenCalledTimes(1);
  });

  it('classifies past_due updates correctly', async () => {
    const event = buildEvent(
      'customer.subscription.updated',
      buildSubscription({ status: 'past_due' }),
    );
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const past_due = vi.fn(() => Promise.resolve());
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { past_due } });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });

    expect(response.status).toBe(200);
    expect(past_due).toHaveBeenCalledTimes(1);
  });

  it('classifies price upgrades and downgrades', async () => {
    const sub = buildSubscription();
    sub.items.data[0]!.price.id = 'price_z';
    // Use distinct event IDs so KV deduplication does not suppress the second delivery.
    const upgradeEvent = { ...buildEvent('customer.subscription.updated', sub, {
      items: { data: [{ price: { id: 'price_a' } }] },
    }), id: 'evt_upgrade' };
    const body1 = JSON.stringify(upgradeEvent);
    const sig1 = await signBody(body1);

    const upgraded = vi.fn(() => Promise.resolve());
    const downgraded = vi.fn(() => Promise.resolve());
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { upgraded, downgraded } });

    let response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig1 },
      body: body1,
    });
    expect(response.status).toBe(200);
    expect(upgraded).toHaveBeenCalledTimes(1);

    const sub2 = buildSubscription();
    sub2.items.data[0]!.price.id = 'price_a';
    const downgradeEvent = { ...buildEvent('customer.subscription.updated', sub2, {
      items: { data: [{ price: { id: 'price_z' } }] },
    }), id: 'evt_downgrade' };
    const body2 = JSON.stringify(downgradeEvent);
    const sig2 = await signBody(body2);

    response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig2 },
      body: body2,
    });
    expect(response.status).toBe(200);
    expect(downgraded).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when signature validation fails', async () => {
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: {} });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=badhex` },
      body: '{}',
    });
    expect(response.status).toBe(400);
  });

  it('ignores unrelated events', async () => {
    const event = { type: 'invoice.paid', data: { object: {} } } as unknown as Stripe.Event;
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { created } });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });
    expect(response.status).toBe(200);
    expect(created).not.toHaveBeenCalled();
  });

  it('extracts customerId when customer is an object', async () => {
    const sub = buildSubscription();
    (sub as unknown as Record<string, unknown>).customer = { id: 'cus_obj' };
    const event = buildEvent('customer.subscription.created', sub);
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { created } });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });
    expect(response.status).toBe(200);
    expect(created.mock.calls[0]?.[0]?.customerId).toBe('cus_obj');
  });

  it('returns null classification when updated event has no price change', async () => {
    const sub = buildSubscription();
    const event = buildEvent('customer.subscription.updated', sub, {
      items: { data: [{ price: { id: 'price_pro' } }] },
    });
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { created } });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });
    expect(response.status).toBe(200);
    expect(created).not.toHaveBeenCalled();
  });

  it('deduplicates a repeated event.id — handler called once, second delivery returns deduplicated:true', async () => {
    const subscription = buildSubscription();
    const event = buildEvent('customer.subscription.created', subscription);
    const body = JSON.stringify(event);

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const kv = buildKVMock();
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: { created } }, kv);

    // First delivery — should process normally
    const sig1 = await signBody(body);
    const res1 = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig1 },
      body,
    });
    expect(res1.status).toBe(200);
    expect(created).toHaveBeenCalledTimes(1);
    const body1 = await res1.json() as { data: { deduplicated?: boolean } };
    expect(body1.data.deduplicated).toBeUndefined();

    // Second delivery with the same event.id — must NOT call handler again
    const sig2 = await signBody(body);
    const res2 = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig2 },
      body,
    });
    expect(res2.status).toBe(200);
    expect(created).toHaveBeenCalledTimes(1); // still 1 — not called again
    const body2 = await res2.json() as { data: { deduplicated?: boolean } };
    expect(body2.data.deduplicated).toBe(true);
  });

  it('stores the event.id in KV after processing', async () => {
    const subscription = buildSubscription();
    const event = buildEvent('customer.subscription.created', subscription);
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const kv = buildKVMock();
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: {} }, kv);

    await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });

    expect(kv.store.get(`stripe:event:${event.id}`)).toBe('1');
  });

  it('stores unclassified event.id in KV to prevent redundant delivery', async () => {
    const event = { id: 'evt_unrelated', type: 'invoice.paid', data: { object: {} } } as unknown as Stripe.Event;
    const body = JSON.stringify(event);
    const sig = await signBody(body);

    const kv = buildKVMock();
    const app = buildApp({ webhookSecret: 'whsec_test', handlers: {} }, kv);

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': sig },
      body,
    });
    expect(response.status).toBe(200);
    expect(kv.store.get('stripe:event:evt_unrelated')).toBe('1');
  });
});

describe('priceToTier', () => {
  it('maps a known price ID to its tier', () => {
    expect(priceToTier('price_pro', { price_pro: 'pro' })).toBe('pro');
  });

  it('returns "unknown" for an unmapped price ID', () => {
    expect(priceToTier('price_other', { price_pro: 'pro' })).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// transferOrIdempotent (P2.13h)
// ---------------------------------------------------------------------------

describe('transferOrIdempotent', () => {
  const baseOpts = {
    neonDb: { connectionString: 'postgres://test' },
    idempotencyKey: 'idem-key-001',
    destination: 'acct_1234',
    amountCents: 5000,
  };

  function makeDb(overrides: {
    insertRows?: Array<{ id: string }>;
    selectRows?: Array<unknown>;
  } = {}) {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const selectLimit = vi.fn().mockResolvedValue(overrides.selectRows ?? []);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const select = vi.fn().mockReturnValue({ from: selectFrom });
    const insertReturning = vi.fn().mockResolvedValue(overrides.insertRows ?? [{ id: 'db-row-id' }]);
    const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
    const insert = vi.fn().mockReturnValue({ values: insertValues });
    return { insert, select, update };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Stripe and returns transferId on fresh key', async () => {
    const mockDb = makeDb({ insertRows: [{ id: 'db-row-id' }] });
    vi.mocked(createDb).mockReturnValue(mockDb as unknown as ReturnType<typeof createDb>);

    const fakeTransferCreate = vi.fn().mockResolvedValue({ id: 'tr_abc123' });
    const fakeStripe = { transfers: { create: fakeTransferCreate } } as unknown as Stripe;

    const result = await transferOrIdempotent({ ...baseOpts, stripeClient: fakeStripe });
    expect(result).toEqual({ transferId: 'tr_abc123', isNew: true });
    expect(fakeTransferCreate).toHaveBeenCalledWith(
      { amount: 5000, currency: 'usd', destination: 'acct_1234', metadata: {} },
      { idempotencyKey: 'idem-key-001' },
    );
  });

  it('returns stored transferId on idempotent replay (status=success)', async () => {
    const mockDb = makeDb({
      insertRows: [],
      selectRows: [{ status: 'success', stripeResponse: { id: 'tr_existing' }, stripeError: null }],
    });
    vi.mocked(createDb).mockReturnValue(mockDb as unknown as ReturnType<typeof createDb>);

    const result = await transferOrIdempotent({ ...baseOpts, stripeClient: {} as unknown as Stripe });
    expect(result).toEqual({ transferId: 'tr_existing', isNew: false });
  });

  it('throws stored error on idempotent replay (status=failed)', async () => {
    const mockDb = makeDb({
      insertRows: [],
      selectRows: [{ status: 'failed', stripeResponse: null, stripeError: 'insufficient funds' }],
    });
    vi.mocked(createDb).mockReturnValue(mockDb as unknown as ReturnType<typeof createDb>);

    await expect(
      transferOrIdempotent({ ...baseOpts, stripeClient: {} as unknown as Stripe }),
    ).rejects.toThrow('insufficient funds');
  });

  it('throws conflict error on idempotent replay (status=pending)', async () => {
    const mockDb = makeDb({
      insertRows: [],
      selectRows: [{ status: 'pending', stripeResponse: null, stripeError: null }],
    });
    vi.mocked(createDb).mockReturnValue(mockDb as unknown as ReturnType<typeof createDb>);

    await expect(
      transferOrIdempotent({ ...baseOpts, stripeClient: {} as unknown as Stripe }),
    ).rejects.toThrow('concurrent request');
  });

  it('marks status=failed and throws when Stripe errors', async () => {
    const mockDb = makeDb({ insertRows: [{ id: 'db-row-id' }] });
    vi.mocked(createDb).mockReturnValue(mockDb as unknown as ReturnType<typeof createDb>);

    const fakeStripe = {
      transfers: { create: vi.fn().mockRejectedValue(new Error('card declined')) },
    } as unknown as Stripe;

    await expect(
      transferOrIdempotent({ ...baseOpts, stripeClient: fakeStripe }),
    ).rejects.toThrow('card declined');
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('throws when conflict row not found', async () => {
    const mockDb = makeDb({ insertRows: [], selectRows: [] });
    vi.mocked(createDb).mockReturnValue(mockDb as unknown as ReturnType<typeof createDb>);

    await expect(
      transferOrIdempotent({ ...baseOpts, stripeClient: {} as unknown as Stripe }),
    ).rejects.toThrow('row not found');
  });

  it('throws when neither stripeSecretKey nor stripeClient provided', async () => {
    await expect(
      transferOrIdempotent({ neonDb: { connectionString: 'x' }, idempotencyKey: 'k', destination: 'd', amountCents: 1 }),
    ).rejects.toThrow('provide stripeSecretKey or stripeClient');
  });
});

// ── Stripe Connect (Express onboarding + status) ──────────────────────────────

function buildConnectMock(overrides: Record<string, unknown> = {}) {
  const accountsCreate = vi.fn();
  const accountsRetrieve = vi.fn();
  const accountLinksCreate = vi.fn();
  const client = {
    accounts: { create: accountsCreate, retrieve: accountsRetrieve },
    accountLinks: { create: accountLinksCreate },
    ...overrides,
  } as unknown as Stripe;
  return { client, accountsCreate, accountsRetrieve, accountLinksCreate };
}

const acct = (over: Record<string, unknown> = {}) =>
  ({
    id: 'acct_1',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements: { currently_due: [], past_due: [] },
    ...over,
  }) as unknown as Stripe.Account;

describe('mapConnectAccount', () => {
  it('maps a fully-enabled account to active + ready', () => {
    const s = mapConnectAccount(
      acct({ charges_enabled: true, payouts_enabled: true, details_submitted: true }),
    );
    expect(s).toMatchObject({ accountId: 'acct_1', status: 'active', ready: true });
  });

  it('maps details-submitted-but-not-enabled to restricted (not ready)', () => {
    const s = mapConnectAccount(acct({ details_submitted: true, charges_enabled: true }));
    expect(s.status).toBe('restricted');
    expect(s.ready).toBe(false);
  });

  it('maps an unstarted account to pending', () => {
    expect(mapConnectAccount(acct()).status).toBe('pending');
  });

  it('maps deauthorized to inactive and forces ready=false', () => {
    const s = mapConnectAccount(
      acct({ charges_enabled: true, payouts_enabled: true, details_submitted: true }),
      { deauthorized: true },
    );
    expect(s.status).toBe('inactive');
    expect(s.ready).toBe(false);
  });

  it('dedupes requirementsDue across currently_due and past_due', () => {
    const s = mapConnectAccount(
      acct({ requirements: { currently_due: ['a', 'b'], past_due: ['b', 'c'] } }),
    );
    expect(s.requirementsDue.sort()).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a missing requirements object', () => {
    const s = mapConnectAccount({ id: 'acct_x' } as unknown as Stripe.Account);
    expect(s.requirementsDue).toEqual([]);
    expect(s.status).toBe('pending');
  });
});

describe('connectAccountFromEvent', () => {
  it('returns mapped status for account.updated', () => {
    const event = {
      type: 'account.updated',
      data: { object: acct({ charges_enabled: true, payouts_enabled: true, details_submitted: true }) },
    } as unknown as Stripe.Event;
    expect(connectAccountFromEvent(event)?.status).toBe('active');
  });

  it('returns null for unrelated events', () => {
    const event = { type: 'customer.subscription.created', data: { object: {} } } as unknown as Stripe.Event;
    expect(connectAccountFromEvent(event)).toBeNull();
  });
});

describe('createConnectAccount', () => {
  it('creates an Express account + onboarding link and returns both', async () => {
    const { client, accountsCreate, accountLinksCreate } = buildConnectMock();
    accountsCreate.mockResolvedValue({ id: 'acct_new' });
    accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/x' });

    const res = await createConnectAccount({
      stripeClient: client,
      email: 'a@b.com',
      idempotencyRef: 'user_7',
      returnUrl: 'https://app/return',
      refreshUrl: 'https://app/refresh',
    });

    expect(res).toEqual({ accountId: 'acct_new', onboardingUrl: 'https://connect.stripe.com/setup/x' });
    expect(accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        email: 'a@b.com',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      }),
      { idempotencyKey: 'connect-account-user_7' },
    );
    expect(accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_new', type: 'account_onboarding' }),
      { idempotencyKey: 'account-link-acct_new' },
    );
  });

  it('merges extra accountParams', async () => {
    const { client, accountsCreate, accountLinksCreate } = buildConnectMock();
    accountsCreate.mockResolvedValue({ id: 'acct_2' });
    accountLinksCreate.mockResolvedValue({ url: 'https://x' });
    await createConnectAccount({
      stripeClient: client,
      email: 'a@b.com',
      idempotencyRef: 'u',
      returnUrl: 'r',
      refreshUrl: 'f',
      accountParams: { business_profile: { name: 'Acme' } },
    });
    expect(accountsCreate.mock.calls[0]?.[0]).toMatchObject({ business_profile: { name: 'Acme' } });
  });

  it('wraps Stripe failures in InternalError', async () => {
    const { client, accountsCreate } = buildConnectMock();
    accountsCreate.mockRejectedValue(new Error('stripe down'));
    await expect(
      createConnectAccount({ stripeClient: client, email: 'a@b.com', idempotencyRef: 'u', returnUrl: 'r', refreshUrl: 'f' }),
    ).rejects.toThrow('Stripe Connect account creation failed: stripe down');
  });

  it('throws when neither key nor client provided', async () => {
    await expect(
      createConnectAccount({ email: 'a@b.com', idempotencyRef: 'u', returnUrl: 'r', refreshUrl: 'f' }),
    ).rejects.toThrow('Provide stripeSecretKey or stripeClient');
  });
});

describe('createConnectOnboardingLink', () => {
  it('returns a fresh onboarding URL for an existing account', async () => {
    const { client, accountLinksCreate } = buildConnectMock();
    accountLinksCreate.mockResolvedValue({ url: 'https://resume' });
    const res = await createConnectOnboardingLink({
      stripeClient: client,
      accountId: 'acct_9',
      returnUrl: 'r',
      refreshUrl: 'f',
    });
    expect(res).toEqual({ onboardingUrl: 'https://resume' });
    expect(accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_9', type: 'account_onboarding' }),
    );
  });

  it('wraps Stripe failures in InternalError', async () => {
    const { client, accountLinksCreate } = buildConnectMock();
    accountLinksCreate.mockRejectedValue(new Error('boom'));
    await expect(
      createConnectOnboardingLink({ stripeClient: client, accountId: 'a', returnUrl: 'r', refreshUrl: 'f' }),
    ).rejects.toThrow('Stripe Connect onboarding link failed: boom');
  });
});

describe('getConnectAccountStatus', () => {
  it('retrieves and normalizes the account', async () => {
    const { client, accountsRetrieve } = buildConnectMock();
    accountsRetrieve.mockResolvedValue(
      acct({ charges_enabled: true, payouts_enabled: true, details_submitted: true }),
    );
    const s = await getConnectAccountStatus({ stripeClient: client, accountId: 'acct_1' });
    expect(s.ready).toBe(true);
    expect(accountsRetrieve).toHaveBeenCalledWith('acct_1');
  });

  it('wraps Stripe failures in InternalError', async () => {
    const { client, accountsRetrieve } = buildConnectMock();
    accountsRetrieve.mockRejectedValue(new Error('no such account'));
    await expect(
      getConnectAccountStatus({ stripeClient: client, accountId: 'acct_1' }),
    ).rejects.toThrow('Stripe Connect account retrieval failed: no such account');
  });
});

describe('calculatePlatformFee', () => {
  it('computes 15% (1500 bps) correctly', () => {
    expect(calculatePlatformFee(10000, 1500)).toEqual({ grossCents: 10000, feeCents: 1500, netCents: 8500 });
  });

  it('rounds to the nearest cent', () => {
    // 999 * 1500 / 10000 = 149.85 → 150
    expect(calculatePlatformFee(999, 1500).feeCents).toBe(150);
  });

  it('allows a 0% fee', () => {
    expect(calculatePlatformFee(5000, 0)).toEqual({ grossCents: 5000, feeCents: 0, netCents: 5000 });
  });

  it('rejects negative or non-integer gross', () => {
    expect(() => calculatePlatformFee(-1, 1500)).toThrow('non-negative integer');
    expect(() => calculatePlatformFee(10.5, 1500)).toThrow('non-negative integer');
  });

  it('rejects out-of-range fee basis points', () => {
    expect(() => calculatePlatformFee(100, -1)).toThrow('[0, 10000)');
    expect(() => calculatePlatformFee(100, 10000)).toThrow('[0, 10000)');
  });
});
