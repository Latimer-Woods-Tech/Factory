import Stripe from 'stripe';
import type { Handler, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  ErrorCodes,
  InternalError,
  ValidationError,
  toErrorResponse,
} from '@latimer-woods-tech/errors';
import { createDb, stripeIdempotencyKeys, eq } from '@latimer-woods-tech/neon';

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
 * Minimal KV namespace interface required by {@link stripeWebhookHandler} for
 * event-ID deduplication. Satisfied by Cloudflare Workers `KVNamespace` and any
 * compatible mock.
 */
export interface StripeKVCache {
  /** Returns the stored string value, or `null` if the key does not exist. */
  get(key: string): Promise<string | null>;
  /**
   * Stores a string value with an optional TTL.
   *
   * @param key - Cache key.
   * @param value - String value to store.
   * @param options - Optional write options.
   * @param options.expirationTtl - Seconds until the key expires.
   */
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Options for {@link stripeWebhookHandler}.
 */
export interface StripeWebhookHandlerOptions {
  webhookSecret: string;
  handlers: Partial<
    Record<SubscriptionEvent, (status: SubscriptionStatus) => Promise<void>>
  >;
  /**
   * KV namespace used to deduplicate Stripe events by `event.id`.
   *
   * Stripe may deliver the same event more than once within its 7-day retry
   * window. Providing a KV binding here ensures at-most-once processing:
   * a processed event ID is stored with a 7-day TTL, and any duplicate
   * delivery returns HTTP 200 immediately without re-invoking the handler.
   *
   * **This field is REQUIRED for production deployments.** Omitting it
   * disables deduplication and risks duplicate billing side-effects.
   *
   * Pass `env.KV` (your Worker's KV binding) as this value.
   */
  kvCache: StripeKVCache;
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
   * Stable idempotency key scoped to the logical purchase operation.
   * Must be tied to an external business ID (order ID, cart ID, session ID)
   * so that retries and double-clicks within Stripe's 24-hour window
   * are deduplicated without risking duplicate charges.
   */
  idempotencyKey: string;
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

/** @internal Constant-time byte comparison — prevents timing-based side-channel attacks. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  const va = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const vb = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= va.getUint8(i) ^ vb.getUint8(i);
  return diff === 0;
}

/** @internal Convert a lowercase hex string to Uint8Array. Returns null on invalid input. */
function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * @internal HMAC-SHA256 webhook signature verification via Web Crypto API.
 *
 * Validates all security properties required by the Stripe signature scheme:
 * - Format: rejects headers missing `t=` timestamp or `v1=` signature components.
 * - Replay protection: rejects timestamps outside the ±300-second tolerance window.
 * - Signature integrity: computes HMAC-SHA256 over `"${timestamp}.${body}"` and
 *   compares against every `v1=` candidate in the header.
 * - Timing safety: comparison uses `bytesEqual()` (XOR accumulator) to prevent
 *   timing side-channel attacks that could leak information about the correct value.
 *
 * Edge-case test coverage lives in `index.test.ts` → `describe('validateWebhook')`:
 * missing header, no timestamp, no v1 component, expired timestamp, HMAC mismatch,
 * invalid JSON post-signature, and a fully valid round-trip.
 */
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<void> {
  const parts = signature.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1Sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));

