# ADR — Resend Fallback Provider: Postmark

**Status:** Accepted · **Date:** 2026-05-18 · **Decider:** @adrper79-dot · **Supersedes:** none

> **TL;DR:** Adopt **Postmark** as the failover provider for [`@latimer-woods-tech/email`](../../packages/email/) when Resend is degraded. Mirror the [`@latimer-woods-tech/llm`](../../packages/llm/) chain pattern (primary → fallback on transient failure only, never on 4xx). Keep the canonical `email_suppression_list` in Neon and reconcile to both providers via a 60s cron fan-out. Lock the choice now so the marketing loop ([`CONSTITUTION.md §6`](../marketing/CONSTITUTION.md#6-data-consent-compliance)) is not single-vendor-dependent before any paid spend gates open.

---

## Context

The grand review of the marketing maturation plan flagged **item A4 — single-vendor email dependency**. Current state:

- [`packages/email/src/index.ts`](../../packages/email/src/index.ts) calls Resend directly, with no retry or failover path.
- A Resend outage, account suspension, or rate-limit event halts every transactional and lifecycle send across the portfolio. The marketing supervisor cannot reroute.
- Unsubscribe state is stored only via Resend contact tags. If Resend is unavailable we cannot honour suppression — a direct violation of [`CONSTITUTION.md §6`](../marketing/CONSTITUTION.md) (consent gates / unsubscribe).
- Reputation events at Resend (a noisy neighbour on a shared IP pool, an inbox-provider block on `thefactory.dev`) propagate to every product. We need reputation independence the same way we need provider independence.

The autonomous marketing loop is about to send larger volumes ([`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md)) across multiple ICP cells. Single-vendor email is the highest-blast-radius dependency we still hold; it must be addressed before any cell graduates to `paid_active` per [`CONSTITUTION.md §5`](../marketing/CONSTITUTION.md#5-channel-allowlist--readiness-gates).

---

## Decision

### 1. Postmark is the fallback provider

Postmark is added as a second transactional sender behind a thin abstraction in [`packages/email/src/index.ts`](../../packages/email/src/index.ts). Selection criteria, in order of weight:

| Criterion | Why Postmark wins |
|---|---|
| **Transactional focus** | Postmark refuses bulk/marketing mail on its transactional streams; this gives our lifecycle + transactional traffic an isolated reputation pool. Resend mixes both. |
| **Reputation independence** | Postmark runs separate IP infrastructure, separate inbox-provider relationships, separate compliance posture. A Resend reputation event does not propagate. |
| **Queryable suppression API** | Postmark exposes a first-class `/suppressions` endpoint for both read and write. We can reconcile the canonical Neon `email_suppression_list` table to Postmark deterministically. Resend's suppression model is tag-based and not symmetrically queryable. |
| **Deliverability ceiling** | Postmark publishes hourly time-to-inbox; track record on transactional is at or above Resend for our verticals. |
| **Operational simplicity** | Single REST API; same `Bearer` auth shape; no SMTP fallback required. Drop-in mirror of the existing Resend code path. |

### 2. Failover triggers (mirror the LLM chain)

The fallback fires **only on transient or provider-side failures**, never on errors that indicate our own bug:

| Resend response | Action |
|---|---|
| `5xx` (any) | Retry once on Resend, then route to Postmark |
| `429 Too Many Requests` | Honour `Retry-After` once, then route to Postmark |
| Fetch timeout (>10s wall clock) | Route to Postmark |
| Account suspended / inactive (`401`/`403` with provider-side cause) | Route to Postmark + tier-3 escalation per [`CONSTITUTION.md §4`](../marketing/CONSTITUTION.md#4-approval-tiers) |
| `4xx` other than the above (bad payload, invalid `from`, malformed recipient) | **Do not** failover. This is our bug. Surface as `InternalError`, fail loudly. |
| Suppressed recipient (Resend reports `unsubscribed`) | **Do not** failover. Failing over would re-mail an opted-out recipient — a §6 violation. Drop send, log, exit. |

This is the exact policy used by [`@latimer-woods-tech/llm`](../../packages/llm/) when it falls Anthropic → Grok → Groq: transient = chain forward; client error = halt and surface.

### 3. Suppression list canonical in Neon

A new table [`email_suppression_list`](../../packages/email/) is created in the platform Neon database:

```sql
CREATE TABLE IF NOT EXISTS email_suppression_list (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  email           TEXT NOT NULL,
  email_hash      TEXT NOT NULL,        -- SHA-256 of lowercased email, for audit lookups after deletion
  reason          TEXT NOT NULL,        -- 'unsubscribe' | 'bounce_hard' | 'complaint' | 'dsr_erasure' | 'manual'
  source_provider TEXT,                 -- 'resend' | 'postmark' | 'app' | 'dsr'
  user_id         TEXT,
  suppressed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_to       TEXT[] DEFAULT '{}',  -- which providers have confirmed the suppression
  UNIQUE(tenant_id, email)
);
```

- Every `unsubscribe()`, hard bounce, spam complaint, and DSR erasure writes here first.
- A 60s Cloudflare cron Worker fans the table out to **both** providers' suppression APIs, marking each row's `synced_to` once acknowledged.
- The email client checks Neon before every send. Provider-level suppression is defence in depth, not the source of truth.
- DSR erasure ([`docs/marketing/DSR_HANDLING.md`](../marketing/DSR_HANDLING.md)) deletes PII rows from `crm_leads` / `outreach_contacts` but **inserts** the hashed identifier here so a future re-signup cannot re-enrol the same address without explicit re-consent.

### 4. Sender-domain isolation

- Resend keeps `noreply@thefactory.dev` and per-product subdomains already configured.
- Postmark uses parallel DKIM/SPF/DMARC records on the same domains. DNS is shared; signing keys are separate.
- Domain reputation is therefore tracked twice (once per provider), with shared anti-spoofing posture.

---

## Alternatives considered

### A. SendGrid

**Why rejected:** Twilio-owned, repeated multi-day outages in 2023–2025, mixed transactional/marketing reputation pool, painful suppression API ergonomics. Adds a vendor we'd otherwise avoid.

### B. Mailgun

**Why rejected:** Adequate technically; weaker transactional reputation; pricing model rewards volume which inverts the incentive we want (we want a provider that pushes back on spammy patterns, not one that discounts them).

### C. Amazon SES

**Why rejected:**
- Requires us to operate reputation management ourselves (warming, complaint handling, deliverability tuning) — that's the exact ops load we want to avoid.
- Sandbox-graduation friction and per-region quotas add operational sharp edges.
- IAM key handling re-introduces an AWS dependency surface we don't otherwise carry on Cloudflare Workers.

### D. Do nothing (single-vendor)

**Why rejected:** Already the failure mode the grand review flagged. The marketing loop cannot graduate any cell to `paid_active` while single-vendor dependency persists — every paid dollar is at risk of a Resend incident wasting it.

### E. Self-host Postfix on a non-Cloudflare runtime

**Why rejected:** Violates the Workers-first stack constraint in [`CLAUDE.md`](../../CLAUDE.md). Reputation management is a full-time job; we are not staffed for it.

---

## Consequences

### Positive

- Marketing loop tolerates a Resend outage without halting sends.
- Reputation independence — a `thefactory.dev` IP block at one provider does not propagate.
- Suppression state survives any single-provider failure; consent compliance is preserved.
- Postmark's queryable suppression API makes the DSR audit trail simpler ([`DSR_HANDLING.md`](../marketing/DSR_HANDLING.md)).
- The cron fan-out gives a single Neon-side ledger that audit tooling can query without touching either provider.

### Negative

- Two provider API keys to rotate ([`docs/runbooks/secret-rotation.md`](../runbooks/secret-rotation.md) gets a new section).
- Two DKIM/SPF/DMARC records per domain; DNS surface roughly doubles.
- ~2 hours/month of incremental ops to monitor Postmark separately.
- Postmark adds a recurring cost (estimated $15–$50/month at current send volumes); within [`BUDGET_CAPS.md`](../marketing/BUDGET_CAPS.md) infra allowance.

### Neutral

- Tests in [`packages/email/`](../../packages/email/) gain a second provider mock. Coverage targets unchanged.
- Resend remains primary; failover is the exception path, not the steady state.

---

## Rollback path

If Postmark proves unworkable (deliverability regression, API instability, cost overrun):

1. Pin the email client to `provider: 'resend'` via a config flag; failover code remains compiled but disabled.
2. Re-open the ADR; evaluate Mailgun or SES with the lessons learned.
3. Suppression-list ledger in Neon stays — provider-agnostic by design.
4. Estimated rollback time: 1 day. No schema migration required.

If Resend itself becomes the unworkable side, flip the order: Postmark primary, Resend fallback. The abstraction is symmetric.

---

## Cross-references

- [`packages/email/src/index.ts`](../../packages/email/src/index.ts) — code path that gains the fallback
- [`packages/llm/`](../../packages/llm/) — reference pattern for provider-chain failover
- [`docs/marketing/CONSTITUTION.md §6`](../marketing/CONSTITUTION.md#6-data-consent-compliance) — consent / suppression rules this ADR upholds
- [`docs/marketing/DSR_HANDLING.md`](../marketing/DSR_HANDLING.md) — companion doc for erasure cascade
- [`docs/runbooks/secret-rotation.md`](../runbooks/secret-rotation.md) — `POSTMARK_SERVER_TOKEN` rotation added
- [`docs/runbooks/github-secrets-and-tokens.md`](../runbooks/github-secrets-and-tokens.md) — inventory entry added
- [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) — grand-review item A4 closed by this work

---

## Authors

- Drafted by Claude (Opus 4.7) on 2026-05-18 in response to the marketing-maturation grand review (item A4).
- Accepted by @adrper79-dot on commit.
