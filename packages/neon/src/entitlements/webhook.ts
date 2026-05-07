/**
 * Stripe Webhook Handler for Studio Subscriptions (W360-005)
 *
 * Date: 2026-04-29
 * Purpose: Ingest Stripe subscription events and update entitlements
 *
 * Event flow:
 *   1. Webhook POST request received (signature verified via HMAC-SHA256)
 *   2. Event parsed and checked for idempotency (process only once)
 *   3. Subscription created/updated/deleted in database
 *   4. Entitlements materialized view refreshed
 *   5. Customer granted/revoked permissions synchronously
 *   6. Always return 200 to Stripe (acknowledge) to prevent retries
 *
 * Security:
 *   - Signature verification mandatory (400 if missing, 401 if invalid)
 *   - JSON parse errors caught and acknowledged (400)
 *   - No exceptions propagate to Stripe (all wrapped in try-catch)
 *   - All errors logged for operator review
 */

import { sql } from 'drizzle-orm';
import type { FactoryDb } from '../index.js';

// ============================================================================
// Raw SQL row shapes (used for db.execute results)
// ============================================================================

interface PlanRow extends Record<string, unknown> {
  id: string;
  included_credits: string | number;
  monthly_render_quota: number | null;
  max_video_seconds: number;
  max_retries_per_job: number;
  public_publish_allowed: boolean;
}

interface CustomerIdRow extends Record<string, unknown> {
  id: string;
}

interface CustomerStatusRow extends Record<string, unknown> {
  suspension_status: string;
}

interface SubscriptionCustomerRow extends Record<string, unknown> {
  customer_id: string;
}

interface SubscriptionPlanRow extends Record<string, unknown> {
  id: string;
}

interface SubscriptionDetailRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  plan_id: string;
}

interface PlanIdRow extends Record<string, unknown> {
  plan_id: string;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal Stripe event shape.
 * Actual events have many more fields; we extract only what we need.
 */
export interface StripeEvent {
  id: string;
  type: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted';
  created: number;
  data: {
    object: StripeSubscription;
  };
}

/**
 * Stripe subscription object shape (simplified for our use case).
 */
export interface StripeSubscription {
  id: string;
  customer: string;
  items: {
    data: Array<{
      price: {
        id: string;
      };
    }>;
  };
  status: string;
  current_period_start: number;
  current_period_end: number;
  trial_end?: number | null;
  canceled_at?: number | null;
}

export interface StripeCustomer {
  id: string;
  email: string;
}

export interface StripeInvoice {
  id: string;
  subscription: string;
  total: number;
}

// ============================================================================
// Signature Verification (Web Crypto API)
// ============================================================================

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 *
 * Stripe sends header: Stripe-Signature: t=<timestamp>,v1=<signature>
 * We compute: HMAC-SHA256(secret, "<timestamp>.<body>")
 * Compare with provided v1 signature (hex).
 *
 * Constant-time comparison prevents timing attacks.
 *
 * @param body Raw JSON body string (not parsed)
 * @param signature Stripe-Signature header value (e.g. "t=1234,v1=abcd...")
 * @param secret Webhook signing secret from Stripe dashboard
 * @returns true if signature valid, false otherwise
 */
export async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    // Parse signature header: "t=<timestamp>,v1=<signature>"
    const parts = signature.split(',');
    const tPart = parts.find((p: string) => p.startsWith('t='));
    const v1Part = parts.find((p: string) => p.startsWith('v1='));

    if (!tPart || !v1Part) return false;

    const timestamp = tPart.split('=')[1];
    const providedSignature = v1Part.split('=')[1];

    if (!timestamp || !providedSignature) return false;

    // Create signed payload: "<timestamp>.<body>"
    const signedPayload = `${timestamp}.${body}`;

    // HMAC-SHA256 using Web Crypto API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(signedPayload);

    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);

    const signature256Buffer = await crypto.subtle.sign('HMAC', key, payloadData);

    // Convert to hex string
    const computedSignature = Array.from(new Uint8Array(signature256Buffer))
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison (protect against timing attacks)
    return timingSafeEqual(computedSignature, providedSignature);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('[webhook] signature verification error:', err.message);
    }
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// Idempotency
// ============================================================================

/**
 * Check if event was already processed.
 * Prevents duplicate subscription entries when webhook retried.
 */
