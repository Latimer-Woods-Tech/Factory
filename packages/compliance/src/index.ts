import { sql } from '@latimer-woods-tech/neon';
import type { FactoryDb } from '@latimer-woods-tech/neon';
import { InternalError, NotFoundError, ValidationError, ErrorCodes } from '@latimer-woods-tech/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Consent type — which regulation the consent record covers. */
export type ConsentType = 'TCPA' | 'FDCPA' | 'GDPR' | 'CCPA';

// ---------------------------------------------------------------------------
// DSR (Data Subject Request) Types
// ---------------------------------------------------------------------------

/** The category of rights being exercised in a DSR. */
export type DsrRequestType = 'access' | 'erasure' | 'portability' | 'rectification';

/** Lifecycle status of a DSR. */
export type DsrStatus = 'pending' | 'in_progress' | 'fulfilled' | 'rejected';

/** A single DSR record as returned from the database. */
export interface DsrRequest {
  /** UUID primary key. */
  id: string;
  /** The user ID whose data is the subject of the request. */
  userId: string;
  /** Optional app/product identifier (e.g. "humandesign"). */
  appId: string | null;
  /** The type of DSR being made. */
  requestType: DsrRequestType;
  /** Current lifecycle status. */
  status: DsrStatus;
  /** Optional human-readable note attached by the requester. */
  notes: string | null;
  /** ISO 8601 timestamp when the request was submitted. */
  submittedAt: string;
  /** ISO 8601 timestamp when the request was last updated. */
  updatedAt: string;
}

/** FDCPA call classification. */
export type FDCPACallType = 'initial' | 'follow_up';

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

/**
 * DDL for the `compliance_consents` table — immutable consent log.
 */
export const CREATE_COMPLIANCE_CONSENTS_TABLE = `
CREATE TABLE IF NOT EXISTS compliance_consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  ip_address   TEXT NOT NULL,
  user_agent   TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

/**
 * DDL for the `compliance_contacts` table — FDCPA / TCPA contact tracking.
 */
export const CREATE_COMPLIANCE_CONTACTS_TABLE = `
CREATE TABLE IF NOT EXISTS compliance_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   TEXT NOT NULL,
  call_type    TEXT NOT NULL,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

/**
 * DDL for the `compliance_tcpa_suppression` table.
 * A row = this phone number opted out and must not be called.
 */
export const CREATE_TCPA_SUPPRESSION_TABLE = `
CREATE TABLE IF NOT EXISTS compliance_tcpa_suppression (
  phone        TEXT PRIMARY KEY,
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason        TEXT
);
`.trim();

// ---------------------------------------------------------------------------
// TCPA
// ---------------------------------------------------------------------------

/**
 * Checks whether it is safe to contact a phone number under TCPA.
 * Returns `{ safe: true }` if the number is not in the suppression list,
 * or `{ safe: false, reason }` if it is.
 *
 * @param opts - TCPA check options.
 */
