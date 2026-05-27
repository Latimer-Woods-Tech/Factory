# Data Retention Policy — Factory Platform

> **Owner:** @sauna  
> **Last reviewed:** 2026-05-23  
> **Classification:** Internal — Engineering + Legal

This document defines retention periods and deletion procedures for all data processed by Factory-hosted applications. It satisfies the privacy conformance dimension (Platform Standards §10) and the PII inventory referenced in [PII_INVENTORY.md](./PII_INVENTORY.md).

---

## 1. Retention Schedule

### 1.1 User Account Data

| Data | Retention period | Trigger | Notes |
|---|---|---|---|
| User profile (`email`, `name`, `avatar_url`) | Account lifetime + 30 days | Account deletion request | Soft-delete on request; hard purge at T+30d |
| Google OIDC sub (`google_sub`) | Account lifetime + 30 days | Account deletion | Same as above |
| Stripe customer ID | Account lifetime + **7 years** | Account deletion | Retained for legal/tax compliance |
| Stripe payment records | **7 years** from transaction date | Statutory minimum | Accessible only to Finance |

### 1.2 Analytics & Event Data

| Data | Retention period | Storage |
|---|---|---|
| `factory_events` rows | **13 months** rolling | Neon (per-app) |
| PostHog events | **24 months** | PostHog cloud |
| `ip` (hashed) | **30 days** | Neon |
| `user_agent` | **30 days** | Neon |

### 1.3 Error Monitoring

| Data | Retention period | Storage |
|---|---|---|
| Sentry events | **90 days** | Sentry cloud |
| Sentry attachments | **30 days** | Sentry cloud |

### 1.4 Logs & Audit Trails

| Data | Retention period | Storage |
|---|---|---|
| Structured access logs (Cloudflare) | **30 days** | Cloudflare Logpush |
| Audit log entries (`audit_log` table) | **1 year** | Neon |
| Admin action audit trail | **3 years** | Neon |

### 1.5 AI / LLM Prompt Data

- **Prompts are never persisted** unless explicitly stored for a product feature.
- LLM providers (Anthropic, Groq) receive anonymized prompts — no PII.
- Token cost accumulators (KV) contain no PII; TTL 48h (daily) / 40d (monthly).

---

## 2. Deletion Procedure

### 2.1 User-Initiated Deletion (DSR)

1. User calls `DELETE /api/me` with a valid JWT.
2. Worker sets `deleted_at = NOW()` on the `users` row (soft-delete).
3. A nightly Neon scheduled function (`fn_purge_deleted_users`) hard-deletes rows where `deleted_at < NOW() - INTERVAL '30 days'`.
4. A Stripe webhook listener cancels active subscriptions and flags the customer as deleted.
5. PostHog `$delete` event is sent to suppress future processing.
6. Sentry user is deleted via Sentry API.

### 2.2 Automated Expiry

- `factory_events` rows older than 13 months are deleted by a Neon scheduled job.
- `audit_log` rows older than 3 years are archived to R2 and then deleted from Neon.

### 2.3 Data Export (DSR)

- `GET /api/me/export` returns a JSON package of all personal data for the authenticated user.
- Response includes: profile fields, subscription information, analytics event counts (aggregated, not raw), and a list of content items.

---

## 3. Legal Basis Summary

| Processing purpose | Legal basis (GDPR Art. 6) |
|---|---|
| Account creation and service delivery | Contract performance (Art. 6(1)(b)) |
| Analytics and product improvement | Legitimate interests (Art. 6(1)(f)) |
| Billing and financial records | Legal obligation (Art. 6(1)(c)) |
| Security monitoring and fraud prevention | Legitimate interests (Art. 6(1)(f)) |

---

## 4. Review Schedule

This policy is reviewed annually or after any significant data model change.

| Date | Change | Author |
|---|---|---|
| 2026-05-23 | Initial policy created | @sauna |