  if (!timestamp || v1Sigs.length === 0) {
    throw new ValidationError('Invalid stripe-signature format', {
      code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
    });
  }

  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) {
    throw new ValidationError('Stripe webhook timestamp outside tolerance window', {
      code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
    });
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`)),
  );

  // Constant-time comparison across all provided v1 signatures — prevents timing
  // attacks that could reveal information about the correct signature value.
  const matched = v1Sigs.some((sig) => {
    const sigBytes2 = hexToBytes(sig);
    return sigBytes2 !== null && bytesEqual(sigBytes, sigBytes2);
  });

  if (!matched) {
    throw new ValidationError('Stripe webhook signature mismatch', {
      code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
    });
  }
}

/**
 * Validates a Stripe webhook signature using the Web Crypto API (HMAC-SHA256)
 * and returns the parsed event. No Stripe SDK required — compatible with all
 * Cloudflare Workers runtimes.
 *
 * @param request - Inbound webhook request.
 * @param webhookSecret - Stripe webhook signing secret (`whsec_…`).
 * @returns The parsed and verified Stripe event.
 * @throws {ValidationError} If the signature header is missing, invalid, or expired.
 */
export async function validateWebhook(
  request: Request,
  webhookSecret: string,
): Promise<Stripe.Event> {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    throw new ValidationError('Missing stripe-signature header', {
      code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
    });
  }

  const body = await request.text();

  await verifyStripeSignature(body, signature, webhookSecret);

  try {
    return JSON.parse(body) as Stripe.Event;
  } catch {
    throw new ValidationError('Invalid webhook payload JSON', {
      code: ErrorCodes.STRIPE_WEBHOOK_INVALID,
    });
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
 * @param options - Checkout session inputs.  `options.idempotencyKey` **must**
 *   be a stable, unique value scoped to the business operation — e.g., a cart
 *   ID, order ID, or server-side checkout UUID.  Callers that generate a fresh
 *   random key on every call defeat Stripe's 24-hour deduplication window and
 *   risk duplicate charges on retries or double-clicks.  See
 *   {@link CreateCheckoutSessionOptions.idempotencyKey} for the full contract.
 * @returns The hosted Checkout URL.
 * @throws {ValidationError} If `priceId` is missing or malformed.
 * @throws {InternalError} If Stripe does not return a URL.
 */
export async function createCheckoutSession(
  options: CreateCheckoutSessionOptions,
): Promise<string> {
  const priceId = options.priceId?.trim() ?? '';

  if (!priceId) {
    throw new ValidationError('Stripe price ID is required', { code: ErrorCodes.VALIDATION_ERROR });
  }

  if (!priceId.startsWith('price_')) {
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

  if (options.metadata) {
    params.metadata = options.metadata;
  }

  const requestOptions: Stripe.RequestOptions = {
    idempotencyKey: options.idempotencyKey,
  };

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

/** TTL for processed Stripe event IDs in KV — matches Stripe's 7-day retry window. */
const STRIPE_EVENT_DEDUP_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Hono route handler for `/webhooks/stripe`.
 *
 * Validates the Stripe signature, deduplicates the event via KV (to guard
 * against Stripe's at-least-once delivery), classifies the subscription event,
 * and dispatches it to the matching handler in `options.handlers`.
 *
 * **Event deduplication (RED-tier billing requirement):**
 * After signature verification, the handler checks `event.id` against
 * `options.kvCache`. If the event has already been processed it returns
 * HTTP 200 immediately with `{ deduplicated: true }` — no handler is called.
 * Processed event IDs are stored with a 7-day TTL matching Stripe's retry window.
 *
 * @param options - Handler configuration including a KV binding for dedup.
 * @returns A Hono handler.
 */
export function stripeWebhookHandler(options: StripeWebhookHandlerOptions): Handler {
  return async (c) => {
    let event: Stripe.Event;
    try {
      event = await validateWebhook(c.req.raw.clone(), options.webhookSecret);
    } catch (err) {
      const response = toErrorResponse(err);
      return c.json(response, 400 as ContentfulStatusCode);
    }

    // RED-tier billing requirement: deduplicate by Stripe event.id.
    // Stripe guarantees at-least-once delivery; the same event can arrive
    // multiple times within its 7-day retry window.
    const dedupKey = `stripe:event:${event.id}`;
    const alreadyProcessed = await options.kvCache.get(dedupKey);
    if (alreadyProcessed) {
      return c.json({ data: { received: true, deduplicated: true }, error: null });
    }

    const kind = classifyEvent(event);
    if (!kind) {
      // Mark as processed even for unclassified events to prevent repeat delivery
      // of non-actionable events from triggering redundant work.
      await options.kvCache.put(dedupKey, '1', { expirationTtl: STRIPE_EVENT_DEDUP_TTL_SECONDS });
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

    // Persist the event ID AFTER successful handler execution so that a handler
    // crash does not permanently suppress retry delivery.
    await options.kvCache.put(dedupKey, '1', { expirationTtl: STRIPE_EVENT_DEDUP_TTL_SECONDS });

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

// ---------------------------------------------------------------------------
// Idempotency-key helper (P2.13h)
// ---------------------------------------------------------------------------

/** Options for transferOrIdempotent. */
export interface IdempotentTransferOptions {
  /** Stripe secret key. Required when stripeClient is not provided. */
  stripeSecretKey?: string;
  /** Optional pre-built Stripe client (for testing). */
  stripeClient?: Stripe;
  /** Hyperdrive-compatible Neon DB binding for idempotency key persistence. */
  neonDb: { connectionString: string };
  /** Pre-generated idempotency key (UUID recommended). */
  idempotencyKey: string;
  /** Destination Stripe Connect account ID. */
  destination: string;
  /** Amount in cents. */
  amountCents: number;
  /** ISO 4217 currency code (lowercase). Default: 'usd'. */
  currency?: string;
  /** Optional attribution for cost accounting. */
  tenantId?: string;
  runId?: string;
  actor?: string;
  /** Optional transfer metadata passed through to Stripe. */
  metadata?: Record<string, string>;
}

/** Result of a transferOrIdempotent call. */
export interface IdempotentTransferResult {
  /** Stripe transfer ID. */
  transferId: string;
  /** True when this call performed the transfer; false when a previous call did. */
  isNew: boolean;
}

/**
 * Persists an idempotency key to Neon BEFORE calling Stripe, so a Worker
 * crash mid-call never results in a double-charge.
 *
 * Flow:
 *   1. INSERT idempotency key with status='pending' (unique constraint)
 *   2. If INSERT conflicts, look up the existing row:
 *      - status='success' → return stored transfer ID (idempotent replay)
 *      - status='failed'  → throw stored error
 *      - status='pending' → another request is in flight; throw conflict error
 *   3. Call Stripe stripe.transfers.create()
 *   4. On success: UPDATE status='success', stripe_response=...
 *   5. On failure: UPDATE status='failed', stripe_error=...
 *
 * @throws {InternalError} when Stripe rejects the transfer.
 */
export async function transferOrIdempotent(
  opts: IdempotentTransferOptions,
): Promise<IdempotentTransferResult> {
  if (!opts.stripeSecretKey && !opts.stripeClient) {
    throw new InternalError('transferOrIdempotent: provide stripeSecretKey or stripeClient');
  }
  const db = createDb(opts.neonDb);
  const stripe = opts.stripeClient ?? new Stripe(opts.stripeSecretKey!);

  // Step 1: try to claim the idempotency key
  const inserted = await db
    .insert(stripeIdempotencyKeys)
    .values({
      idempotencyKey: opts.idempotencyKey,
      stripeOperation: 'transfer',
      status: 'pending',
      tenantId: opts.tenantId,
      runId: opts.runId,
      actor: opts.actor,
    })
    .onConflictDoNothing({ target: stripeIdempotencyKeys.idempotencyKey })
    .returning({ id: stripeIdempotencyKeys.id });

  // Step 2: conflict → look up existing row
  if (inserted.length === 0) {
    const existing = await db
      .select({
        status: stripeIdempotencyKeys.status,
        stripeResponse: stripeIdempotencyKeys.stripeResponse,
        stripeError: stripeIdempotencyKeys.stripeError,
      })
      .from(stripeIdempotencyKeys)
      .where(eq(stripeIdempotencyKeys.idempotencyKey, opts.idempotencyKey))
      .limit(1);

    const row = existing[0];
    if (!row) throw new InternalError('idempotency key conflict but row not found');

    if (row.status === 'success') {
      const transferId = (row.stripeResponse as { id?: string } | null)?.id;
      if (!transferId) throw new InternalError('missing transfer ID in stored response');
      return { transferId, isNew: false };
    }
    if (row.status === 'failed') {
      throw new InternalError(`transfer failed (stored): ${row.stripeError ?? 'unknown'}`);
    }
    throw new InternalError('transfer in progress: concurrent request holds this idempotency key');
  }

  // Step 3 & 4: call Stripe, then update the key
  const rowId = inserted[0]?.id;
  if (!rowId) throw new InternalError('unexpected: insert returned no row id');

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: opts.amountCents,
        currency: opts.currency ?? 'usd',
        destination: opts.destination,
        metadata: opts.metadata ?? {},
      },
      { idempotencyKey: opts.idempotencyKey },
    );

    await db
      .update(stripeIdempotencyKeys)
      .set({ status: 'success', stripeResponse: transfer as unknown as Record<string, unknown>, resolvedAt: new Date() })
      .where(eq(stripeIdempotencyKeys.id, rowId));

    return { transferId: transfer.id, isNew: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(stripeIdempotencyKeys)
      .set({ status: 'failed', stripeError: msg, resolvedAt: new Date() })
      .where(eq(stripeIdempotencyKeys.id, rowId));
    throw new InternalError(`Stripe transfer failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Stripe Connect — Express onboarding + account status (shared across apps)
// ---------------------------------------------------------------------------
//
// Both Capricast (creator payouts) and SelfPrime/HumanDesign (practitioner
// payouts) onboard connected accounts as Stripe **Express** accounts via
// `accounts.create` + `accountLinks.create`, gate readiness on
// `charges_enabled && payouts_enabled && details_submitted`, and sync status
// from the `account.updated` webhook. These helpers are the single source of
// truth for that flow. Direct money movement uses destination charges in both
// apps; per-batch transfer payouts (Capricast-only) are intentionally NOT
// abstracted here — they build on `transferOrIdempotent` above.

/** Normalized lifecycle status for a Connect (Express) connected account. */
export type ConnectOnboardingStatus = 'pending' | 'restricted' | 'active' | 'inactive';

/** Normalized, app-agnostic snapshot of a connected account's readiness. */
export interface ConnectAccountStatus {
  /** Stripe connected-account ID (`acct_…`). */
  accountId: string;
  /** Whether the account can accept charges. */
  chargesEnabled: boolean;
  /** Whether the account can receive payouts. */
  payoutsEnabled: boolean;
  /** Whether the account finished the hosted onboarding form. */
  detailsSubmitted: boolean;
  /** Derived lifecycle status. */
  status: ConnectOnboardingStatus;
  /** True iff `chargesEnabled && payoutsEnabled && detailsSubmitted`. */
  ready: boolean;
  /** Requirement IDs currently blocking the account (`currently_due` ∪ `past_due`). */
  requirementsDue: string[];
}

/** @internal Resolve a Stripe client from a secret key or a pre-built client. */
function resolveStripeClient(opts: { stripeSecretKey?: string; stripeClient?: Stripe }): Stripe {
  if (opts.stripeClient) return opts.stripeClient;
  if (opts.stripeSecretKey) return createStripeClient(opts.stripeSecretKey);
  throw new ValidationError('Provide stripeSecretKey or stripeClient', {
    code: ErrorCodes.VALIDATION_ERROR,
  });
}

/**
 * Pure mapper from a Stripe Account to the normalized {@link ConnectAccountStatus}.
 * No network calls, so it is fully unit-testable.
 *
 * Status derivation:
 * - `inactive`   — account was deauthorized (pass `{ deauthorized: true }`)
 * - `active`     — charges + payouts enabled and details submitted (`ready`)
 * - `restricted` — details submitted but charges or payouts still disabled
 * - `pending`    — onboarding not yet completed
 *
 * @param account - Stripe Account object (or minimal subset).
 * @param opts - Set `deauthorized` when handling `account.application.deauthorized`.
 * @returns Normalized account status.
 */
export function mapConnectAccount(
  account: Pick<Stripe.Account, 'id' | 'charges_enabled' | 'payouts_enabled' | 'details_submitted' | 'requirements'>,
  opts: { deauthorized?: boolean } = {},
): ConnectAccountStatus {
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);
  const ready = chargesEnabled && payoutsEnabled && detailsSubmitted;

  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];
  const requirementsDue = Array.from(new Set([...currentlyDue, ...pastDue]));

  let status: ConnectOnboardingStatus;
  if (opts.deauthorized) {
    status = 'inactive';
  } else if (ready) {
    status = 'active';
  } else if (detailsSubmitted) {
    status = 'restricted';
  } else {
    status = 'pending';
  }

  return {
    accountId: account.id,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    status,
    ready: opts.deauthorized ? false : ready,
    requirementsDue,
  };
}

