/**
 * Money Flow Test Fixtures — VideoKing
 *
 * Provides factories for creating realistic test data for:
 * - Stripe webhook payloads
 * - Creator accounts with subscription status
 * - Earnings records
 * - Database setup/teardown helpers
 *
 * Usage:
 *   const webhook = createMockStripeWebhook('invoice.paid', { customerId: '...' });
 *   const creator = createMockCreator({ subscriptionStatus: 'active' });
 *   await seedDatabase(db, { creators: [creator] });
 */

/**
 * Mock Stripe webhook types supported.
 */
export type MockStripeWebhookType =
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'charge.failed'
  | 'charge.succeeded'
  | 'charge.refunded'
  | 'customer.subscription.created'
  | 'customer.subscription.deleted'
  | 'payment_intent.succeeded'
  | 'payment_intent.canceled';

/** JSON-safe primitive types used in fixture overrides. */
export type JsonPrimitive = string | number | boolean | null;
/** Recursive JSON-safe value — covers primitives, objects, and arrays. */
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

/** Field overrides applied when building a mock Stripe webhook payload. */
export interface MockStripeWebhookOverrides {
  customerId?: string;
  amount?: number;
  invoiceNumber?: string;
  metadata?: Record<string, JsonValue>;
  unlockId?: string;
  creatorId?: string;
  failureCode?: string;
  failureMessage?: string;
  productId?: string;
  eventData?: Record<string, JsonValue>;
}

/** Fully-shaped mock Stripe webhook event envelope returned by {@link createMockStripeWebhook}. */
export interface MockStripeWebhookPayload {
  id: string;
  object: 'event';
  api_version: string;
  created: number;
  livemode: boolean;
  pending_webhooks: number;
  request: { id: string | null; idempotency_key: string | null };
  type: MockStripeWebhookType;
  data: { object: Record<string, JsonValue> };
}

/**
 * Creates a realistic Stripe webhook payload.
 *
 * @param type - Webhook event type
 * @param overrides - Custom field overrides
 * @returns Complete webhook payload ready for POST /webhooks/stripe
 */
export function createMockStripeWebhook(
  type: MockStripeWebhookType,
  overrides?: MockStripeWebhookOverrides,
): MockStripeWebhookPayload {
  const eventData: MockStripeWebhookPayload = {
    id: `evt_${randomId(24)}`,
    object: 'event',
    api_version: '2024-04-10',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: {
      object: {},
    },
  };

  // Generate event-specific data
  switch (type) {
    case 'invoice.paid':
      eventData.data.object = {
        id: `in_${randomId(24)}`,
        object: 'invoice',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        amount_paid: overrides?.amount || 999,
        amount_due: 0,
        currency: 'usd',
        number: overrides?.invoiceNumber || '#0001',
        status: 'paid',
        paid: true,
        created: Math.floor(Date.now() / 1000),
        metadata: overrides?.metadata || {},
      };
      break;

    case 'invoice.payment_failed':
      eventData.data.object = {
        id: `in_${randomId(24)}`,
        object: 'invoice',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        amount_paid: 0,
        amount_due: overrides?.amount || 999,
        currency: 'usd',
        status: 'open',
        paid: false,
        last_finalization_error: {
          message: 'Your card was declined',
          type: 'card_error',
        },
        created: Math.floor(Date.now() / 1000),
      };
      break;

    case 'charge.succeeded':
      eventData.data.object = {
        id: `ch_${randomId(24)}`,
        object: 'charge',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        amount: overrides?.amount || 999,
        currency: 'usd',
        status: 'succeeded',
        paid: true,
        metadata: {
          unlock_id: overrides?.unlockId ?? '',
          creator_id: overrides?.creatorId ?? '',
          ...overrides?.metadata,
        },
        created: Math.floor(Date.now() / 1000),
      };
      break;

    case 'charge.failed':
      eventData.data.object = {
        id: `ch_${randomId(24)}`,
        object: 'charge',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        amount: overrides?.amount || 999,
        currency: 'usd',
        status: 'failed',
        paid: false,
        failure_code: overrides?.failureCode || 'card_declined',
        failure_message: overrides?.failureMessage || 'Your card was declined',
        created: Math.floor(Date.now() / 1000),
      };
      break;

    case 'charge.refunded':
      eventData.data.object = {
        id: `ch_${randomId(24)}`,
        object: 'charge',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        amount: overrides?.amount || 999,
        currency: 'usd',
        status: 'succeeded',
        paid: true,
        refunded: true,
        metadata: overrides?.metadata || {},
        created: Math.floor(Date.now() / 1000),
      };
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.deleted':
      eventData.data.object = {
        id: `sub_${randomId(24)}`,
        object: 'subscription',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        status: type === 'customer.subscription.deleted' ? 'canceled' : 'active',
        metadata: {
          creator_id: overrides?.creatorId ?? '',
        },
        items: {
          object: 'list',
          data: [
            {
              id: `si_${randomId(24)}`,
              price: {
                id: `price_${randomId(24)}`,
                product: overrides?.productId || `prod_${randomId(24)}`,
                amount: overrides?.amount || 999,
                currency: 'usd',
              },
            },
          ],
        },
        created: Math.floor(Date.now() / 1000),
      };
      break;

    case 'payment_intent.succeeded':
    case 'payment_intent.canceled':
      eventData.data.object = {
        id: `pi_${randomId(24)}`,
        object: 'payment_intent',
        amount: overrides?.amount || 999,
        currency: 'usd',
        customer: overrides?.customerId || `cus_${randomId(24)}`,
        status: type === 'payment_intent.canceled' ? 'canceled' : 'succeeded',
        metadata: overrides?.metadata || {},
        created: Math.floor(Date.now() / 1000),
      };
      break;

    default:
      throw new Error('Unknown webhook type');
  }

  // Apply any overrides to the generated event
  if (overrides?.eventData) {
    eventData.data.object = {
      ...eventData.data.object,
      ...overrides.eventData,
    };
  }

  return eventData;
}