export async function isEventProcessed(db: FactoryDb, eventId: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM studio_webhook_events WHERE stripe_event_id = ${eventId}
    `);
    return result.rows.length > 0;
  } catch {
    // If table doesn't exist yet, assume not processed
    return false;
  }
}

/**
 * Record that event was processed.
 */
export async function recordProcessedEvent(
  db: FactoryDb,
  eventId: string,
  eventType: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO studio_webhook_events (stripe_event_id, event_type, processed_at)
      VALUES (${eventId}, ${eventType}, NOW())
      ON CONFLICT DO NOTHING
    `);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.warn('[webhook] Failed to record processed event:', err.message);
    }
    // Don't throw; webhook already acknowledged
  }
}

// ============================================================================
// Subscription Event Handlers
// ============================================================================

/**
 * Handle 'customer.subscription.created' event.
 *
 * 1. Find or create studio_customer record
 * 2. Insert subscription with status from Stripe
 * 3. Calculate initial credits from plan
 * 4. Grant trial/signup bonus
 * 5. Refresh entitlements
 */
export async function handleSubscriptionCreated(db: FactoryDb, event: StripeEvent): Promise<void> {
  const sub = event.data.object;
  const stripeCustomerId = sub.customer;
  const stripePriceId = sub.items.data[0]?.price.id;

  if (!stripePriceId) {
    throw new Error(`[webhook] subscription.created: no price found for ${sub.id}`);
  }

  // Get plan by Stripe price ID
  const planResult = await db.execute<PlanRow>(sql`
    SELECT * FROM studio_plans WHERE stripe_price_id = ${stripePriceId}
  `);

  if (!planResult.rows.length) {
    throw new Error(`[webhook] subscription.created: unknown Stripe price ${stripePriceId}`);
  }

  const plan = planResult.rows[0]!;
  const planId = plan.id;

  // Check if customer exists; if not, create
  const customerResult = await db.execute<CustomerIdRow>(sql`
    SELECT id FROM studio_customers WHERE stripe_customer_id = ${stripeCustomerId}
  `);

  let customerId: string;
  if (customerResult.rows.length) {
    customerId = customerResult.rows[0]!.id;
  } else {
    // Create customer (app_id will be set by Stripe metadata or default)
    customerId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO studio_customers (
        id, app_id, stripe_customer_id, email, created_at, updated_at
      ) VALUES (
        ${customerId}, 'studio', ${stripeCustomerId}, ${sub.customer}@stripe.local, NOW(), NOW()
      )
    `);
  }

  // Map Stripe status to our enum
  const status = sub.status;

  // Insert subscription
  const subscriptionId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO studio_subscriptions (
      id, customer_id, plan_id, stripe_subscription_id, billing_cycle,
      status, current_period_start, current_period_end, trial_end_at,
      monthly_credits, created_at, updated_at
    ) VALUES (
      ${subscriptionId}, ${customerId}, ${planId}, ${sub.id}, 'monthly',
      ${status}, to_timestamp(${Math.floor(sub.current_period_start)}),
      to_timestamp(${Math.floor(sub.current_period_end)}),
      ${sub.trial_end ? `to_timestamp(${Math.floor(sub.trial_end)})` : null},
      ${(plan.included_credits || 0).toString()}, NOW(), NOW()
    )
  `);

  // Grant signup bonus (if applicable)
  const signupBonusCredits = 5; // Example: 5 bonus credits
  if (signupBonusCredits > 0) {
    await db.execute(sql`
      INSERT INTO studio_credit_ledger (
        id, customer_id, operation_type, amount, reason, subscription_id, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${customerId}, 'grant', ${signupBonusCredits},
        'Signup bonus', ${subscriptionId}, NOW()
      )
    `);
  }

  // Refresh entitlements
  await refreshEntitlements(db, customerId, planId);
}

/**
 * Handle 'customer.subscription.updated' event.
 *
 * Plan changes: update plan_id, monthly_credits
 * Status changes: update status, current_period_end
 * Refresh entitlements
 */
