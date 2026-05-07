import { sql, withTenant } from '@latimer-woods-tech/neon';
import type { FactoryDb } from '@latimer-woods-tech/neon';
import { NotFoundError, InternalError, ErrorCodes } from '@latimer-woods-tech/errors';
import type { Analytics } from '@latimer-woods-tech/analytics';
import { validateAiOutput } from '@latimer-woods-tech/validation';
import type { OutputValidationIssue, BrandVoiceRules } from '@latimer-woods-tech/validation';
import { complete } from '@latimer-woods-tech/llm';
import type { LLMEnv } from '@latimer-woods-tech/llm';

// ---------------------------------------------------------------------------
// WB-2: Outreach Types
// ---------------------------------------------------------------------------

/** Consent status for outreach communications. */
export type ConsentStatus = 'unknown' | 'opted_in' | 'opted_out' | 'do_not_contact';

/** Campaign lifecycle status. */
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

/** Call provider identifier. */
export type CallProvider = 'telnyx' | 'twilio';

/**
 * A contact record for outreach campaigns.
 */
export interface OutreachContact {
  /** UUID primary key. */
  id: string;
  /** Tenant identifier for multi-tenancy. */
  tenantId: string;
  /** First name. */
  firstName: string;
  /** Last name. */
  lastName: string;
  /** Contact phone number. */
  phone: string;
  /** Contact email address. */
  email: string;
  /** Consent status for outreach. */
  consentStatus: ConsentStatus;
  /** Provider-specific call ID (e.g., Telnyx contact ID). */
  providerCallId?: string;
  /** Call provider name. */
  provider?: CallProvider;
  /** Additional metadata as JSON. */
  metadata?: Record<string, unknown>;
  /** When the contact was created. */
  createdAt: Date;
  /** When the contact was last updated. */
  updatedAt: Date;
}

/**
 * An outreach campaign.
 */
export interface OutreachCampaign {
  /** UUID primary key. */
  id: string;
  /** Tenant identifier for multi-tenancy. */
  tenantId: string;
  /** Campaign name. */
  name: string;
  /** Campaign description. */
  description?: string;
  /** Campaign lifecycle status. */
  status: CampaignStatus;
  /**
   * LLM-generated call script. Must pass brand voice validation before the
   * campaign can transition from `draft` → `active`.
   */
  script?: string;
  /** When the campaign was created. */
  createdAt: Date;
  /** When the campaign was last updated. */
  updatedAt: Date;
}

/**
 * A call log record for tracking outreach calls.
 */
export interface CallLog {
  /** UUID primary key. */
  id: string;
  /** Campaign ID. */
  campaignId: string;
  /** Contact ID. */
  contactId: string;
  /** Call provider name. */
  provider: CallProvider;
  /** Provider-specific call ID. */
  providerCallId: string;
  /** Call duration in seconds. */
  durationSeconds: number;
  /** Call outcome (e.g., 'completed', 'no-answer', 'voicemail'). */
  outcome: string;
  /** Recording URL if available. */
  recordingUrl?: string;
  /** Call start timestamp. */
  callStarted: Date;
  /** Call end timestamp. */
  callEnded: Date;
}

/** Input for creating a new outreach contact. */
export interface CreateContactInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consentStatus: ConsentStatus;
  providerCallId?: string;
  provider?: CallProvider;
  metadata?: Record<string, unknown>;
}

/** Input for creating a new outreach campaign. */
export interface CreateCampaignInput {
  tenantId: string;
  name: string;
  description?: string;
}

/** Input for creating a new call log. */
export interface CreateCallLogInput {
  campaignId: string;
  contactId: string;
  provider: CallProvider;
  providerCallId: string;
  durationSeconds: number;
  outcome: string;
  recordingUrl?: string;
  callStarted: Date;
  callEnded: Date;
}