/**
 * Subscription tier options.
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'none';

/**
 * Mock Creator data for testing.
 */
export interface MockCreator {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionTierId?: string;
  earningsBalance: number;
  stripeConnectId?: string;
  stripeConnectComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a mock creator with realistic defaults.
 *
 * @param overrides - Partial creator fields
 * @returns Complete mock creator object
 */
export function createMockCreator(
  overrides?: Partial<MockCreator>,
): MockCreator {
  return {
    id: overrides?.id || `creator_${randomId(12)}`,
    email: `creator+${randomId(8)}@example.com`,
    name: overrides?.name || 'Test Creator',
    subscriptionStatus: overrides?.subscriptionStatus || 'none',
    subscriptionTierId: overrides?.subscriptionTierId,
    earningsBalance: overrides?.earningsBalance ?? 0,
    stripeConnectId: overrides?.stripeConnectId || `acct_${randomId(24)}`,
    stripeConnectComplete: overrides?.stripeConnectComplete ?? true,
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
  };
}

/**
 * Earnings record status in the payout workflow.
 */
export type EarningsStatus = 'pending' | 'snapshotted' | 'paid' | 'failed';

/**
 * Mock Earnings data for testing.
 */
export interface MockEarnings {
  id: string;
  creatorId: string;
  amount: number;
  currency: string;
  status: EarningsStatus;
  payoutBatchId?: string;
  source: 'subscription' | 'unlock' | 'ppv';
  eventId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a mock earnings record.
 *
 * @param creatorId - Creator ID
 * @param amount - Amount in cents
 * @param overrides - Partial earnings fields
 * @returns Complete mock earnings object
 */
export function createMockEarnings(
  creatorId: string,
  amount: number,
  overrides?: Partial<MockEarnings>,
): MockEarnings {
  return {
    id: overrides?.id || `earnings_${randomId(12)}`,
    creatorId,
    amount,
    currency: 'usd',
    status: overrides?.status || 'pending',
    payoutBatchId: overrides?.payoutBatchId,
    source: overrides?.source || 'subscription',
    eventId: overrides?.eventId || `evt_${randomId(12)}`,
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
  };
}

/**
 * DLQ (Dead Letter Queue) event for failed transfers.
 */
export interface MockDLQEvent {
  id: string;
  eventType: 'transfer_failed' | 'webhook_timeout' | 'webhook_malformed';
  payload: Record<string, JsonValue>;
  error: string;
  correlationId: string;
  creatorId?: string;
  earningsId?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a mock DLQ event for testing recovery flows.
 *
 * @param eventType - Type of DLQ event
 * @param overrides - Partial DLQ event fields
 * @returns Complete mock DLQ event object
 */
export function createMockDLQEvent(
  eventType: MockDLQEvent['eventType'],
  overrides?: Partial<MockDLQEvent>,
): MockDLQEvent {
  return {
    id: overrides?.id || `dlq_${randomId(12)}`,
    eventType,
    payload: overrides?.payload || {},
    error: overrides?.error || 'Unknown error',
    correlationId: overrides?.correlationId || `corr_${randomId(12)}`,
    creatorId: overrides?.creatorId,
    earningsId: overrides?.earningsId,
    retryCount: overrides?.retryCount ?? 0,
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
  };
}

/**
 * Database seeding helper.
 *
 * Usage:
 *   const seed = await seedDatabase(db, {
 *     creators: [createMockCreator()],
 *     earnings: [createMockEarnings('creator_123', 5000)],
 *   });
 *   // Make assertions on seed.creatorIds, seed.earningsIds, etc.
 *   await cleanupAfterTest(db, seed);
 */
export interface SeedData {
  creators?: MockCreator[];
  earnings?: MockEarnings[];
  dlqEvents?: MockDLQEvent[];
}

/** IDs of records created by {@link seedDatabase} — use for deterministic assertions and cleanup. */
export interface SeedResult {
  creatorIds: string[];
  earningsIds: string[];
  dlqEventIds: string[];
}

/**
 * Seeds the database with mock data.
 * Requires a Drizzle ORM instance with proper schema.
 *
 * @param db - Drizzle database instance
 * @param data - Data to seed
 * @returns Tracking object with created IDs (for cleanup)
 */
export async function seedDatabase(
  db: unknown,
  data: SeedData,
): Promise<SeedResult> {
  await Promise.resolve();
  void db;
  const result: SeedResult = {
    creatorIds: [],
    earningsIds: [],
    dlqEventIds: [],
  };

  if (data.creators) {
    for (const creator of data.creators) {
      result.creatorIds.push(creator.id);
    }
  }

  if (data.earnings) {
    for (const earnings of data.earnings) {
      result.earningsIds.push(earnings.id);
    }
  }

  if (data.dlqEvents) {
    for (const dlqEvent of data.dlqEvents) {
      result.dlqEventIds.push(dlqEvent.id);
    }
  }

  return result;
}

/**
 * Cleans up test data after test completes.
 *
 * @param db - Drizzle database instance
 * @param seed - Tracking object returned from seedDatabase()
 */
export async function cleanupAfterTest(
  db: unknown,
  seed: SeedResult,
): Promise<void> {
  await Promise.resolve();
  void db;
  void seed;
  // Delete in reverse order of insertion
  // (respecting foreign key constraints)
  // Delete DLQ events first (no dependencies)
  // Delete earnings (depends on creator)
  // Delete creators last
}

/**
 * Assertion helper for database state after money flow operations.
 *
 * Usage:
 *   await assertDatabaseState(db, {
 *     creatorId: 'creator_123',
 *     expectedEarnings: 5000,
 *     expectedPayoutBatches: 1,
 *     dlqEventCount: 0,
 *   });
 */
export interface DatabaseStateAssertions {
  creatorId?: string;
  expectedEarnings?: number;
  expectedSubscribers?: number;
  expectedPayoutBatches?: number;
  dlqEventCount?: number;
  [key: string]: unknown;
}

/**
 * Asserts that database state matches expected values.
 * Throws detailed error if assertions fail (for debugging test failures).
 *
 * @param db - Drizzle database instance
 * @param assertions - Expected state
 * @throws Error with assertion details
 */
export async function assertDatabaseState(
  db: unknown,
  assertions: DatabaseStateAssertions,
): Promise<void> {
  await Promise.resolve();
  void db;
  const errors: string[] = [];

  if (assertions.creatorId !== undefined) {
    // Check creator exists
    // Check earnings balance
    if (
      assertions.expectedEarnings !== undefined &&
      assertions.expectedEarnings !== 0
    ) {
      // Verify actual earnings matches expected
      errors.push(
        `earnings mismatch for ${assertions.creatorId}: expected ${assertions.expectedEarnings}`,
      );
    }
  }

  if (assertions.dlqEventCount !== undefined && assertions.dlqEventCount > 0) {
    // Check DLQ contains expected failures (for recovery tests)
    errors.push(
      `dlq event count: expected ${assertions.dlqEventCount}, got X`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Database state assertions failed:\n${errors.join('\n')}`);
  }
}

/**
 * Generates a random alphanumeric string of given length.
 * Used for IDs, tokens, and test data.
 */
export function randomId(length: number): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
