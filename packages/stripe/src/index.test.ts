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

function buildStripeMock(overrides: Record<string, unknown> = {}) {
  const webhooks = { constructEventAsync: vi.fn() };
  const subscriptionsList = vi.fn();
  const checkoutCreate = vi.fn();
  const portalCreate = vi.fn();
  const client = {
    webhooks,
    subscriptions: { list: subscriptionsList },
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    ...overrides,
  } as unknown as Stripe;
  return { client, webhooks, subscriptionsList, checkoutCreate, portalCreate };
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
  it('throws when stripe-signature is missing', async () => {
    const { client } = buildStripeMock();
    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });

    await expect(validateWebhook(request, 'whsec', client)).rejects.toThrow(
      'Missing stripe-signature header',
    );
  });

  it('returns the event on success', async () => {
    const event = buildEvent('customer.subscription.created', buildSubscription());
    const { client, webhooks } = buildStripeMock();
    webhooks.constructEventAsync.mockResolvedValue(event);

    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: 'raw-body',
      headers: { 'stripe-signature': 't=1,v1=sig' },
    });

    const result = await validateWebhook(request, 'whsec', client);
    expect(result).toBe(event);
    expect(webhooks.constructEventAsync).toHaveBeenCalledWith(
      'raw-body',
      't=1,v1=sig',
      'whsec',
    );
  });

  it('wraps Stripe verification errors as ValidationError', async () => {
    const { client, webhooks } = buildStripeMock();
    webhooks.constructEventAsync.mockRejectedValue(new Error('bad signature'));

    const request = new Request('https://example.com/webhooks/stripe', {
      method: 'POST',
      body: 'x',
      headers: { 'stripe-signature': 'sig' },
    });

    await expect(validateWebhook(request, 'whsec', client)).rejects.toThrow('bad signature');
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
      }),
    ).rejects.toThrow('priceId must be a valid Stripe price ID');
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
      {},
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
      }),
    ).rejects.toThrow('Stripe did not return a checkout URL');
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
    });

    expect(url).toBe('https://checkout.stripe.com/sess_2');
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'payment' }),
      {},
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

  it('passes paymentMethodTypes when provided', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_4' });

    await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
      paymentMethodTypes: ['card'],
    });

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method_types: ['card'] }),
      {},
    );
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
    });

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: 'u_42', tier: 'pro' } }),
      {},
    );
  });

  it('omits payment_method_types and metadata when not provided', async () => {
    const { client, checkoutCreate } = buildStripeMock();
    checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/sess_6' });

    await createCheckoutSession({
      priceId: 'price_pro',
      customerId: 'cus_123',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeClient: client,
    });

    // Exact match confirms neither payment_method_types nor metadata was passed
    expect(checkoutCreate).toHaveBeenCalledWith(
      {
        mode: 'subscription',
        customer: 'cus_123',
        success_url: 'https://app/ok',
        cancel_url: 'https://app/cancel',
        line_items: [{ price: 'price_pro', quantity: 1 }],
      },
      {},
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
    const { client, webhooks } = buildStripeMock();
    const subscription = buildSubscription();
    webhooks.constructEventAsync.mockResolvedValue(
      buildEvent('customer.subscription.created', subscription),
    );

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { created },
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(created).toHaveBeenCalledTimes(1);
    const status = created.mock.calls[0]?.[0];
    expect(status?.customerId).toBe('cus_123');
  });

  it('classifies subscription.deleted as canceled', async () => {
    const { client, webhooks } = buildStripeMock();
    webhooks.constructEventAsync.mockResolvedValue(
      buildEvent('customer.subscription.deleted', buildSubscription({ status: 'canceled' })),
    );

    const canceled = vi.fn(() => Promise.resolve());
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { canceled },
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(canceled).toHaveBeenCalledTimes(1);
  });

  it('classifies past_due updates correctly', async () => {
    const { client, webhooks } = buildStripeMock();
    webhooks.constructEventAsync.mockResolvedValue(
      buildEvent(
        'customer.subscription.updated',
        buildSubscription({ status: 'past_due' }),
      ),
    );
    const past_due = vi.fn(() => Promise.resolve());
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { past_due },
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(past_due).toHaveBeenCalledTimes(1);
  });

  it('classifies price upgrades and downgrades', async () => {
    const { client, webhooks } = buildStripeMock();
    const sub = buildSubscription();
    sub.items.data[0]!.price.id = 'price_z';
    webhooks.constructEventAsync.mockResolvedValueOnce(
      buildEvent('customer.subscription.updated', sub, {
        items: { data: [{ price: { id: 'price_a' } }] },
      }),
    );

    const upgraded = vi.fn(() => Promise.resolve());
    const downgraded = vi.fn(() => Promise.resolve());
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { upgraded, downgraded },
    });

    let response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(upgraded).toHaveBeenCalledTimes(1);

    const sub2 = buildSubscription();
    sub2.items.data[0]!.price.id = 'price_a';
    webhooks.constructEventAsync.mockResolvedValueOnce(
      buildEvent('customer.subscription.updated', sub2, {
        items: { data: [{ price: { id: 'price_z' } }] },
      }),
    );

    response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(downgraded).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when signature validation fails', async () => {
    const { client, webhooks } = buildStripeMock();
    webhooks.constructEventAsync.mockRejectedValue(new Error('bad sig'));

    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: {},
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });
    expect(response.status).toBe(400);
  });

  it('ignores unrelated events', async () => {
    const { client, webhooks } = buildStripeMock();
    webhooks.constructEventAsync.mockResolvedValue({
      type: 'invoice.paid',
      data: { object: {} },
    } as unknown as Stripe.Event);

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { created },
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(created).not.toHaveBeenCalled();
  });

  it('extracts customerId when customer is an object', async () => {
    const { client, webhooks } = buildStripeMock();
    const sub = buildSubscription();
    (sub as unknown as Record<string, unknown>).customer = { id: 'cus_obj' };
    webhooks.constructEventAsync.mockResolvedValue(
      buildEvent('customer.subscription.created', sub),
    );

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { created },
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(created.mock.calls[0]?.[0]?.customerId).toBe('cus_obj');
  });

  it('returns null classification when updated event has no price change', async () => {
    const { client, webhooks } = buildStripeMock();
    const sub = buildSubscription();
    webhooks.constructEventAsync.mockResolvedValue(
      buildEvent('customer.subscription.updated', sub, {
        items: { data: [{ price: { id: 'price_pro' } }] },
      }),
    );

    const created = vi.fn(((status: SubscriptionStatus) => { void status; return Promise.resolve(); }));
    const app = buildApp({
      webhookSecret: 'whsec',
      stripeClient: client,
      handlers: { created },
    });

    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
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