/** Filters for listing contacts. */
export interface ContactFilters {
  consentStatus?: ConsentStatus;
  provider?: CallProvider;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lifecycle status of a lead in the CRM. */
export type LeadStatus = 'lead' | 'trial' | 'active' | 'churned';

/** Churn risk classification for a customer. */
export type ChurnRisk = 'low' | 'medium' | 'high';

/**
 * A lead or customer record stored in the `crm_leads` table.
 */
export interface Lead {
  /** UUID primary key. */
  id: string;
  /** Authenticated user identifier. */
  userId: string;
  /** App that originated the lead. */
  appId: string;
  /** Acquisition channel (e.g. 'organic', 'tiktok', 'referral'). */
  source: string;
  /** Current lifecycle status. */
  status: LeadStatus;
  /** Monthly recurring revenue in cents. */
  mrr: number;
  /** When the lead record was created. */
  createdAt: Date;
  /** When the lead converted to a paid customer. */
  convertedAt?: Date;
}

/** Minimal subscription record used in {@link CustomerView}. */
export interface SubscriptionStatus {
  plan: string;
  mrr: number;
  status: string;
}

/** Minimal event record used in {@link CustomerView}. */
export interface FactoryEvent {
  event: string;
  properties: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * A full 360-degree view of a customer — lead info, subscriptions, events, churnRisk.
 */
export interface CustomerView {
  lead: Lead;
  subscriptions: SubscriptionStatus[];
  events: FactoryEvent[];
  churnRisk: ChurnRisk;
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

/**
 * DDL statement that creates the `crm_leads` table.
 * Run once during provisioning / migration.
 */
export const CREATE_CRM_LEADS_TABLE = `
CREATE TABLE IF NOT EXISTS crm_leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  app_id       TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'organic',
  status       TEXT NOT NULL DEFAULT 'lead',
  mrr          INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  UNIQUE(user_id, app_id)
);
`.trim();

/**
 * DDL statement that creates the `outreach_contacts` table.
 * Run once during provisioning / migration.
 */
export const CREATE_CONTACTS_TABLE = `
CREATE TABLE IF NOT EXISTS outreach_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT NOT NULL,
  consent_status   TEXT NOT NULL DEFAULT 'unknown',
  provider_call_id TEXT,
  provider         TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, phone, email)
);
`.trim();

/**
 * DDL statement that creates the `outreach_campaigns` table.
 * Run once during provisioning / migration.
 */
export const CREATE_CAMPAIGNS_TABLE = `
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  script      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

/**
 * Migration to add the `script` column to an existing `outreach_campaigns` table.
 * Idempotent via `IF NOT EXISTS`.
 */
export const ADD_CAMPAIGNS_SCRIPT_COLUMN = `
ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS script TEXT;
`.trim();

/**
 * DDL statement that creates the `call_logs` table.
 * Run once during provisioning / migration.
 */
export const CREATE_CALL_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS call_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL,
  contact_id       UUID NOT NULL,
  provider         TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  outcome          TEXT NOT NULL,
  recording_url    TEXT,
  call_started     TIMESTAMPTZ NOT NULL,
  call_ended       TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES outreach_campaigns(id),
  FOREIGN KEY (contact_id) REFERENCES outreach_contacts(id)
);
`.trim();

/**
 * DDL statements that enable Row-Level Security on the three outreach tables
 * and add a tenant-isolation policy backed by the `app.tenant_id` session
 * variable.  Run once during provisioning after the tables are created.
 *
 * The application must set `SET LOCAL app.tenant_id = '<id>'` inside each
 * transaction before issuing any CRM query, e.g.:
 *
 * ```sql
 * BEGIN;
 * SET LOCAL app.tenant_id = 'acme-corp';
 * SELECT * FROM outreach_contacts; -- only acme-corp rows are visible
 * COMMIT;
 * ```
 *
 * This provides defence-in-depth: even if the application-layer WHERE clause
 * is accidentally omitted, Postgres will silently filter to the current tenant.
 */
export const ENABLE_OUTREACH_RLS = `
ALTER TABLE outreach_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs          ENABLE ROW LEVEL SECURITY;

CREATE POLICY outreach_contacts_tenant_isolation  ON outreach_contacts
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE POLICY outreach_campaigns_tenant_isolation ON outreach_campaigns
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE POLICY call_logs_tenant_isolation ON call_logs
  USING (
    EXISTS (
      SELECT 1 FROM outreach_campaigns c
       WHERE c.id = campaign_id
         AND c.tenant_id = current_setting('app.tenant_id', TRUE)
    )
  );
`.trim();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface LeadRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  app_id: string;
  source: string;
  status: string;
  mrr: string | number;
  created_at: string | Date;
  converted_at: string | Date | null;
}

interface SubRow extends Record<string, unknown> {
  plan: string;
  mrr: string | number;
  status: string;
}

interface EventRow extends Record<string, unknown> {
  event: string;
  properties: string;
  occurred_at: string | Date;
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    userId: row.user_id,
    appId: row.app_id,
    source: row.source,
    status: row.status as LeadStatus,
    mrr: Number(row.mrr),
    createdAt: new Date(row.created_at as string),
    convertedAt: row.converted_at != null ? new Date(row.converted_at as string) : undefined,
  };
}

interface ContactRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  consent_status: string;
  provider_call_id: string | null;
  provider: string | null;
  metadata: string | Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CampaignRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: string;
  script: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CallLogRow extends Record<string, unknown> {
  id: string;
  campaign_id: string;
  contact_id: string;
  provider: string;
  provider_call_id: string;
  duration_seconds: string | number;
  outcome: string;
  recording_url: string | null;
  call_started: string | Date;
  call_ended: string | Date;
}

function rowToContact(row: ContactRow): OutreachContact {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    metadata =
      typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    consentStatus: row.consent_status as ConsentStatus,
    providerCallId: row.provider_call_id ?? undefined,
    provider: (row.provider as CallProvider) ?? undefined,
    metadata,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToCampaign(row: CampaignRow): OutreachCampaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as CampaignStatus,
    script: row.script ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToCallLog(row: CallLogRow): CallLog {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    provider: row.provider as CallProvider,
    providerCallId: row.provider_call_id,
    durationSeconds: Number(row.duration_seconds),
    outcome: row.outcome,
    recordingUrl: row.recording_url ?? undefined,
    callStarted: new Date(row.call_started as string),
    callEnded: new Date(row.call_ended as string),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records a new lead, or returns the existing one if (userId, appId) already exists.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - Lead details.
 */
export async function trackLead(
  db: FactoryDb,
  opts: { userId: string; appId: string; source: string },
): Promise<Lead> {
  const { userId, appId, source } = opts;

  if (!userId || !appId || !source) {
    throw new InternalError('trackLead: userId, appId, and source are required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  const rows = await db.execute<LeadRow>(
    sql`INSERT INTO crm_leads (user_id, app_id, source)
        VALUES (${userId}, ${appId}, ${source})
        ON CONFLICT (user_id, app_id) DO UPDATE
          SET source = EXCLUDED.source
        RETURNING *`,
  );

  const row = rows.rows[0];
  if (!row) {
    throw new InternalError('trackLead: no row returned', { code: ErrorCodes.DB_QUERY_FAILED });
  }
  return rowToLead(row);
}

/**
 * Marks a lead as a paying customer and records the MRR.
 * Updates status to 'active', sets mrr, and stamps convertedAt.
 *
 * @param db - Drizzle / Neon database client.
 * @param opts - Conversion details.
 * @param analytics - Optional Analytics instance for business event tracking.
 */
export async function trackConversion(
  db: FactoryDb,
  opts: { userId: string; plan: string; mrr: number },
  analytics?: Analytics,
): Promise<void> {
  const { userId, plan, mrr } = opts;

  if (!userId || !plan) {
    throw new InternalError('trackConversion: userId and plan are required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }
  if (mrr < 0) {
    throw new InternalError('trackConversion: mrr must not be negative', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  const result = await db.execute(
    sql`UPDATE crm_leads
        SET status = 'active', mrr = ${mrr}, converted_at = NOW()
        WHERE user_id = ${userId}`,
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError(`No lead found for userId ${userId}`);
  }

  if (analytics) {
    await analytics.businessEvent('subscription.converted', { plan, mrr }, userId);
  }
}

/**
 * Returns a full 360-degree customer view: lead record, subscriptions,
 * recent events, and a derived churn risk assessment.
 *
 * @param db - Drizzle / Neon database client.
 * @param userId - The user to look up.
 */
export async function getCustomerView(db: FactoryDb, userId: string): Promise<CustomerView> {
  if (!userId) {
    throw new InternalError('getCustomerView: userId is required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  // Lead
  const leadRows = await db.execute<LeadRow>(
    sql`SELECT * FROM crm_leads WHERE user_id = ${userId} LIMIT 1`,
  );
  const leadRow = leadRows.rows[0];
  if (!leadRow) {
    throw new NotFoundError(`No CRM lead found for userId ${userId}`);
  }
  const lead = rowToLead(leadRow);

  // Subscriptions — from stripe_subscriptions if present
  let subscriptions: SubscriptionStatus[] = [];
  try {
    const subRows = await db.execute<SubRow>(
      sql`SELECT plan, mrr, status FROM stripe_subscriptions WHERE user_id = ${userId}`,
    );
    subscriptions = subRows.rows.map((r) => ({
      plan: r.plan,
      mrr: Number(r.mrr),
      status: r.status,
    }));
  } catch {
    // Table may not exist in all apps — treat as empty
    subscriptions = [];
  }

  // Recent events from factory_events
  let events: FactoryEvent[] = [];
  try {
    const evtRows = await db.execute<EventRow>(
      sql`SELECT event, properties, occurred_at
          FROM factory_events
          WHERE user_id = ${userId}
          ORDER BY occurred_at DESC
          LIMIT 50`,
    );
    events = evtRows.rows.map((r) => ({
      event: r.event,
      properties: (typeof r.properties === 'string'
        ? JSON.parse(r.properties)
        : r.properties) as Record<string, unknown>,
      occurredAt: new Date(r.occurred_at as string),
    }));
  } catch {
    events = [];
  }

  // Churn risk heuristic
  const daysSinceActivity =
    events.length > 0
      ? (Date.now() - (events[0]?.occurredAt.getTime() ?? 0)) / 86_400_000
      : Infinity;

  let churnRisk: ChurnRisk;
  if (lead.status === 'churned') {
    churnRisk = 'high';
  } else if (lead.mrr === 0 || daysSinceActivity > 30) {
    churnRisk = 'medium';
  } else {
    churnRisk = 'low';
  }

  return { lead, subscriptions, events, churnRisk };
}

// ---------------------------------------------------------------------------
// WB-4: Brand voice gate helpers
// ---------------------------------------------------------------------------

/**
 * Result returned by {@link CampaignService.transitionCampaignStatus}.
 *
 * When `success` is `false`, `validationErrors` contains only `major` or
 * `critical` issues that blocked the transition. Minor issues are logged as
 * warnings and do not populate this field.
 */
export interface TransitionResult {
  /** Whether the status transition was applied. */
  success: boolean;
  /** Major or critical validation issues that blocked the transition. */
  validationErrors?: OutputValidationIssue[];
}

/**
 * Result returned by {@link CampaignService.generateCampaignScript}.
 *
 * On success, the `script` field contains the validated text that has been
 * persisted to the campaign row.  On failure, `validationErrors` describes
 * the issues that prevented the script from being stored.
 */
export interface ScriptGenerationResult {
  /** Whether a valid script was generated and stored. */
  success: boolean;
  /** The generated and validated script text (only when `success` is `true`). */
  script?: string;
  /** Major or critical validation issues (only when `success` is `false`). */
  validationErrors?: OutputValidationIssue[];
}

/**
 * Minimal brand voice data stored per known Factory application.
 *
 * Keyed by `appId` (the same identifier used in `crm_leads.app_id`).
 * Consumer apps may supply their own profile via the `appId` parameter;
 * unknown IDs fall back to an empty set of rules (no-op validation).
 *
 * @internal
 */
const BRAND_PROFILES: Record<string, BrandVoiceRules> = {
  humandesign: {
    requiredTerms: ['human design', 'chart', 'type'],
    blockedTerms: ['hustle', 'grind'],
  },
  capricast: {
    requiredTerms: [],
    blockedTerms: ['hustle', 'quick fix'],
  },
  xicocity: {
    requiredTerms: [],
    blockedTerms: ['toxic positivity'],
  },
  prime_self: {
    requiredTerms: [],
    blockedTerms: ['lazy', 'excuse', 'average'],
  },
  cypher_healing: {
    requiredTerms: [],
    blockedTerms: ['hustle', 'grind', 'quick fix'],
  },
  ijustus: {
    requiredTerms: [],
    blockedTerms: ['surface-level', 'performative'],
  },
  the_calling: {
    requiredTerms: [],
    blockedTerms: ['secular shortcuts'],
  },
};

/**
 * Returns the {@link BrandVoiceRules} registered for `appId`, or `undefined`
 * when the ID is unknown (meaning no brand-voice rules apply).
 *
 * @param appId - The application identifier (e.g. `'humandesign'`).
 * @internal
 */
function getBrandVoiceRules(appId: string): BrandVoiceRules | undefined {
  return BRAND_PROFILES[appId];
}

// ---------------------------------------------------------------------------
// WB-2: Outreach Service Classes
// ---------------------------------------------------------------------------

/**
 * Service for managing outreach contacts with tenant isolation.
 */
export class ContactService {
  /**
   * Create a new contact.
   *
   * @param db - Database client.
   * @param tenantId - Tenant identifier.
   * @param data - Contact data.
   * @returns The created contact.
   */
  async createContact(db: FactoryDb, tenantId: string, data: CreateContactInput): Promise<OutreachContact> {
    if (!tenantId || !data.firstName || !data.lastName || !data.phone || !data.email) {
      throw new InternalError('ContactService.createContact: required fields missing', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<ContactRow>(
        sql`INSERT INTO outreach_contacts (
            tenant_id, first_name, last_name, phone, email, consent_status,
            provider_call_id, provider, metadata
          )
          VALUES (
            ${tenantId}, ${data.firstName}, ${data.lastName}, ${data.phone}, ${data.email},
            ${data.consentStatus}, ${data.providerCallId ?? null}, ${data.provider ?? null},
            ${data.metadata ? JSON.stringify(data.metadata) : null}
          )
          RETURNING *`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new InternalError('ContactService.createContact: no row returned', {
          code: ErrorCodes.DB_QUERY_FAILED,
        });
      }
      return rowToContact(row);
    });
  }

  /**
   * Get a contact by ID with tenant isolation.
   *
   * @param db - Database client.
   * @param id - Contact ID.
   * @param tenantId - Tenant identifier.
   * @returns The contact, or throws NotFoundError.
   */
  async getContact(db: FactoryDb, id: string, tenantId: string): Promise<OutreachContact> {
    if (!id || !tenantId) {
      throw new InternalError('ContactService.getContact: id and tenantId are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<ContactRow>(
        sql`SELECT * FROM outreach_contacts WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new NotFoundError(`Contact ${id} not found for tenant ${tenantId}`);
      }
      return rowToContact(row);
    });
  }

  /**
   * List contacts for a tenant with optional filters.
   *
   * @param db - Database client.
   * @param tenantId - Tenant identifier.
   * @param filters - Optional filters.
   * @returns Array of contacts.
   */
  async listContacts(db: FactoryDb, tenantId: string, filters: ContactFilters = {}): Promise<OutreachContact[]> {
    if (!tenantId) {
      throw new InternalError('ContactService.listContacts: tenantId is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;

      let rows;
      if (filters.consentStatus && filters.provider) {
        rows = await db.execute<ContactRow>(
          sql`SELECT * FROM outreach_contacts
              WHERE tenant_id = ${tenantId}
                AND consent_status = ${filters.consentStatus}
                AND provider = ${filters.provider}
              ORDER BY created_at DESC
              LIMIT ${limit} OFFSET ${offset}`,
        );
      } else if (filters.consentStatus) {
        rows = await db.execute<ContactRow>(
          sql`SELECT * FROM outreach_contacts
              WHERE tenant_id = ${tenantId}
                AND consent_status = ${filters.consentStatus}
              ORDER BY created_at DESC
              LIMIT ${limit} OFFSET ${offset}`,
        );
      } else if (filters.provider) {
        rows = await db.execute<ContactRow>(
          sql`SELECT * FROM outreach_contacts
              WHERE tenant_id = ${tenantId}
                AND provider = ${filters.provider}
              ORDER BY created_at DESC
              LIMIT ${limit} OFFSET ${offset}`,
        );
      } else {
        rows = await db.execute<ContactRow>(
          sql`SELECT * FROM outreach_contacts
              WHERE tenant_id = ${tenantId}
              ORDER BY created_at DESC
              LIMIT ${limit} OFFSET ${offset}`,
        );
      }

      return rows.rows.map(rowToContact);
    });
  }

  /**
   * Update consent status for a contact with tenant isolation.
   *
   * @param db - Database client.
   * @param id - Contact ID.
   * @param tenantId - Tenant identifier.
   * @param status - New consent status.
   * @returns Updated contact.
   */
  async updateConsentStatus(
    db: FactoryDb,
    id: string,
    tenantId: string,
    status: ConsentStatus,
  ): Promise<OutreachContact> {
    if (!id || !tenantId || !status) {
      throw new InternalError('ContactService.updateConsentStatus: id, tenantId, and status are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<ContactRow>(
        sql`UPDATE outreach_contacts
            SET consent_status = ${status}, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}
            RETURNING *`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new NotFoundError(`Contact ${id} not found for tenant ${tenantId}`);
      }
      return rowToContact(row);
    });
  }
}

/**
 * Service for managing outreach campaigns with tenant isolation.
 */
export class CampaignService {
  /**
   * Create a new campaign.
   *
   * @param db - Database client.
   * @param tenantId - Tenant identifier.
   * @param data - Campaign data.
   * @returns The created campaign.
   */
  async createCampaign(db: FactoryDb, tenantId: string, data: CreateCampaignInput): Promise<OutreachCampaign> {
    if (!tenantId || !data.name) {
      throw new InternalError('CampaignService.createCampaign: tenantId and name are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<CampaignRow>(
        sql`INSERT INTO outreach_campaigns (tenant_id, name, description, status)
            VALUES (${tenantId}, ${data.name}, ${data.description || null}, 'draft')
            RETURNING *`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new InternalError('CampaignService.createCampaign: no row returned', {
          code: ErrorCodes.DB_QUERY_FAILED,
        });
      }
      return rowToCampaign(row);
    });
  }

  /**
   * Get a campaign by ID with tenant isolation.
   *
   * @param db - Database client.
   * @param id - Campaign ID.
   * @param tenantId - Tenant identifier.
   * @returns The campaign, or throws NotFoundError.
   */
  async getCampaign(db: FactoryDb, id: string, tenantId: string): Promise<OutreachCampaign> {
    if (!id || !tenantId) {
      throw new InternalError('CampaignService.getCampaign: id and tenantId are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<CampaignRow>(
        sql`SELECT * FROM outreach_campaigns WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new NotFoundError(`Campaign ${id} not found for tenant ${tenantId}`);
      }
      return rowToCampaign(row);
    });
  }

  /**
   * List campaigns for a tenant.
   *
   * @param db - Database client.
   * @param tenantId - Tenant identifier.
   * @returns Array of campaigns.
   */
  async listCampaigns(db: FactoryDb, tenantId: string): Promise<OutreachCampaign[]> {
    if (!tenantId) {
      throw new InternalError('CampaignService.listCampaigns: tenantId is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<CampaignRow>(
        sql`SELECT * FROM outreach_campaigns WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`,
      );
      return rows.rows.map(rowToCampaign);
    });
  }

  /**
   * Update campaign status.
   *
   * @param db - Database client.
   * @param id - Campaign ID.
   * @param tenantId - Tenant identifier.
   * @param status - New campaign status.
   * @returns Updated campaign.
   */
  async updateCampaignStatus(
    db: FactoryDb,
    id: string,
    tenantId: string,
    status: CampaignStatus,
  ): Promise<OutreachCampaign> {
    if (!id || !tenantId || !status) {
      throw new InternalError('CampaignService.updateCampaignStatus: id, tenantId, and status are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<CampaignRow>(
        sql`UPDATE outreach_campaigns
            SET status = ${status}, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}
            RETURNING *`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new NotFoundError(`Campaign ${id} not found for tenant ${tenantId}`);
      }
      return rowToCampaign(row);
    });
  }

  /**
   * Transitions a campaign to a new lifecycle status, enforcing the brand
   * voice gate when moving from `draft` → `active`.
   *
   * Gate logic:
   * - If the campaign has no `script`, the transition proceeds without
   *   validation (a campaign without copy cannot be blocked).
   * - `critical` or `major` validation issues → `{ success: false, validationErrors }`.
   * - `minor` issues only → logged as a warning, transition allowed.
   * - All other status transitions (e.g. `active` → `paused`) bypass
   *   validation entirely.
   *
   * @param db - Database client.
   * @param campaignId - Campaign UUID.
   * @param tenantId - Tenant identifier.
   * @param newStatus - Target lifecycle status.
   * @param appId - Optional app identifier used to look up brand voice rules.
   * @returns `{ success: true }` on success or `{ success: false, validationErrors }` on block.
   */
  async transitionCampaignStatus(
    db: FactoryDb,
    campaignId: string,
    tenantId: string,
    newStatus: CampaignStatus,
    appId?: string,
  ): Promise<TransitionResult> {
    if (!campaignId || !tenantId || !newStatus) {
      throw new InternalError(
        'CampaignService.transitionCampaignStatus: campaignId, tenantId, and newStatus are required',
        { code: ErrorCodes.VALIDATION_ERROR },
      );
    }

    const campaign = await this.getCampaign(db, campaignId, tenantId);

    // Enforce brand voice gate only on draft → active when a script exists
    if (campaign.status === 'draft' && newStatus === 'active' && campaign.script) {
      const brandVoice = appId ? getBrandVoiceRules(appId) : undefined;
      const result = validateAiOutput(campaign.script, { brandVoice });

      const blocking = result.issues.filter(
        (i) => i.severity === 'critical' || i.severity === 'major',
      );
      const warnings = result.issues.filter((i) => i.severity === 'minor');

      if (blocking.length > 0) {
        return { success: false, validationErrors: blocking };
      }

      if (warnings.length > 0) {
        // Minor issues are non-blocking; surface them as structured warnings
        // so they flow into Sentry breadcrumbs or PostHog properties upstream.
        console.warn('campaign.script.minor_violations', {
          campaignId,
          tenantId,
          count: warnings.length,
          rules: warnings.map((w) => w.rule),
        });
      }
    }

    await this.updateCampaignStatus(db, campaignId, tenantId, newStatus);
    return { success: true };
  }

  /**
   * Generates a brand-voice-aligned call script for a campaign using the LLM,
   * validates it, and persists it if it passes the gate.
   *
   * Steps:
   * 1. Fetch the campaign to confirm it exists and belongs to the tenant.
   * 2. Ask the LLM to draft a script for the campaign name/description.
   * 3. Run {@link validateAiOutput} with the app's brand voice rules.
   * 4. If major/critical issues are found, return `{ success: false, validationErrors }`.
   * 5. Otherwise persist the script and return `{ success: true, script }`.
   *
   * @param db - Database client.
   * @param campaignId - Campaign UUID.
   * @param tenantId - Tenant identifier.
   * @param llmEnv - LLM provider environment bindings.
   * @param appId - Optional app identifier used for brand voice lookup.
   * @returns Generation result with the script text on success.
   */
  async generateCampaignScript(
    db: FactoryDb,
    campaignId: string,
    tenantId: string,
    llmEnv: LLMEnv,
    appId?: string,
  ): Promise<ScriptGenerationResult> {
    if (!campaignId || !tenantId) {
      throw new InternalError(
        'CampaignService.generateCampaignScript: campaignId and tenantId are required',
        { code: ErrorCodes.VALIDATION_ERROR },
      );
    }

    const campaign = await this.getCampaign(db, campaignId, tenantId);

    const brandVoice = appId ? getBrandVoiceRules(appId) : undefined;
    const brandContext = brandVoice?.requiredTerms?.length
      ? `Include these preferred terms naturally: ${brandVoice.requiredTerms.join(', ')}.`
      : '';
    const avoidContext = brandVoice?.blockedTerms?.length
      ? `Avoid these terms entirely: ${brandVoice.blockedTerms.join(', ')}.`
      : '';

    const systemPrompt = [
      'You are a professional outreach copywriter. Write a concise, persuasive call script.',
      'The script must be between 150 and 600 words.',
      'Produce plain prose — no JSON, no markdown headings.',
      brandContext,
      avoidContext,
    ]
      .filter(Boolean)
      .join(' ');

    const userPrompt = [
      `Campaign name: ${campaign.name}`,
      campaign.description ? `Description: ${campaign.description}` : '',
      'Write a call script for a sales representative to use when reaching out to prospects.',
    ]
      .filter(Boolean)
      .join('\n');

    const llmResponse = await complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      llmEnv,
      { tier: 'balanced', signal: AbortSignal.timeout(30_000) },
    );

    if (!llmResponse.data) {
      throw new InternalError('CampaignService.generateCampaignScript: LLM returned no data', {
        code: ErrorCodes.INTERNAL_ERROR,
      });
    }
    const generatedScript = llmResponse.data.content;

    const validation = validateAiOutput(generatedScript, {
      brandVoice,
      minCharacters: 150,
      maxCharacters: 3600,
    });

    const blocking = validation.issues.filter(
      (i) => i.severity === 'critical' || i.severity === 'major',
    );

    if (blocking.length > 0) {
      return { success: false, validationErrors: blocking };
    }

    // Persist validated script
    await withTenant(db, tenantId, async (txDb) => {
      await txDb.execute(
        sql`UPDATE outreach_campaigns
            SET script = ${generatedScript}, updated_at = NOW()
            WHERE id = ${campaignId} AND tenant_id = ${tenantId}`,
      );
    });

    return { success: true, script: generatedScript };
  }
}

/**
 * Service for managing call logs with tenant isolation.
 */
export class CallLogService {
  /**
   * Create a new call log.
   *
   * Runs inside a transaction where `SET LOCAL app.tenant_id` is set first so
   * that the RLS policy on `call_logs` (which checks tenant via the
   * `outreach_campaigns` join) can filter correctly.
   *
   * @param db - Database client.
   * @param tenantId - Tenant identifier for RLS isolation.
   * @param data - Call log data.
   * @returns The created call log.
   */
  async createCallLog(db: FactoryDb, tenantId: string, data: CreateCallLogInput): Promise<CallLog> {
    if (!tenantId) {
      throw new InternalError('CallLogService.createCallLog: tenantId is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    if (
      !data.campaignId ||
      !data.contactId ||
      !data.provider ||
      !data.providerCallId ||
      data.durationSeconds === undefined ||
      !data.outcome ||
      !data.callStarted ||
      !data.callEnded
    ) {
      throw new InternalError('CallLogService.createCallLog: required fields missing', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (txDb) => {
      const rows = await txDb.execute<CallLogRow>(
        sql`INSERT INTO call_logs (
            campaign_id, contact_id, provider, provider_call_id,
            duration_seconds, outcome, recording_url, call_started, call_ended
          )
          VALUES (
            ${data.campaignId}, ${data.contactId}, ${data.provider}, ${data.providerCallId},
            ${data.durationSeconds}, ${data.outcome}, ${data.recordingUrl || null},
            ${data.callStarted.toISOString()}, ${data.callEnded.toISOString()}
          )
          RETURNING *`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new InternalError('CallLogService.createCallLog: no row returned', {
          code: ErrorCodes.DB_QUERY_FAILED,
        });
      }
      return rowToCallLog(row);
    });
  }

  /**
   * Get a call log by ID with tenant isolation.
   *
   * Runs inside a transaction where `SET LOCAL app.tenant_id` is set first so
   * that the RLS policy on `call_logs` restricts access to the specified tenant.
   *
   * @param db - Database client.
   * @param id - Call log ID.
   * @param tenantId - Tenant identifier for RLS isolation.
   * @returns The call log, or throws NotFoundError.
   */
  async getCallLog(db: FactoryDb, id: string, tenantId: string): Promise<CallLog> {
    if (!id || !tenantId) {
      throw new InternalError('CallLogService.getCallLog: id and tenantId are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (txDb) => {
      const rows = await txDb.execute<CallLogRow>(
        sql`SELECT * FROM call_logs WHERE id = ${id} LIMIT 1`,
      );

      const row = rows.rows[0];
      if (!row) {
        throw new NotFoundError(`Call log ${id} not found`);
      }
      return rowToCallLog(row);
    });
  }

  /**
   * List call logs for a campaign with tenant isolation enforced via campaign join.
   *
   * @param db - Database client.
   * @param campaignId - Campaign ID.
   * @param tenantId - Tenant identifier for isolation.
   * @returns Array of call logs.
   */
  async listCallLogsByCampaign(db: FactoryDb, campaignId: string, tenantId: string): Promise<CallLog[]> {
    if (!campaignId || !tenantId) {
      throw new InternalError('CallLogService.listCallLogsByCampaign: campaignId and tenantId are required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    return withTenant(db, tenantId, async (db) => {
      const rows = await db.execute<CallLogRow>(
        sql`SELECT cl.* FROM call_logs cl
            JOIN outreach_campaigns oc ON cl.campaign_id = oc.id
            WHERE cl.campaign_id = ${campaignId} AND oc.tenant_id = ${tenantId}
            ORDER BY cl.call_started DESC`,
      );
      return rows.rows.map(rowToCallLog);
    });
  }
}