/**
 * Extracts a normalized {@link ConnectAccountStatus} from an `account.updated`
 * webhook event. Returns `null` for any other event type.
 *
 * `account.application.deauthorized` is intentionally not handled here: its
 * event payload carries the application, not the account, so callers should map
 * it from the `Stripe-Account` header to `{ status: 'inactive' }` directly.
 *
 * @param event - A verified Stripe event.
 * @returns Normalized status, or `null` if the event is not `account.updated`.
 */
export function connectAccountFromEvent(event: Stripe.Event): ConnectAccountStatus | null {
  if (event.type !== 'account.updated') return null;
  return mapConnectAccount(event.data.object);
}

/** Options for {@link createConnectAccount}. */
export interface CreateConnectAccountOptions {
  /** Stripe secret key. Required when `stripeClient` is not provided. */
  stripeSecretKey?: string;
  /** Optional pre-built Stripe client (for testing). */
  stripeClient?: Stripe;
  /** Email for the connected account. */
  email: string;
  /** Stable reference (e.g. userId) used for the account-create idempotency key. */
  idempotencyRef: string;
  /** URL Stripe returns to after onboarding completes. */
  returnUrl: string;
  /** URL Stripe returns to if the onboarding link expires. */
  refreshUrl: string;
  /** Extra account params merged into the Express account (e.g. `business_profile`). */
  accountParams?: Partial<Stripe.AccountCreateParams>;
}

