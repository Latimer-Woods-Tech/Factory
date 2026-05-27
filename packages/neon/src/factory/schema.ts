/**
 * Factory read-layer Drizzle schema — Admin Build Plan P1.2.
 *
 * Three append-only tables:
 *   - factory_events_ingest  raw event log; immutable payload (trigger-enforced)
 *   - factory_gates          gate state transitions; latest/blocking views
 *   - factory_artifacts      catalog of run outputs
 *
 * Migrations live in /migrations/0101_factory_read_layer.sql and
 * /migrations/0102_ingest_source_event_unique.sql (partial unique index for
 * race-safe ingest dedup).
 */
import { pgTable, pgView, text, uuid, integer, bigint, jsonb, timestamp, uniqueIndex, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── factory_events_ingest ────────────────────────────────────────────────────

/** Allowed source systems for raw ingest events. */
export const SOURCE_SYSTEMS = [
  'github-webhook',
  'video-pipeline',
  'supervisor-d1',
  'wrangler-canary',
  'llm-meter',
  'manual',
] as const;

/** Union of allowed source system strings. */
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

/** Derivation lifecycle states for a raw ingest event. */
export const DERIVATION_STATUSES = ['pending', 'derived', 'failed', 'replayed'] as const;
/** Union of valid derivation status strings. */
export type DerivationStatus = (typeof DERIVATION_STATUSES)[number];

/**
 * `factory_events_ingest` — append-only raw event log.
 *
 * Payload columns (`payload`, `payload_size_bytes`, `payload_sha256`) are
 * immutable after insert; the DB trigger rejects updates to these fields.
 * Only `derivation_status`, `derivation_at`, `derivation_error`, and
 * `derivation_targets` may be updated.
 */
export const factoryEventsIngest = pgTable('factory_events_ingest', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  sourceSystem: text('source_system').notNull(),
  sourceEventType: text('source_event_type').notNull(),
  sourceEventId: text('source_event_id'),

  payload: jsonb('payload').notNull(),
  /** DB-generated: `octet_length(payload::text)`. Read-only. */
  payloadSizeBytes: integer('payload_size_bytes'),
  /** DB-generated: `encode(sha256(payload::text::bytea), 'hex')`. Read-only. */
  payloadSha256: text('payload_sha256'),

  ingestActor: text('ingest_actor').notNull(),

  derivationStatus: text('derivation_status').notNull().default('pending'),
  derivationTargets: text('derivation_targets').array(),
  derivationError: text('derivation_error'),
  derivationAt: timestamp('derivation_at', { withTimezone: true }),

  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  // Partial unique index: race-safe idempotency backstop for the two-step
  // ingest dedup. `source_event_id` is nullable and many rows legitimately
  // carry NULL, so the constraint is partial (only enforced when an ID is
  // present). This is the real guarantee behind the route-level
  // check-then-insert fast path, which alone is a TOCTOU race under
  // concurrent writers. Mirror SQL: migrations/0102_ingest_source_event_unique.sql.
  uniqueIndex('ux_events_source_event_id')
    .on(t.sourceSystem, t.sourceEventId)
    .where(sql`source_event_id IS NOT NULL`),
]);

/** Drizzle inferred select type for `factory_events_ingest`. */
export type FactoryEventIngest = typeof factoryEventsIngest.$inferSelect;
/** Drizzle inferred insert type for `factory_events_ingest`. */
export type NewFactoryEventIngest = typeof factoryEventsIngest.$inferInsert;

// ── factory_gates ────────────────────────────────────────────────────────────

/** All valid gate types for the Better Gate layer. */
export const GATE_TYPES = [
  'ci',
  'canary',
  'codeowner-review',
  'budget',
  'verifier',
  'claude-review',
  'constraints',
  'reliability',
  'capability-check',
  'migration-drift',
  'stuck-detection',
] as const;

/** Union of valid gate type strings. */
export type GateType = (typeof GATE_TYPES)[number];

/** Valid gate source systems. */
export const GATE_SOURCE_SYSTEMS = [
  'github-actions',
  'github-review',
  'sentry',
  'wrangler-canary',
  'supervisor-d1',
  'llm-meter',
  'factory-cross-repo',
  'factory-stuck-watcher',
] as const;

/** Union of valid gate source system strings. */
export type GateSourceSystem = (typeof GATE_SOURCE_SYSTEMS)[number];

/** Subject types a gate can apply to. */
export const SUBJECT_TYPES = ['pr', 'issue', 'deploy', 'supervisor-run', 'video-render'] as const;
/** Union of valid subject type strings. */
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** Possible gate states. */
export const GATE_STATES = ['pending', 'passed', 'failed', 'skipped', 'override', 'expired'] as const;
/** Union of valid gate state strings. */
export type GateState = (typeof GATE_STATES)[number];