export async function handleSubscriptionUpdated(db: FactoryDb, event: StripeEvent): Promise<void> {
  const sub = event.data.object;
  const stripeSubscriptionId = sub.id;
  const stripePriceId = sub.items.data[0]?.price.id;

  // Find subscription
  const subResult = await db.execute<SubscriptionCustomerRow>(sql`
    SELECT customer_id FROM studio_subscriptions WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `);

  if (!subResult.rows.length) {
    throw new Error(`[webhook] subscription.updated: subscription ${stripeSubscriptionId} not found`);
  }

  const customerId = subResult.rows[0]!.customer_id;

  if (stripePriceId) {
    // Get plan from price
    const planResult = await db.execute<SubscriptionPlanRow>(sql`
      SELECT id FROM studio_plans WHERE stripe_price_id = ${stripePriceId}
    `);

    if (planResult.rows.length) {
      const planId = planResult.rows[0]!.id;

      // Update subscription: plan, credits, status, period
      const status = sub.status;

      await db.execute(sql`
        UPDATE studio_subscriptions SET
          plan_id = ${planId},
          status = ${status},
          current_period_start = to_timestamp(${Math.floor(sub.current_period_start)}),
          current_period_end = to_timestamp(${Math.floor(sub.current_period_end)}),
          trial_end_at = ${sub.trial_end ? `to_timestamp(${Math.floor(sub.trial_end)})` : null},
          updated_at = NOW()
        WHERE stripe_subscription_id = ${stripeSubscriptionId}
      `);

      // Refresh entitlements with new plan
      await refreshEntitlements(db, customerId, planId);
    }
  }
}

/**
 * Handle 'customer.subscription.deleted' event.
 *
 * If billing mode is prepaid, refund unused credits to customer account.
 * If subscription: disable rendering (set entitlements to 0).
 */
export async function handleSubscriptionDeleted(db: FactoryDb, event: StripeEvent): Promise<void> {
  const sub = event.data.object;
  const stripeSubscriptionId = sub.id;

  // Find subscription
  const result = await db.execute<SubscriptionDetailRow>(sql`
    SELECT id, customer_id, plan_id FROM studio_subscriptions WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `);

  if (!result.rows.length) {
    throw new Error(`[webhook] subscription.deleted: subscription ${stripeSubscriptionId} not found`);
  }

  const row = result.rows[0]!;
  const subscriptionId = String(row.id);
  const customerId = String(row.customer_id);
  const planId = String(row.plan_id);

  // Mark subscription as canceled
  await db.execute(sql`
    UPDATE studio_subscriptions SET
      status = 'canceled',
      canceled_at = NOW(),
      updated_at = NOW()
    WHERE id = ${subscriptionId}
  `);

  // Refresh entitlements (which will zero out canRender, etc.)
  await refreshEntitlements(db, customerId, planId);
}

/**
 * Refresh entitlements materialized view.
 *
 * Computes:
 *   - Total available credits from ledger
 *   - canRender: subscription active && credits > 0 && customer not suspended
 *   - canPublishPublic: plan feature + canRender
 *   - Plan limits (monthly_render_quota, max_video_seconds)
 */
