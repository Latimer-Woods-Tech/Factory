# Data Subject Request Handling

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot · **Supersedes:** the placeholder paragraph in [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance)

> How the autonomous marketing system honours subject-access, rectification, erasure, portability, and objection requests across every table that holds marketing-collected PII. The system does not store data it cannot delete; this doc names the tables, the cascade rules, and the SQL. If a new table holds PII and isn't listed here, it is in violation of [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance) until added.

---

## 1. Purpose

[`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance) requires DSR handling but defers the mechanism to "Stage-5 process (queued; ADR-pending)." This document is that process. It is regulator-facing — every claim here is enforceable in code or in runbooks, not in judgment.

The autonomous loop must never be the reason a DSR is missed. Two hard rules:

1. **Every PII table has a documented cascade rule.** New tables are blocked from migration until added.
2. **Every DSR is auditable end-to-end** without re-exposing the PII that was deleted.

---

## 2. PII inventory per table

Marketing-collected PII lives across these tables. Anything not on this list is forbidden from holding PII until added by ADR.

| Table | PII held | Owner package | Notes |
|---|---|---|---|
| [`crm_leads`](../../packages/crm/src/index.ts) | `user_id` (auth FK), attribution touch history (`first_touch_*`, `last_touch_*`, `touch_history`) | [`@latimer-woods-tech/crm`](../../packages/crm/) | Touch fields can re-identify when joined with `factory_events` |
| [`outreach_contacts`](../../packages/crm/src/index.ts) | `first_name`, `last_name`, `phone`, `email`, `metadata` (free-form) | [`@latimer-woods-tech/crm`](../../packages/crm/) | Highest-density PII table; full direct identifiers |
| `outreach_campaigns` | None | [`@latimer-woods-tech/crm`](../../packages/crm/) | Listed for completeness; no DSR action required |
| [`call_logs`](../../packages/crm/src/index.ts) | `recording_url` (voice recording = PII), `provider_call_id` (linkable) | [`@latimer-woods-tech/crm`](../../packages/crm/) | Recording is biometric PII in EU/UK; treat as sensitive |
| [`factory_events`](../../packages/analytics/src/index.ts) | `user_id`, event `properties` (may contain PII despite firewall) | [`@latimer-woods-tech/analytics`](../../packages/analytics/) | Firewalled from PostHog; resides only in Neon |
| `email_drip_state` | `email`, sequence cursor, last-send timestamp | [`@latimer-woods-tech/email`](../../packages/email/) | Drip enrolment state per recipient |
| `email_suppression_list` | `email`, `email_hash`, `user_id` | [`@latimer-woods-tech/email`](../../packages/email/) | See [`ADR 2026-05-18 — Resend fallback`](../decisions/2026-05-18-resend-fallback-provider.md). Hashed identifier survives erasure on purpose. |
| `published_readings` | Client first names embedded in body, slug | (humandesign / cypher) | Public-surface PII; CDN-cached |
| `referral_codes` | `user_id`, `stripe_account_id` | (referral package) | Stripe account ID is linkable to natural person |

PostHog is intentionally excluded — the firewall in [`packages/analytics/src/index.ts`](../../packages/analytics/src/index.ts) keeps revenue events out. If a DSR proves data leaked, that is a §6 violation independent of this doc.

---

## 3. DSR types

| Type | Statutory anchors | What we do |
|---|---|---|
| **Access** | GDPR Art. 15, CCPA §1798.110 | Export every row keyed to the subject as JSON; ship via signed URL; logged in audit ledger |
| **Rectification** | GDPR Art. 16 | Operator-mediated update through admin tooling; no autonomous-loop path (rectifications need human judgment) |
| **Erasure ("right to be forgotten")** | GDPR Art. 17, CCPA §1798.105, LGPD Art. 18 V | Cascade per §6; suppression-list row inserted to prevent re-enrolment |
| **Portability** | GDPR Art. 20 | Same machine-readable export as Access; JSON + machine-readable schema |
| **Objection / opt-out of sale** | GDPR Art. 21, CCPA §1798.120 | Set `consent_status='do_not_contact'` on all `outreach_contacts` rows; drop from active sequences; do **not** delete (objection ≠ erasure) |

---

## 4. Endpoints

DSRs arrive through three channels, all funnel into the same queue:

| Channel | Mechanism | SLA |
|---|---|---|
| Email to `privacy@thefactory.dev` | Routed to ops queue; logged into `dsr_requests` table on triage | 5 business days to acknowledge, 30 days to complete (GDPR cap) |
| In-product opt-out / delete | `DELETE /api/me` on each app's API; calls `executeDSR()` in [`@latimer-woods-tech/compliance`](../../packages/compliance/) | Same-session acknowledgement; cascade within 24h |
| Regulator-forwarded request | Same email path with `X-Regulator: <body>` header tag; bumps tier-3 escalation | Same SLAs but tier-3 alert to operator |

Programmatic surface (forthcoming in [`@latimer-woods-tech/compliance`](../../packages/compliance/)):

```ts
await executeDSR({
  type: 'erasure' | 'access' | 'portability' | 'objection' | 'rectification',
  subject: { userId?: string; email?: string },
  tenantId: string,
  reason: string,
  requestedAt: Date,
});
```

---

## 5. Verification

Before any cascade runs, the request is verified. We do not delete on the basis of an unauthenticated email.

| Subject identifier | Verification step |
|---|---|
| Authenticated `user_id` | JWT proves identity; proceed |
| Email address only | Send signed magic link to the address; subject clicks within 7 days; proceed |
| Third party / authorized agent | Operator reviews proof of authorization (CCPA §1798.140(d)); tier-3 escalation per [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers) |
| Regulator | Operator verifies provenance; tier-3 escalation |

Unverified requests are queued for ≤30 days then dropped with an audit row stating "unverified — no action."

---

## 6. Cascade rules per table

Every cascade runs inside a single transaction per table with `SET LOCAL app.tenant_id` so RLS policies in [`packages/crm/src/index.ts ENABLE_OUTREACH_RLS`](../../packages/crm/src/index.ts) hold.

### 6.1 `crm_leads` — soft-delete with 30-day grace

Touch history may be load-bearing for an in-flight billing dispute. Soft-delete preserves it for grace, hard-deletes after.

```sql
-- Phase 1: soft-delete
UPDATE crm_leads
SET status = 'churned',
    touch_history = '[]'::jsonb,
    first_touch_source = NULL,
    last_touch_source  = NULL,
    first_touch_campaign = NULL,
    last_touch_campaign  = NULL
WHERE user_id = $1;

-- Phase 2 (cron, +30d): hard-delete
DELETE FROM crm_leads WHERE user_id = $1 AND status = 'churned' AND converted_at IS NULL;
```

### 6.2 `outreach_contacts` — hard-delete + suppression

Direct identifiers; nothing to preserve. Same transaction inserts the suppression row so the subject is not re-enrolled by a future import.

```sql
WITH gone AS (
  DELETE FROM outreach_contacts
  WHERE tenant_id = $1 AND (email = $2 OR phone = $3)
  RETURNING email
)
INSERT INTO email_suppression_list (tenant_id, email, email_hash, reason, source_provider)
SELECT $1, email, encode(digest(lower(email), 'sha256'), 'hex'), 'dsr_erasure', 'dsr'
FROM gone
ON CONFLICT (tenant_id, email) DO NOTHING;
```

### 6.3 `outreach_campaigns` — no action

No PII. Listed only so audit can prove inspection.

### 6.4 `call_logs` — recording purge + row anonymization

Recording URL is biometric PII; the metadata row is retained anonymized for billing reconciliation.

```sql
-- Purge R2 / Cloudflare Stream asset first (orchestrated outside DB)
-- Then:
UPDATE call_logs
SET recording_url = NULL,
    provider_call_id = 'dsr_erased:' || encode(digest(provider_call_id, 'sha256'), 'hex')
WHERE contact_id IN (
  SELECT id FROM outreach_contacts
  WHERE tenant_id = $1 AND (email = $2 OR phone = $3)
);
```

### 6.5 `factory_events` — anonymize (preserve aggregates)

Cohort retention and revenue rollups must survive. We null `user_id`, scrub property keys known to hold PII, retain the timestamp + event name.

```sql
UPDATE factory_events
SET user_id = NULL,
    properties = properties
      - 'email' - 'phone' - 'first_name' - 'last_name'
      - 'ip' - 'user_agent'
      - 'name' - 'address'
WHERE user_id = $1;
```

A scheduled audit query (`SELECT count(*) FROM factory_events WHERE properties ? 'email'`) runs weekly; non-zero result = tripwire per [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires).

### 6.6 `email_drip_state` — hard-delete

```sql
DELETE FROM email_drip_state
WHERE email = $1 OR user_id = $2;
```

The cascade also calls `unsubscribe()` in [`packages/email/src/index.ts`](../../packages/email/src/index.ts) so both Resend and Postmark stop pending sends — see [`ADR 2026-05-18 — Resend fallback`](../decisions/2026-05-18-resend-fallback-provider.md).

### 6.7 `email_suppression_list` — insert, never delete

Counter-intuitive but mandatory: an erasure inserts a row here so the subject is not re-enrolled by a re-signup or import. The row holds the SHA-256 hash of the email, never the plaintext after the cascade completes.

```sql
INSERT INTO email_suppression_list
  (tenant_id, email, email_hash, reason, source_provider)
VALUES
  ($1, $2, encode(digest(lower($2), 'sha256'), 'hex'), 'dsr_erasure', 'dsr')
ON CONFLICT (tenant_id, email) DO UPDATE
  SET reason = 'dsr_erasure', suppressed_at = NOW();

-- 24h later, after cron has fanned out to providers:
UPDATE email_suppression_list SET email = email_hash WHERE reason = 'dsr_erasure' AND email <> email_hash;
```

The subject's plaintext email lives ≤24h post-erasure — long enough for the 60s cron to confirm provider-side suppression — then is replaced by the hash. A future "did this person re-sign up?" check uses the hash.

### 6.8 `published_readings` — 410 Gone + slug tombstone + CDN purge + de-index

A reading published with a client first name is a public surface. Cascade:

1. Delete the row.
2. Insert a tombstone in `slug_tombstones (slug, reason, tombstoned_at)` so the slug is not reused.
3. Server responds **HTTP 410 Gone** (not 404) on the slug — this signals to search engines to drop the URL permanently rather than retry.
4. Issue a Cloudflare cache purge for the URL.
5. Submit a removal request to the Google Search Console URL removal tool (operator-mediated within 24h).
6. Insert a hashed audit row keyed by SHA-256 of the slug + a random nonce, proving "this reading was published and erased" without preserving the client's name.

### 6.9 `referral_codes` — anonymize `user_id`, retain `stripe_account_id` decision

The Stripe account ID is the linking key for revenue reconciliation; we cannot delete it without breaking the Stripe ledger. We anonymize `user_id` (the marketing-side identifier) and retain `stripe_account_id` under a separate retention class governed by financial-records law (typically 7 years), documented in the audit trail.

```sql
UPDATE referral_codes
SET user_id = NULL
WHERE user_id = $1;
```

The subject is informed in the access export that `stripe_account_id` is retained under financial-records retention; this is GDPR Art. 17(3)(e) compliant (legal obligation).

---

## 7. Audit trail

Every DSR produces an immutable row in `dsr_requests`:

```sql
CREATE TABLE IF NOT EXISTS dsr_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  type            TEXT NOT NULL,            -- access | rectification | erasure | portability | objection
  subject_hash    TEXT NOT NULL,            -- SHA-256(lower(email)) — survives erasure for auditability
  region_claimed  TEXT,                     -- 'EU' | 'UK' | 'CA' | 'BR' | 'ZA' | other
  channel         TEXT NOT NULL,            -- 'email' | 'in_product' | 'regulator'
  verified_at     TIMESTAMPTZ,
  cascade_started TIMESTAMPTZ,
  cascade_done    TIMESTAMPTZ,
  cascade_rows    JSONB NOT NULL DEFAULT '{}', -- {table_name: row_count_affected}
  notes           TEXT
);
```

- The subject's identity is stored only as a hash. The audit ledger therefore survives the cascade without re-exposing PII.
- `cascade_rows` lets a regulator confirm scope of action without disclosing identities.
- The ledger is append-only at the application layer; updates are forbidden once `cascade_done` is set.

---

## 8. Regional considerations

| Region | Statute | Specific obligations beyond the cascade |
|---|---|---|
| EU / UK | GDPR Art. 12–22; UK GDPR | 30-day completion cap; right-to-be-informed within 5 business days; cross-border transfer disclosed in access export |
| US — California | CCPA / CPRA | 45-day completion cap; identity verification by "reasonable methods"; do-not-sell opt-out honoured globally per CPRA |
| US — Virginia, Colorado, Connecticut, Utah, others | State-specific | Same shape as CCPA; differences captured by the 45-day cap holding as the binding minimum |
| Brazil | LGPD Art. 17–22 | 15-day acknowledgement; portability format must be "structured" — our JSON export qualifies |
| South Africa | POPIA | Acknowledgement within "reasonable time"; we hold to GDPR's 30-day cap as the floor |
| Canada | PIPEDA / CASL | CASL governs sending; PIPEDA governs access/erasure; both are honoured by the same cascade |
| Everywhere else | Operator-mediated | Tier-3 escalation per [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers); cascade still runs at GDPR strictness |

Region is **claimed** by the subject, not auto-detected. Auto-detection is best-effort only and never relaxes a cascade.

---

## 9. Implementation references

- [`packages/compliance/`](../../packages/compliance/) — DSR queue + `executeDSR()` (forthcoming; package #20 in [`CLAUDE.md`](../../CLAUDE.md) dep order)
- [`packages/email/src/index.ts`](../../packages/email/src/index.ts) — `unsubscribe()` cascade hook
- [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) — RLS policies the cascade runs under
- [`packages/analytics/src/index.ts`](../../packages/analytics/src/index.ts) — PostHog firewall that keeps `factory_events` the only home for event-level PII
- [`docs/decisions/2026-05-18-resend-fallback-provider.md`](../decisions/2026-05-18-resend-fallback-provider.md) — suppression-list ledger that this doc relies on
- [`docs/runbooks/secret-rotation.md`](../runbooks/secret-rotation.md) — for any tokens that touch DSR endpoints

---

## 10. Cross-references

| Doc | Why |
|---|---|
| [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance) | The rule this doc operationalizes |
| [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights) | Operator can request full audit trail at any time; this doc provides it |
| [`ATTRIBUTION.md §8`](./ATTRIBUTION.md#8-privacy--compliance) | Touch-history zeroing on `do_not_contact` |
| [`icp/cypher-practitioner.md §3.4`](./icp/cypher-practitioner.md) | Regulated-vertical compliance pattern this doc complements |
| [`docs/PLATFORM_STANDARDS.md`](../PLATFORM_STANDARDS.md) | Multi-tenancy / RLS standards the cascade respects |
| [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) | Stage-5 DSR gap closed by this doc |

---

## 11. Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — initial DSR handling for all marketing-collected PII; cascade rules per table; regional matrix; audit ledger |
