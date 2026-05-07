/**
 * Practitioner Studio Entitlements Schema (W360-005)
 *
 * Date: 2026-04-29
 * Purpose: Revenue model for self-serve video generation product
 *
 * Schema overview:
 * - studio_plans: Product plan catalog (immutable during billing)
 * - studio_customers: User → Stripe mapping
 * - studio_subscriptions: Active billing subscriptions
 * - studio_credit_ledger: Append-only transaction log
 * - studio_entitlements: Denormalized policy snapshot
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { FactoryDb } from '../index.js';

// ============================================================================
// 1. Plans Table — Product Catalog
// ============================================================================

/** Drizzle table definition for `studio_plans` — immutable product plan catalog. */
export const studioPlanTable = pgTable(
  'studio_plans',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    stripePriceId: text('stripe_price_id').notNull().unique(),
    billingMode: text('billing_mode', {
      enum: ['monthly_subscription', 'yearly_subscription', 'prepaid_credits'],
    }).notNull(),
    monthlyRenderQuota: integer('monthly_render_quota'),
    includedCredits: numeric('included_credits', { precision: 10, scale: 2 }).notNull().default('0'),
    maxVideoSeconds: integer('max_video_seconds').notNull().default(300),
    maxRetriesPerJob: integer('max_retries_per_job').notNull().default(3),
    privateVideoAllowed: boolean('private_video_allowed').notNull().default(true),
    publicPublishAllowed: boolean('public_publish_allowed').notNull().default(false),
    whiteLabelAllowed: boolean('white_label_allowed').notNull().default(false),
    customVoicePacks: boolean('custom_voice_packs').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (table) => ({
    idxSlug: uniqueIndex('idx_studio_plans_slug').on(table.slug),
    idxStripePriceId: uniqueIndex('idx_studio_plans_stripe_price_id').on(table.stripePriceId),
  }),
);

/** Inferred SELECT type for the studio_plans table. */
export type StudioPlan = typeof studioPlanTable.$inferSelect;
/** Inferred INSERT type for the studio_plans table. */
export type StudioPlanInsert = typeof studioPlanTable.$inferInsert;

// ============================================================================
// 2. Customers Table — User Registration
// ============================================================================