/**
 * `factory_gates` — append-only gate state transitions.
 *
 * Each row is one state transition. Current state is derived via
 * `factory_gates_latest` view (most recent row per subject + gate_type + source_ref).
 */
export const factoryGates = pgTable('factory_gates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  ingestEventId: uuid('ingest_event_id').notNull(),

  gateType: text('gate_type').notNull(),
  sourceSystem: text('source_system').notNull(),
  sourceRef: text('source_ref').notNull(),

  subjectType: text('subject_type').notNull(),
  subjectRepo: text('subject_repo'),
  subjectRef: text('subject_ref').notNull(),

  state: text('state').notNull(),
  evidenceUrl: text('evidence_url'),
  evidenceSummary: jsonb('evidence_summary').notNull().default(sql`'{}'`),

  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().default(sql`now()`),
});

/** Drizzle inferred select type for `factory_gates`. */
export type FactoryGate = typeof factoryGates.$inferSelect;
/** Drizzle inferred insert type for `factory_gates`. */
export type NewFactoryGate = typeof factoryGates.$inferInsert;

// ── factory_artifacts ────────────────────────────────────────────────────────

/** All valid artifact types. */
export const ARTIFACT_TYPES = [
  'video',
  'audio',
  'thumbnail',
  'transcript',
  'deploy-url',
  'build-artifact',
  'preview',
  'lighthouse',
  'audit-report',
  'logs',
  'report',
] as const;

/** Union of valid artifact type strings. */
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

/** Valid artifact producer types. */
export const PRODUCER_TYPES = [
  'github-workflow',
  'supervisor-run',
  'video-pipeline',
  'cloudflare-deploy',
  'manual',
] as const;

/** Union of valid artifact producer type strings. */
export type ProducerType = (typeof PRODUCER_TYPES)[number];

/**
 * `factory_artifacts` — append-only catalog of run outputs.
 *
 * `uri_scheme` is DB-generated (`split_part(uri, ':', 1)`). Read-only after insert.
 */