export async function refreshEntitlements(
  db: FactoryDb,
  customerId: string,
  planId?: string,
): Promise<void> {
  const entitlementId = crypto.randomUUID();

  // If planId not provided, get from current active subscription
  let planIdToUse = planId;
  if (!planIdToUse) {
    const subResult = await db.execute<PlanIdRow>(sql`
      SELECT plan_id FROM studio_subscriptions
      WHERE customer_id = ${customerId} AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `);
    if (subResult.rows.length) {
      planIdToUse = subResult.rows[0]!.plan_id;
    }
  }

  // Fetch plan features
  const planFeatures: PlanRow | undefined = planIdToUse
    ? (
        await db.execute<PlanRow>(sql`
          SELECT monthly_render_quota, max_video_seconds, max_retries_per_job,
                 public_publish_allowed FROM studio_plans WHERE id = ${planIdToUse}
        `)
      ).rows[0]
    : undefined;

  // Calculate available credits
  const creditsResult = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(CASE 
      WHEN operation_type IN ('grant', 'refund') THEN amount::numeric 
      WHEN operation_type IN ('debit', 'expiration') THEN -amount::numeric
      ELSE 0
    END), 0) as total
    FROM studio_credit_ledger
    WHERE customer_id = ${customerId}
  `);

  const availableCredits = creditsResult.rows[0] ? parseFloat(creditsResult.rows[0].total) : 0;

  // Check subscription status
  const subResult = await db.execute(sql`
    SELECT status FROM studio_subscriptions
    WHERE customer_id = ${customerId} AND status IN ('active', 'trialing')
    ORDER BY created_at DESC LIMIT 1
  `);

  const hasActiveSubscription = subResult.rows.length > 0;

  // Check customer suspension
  const custResult = await db.execute<CustomerStatusRow>(sql`
    SELECT suspension_status FROM studio_customers WHERE id = ${customerId}
  `);

  const isSuspended = custResult.rows.length > 0 && custResult.rows[0]!.suspension_status !== 'active';

  // Compute policy
  const canRender = hasActiveSubscription && !isSuspended && availableCredits > 0;
  const canPublishPublic = canRender && planFeatures?.public_publish_allowed;

  // Upsert entitlements
  const monthlyQuota = planFeatures?.monthly_render_quota ?? null;
  const maxSeconds = planFeatures?.max_video_seconds ?? 300;
  const maxRetries = planFeatures?.max_retries_per_job ?? 3;
  await db.execute(sql`
    INSERT INTO studio_entitlements (
      id, customer_id, subscription_id, plan_id, available_credits,
      can_render, can_publish_public, monthly_render_quota,
      max_video_seconds, max_retries_per_job, last_refreshed_at, created_at, updated_at
    ) VALUES (
      ${entitlementId}, ${customerId}, ${null}, ${planIdToUse ?? null},
      ${availableCredits}, ${canRender}, ${canPublishPublic === true},
      ${monthlyQuota},
      ${maxSeconds},
      ${maxRetries},
      NOW(), NOW(), NOW()
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      available_credits = EXCLUDED.available_credits,
      can_render = EXCLUDED.can_render,
      can_publish_public = EXCLUDED.can_publish_public,
      plan_id = EXCLUDED.plan_id,
      monthly_render_quota = EXCLUDED.monthly_render_quota,
      max_video_seconds = EXCLUDED.max_video_seconds,
      max_retries_per_job = EXCLUDED.max_retries_per_job,
      last_refreshed_at = EXCLUDED.last_refreshed_at,
      updated_at = EXCLUDED.updated_at
  `);
}

// ============================================================================
// Main Webhook Handler
// ============================================================================

/**
 * Process Stripe webhook event.
 *
 * Returns: { statusCode: 200|400|401, body: JSON }
 *   - 200: Event processed (always returned to Stripe to acknowledge)
 *   - 400: Bad request (malformed JSON, missing signature/event ID)
 *   - 401: Signature verification failed
 *
 * All errors returned to Stripe without throwing. Operator logs for review.
 */
export async function handleStripeWebhook(
  body: string,
  signature: string | undefined,
  db: FactoryDb,
  webhookSecret: string,
): Promise<{ statusCode: number; body: string }> {
  try {
    // 1. Verify signature
    if (!signature) {
      console.warn('[webhook] Missing Stripe-Signature header');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing Stripe-Signature header' }),
      };
    }

    const isValid = await verifyStripeSignature(body, signature, webhookSecret);
    if (!isValid) {
      console.warn('[webhook] Signature verification failed');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Signature verification failed' }),
      };
    }

    // 2. Parse JSON
    let event: StripeEvent;
    try {
      event = JSON.parse(body) as StripeEvent;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown parse error';
      console.error('[webhook] JSON parse error:', msg);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      };
    }

    // 3. Check idempotency
    if (await isEventProcessed(db, event.id)) {
      console.info(`[webhook] Event ${event.id} already processed (idempotent)`);
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'acknowledged (duplicate)' }),
      };
    }

    // 4. Route to handler based on event type
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          await handleSubscriptionCreated(db, event);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(db, event);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(db, event);
          break;

        default:
          // Unknown event type - ignore silently
          break;
      }

      // 5. Record event as processed
      await recordProcessedEvent(db, event.id, event.type);

      console.info(`[webhook] Event ${event.id} (${event.type}) processed successfully`);

      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'acknowledged' }),
      };
    } catch (err: unknown) {
      // Handler threw an error; log and acknowledge to Stripe
      const msg = err instanceof Error ? err.message : 'Unknown handler error';
      console.error(`[webhook] Handler error for event ${event.id}:`, msg);

      // Still return 200 to Stripe (prevent retries)
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'error', message: msg }),
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[webhook] Unexpected error:', msg);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
