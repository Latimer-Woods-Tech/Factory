/**
 * Drizzle table definitions for entitlements.
 *
 * Defines the shared feature access control schema used across Factory apps.
 * Migrations are generated per-app from this schema and applied to each app's Neon database.
 */
import { pgTable, text, boolean, timestamp, unique, foreignKey } from 'drizzle-orm/pg-core';

/**
 * Entitlements catalog — the master list of features/tiers (immutable, operator-maintained).
 *
 * Examples: "feature:video-upload", "tier:practitioner", "role:artist"
 */
export const entitlements = pgTable('entitlements', {
  id: text('id').primaryKey(),
  label: text('label').notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * User entitlements — maps users to features/tiers they have access to (mutable via admin panel).
 *
 * Supports expiring access: if expiresAt is in the past, the entitlement is no longer active.
 * app_scope allows multi-tenant reuse (one user can have "tier:practitioner" in "selfprime" and "tier:creator" in "videoking").
 */
export const userEntitlements = pgTable(
  'user_entitlements',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    entitlementId: text('entitlement_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    appScope: text('app_scope').notNull(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (table: any) => ({
    entitlementFk: foreignKey({
      columns: [table.entitlementId],
      foreignColumns: [entitlements.id],
    }),
    uniqueUserEntitlementScope: unique().on(table.userId, table.entitlementId, table.appScope),
  }),
);

/**
 * Audit log — immutable record of all grant/revoke/expire operations.
 *
 * Used for compliance, debugging, and analytics (e.g., PostHog funnel: signup → grant → feature-use).
 */
export const entitlementAuditLog = pgTable('entitlement_audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  entitlementId: text('entitlement_id').notNull(),
  appScope: text('app_scope').notNull(),
  action: text('action').notNull(), // 'grant' | 'revoke' | 'expire'
  operatorId: text('operator_id'), // null if automated (e.g., Stripe webhook)
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});