export const factoryArtifacts = pgTable('factory_artifacts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  artifactType: text('artifact_type').notNull(),
  producerType: text('producer_type').notNull(),
  producerRef: text('producer_ref').notNull(),

  subjectApp: text('subject_app'),
  subjectRepo: text('subject_repo'),
  subjectRef: text('subject_ref'),

  uri: text('uri').notNull(),
  /** DB-generated: `split_part(uri, ':', 1)`. Read-only. */
  uriScheme: text('uri_scheme'),

  checksum: text('checksum'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  mimeType: text('mime_type'),
  durationMs: bigint('duration_ms', { mode: 'number' }),

  metadata: jsonb('metadata').notNull().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

/** Drizzle inferred select type for `factory_artifacts`. */
export type FactoryArtifact = typeof factoryArtifacts.$inferSelect;
/** Drizzle inferred insert type for `factory_artifacts`. */
export type NewFactoryArtifact = typeof factoryArtifacts.$inferInsert;

// ── factory_runs_mirror ──────────────────────────────────────────────────────

/** Valid supervisor run source types (mirror of D1 supervisor_runs.source). */
export const RUN_SOURCES = [
  'github:issue',
  'webhook',
  'scheduled',
  'human',
] as const;

/** Union of valid run source strings. */
export type RunSource = (typeof RUN_SOURCES)[number];

/** Valid supervisor run status values (mirror of D1 supervisor_runs.status). */
export const RUN_STATUSES = [
  'planned',
  'running',
  'passed',
  'failed_verification',
  'failed_execution',
] as const;

/** Union of valid run status strings. */
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * `factory_runs_mirror` — Neon read-layer mirror of D1 `supervisor_runs`.
 *
 * Written by the supervisor-mirror cron Worker (P1.8) via upsert every 5 min.
 * D1 epoch-ms integers are cast to TIMESTAMPTZ; D1 TEXT id is stored as UUID.
 * `mirrored_at` is DB-generated on each upsert to track freshness.
 */
export const factoryRunsMirror = pgTable('factory_runs_mirror', {
  id: uuid('id').primaryKey(),

  templateId: text('template_id').notNull(),
  templateVersion: integer('template_version').notNull().default(1),
  description: text('description').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  dryRun: boolean('dry_run').notNull().default(false),

  prUrl: text('pr_url'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  mirroredAt: timestamp('mirrored_at', { withTimezone: true }).notNull().default(sql`now()`),
});

/** Drizzle inferred select type for `factory_runs_mirror`. */
export type FactoryRunsMirror = typeof factoryRunsMirror.$inferSelect;
/** Drizzle inferred insert type for `factory_runs_mirror`. */
export type NewFactoryRunsMirror = typeof factoryRunsMirror.$inferInsert;

// ── factory_runs_v (read-only join view) ─────────────────────────────────────

/**
 * `factory_runs_v` — supervisor runs enriched with gate counts and latest
 * deploy-url artifact. Created by migration 0104_factory_runs_v.sql.
 *
 * Joins `factory_runs_mirror` with `factory_gates_latest` (gate aggregate
 * counts per run) and `factory_artifacts` (most recent deploy-url).
 * Use this view for the Command Center "Runs" list screen.
 */
export const factoryRunsV = pgView('factory_runs_v').as((qb) =>
  qb
    .select({
      id: factoryRunsMirror.id,
      templateId: factoryRunsMirror.templateId,
      templateVersion: factoryRunsMirror.templateVersion,
      description: factoryRunsMirror.description,
      source: factoryRunsMirror.source,
      status: factoryRunsMirror.status,
      dryRun: factoryRunsMirror.dryRun,
      prUrl: factoryRunsMirror.prUrl,
      startedAt: factoryRunsMirror.startedAt,
      finishedAt: factoryRunsMirror.finishedAt,
      mirroredAt: factoryRunsMirror.mirroredAt,
    })
    .from(factoryRunsMirror),
);

/** TypeScript row shape for `factory_runs_v`. */
export type FactoryRunsV = typeof factoryRunsV.$inferSelect & {
  gatesPassed: number;
  gatesFailed: number;
  gatesPending: number;
  lastGateObservedAt: Date | null;
  deployUrl: string | null;
};

// ── factory_audit_log ────────────────────────────────────────────────────────

/** Valid actor types for audit log entries. */
export const AUDIT_ACTOR_TYPES = ['human', 'automation'] as const;
/** Union of valid actor type strings. */
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Valid result values for audit log entries. */
export const AUDIT_RESULTS = ['success', 'failure', 'denied', 'dry-run'] as const;
/** Union of valid audit result strings. */
export type AuditResult = (typeof AUDIT_RESULTS)[number];

/**
 * `factory_audit_log` — append-only operator/automation action log (P2.13f).
 *
 * Written by the `@latimer-woods-tech/compliance` auditLog() middleware via
 * factory-core-api POST /v1/audit.
 */
export const factoryAuditLog = pgTable('factory_audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  actor: text('actor').notNull(),
  actorType: text('actor_type').notNull().default('human'),

  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),

  requestId: text('request_id'),
  environment: text('environment').notNull().default('production'),
  result: text('result').notNull().default('success'),
  detail: jsonb('detail').notNull().default(sql`'{}'`),
  evidenceUrl: text('evidence_url'),

  actedAt: timestamp('acted_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('ix_audit_log_actor').on(t.actor, t.actedAt),
  index('ix_audit_log_resource').on(t.resource, t.actedAt),
]);

/** Drizzle inferred select type for `factory_audit_log`. */
export type FactoryAuditLog = typeof factoryAuditLog.$inferSelect;
/** Drizzle inferred insert type for `factory_audit_log`. */
export type NewFactoryAuditLog = typeof factoryAuditLog.$inferInsert;

// ── stripe_idempotency_keys ──────────────────────────────────────────────────

/** Valid status values for Stripe idempotency key entries. */
export const STRIPE_IDEM_STATUSES = ['pending', 'success', 'failed'] as const;
/** Union of valid Stripe idempotency status strings. */
export type StripeIdemStatus = (typeof STRIPE_IDEM_STATUSES)[number];

/**
 * `stripe_idempotency_keys` — Stripe call dedup table (P2.13f).
 *
 * Written by `@latimer-woods-tech/stripe` transferOrIdempotent() helper
 * before each Stripe API call to prevent double-charges under Worker crash.
 */
export const stripeIdempotencyKeys = pgTable('stripe_idempotency_keys', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  idempotencyKey: text('idempotency_key').notNull().unique(),
  stripeOperation: text('stripe_operation').notNull(),
  status: text('status').notNull().default('pending'),

  tenantId: text('tenant_id'),
  runId: text('run_id'),
  actor: text('actor'),

  stripeResponse: jsonb('stripe_response'),
  stripeError: text('stripe_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

/** Drizzle inferred select type for `stripe_idempotency_keys`. */
export type StripeIdempotencyKey = typeof stripeIdempotencyKeys.$inferSelect;
/** Drizzle inferred insert type for `stripe_idempotency_keys`. */
export type NewStripeIdempotencyKey = typeof stripeIdempotencyKeys.$inferInsert;
