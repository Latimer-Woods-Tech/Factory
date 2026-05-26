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
import { pgTable, text, uuid, integer, bigint, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