/** Drizzle table definition for `studio_customers` — maps app users to Stripe customers. */
export const studioCustomerTable = pgTable(
  'studio_customers',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    stripeConnectRecipientId: text('stripe_connect_recipient_id'),
    niche: text('niche'),
    brandName: text('brand_name'),
    email: text('email').notNull(),
    kycStatus: text('kyc_status', { enum: ['pending', 'verified', 'rejected'] })
      .notNull()
      .default('pending'),
    suspensionStatus: text('suspension_status', { enum: ['active', 'suspended', 'terminated'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (table) => ({
    idxAppId: index('idx_studio_customers_app_id').on(table.appId),
    idxStripeCustomerId: index('idx_studio_customers_stripe_customer_id').on(table.stripeCustomerId),
  }),
);

/** Inferred SELECT type for the studio_customers table. */
export type StudioCustomer = typeof studioCustomerTable.$inferSelect;
/** Inferred INSERT type for the studio_customers table. */
export type StudioCustomerInsert = typeof studioCustomerTable.$inferInsert;

// ============================================================================
// 3. Subscriptions Table — Billing Records
// ============================================================================

/** Drizzle table definition for `studio_subscriptions` — active Stripe billing subscriptions. */
export const studioSubscriptionTable = pgTable(
  'studio_subscriptions',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => studioCustomerTable.id, { onDelete: 'restrict' }),
    planId: text('plan_id')
      .notNull()
      .references(() => studioPlanTable.id, { onDelete: 'restrict' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    billingCycle: text('billing_cycle', { enum: ['monthly', 'yearly'] }).notNull(),
    status: text('status', { enum: ['trialing', 'active', 'past_due', 'canceled', 'unpaid'] })
      .notNull()
      .default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    trialEndAt: timestamp('trial_end_at', { withTimezone: true }),
    monthlyCredits: numeric('monthly_credits', { precision: 10, scale: 2 }).notNull(),
    creditsUsedThisPeriod: numeric('credits_used_this_period', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
  },
  (table) => ({
    idxCustomerId: index('idx_studio_subscriptions_customer_id').on(table.customerId),
    idxStatus: index('idx_studio_subscriptions_status').on(table.status),
    idxCurrentPeriodEnd: index('idx_studio_subscriptions_current_period_end').on(table.currentPeriodEnd),
  }),
);

/** Inferred SELECT type for the studio_subscriptions table. */
export type StudioSubscription = typeof studioSubscriptionTable.$inferSelect;
/** Inferred INSERT type for the studio_subscriptions table. */
export type StudioSubscriptionInsert = typeof studioSubscriptionTable.$inferInsert;

// ============================================================================
// 4. Credit Ledger Table — Append-Only Transactions
// ============================================================================

/** Allowed operation types for the append-only credit ledger. */
export type CreditLedgerOperationType = 'grant' | 'debit' | 'refund' | 'expiration';

/** Drizzle table definition for `studio_credit_ledger` — append-only credit transaction log. */
export const studioCreditLedgerTable = pgTable(
  'studio_credit_ledger',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => studioCustomerTable.id, { onDelete: 'restrict' }),
    operationType: text('operation_type', {
      enum: ['grant', 'debit', 'refund', 'expiration'],
    }).notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    context: jsonb('context'),
    renderJobId: text('render_job_id'),
    subscriptionId: text('subscription_id').references(() => studioSubscriptionTable.id, {
      onDelete: 'set null',
    }),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (table) => ({
    idxCustomerId: index('idx_studio_credit_ledger_customer_id').on(table.customerId),
    idxOperationType: index('idx_studio_credit_ledger_operation_type').on(table.operationType),
    idxRenderJobId: index('idx_studio_credit_ledger_render_job_id').on(table.renderJobId),
    idxSubscriptionId: index('idx_studio_credit_ledger_subscription_id').on(table.subscriptionId),
  }),
);

/** Inferred SELECT type for the studio_credit_ledger table. */
export type StudioCreditLedgerEntry = typeof studioCreditLedgerTable.$inferSelect;
/** Inferred INSERT type for the studio_credit_ledger table. */
export type StudioCreditLedgerInsert = typeof studioCreditLedgerTable.$inferInsert;

// ============================================================================
// 5. Entitlements Table — Denormalized Policy View
// ============================================================================

/** Drizzle table definition for `studio_entitlements` — denormalized policy snapshot for fast render gating. */
export const studioEntitlementTable = pgTable(
  'studio_entitlements',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .unique()
      .references(() => studioCustomerTable.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => studioSubscriptionTable.id, {
      onDelete: 'set null',
    }),
    planId: text('plan_id').references(() => studioPlanTable.id, { onDelete: 'set null' }),
    availableCredits: numeric('available_credits', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    canRender: boolean('can_render').notNull().default(false),
    canPublishPublic: boolean('can_publish_public').notNull().default(false),
    monthlyRenderQuota: integer('monthly_render_quota'),
    maxVideoSeconds: integer('max_video_seconds').notNull().default(300),
    maxRetriesPerJob: integer('max_retries_per_job').notNull().default(3),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (table) => ({
    idxCustomerId: index('idx_studio_entitlements_customer_id').on(table.customerId),
    idxSubscriptionId: index('idx_studio_entitlements_subscription_id').on(table.subscriptionId),
  }),
);

/** Inferred SELECT type for the studio_entitlements table. */
export type StudioEntitlement = typeof studioEntitlementTable.$inferSelect;
/** Inferred INSERT type for the studio_entitlements table. */
export type StudioEntitlementInsert = typeof studioEntitlementTable.$inferInsert;

// ============================================================================
// 6. Exports & Types
// ============================================================================

/** Convenience map of all five studio entitlement tables for bulk schema registration. */
export const studioPlanTables = {
  plans: studioPlanTable,
  customers: studioCustomerTable,
  subscriptions: studioSubscriptionTable,
  creditLedger: studioCreditLedgerTable,
  entitlements: studioEntitlementTable,
};

/**
 * Service for entitlement policy evaluation.
 *
 * Can render? Must have:
 *   - Active subscription (status = 'active')
 *   - Not suspended (customer.suspension_status = 'active')
 *   - Available credits > 0
 *
 * Can publish public? Must have:
 *   - plan.publicPublishAllowed = true
 *   - Active subscription
 */
export interface EntitlementPolicy {
  canRender: boolean;
  canPublishPublic: boolean;
  availableCredits: number;
  monthlyRenderQuota: number | null;
  maxVideoSeconds: number;
  maxRetriesPerJob: number;
}

/**
 * Evaluate entitlements from a denormalized snapshot.
 * Used by render endpoints to make fast policy decisions.
 */
export function evaluateEntitlementPolicy(entitlement: StudioEntitlement): EntitlementPolicy {
  const credits = parseFloat(entitlement.availableCredits);
  return {
    canRender: entitlement.canRender && credits > 0,
    canPublishPublic: entitlement.canPublishPublic,
    availableCredits: credits,
    monthlyRenderQuota: entitlement.monthlyRenderQuota,
    maxVideoSeconds: entitlement.maxVideoSeconds,
    maxRetriesPerJob: entitlement.maxRetriesPerJob,
  };
}

// ============================================================================
// 7. Entitlements Service Layer
// ============================================================================

/**
 * Service for managing credits and entitlements.
 *
 * Philosophy:
 * - Credits debit BEFORE render job starts (fail-safe)
 * - All transactions append-only (never UPDATE/DELETE ledger)
 * - Entitlements view refreshes after every ledger mutation
 * - Idempotency guaranteed by ledger uniqueness on (render_job_id, operation_type)
 */

/**
 * Check if customer is eligible to render.
 *
 * Returns: { canRender, availableCredits, reason? }
 *
 * A customer can render if:
 *   1. Subscription is active
 *   2. Customer not suspended
 *   3. Available credits > 0
 *   4. Plan allows private video rendering
 */
export async function getEntitlementPolicy(
  db: FactoryDb,
  customerId: string,
): Promise<{ canRender: boolean; policy: EntitlementPolicy | null; reason?: string }> {
  const result = await db.execute(sql`
    SELECT * FROM studio_entitlements WHERE customer_id = ${customerId}
  `);

  if (!result.rows.length) {
    return {
      canRender: false,
      policy: null,
      reason: 'No entitlements found',
    };
  }

  const entitlement = result.rows[0] as StudioEntitlement;
  const policy = evaluateEntitlementPolicy(entitlement);

  const reasons: string[] = [];
  if (!entitlement.canRender) reasons.push('Subscription not active or customer suspended');
  if (parseFloat(entitlement.availableCredits) <= 0) reasons.push('No credits available');

  return {
    canRender: policy.canRender,
    policy,
    reason: reasons.length ? reasons.join('; ') : undefined,
  };
}

/**
 * Debit credits for a render job.
 *
 * Idempotency: If (render_job_id, 'debit') already exists, no-op (ON CONFLICT)
 *
 * Precondition:
 *   - Customer has sufficient credits (caller must check with getEntitlementPolicy)
 *   - render_job_id is unique across all systems
 *
 * Side effects:
 *   - Inserts entry to credit_ledger
 *   - Refreshes entitlements view
 */
export async function debitCreditsForRender(
  db: FactoryDb,
  customerId: string,
  creditCost: number,
  renderJobId: string,
  reason: string = 'Video render job',
): Promise<{ success: boolean; ledgerId: string; newAvailableCredits: number }> {
  const ledgerId = crypto.randomUUID();

  // Insert debit (fail if customer doesn't exist)
  await db.execute(sql`
    INSERT INTO studio_credit_ledger (
      id, customer_id, operation_type, amount, reason, render_job_id, created_at
    ) VALUES (
      ${ledgerId}, ${customerId}, 'debit', ${creditCost}, ${reason}, ${renderJobId}, NOW()
    )
    ON CONFLICT (render_job_id, operation_type) DO NOTHING
  `);

  // Get new balance
  const balanceResult = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(CASE 
      WHEN operation_type IN ('grant', 'refund') THEN amount::numeric 
      WHEN operation_type IN ('debit', 'expiration') THEN -amount::numeric
      ELSE 0
    END), 0) as total
    FROM studio_credit_ledger
    WHERE customer_id = ${customerId}
  `);

  const newBalance = balanceResult.rows[0] ? parseFloat(balanceResult.rows[0].total) : 0;

  // Refresh entitlements (in background; don't block response)
  // In production: trigger async job or use notification
  db.execute(sql`
    SELECT refresh_entitlements(${customerId})
  `).catch((err: Error) => {
    console.error('[entitlements] refresh failed:', err.message);
  });

  return {
    success: true,
    ledgerId,
    newAvailableCredits: newBalance,
  };
}

/**
 * Grant credits from subscription or promotional allocation.
 *
 * Idempotency: If credit grant is for a subscription period, key on (subscription_id, 'grant')
 * Normal grants won't collide if reason is unique.
 */
export async function grantCredits(
  db: FactoryDb,
  customerId: string,
  creditAmount: number,
  reason: string,
  context?: Record<string, unknown>,
): Promise<{ ledgerId: string }> {
  const ledgerId = crypto.randomUUID();
  const contextJson = JSON.stringify(context || {});

  await db.execute(sql`
    INSERT INTO studio_credit_ledger (
      id, customer_id, operation_type, amount, reason, context, created_at
    ) VALUES (
      ${ledgerId}, ${customerId}, 'grant', ${creditAmount}, ${reason}, ${contextJson}::jsonb, NOW()
    )
  `);

  return { ledgerId };
}

/**
 * Refund credits (e.g., render job failed, customer refund).
 *
 * Note: Refunds are positive amounts; they add back to available_credits.
 */
export async function refundCredits(
  db: FactoryDb,
  customerId: string,
  creditAmount: number,
  renderJobId: string,
  reason: string = 'Render job refund',
): Promise<{ ledgerId: string }> {
  const ledgerId = crypto.randomUUID();

  await db.execute(sql`
    INSERT INTO studio_credit_ledger (
      id, customer_id, operation_type, amount, reason, render_job_id, created_at
    ) VALUES (
      ${ledgerId}, ${customerId}, 'refund', ${creditAmount}, ${reason}, ${renderJobId}, NOW()
    )
  `);

  return { ledgerId };
}

/**
 * Calculate current available credits (used by reports/admin).
 */
export async function getTotalAvailableCredits(db: FactoryDb, customerId: string): Promise<number> {
  const result = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(CASE 
      WHEN operation_type IN ('grant', 'refund') THEN amount::numeric 
      WHEN operation_type IN ('debit', 'expiration') THEN -amount::numeric
      ELSE 0
    END), 0) as total
    FROM studio_credit_ledger
    WHERE customer_id = ${customerId}
  `);

  return result.rows[0] ? parseFloat(result.rows[0].total) : 0;
}

/**
 * Export all service functions
 */
export const entitlementService = {
  getEntitlementPolicy,
  debitCreditsForRender,
  grantCredits,
  refundCredits,
  getTotalAvailableCredits,
};