/** Result of {@link createConnectAccount}. */
export interface CreateConnectAccountResult {
  /** Newly created Stripe connected-account ID. */
  accountId: string;
  /** Hosted onboarding URL to redirect the user to. */
  onboardingUrl: string;
}

/**
 * Creates a Stripe **Express** connected account (card_payments + transfers)
 * and a hosted `account_onboarding` link. The account-create call is keyed by
 * `connect-account-${idempotencyRef}` so retries never create duplicates.
 *
 * @param opts - Account + link options.
 * @returns The new account ID and the hosted onboarding URL.
 * @throws {InternalError} If Stripe rejects the account or link creation.
 */
export async function createConnectAccount(
  opts: CreateConnectAccountOptions,
): Promise<CreateConnectAccountResult> {
  const stripe = resolveStripeClient(opts);
  try {
    const account = await stripe.accounts.create(
      {
        type: 'express',
        email: opts.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        ...opts.accountParams,
      },
      { idempotencyKey: `connect-account-${opts.idempotencyRef}` },
    );

    const link = await stripe.accountLinks.create(
      {
        account: account.id,
        type: 'account_onboarding',
        return_url: opts.returnUrl,
        refresh_url: opts.refreshUrl,
      },
      { idempotencyKey: `account-link-${account.id}` },
    );

    return { accountId: account.id, onboardingUrl: link.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new InternalError(`Stripe Connect account creation failed: ${msg}`);
  }
}

/** Options for {@link createConnectOnboardingLink}. */
export interface ConnectOnboardingLinkOptions {
  /** Stripe secret key. Required when `stripeClient` is not provided. */
  stripeSecretKey?: string;
  /** Optional pre-built Stripe client (for testing). */
  stripeClient?: Stripe;
  /** Existing connected-account ID to generate a fresh onboarding link for. */
  accountId: string;
  /** URL Stripe returns to after onboarding completes. */
  returnUrl: string;
  /** URL Stripe returns to if the onboarding link expires. */
  refreshUrl: string;
}

/**
 * Generates a fresh hosted onboarding link for an existing connected account —
 * used to resume an incomplete onboarding. Account links are single-use and
 * short-lived, so no idempotency key is applied.
 *
 * @param opts - Link options.
 * @returns The hosted onboarding URL.
 * @throws {InternalError} If Stripe rejects the link creation.
 */
export async function createConnectOnboardingLink(
  opts: ConnectOnboardingLinkOptions,
): Promise<{ onboardingUrl: string }> {
  const stripe = resolveStripeClient(opts);
  try {
    const link = await stripe.accountLinks.create({
      account: opts.accountId,
      type: 'account_onboarding',
      return_url: opts.returnUrl,
      refresh_url: opts.refreshUrl,
    });
    return { onboardingUrl: link.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new InternalError(`Stripe Connect onboarding link failed: ${msg}`);
  }
}

/**
 * Retrieves a connected account from Stripe and returns its normalized
 * {@link ConnectAccountStatus}. Use this to sync DB state after onboarding or
 * on a status-poll endpoint.
 *
 * @param opts - Stripe client/key + the account ID to retrieve.
 * @returns Normalized account status.
 * @throws {InternalError} If Stripe rejects the retrieval.
 */
export async function getConnectAccountStatus(opts: {
  stripeSecretKey?: string;
  stripeClient?: Stripe;
  accountId: string;
}): Promise<ConnectAccountStatus> {
  const stripe = resolveStripeClient(opts);
  try {
    const account = await stripe.accounts.retrieve(opts.accountId);
    return mapConnectAccount(account);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new InternalError(`Stripe Connect account retrieval failed: ${msg}`);
  }
}

/** Result of {@link calculatePlatformFee}. */
export interface PlatformFeeResult {
  /** Full charge amount in cents. */
  grossCents: number;
  /** Platform application fee in cents. */
  feeCents: number;
  /** Amount the connected account nets after the platform fee, in cents. */
  netCents: number;
}

/**
 * Computes the platform application fee for a destination charge using basis
 * points (e.g. `1500` = 15%). Matches the SelfPrime `PLATFORM_FEE_BPS`
 * convention; Capricast's percent value maps as `percent * 100`.
 *
 * @param grossCents - Full charge amount in cents (non-negative integer).
 * @param feeBps - Platform fee in basis points, in the range `[0, 10000)`.
 * @returns Gross, fee, and net amounts in cents.
 * @throws {ValidationError} If inputs are out of range.
 */
export function calculatePlatformFee(grossCents: number, feeBps: number): PlatformFeeResult {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new ValidationError('grossCents must be a non-negative integer', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps >= 10000) {
    throw new ValidationError('feeBps must be in the range [0, 10000)', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }
  const feeCents = Math.round((grossCents * feeBps) / 10000);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}

export type { Stripe };
export type { MiddlewareHandler };