export async function checkTCPA(opts: {
  phone: string;
  db: FactoryDb;
}): Promise<{ safe: boolean; reason?: string }> {
  const { phone, db } = opts;

  if (!phone) {
    throw new ValidationError('checkTCPA: phone is required');
  }

  interface SuppressionRow extends Record<string, unknown> {
    phone: string;
    reason: string | null;
  }

  const rows = await db.execute<SuppressionRow>(
    sql`SELECT phone, reason FROM compliance_tcpa_suppression WHERE phone = ${phone} LIMIT 1`,
  );

  if (rows.rows.length === 0) {
    return { safe: true };
  }

  const row = rows.rows[0];
  return {
    safe: false,
    reason: row?.reason ?? 'Number on TCPA suppression list',
  };
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * Records an immutable consent event to `compliance_consents`.
 * This log is append-only — never update or delete rows.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - Consent details.
 */
export async function logConsent(
  db: FactoryDb,
  opts: {
    userId: string;
    consentType: ConsentType;
    ipAddress: string;
    userAgent?: string;
  },
): Promise<void> {
  const { userId, consentType, ipAddress, userAgent } = opts;

  if (!userId || !consentType || !ipAddress) {
    throw new ValidationError('logConsent: userId, consentType, and ipAddress are required');
  }

  const ua = userAgent ?? null;

  await db.execute(
    sql`INSERT INTO compliance_consents (user_id, consent_type, ip_address, user_agent)
        VALUES (${userId}, ${consentType}, ${ipAddress}, ${ua})`,
  );
}

// ---------------------------------------------------------------------------
// FDCPA
// ---------------------------------------------------------------------------

/** Minimum gap in hours between initial and follow-up contacts (FDCPA). */
const FDCPA_MIN_HOURS_BETWEEN_CONTACTS = 24;

/**
 * Validates whether contacting a person under FDCPA rules is permitted.
 * Checks: no prior contact within 24 hours for the same contactId.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - FDCPA check options.
 */
export async function checkFDCPA(
  db: FactoryDb,
  opts: { contactId: string; callType: FDCPACallType },
): Promise<{ allowed: boolean; nextAllowedAt?: Date; reason?: string }> {
  const { contactId, callType } = opts;

  if (!contactId || !callType) {
    throw new InternalError('checkFDCPA: contactId and callType are required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  interface ContactRow extends Record<string, unknown> {
    contacted_at: string | Date;
  }

  // Find the most recent contact for this contactId
  const rows = await db.execute<ContactRow>(
    sql`SELECT contacted_at FROM compliance_contacts
        WHERE contact_id = ${contactId}
        ORDER BY contacted_at DESC
        LIMIT 1`,
  );

  if (rows.rows.length === 0) {
    // No prior contact — always allowed
    return { allowed: true };
  }

  const lastContactedAt = new Date(rows.rows[0]!.contacted_at as string);
  const msElapsed = Date.now() - lastContactedAt.getTime();
  const hoursElapsed = msElapsed / 3_600_000;

  if (hoursElapsed < FDCPA_MIN_HOURS_BETWEEN_CONTACTS) {
    const nextAllowedAt = new Date(
      lastContactedAt.getTime() + FDCPA_MIN_HOURS_BETWEEN_CONTACTS * 3_600_000,
    );
    const reason =
      callType === 'follow_up'
        ? `Follow-up contacts must wait ${String(FDCPA_MIN_HOURS_BETWEEN_CONTACTS)} hours after initial contact`
        : `Contact attempted within the ${String(FDCPA_MIN_HOURS_BETWEEN_CONTACTS)}-hour window`;
    return { allowed: false, nextAllowedAt, reason };
  }

  return { allowed: true };
}

/**
 * Records a contact attempt in `compliance_contacts` for FDCPA tracking.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - Contact attempt details.
 */
export async function recordContact(
  db: FactoryDb,
  opts: { contactId: string; callType: FDCPACallType },
): Promise<void> {
  const { contactId, callType } = opts;

  if (!contactId || !callType) {
    throw new InternalError('recordContact: contactId and callType are required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  await db.execute(
    sql`INSERT INTO compliance_contacts (contact_id, call_type) VALUES (${contactId}, ${callType})`,
  );
}

/**
 * Adds a phone number to the TCPA suppression list.
 *
 * @param db - Drizzle / Neon database client.
 * @param phone - The phone number to suppress.
 * @param reason - Optional reason for suppression.
 */
export async function suppressPhone(
  db: FactoryDb,
  phone: string,
  reason?: string,
): Promise<void> {
  if (!phone) {
    throw new NotFoundError('suppressPhone: phone is required');
  }

  const r = reason ?? null;
  await db.execute(
    sql`INSERT INTO compliance_tcpa_suppression (phone, reason) VALUES (${phone}, ${r})
        ON CONFLICT (phone) DO NOTHING`,
  );
}

// ---------------------------------------------------------------------------
// DSR DDL
// ---------------------------------------------------------------------------

/**
 * DDL for the `compliance_dsr_requests` table.
 * Tracks DSR intake, lifecycle status, and fulfillment metadata.
 * Append-only status transitions are enforced at the application layer.
 */
export const CREATE_DSR_REQUESTS_TABLE = `
CREATE TABLE IF NOT EXISTS compliance_dsr_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  app_id       TEXT,
  request_type TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  notes        TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

/**
 * DDL for the `compliance_dsr_artifacts` table.
 * Stores fulfillment evidence (export URLs, erasure manifests) linked to a DSR.
 */
export const CREATE_DSR_ARTIFACTS_TABLE = `
CREATE TABLE IF NOT EXISTS compliance_dsr_artifacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES compliance_dsr_requests(id),
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

// ---------------------------------------------------------------------------
// DSR functions
// ---------------------------------------------------------------------------

const VALID_REQUEST_TYPES: DsrRequestType[] = ['access', 'erasure', 'portability', 'rectification'];
const VALID_STATUSES: DsrStatus[] = ['pending', 'in_progress', 'fulfilled', 'rejected'];

/**
 * Submits a new Data Subject Request and returns the generated request ID.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - DSR submission options.
 * @returns The UUID of the newly created DSR record.
 */
export async function submitDSR(
  db: FactoryDb,
  opts: {
    userId: string;
    appId?: string;
    requestType: DsrRequestType;
    notes?: string;
  },
): Promise<string> {
  const { userId, appId, requestType, notes } = opts;

  if (!userId) {
    throw new ValidationError('submitDSR: userId is required');
  }
  if (!VALID_REQUEST_TYPES.includes(requestType)) {
    throw new ValidationError(
      `submitDSR: requestType must be one of ${VALID_REQUEST_TYPES.join(', ')}`,
    );
  }

  const aid = appId ?? null;
  const n = notes ?? null;

  interface InsertRow extends Record<string, unknown> {
    id: string;
  }

  const result = await db.execute<InsertRow>(
    sql`INSERT INTO compliance_dsr_requests (user_id, app_id, request_type, notes)
        VALUES (${userId}, ${aid}, ${requestType}, ${n})
        RETURNING id`,
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new InternalError('submitDSR: insert did not return id', {
      code: ErrorCodes.INTERNAL_ERROR,
    });
  }
  return id;
}

/**
 * Returns the current status and metadata of a DSR by its request ID.
 *
 * @param db - Drizzle / Neon database client.
 * @param requestId - UUID of the DSR.
 * @throws NotFoundError when no record with the given ID exists.
 */
export async function getDSRStatus(db: FactoryDb, requestId: string): Promise<DsrRequest> {
  if (!requestId) {
    throw new ValidationError('getDSRStatus: requestId is required');
  }

  interface DsrRow extends Record<string, unknown> {
    id: string;
    user_id: string;
    app_id: string | null;
    request_type: string;
    status: string;
    notes: string | null;
    submitted_at: string;
    updated_at: string;
  }

  const rows = await db.execute<DsrRow>(
    sql`SELECT id, user_id, app_id, request_type, status, notes, submitted_at, updated_at
        FROM compliance_dsr_requests
        WHERE id = ${requestId}
        LIMIT 1`,
  );

  if (rows.rows.length === 0) {
    throw new NotFoundError(`getDSRStatus: request ${requestId} not found`);
  }

  const row = rows.rows[0]!;
  return {
    id: row.id,
    userId: row.user_id,
    appId: row.app_id,
    requestType: row.request_type as DsrRequestType,
    status: row.status as DsrStatus,
    notes: row.notes,
    submittedAt: new Date(row.submitted_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Lists DSR requests, optionally filtered by userId, appId, or status.
 * Returns up to `limit` results ordered by submission date descending.
 * Used by the operator admin surface to track DSR lifecycle.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - Filter options.
 */
export async function listDSRRequests(
  db: FactoryDb,
  opts: {
    userId?: string;
    appId?: string;
    status?: DsrStatus;
    limit?: number;
  } = {},
): Promise<DsrRequest[]> {
  const { userId, appId, status, limit = 50 } = opts;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new ValidationError(
      `listDSRRequests: status must be one of ${VALID_STATUSES.join(', ')}`,
    );
  }

  interface DsrRow extends Record<string, unknown> {
    id: string;
    user_id: string;
    app_id: string | null;
    request_type: string;
    status: string;
    notes: string | null;
    submitted_at: string;
    updated_at: string;
  }

  // Build conditional filters. We use IS NULL checks on parameters to allow
  // optional equality filtering without multiple query branches — all params
  // are passed to the server and evaluated safely without string interpolation.
  const rows = await db.execute<DsrRow>(
    sql`SELECT id, user_id, app_id, request_type, status, notes, submitted_at, updated_at
        FROM compliance_dsr_requests
        WHERE (${userId ?? null} IS NULL OR user_id = ${userId ?? null})
          AND (${appId ?? null} IS NULL OR app_id = ${appId ?? null})
          AND (${status ?? null} IS NULL OR status = ${status ?? null})
        ORDER BY submitted_at DESC
        LIMIT ${limit}`,
  );

  return rows.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    appId: row.app_id,
    requestType: row.request_type as DsrRequestType,
    status: row.status as DsrStatus,
    notes: row.notes,
    submittedAt: new Date(row.submitted_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

/**
 * Marks a DSR as fulfilled and records an artifact (e.g. an export bundle URL
 * or an erasure manifest). Updates `updated_at` on the parent request.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - Fulfillment details.
 */
export async function fulfillDSR(
  db: FactoryDb,
  opts: {
    requestId: string;
    kind: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { requestId, kind, payload } = opts;

  if (!requestId) {
    throw new ValidationError('fulfillDSR: requestId is required');
  }
  if (!kind) {
    throw new ValidationError('fulfillDSR: kind is required');
  }

  const payloadJson = JSON.stringify(payload);

  await db.execute(
    sql`INSERT INTO compliance_dsr_artifacts (request_id, kind, payload)
        VALUES (${requestId}::uuid, ${kind}, ${payloadJson}::jsonb)`,
  );

  await db.execute(
    sql`UPDATE compliance_dsr_requests
        SET status = 'fulfilled', updated_at = NOW()
        WHERE id = ${requestId}::uuid`,
  );
}

/**
 * Enforces erasure semantics for a userId by:
 * 1. Anonymising all PII columns in `compliance_consents` for this user.
 * 2. Marking any open DSR of type `erasure` as `fulfilled`.
 *
 * This function does NOT hard-delete rows — it overwrites PII with a stable
 * placeholder so audit foreign keys remain intact. Call this only after
 * verifying that no legal hold is active for the user.
 *
 * @param db - Drizzle / Neon database client.
 * @param userId - The user whose data must be erased.
 */
export async function eraseDSR(db: FactoryDb, userId: string): Promise<void> {
  if (!userId) {
    throw new ValidationError('eraseDSR: userId is required');
  }

  // Anonymise consent records — replace PII with a deterministic placeholder.
  await db.execute(
    sql`UPDATE compliance_consents
        SET ip_address = 'ERASED', user_agent = NULL
        WHERE user_id = ${userId}`,
  );

  // Fulfil any open erasure DSRs for this user.
  await db.execute(
    sql`UPDATE compliance_dsr_requests
        SET status = 'fulfilled', updated_at = NOW()
        WHERE user_id = ${userId}
          AND request_type = 'erasure'
          AND status IN ('pending', 'in_progress')`,
  );
}
