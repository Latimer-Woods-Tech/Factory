import { Hono } from 'hono';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import {
  createCheckoutSession,
  createPortalSession,
  createStripeClient,
  getSubscription,
  priceToTier,
  stripeWebhookHandler,
  validateWebhook,
  type SubscriptionStatus,
} from './index';

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
  function buildApp(opts: Parameters<typeof stripeWebhookHandler>[0]) {
    const app = new Hono();
    app.post('/webhooks/stripe', stripeWebhookHandler(opts));
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
    const upgradeEvent = buildEvent('customer.subscription.updated', sub, {
      items: { data: [{ price: { id: 'price_a' } }] },
    });
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
    const downgradeEvent = buildEvent('customer.subscription.updated', sub2, {
      items: { data: [{ price: { id: 'price_z' } }] },
    });
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
});

describe('priceToTier', () => {
  it('maps a known price ID to its tier', () => {
    expect(priceToTier('price_pro', { price_pro: 'pro' })).toBe('pro');
  });

  it('returns "unknown" for an unmapped price ID', () => {
    expect(priceToTier('price_other', { price_pro: 'pro' })).toBe('unknown');
  });
});
