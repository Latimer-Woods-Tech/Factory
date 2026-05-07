import Stripe from 'stripe';
import type { Handler, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  ErrorCodes,
  InternalError,
  ValidationError,
  toErrorResponse,
} from '@latimer-woods-tech/errors';

/**
 * Normalized subscription state used across Factory apps.
 */
export interface SubscriptionStatus {
  customerId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  tier: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/**
 * Lifecycle events emitted by {@link stripeWebhookHandler}.
 */
export type SubscriptionEvent =
  | 'created'
  | 'upgraded'
  | 'downgraded'
  | 'canceled'
  | 'past_due';

/**
 * Options for {@link stripeWebhookHandler}.
 */
export interface StripeWebhookHandlerOptions {
  webhookSecret: string;
  stripeClient: Stripe;
  handlers: Partial<
    Record<SubscriptionEvent, (status: SubscriptionStatus) => Promise<void>>
  >;
}

/**
 * Options for {@link createCheckoutSession}.
 */
export interface CreateCheckoutSessionOptions {
  priceId: string;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  stripeClient: Stripe;
  /** Checkout mode. Defaults to `'subscription'`. Use `'payment'` for one-time purchases. */
  mode?: 'subscription' | 'payment';
  /**
   * Idempotency key to prevent duplicate session creation on retry.
   * Recommended when creating sessions inside retry loops.
   */
  idempotencyKey?: string;
  /**
   * Explicitly list accepted payment method types (e.g. `['card']`).
   * When omitted, Stripe determines the list automatically.
   */
  paymentMethodTypes?: string[];
  /** Metadata to attach to the Checkout session. */
  metadata?: Record<string, string>;
}

/**
 * Options for {@link createPortalSession}.
 */
export interface CreatePortalSessionOptions {
  /** Stripe customer ID. */
  customerId: string;
  /** URL the customer is sent to after they leave the portal. */
  returnUrl: string;
  /** Configured Stripe client. */
  stripeClient: Stripe;
}

const FACTORY_API_VERSION: Stripe.LatestApiVersion = '2025-02-24.acacia';
/**
 * Matches unresolved placeholder price IDs such as `price_xxx` that should
 * never be sent to Stripe in a real checkout flow.
 */
const PLACEHOLDER_PRICE_ID_PATTERN = /^price_x+$/i;

/**
 * Creates a Stripe client configured with the Factory-standard API
 * version and the Workers-native fetch HTTP client.
 *
 * @param secretKey - Stripe secret API key.
 * @returns Configured Stripe client.
 */
export function createStripeClient(secretKey: string): Stripe {
  if (!secretKey) {
    throw new ValidationError('Stripe secret key is required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  return new Stripe(secretKey, {
    apiVersion: FACTORY_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Validates a Stripe webhook signature against the request body.
 *
 * @param request - Inbound webhook request.
 * @param webhookSecret - Stripe webhook signing secret.
 * @param stripeClient - Stripe client used to construct the event.
 * @returns The parsed and verified Stripe event.
 * @throws {ValidationError} If the signature header is missing or invalid.
 */
export async function validateWebhook(
  request: Request,
  webhookSecret: string,
  stripeClient: Stripe,
): Promise<Stripe.Event> {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    throw new ValidationError('Missing stripe-signature header', {
      code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
    });
  }

  const body = await request.text();

  try {
    return await stripeClient.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    throw new ValidationError(
      err instanceof Error ? err.message : 'Invalid Stripe webhook',
      { code: ErrorCodes.STRIPE_WEBHOOK_INVALID },
    );
  }
}

function toDate(epochSeconds: number | null | undefined): Date {
  return epochSeconds ? new Date(epochSeconds * 1000) : new Date(0);
}

function normalizeStatus(status: Stripe.Subscription.Status): SubscriptionStatus['status'] {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
      return status;
    default:
      return 'none';
  }
}

function readNumber(source: unknown, key: string): number | null {
  if (source && typeof source === 'object' && key in source) {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : null;
  }
  return null;
}

/**
 * Detects the Stripe invalid-request error emitted when a checkout references
 * a missing price object.
 *
 * @param err - Unknown error thrown by the Stripe SDK.
 * @returns `true` when Stripe identifies the failure as a missing price.
 */
function isStripeMissingPriceError(err: unknown): err is Error {
  if (!(err instanceof Error)) {
    return false;
  }

  const stripeError = err as Error & { type?: unknown; code?: unknown };
  return (
    stripeError.type === 'StripeInvalidRequestError'
    && stripeError.code === 'resource_missing'
    && /no such price/i.test(err.message)
  );
}

function subscriptionToStatus(
  customerId: string,
  subscription: Stripe.Subscription,
): SubscriptionStatus {
  const item = subscription.items.data[0];
  const periodEndSource =
    readNumber(item, 'current_period_end') ??
    readNumber(subscription, 'current_period_end');

  return {
    customerId,
    status: normalizeStatus(subscription.status),
    tier: typeof item?.price.id === 'string' ? item.price.id : 'unknown',
    currentPeriodEnd: toDate(periodEndSource),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

/**
 * Returns the current subscription status for a Stripe customer.
 *
 * @param customerId - Stripe customer ID.
 * @param stripeClient - Configured Stripe client.
 * @returns Normalized subscription status; `status` is `'none'` when no
 *   subscription exists.
 */
export async function getSubscription(
  customerId: string,
  stripeClient: Stripe,
): Promise<SubscriptionStatus> {
  const result = await stripeClient.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 1,
  });

  const subscription = result.data[0];
  if (!subscription) {
    return {
      customerId,
      status: 'none',
      tier: 'none',
      currentPeriodEnd: new Date(0),
      cancelAtPeriodEnd: false,
    };
  }

  return subscriptionToStatus(customerId, subscription);
}

/**
 * Creates a Stripe Checkout session for a subscription or one-time payment.
 *
 * `priceId` must be a live Stripe price ID read from env/secrets — never
 * hardcode it in source.  The function validates the value is non-empty and
 * starts with the canonical `price_` prefix before calling the Stripe API,
 * so misconfigured environments fail fast with a clear error instead of a
 * `StripeInvalidRequestError: No such price` at runtime (factory#343).
 *
 * @param options - Checkout session inputs.
 * @returns The hosted Checkout URL.
 * @throws {ValidationError} If `priceId` is missing or malformed.
 * @throws {InternalError} If Stripe does not return a URL.
 */
export async function createCheckoutSession(
  options: CreateCheckoutSessionOptions,
): Promise<string> {
  const priceId = options.priceId?.trim() ?? '';

  if (!priceId || !priceId.startsWith('price_')) {
    throw new ValidationError(
      `priceId must be a valid Stripe price ID (starts with "price_"); got: "${priceId}". ` +
      'Read the price ID from env/secrets — never hardcode it in source.',
      { code: ErrorCodes.VALIDATION_ERROR },
    );
  }

  if (PLACEHOLDER_PRICE_ID_PATTERN.test(priceId)) {
    throw new ValidationError('Stripe price ID must be configured with a real Stripe price');
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: options.mode ?? 'subscription',
    customer: options.customerId,
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    line_items: [{ price: priceId, quantity: 1 }],
  };

  if (options.paymentMethodTypes) {
    params.payment_method_types = options.paymentMethodTypes as Stripe.Checkout.SessionCreateParams['payment_method_types'];
  }

  if (options.metadata) {
    params.metadata = options.metadata;
  }

  const requestOptions: Stripe.RequestOptions = {};
  if (options.idempotencyKey) {
    requestOptions.idempotencyKey = options.idempotencyKey;
  }

  let session: Stripe.Checkout.Session;

  try {
    session = await options.stripeClient.checkout.sessions.create(params, requestOptions);
  } catch (err) {
    if (isStripeMissingPriceError(err)) {
      throw new ValidationError('Stripe price ID is not recognized by Stripe', {
        priceId,
      });
    }

    throw err;
  }

  if (!session.url) {
    throw new InternalError('Stripe did not return a checkout URL', {
      code: ErrorCodes.INTERNAL_ERROR,
    });
  }

  return session.url;
}

/**
 * Creates a Stripe Customer Portal session for self-service subscription management.
 *
 * @param options - Portal session inputs.
 * @returns The hosted Customer Portal URL.
 * @throws {InternalError} If Stripe does not return a URL.
 */
export async function createPortalSession(
  options: CreatePortalSessionOptions,
): Promise<string> {
  const session = await options.stripeClient.billingPortal.sessions.create({
    customer: options.customerId,
    return_url: options.returnUrl,
  });

  if (!session.url) {
    throw new InternalError('Stripe did not return a portal URL', {
      code: ErrorCodes.INTERNAL_ERROR,
    });
  }

  return session.url;
}

function classifyEvent(event: Stripe.Event): SubscriptionEvent | null {
  switch (event.type) {
    case 'customer.subscription.created':
      return 'created';
    case 'customer.subscription.deleted':
      return 'canceled';
    case 'customer.subscription.updated': {
      const previous = event.data.previous_attributes;
      const subscription = event.data.object;
      if (subscription.status === 'past_due') {
        return 'past_due';
      }
      const previousPriceId =
        previous?.items?.data?.[0]?.price?.id ?? undefined;
      const currentPriceId = subscription.items.data[0]?.price.id;
      if (previousPriceId && currentPriceId && previousPriceId !== currentPriceId) {
        return previousPriceId < currentPriceId ? 'upgraded' : 'downgraded';
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Hono route handler for `/webhooks/stripe`.
 *
 * Validates the Stripe signature, classifies the subscription event,
 * and dispatches it to the matching handler in `options.handlers`.
 *
 * @param options - Handler configuration.
 * @returns A Hono handler.
 */
export function stripeWebhookHandler(options: StripeWebhookHandlerOptions): Handler {
  return async (c) => {
    let event: Stripe.Event;
    try {
      event = await validateWebhook(c.req.raw.clone(), options.webhookSecret, options.stripeClient);
    } catch (err) {
      const response = toErrorResponse(err);
      return c.json(response, 400 as ContentfulStatusCode);
    }

    const kind = classifyEvent(event);
    if (!kind) {
      return c.json({ data: { received: true }, error: null });
    }

    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
    const status = subscriptionToStatus(customerId, subscription);

    const handler = options.handlers[kind];
    if (handler) {
      await handler(status);
    }

    return c.json({ data: { received: true, kind }, error: null });
  };
}

/**
 * Maps a Stripe price ID to an internal tier slug.
 *
 * @param priceId - Stripe price ID.
 * @param tierMap - Mapping of price ID to tier slug.
 * @returns The mapped tier slug or `'unknown'` if not present.
 */
export function priceToTier(priceId: string, tierMap: Record<string, string>): string {
  return tierMap[priceId] ?? 'unknown';
}

export type { Stripe };
export type { MiddlewareHandler };
