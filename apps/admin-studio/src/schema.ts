/**
 * Drizzle table definitions for Admin Studio's operator database.
 *
 * These tables support the studio audit log, dispatched test runs, and the
 * crawled function catalog. All timestamps are UTC.
 *
 * Migrations live in apps/admin-studio/migrations/.
 */
import { pgTable, text, integer, timestamp, uuid, jsonb, doublePrecision, unique, primaryKey } from 'drizzle-orm/pg-core';

// ── Studio operations ──────────────────────────────────────────────────────

/**
 * Studio audit log — immutable record of every admin/system mutation.
 *
 * Mirrors migration 0001_studio_audit_log.sql.
 * Append-only by policy; UPDATE/DELETE are restricted to the migrator role.
 */
export const studioAuditLog = pgTable('studio_audit_log', {
  id: uuid('id').primaryKey(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email').notNull(),
  userRole: text('user_role').notNull(),
  sessionId: text('session_id').notNull(),
  /** 'local' | 'staging' | 'production' */
  env: text('env').notNull(),
  action: text('action').notNull(),
  resource: text('resource'),
  resourceId: text('resource_id'),
  /** 'trivial' | 'reversible' | 'manual-rollback' | 'irreversible' */
  reversibility: text('reversibility').notNull(),
  payload: jsonb('payload').notNull().default({}),
  /** 'success' | 'failure' | 'dry-run' */
  result: text('result').notNull(),
  resultDetail: jsonb('result_detail'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  requestId: text('request_id').notNull(),
});

/**
 * Dispatched test runs triggered from the Admin Studio UI.
 *
 * Mirrors migration 0004_studio_test_runs.sql.
 * status lifecycle: queued → dispatched → running → passed | failed | cancelled | timed-out
 */
export const studioTestRuns = pgTable('studio_test_runs', {
  id: uuid('id').primaryKey(),
  dispatchedFromEnv: text('dispatched_from_env').notNull(),
  ghRunId: text('gh_run_id'),
  ghRunUrl: text('gh_run_url'),
  suites: jsonb('suites').notNull().default([]),
  filter: text('filter'),
  /** 'queued' | 'dispatched' | 'running' | 'passed' | 'failed' | 'cancelled' | 'timed-out' */
  status: text('status').notNull().default('queued'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  totals: jsonb('totals').notNull().default({ total: 0, passed: 0, failed: 0, skipped: 0 }),
  dispatchedBy: text('dispatched_by').notNull(),
});

/**
 * Individual test results streamed into a studio test run.
 *
 * Mirrors migration 0004_studio_test_runs.sql (studio_test_results table).
 * outcome: 'passed' | 'failed' | 'skipped' | 'todo'
 */
export const studioTestResults = pgTable('studio_test_results', {
  runId: uuid('run_id').notNull().references(() => studioTestRuns.id, { onDelete: 'cascade' }),
  testId: text('test_id').notNull(),
  suite: text('suite').notNull(),
  name: text('name').notNull(),
  outcome: text('outcome').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  failure: jsonb('failure'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.runId, table.testId] }),
}));

/**
 * Function catalog — one row per (app, env, method, path) endpoint.
 *
 * Mirrors migration 0005_function_catalog.sql.
 * Upserted on every /manifest crawl; firstSeenAt is immutable after insert.
 */
export const functionCatalog = pgTable('function_catalog', {
  id: uuid('id').primaryKey(),
  app: text('app').notNull(),
  env: text('env').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  auth: text('auth').notNull(),
  summary: text('summary').notNull(),
  owner: text('owner'),
  reversibility: text('reversibility'),
  sloP95Ms: integer('slo_p95_ms'),
  sloErrorRate: doublePrecision('slo_error_rate'),
  tags: jsonb('tags').notNull().default([]),
  smoke: jsonb('smoke').notNull().default([]),
  buildSha: text('build_sha'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueEndpoint: unique().on(table.app, table.env, table.method, table.path),
}));
