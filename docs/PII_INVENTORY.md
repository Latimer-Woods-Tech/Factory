# PII Inventory — Factory / Admin Studio

> **Owner:** @sauna  
> **Last reviewed:** 2026-05-23  
> **Classification:** Internal — Engineering

This document enumerates all personally identifiable information fields collected or processed by the Factory platform and its hosted apps. It is required by the [RETENTION policy](./RETENTION.md) and the Platform Standards privacy dimension (G12/G13 gap register).

---

## 1. Data Subjects

| Subject type | Description |
|---|---|
| Creator | Individual who signs up and generates content via factory apps (e.g. SelfPrime, Capricast, xico-city) |
| Visitor | Unauthenticated viewer of published content (analytics only) |
| Admin | Internal operator who accesses the Admin Studio |

---

## 2. PII Fields

### 2.1 `users` table (Neon — per-app databases)

| Field | Classification | Purpose | Retention |
|---|---|---|---|
| `id` (UUID) | Pseudonymous | Primary key | Lifetime of account |
| `email` | PII — contact | Auth, notifications | Until deletion request |
| `name` | PII — identity | Display in UI | Until deletion request |
| `avatar_url` | PII — identity (derived) | Profile image from OIDC | Until deletion request |
| `google_sub` | PII — identity (derived) | Google OIDC subject claim | Until deletion request |
| `stripe_customer_id` | PII — financial reference | Billing | Until deletion + 7 years (legal) |
| `created_at` | Metadata | Audit | Until deletion + 30 days |

### 2.2 `analytics_events` / `factory_events` table

| Field | Classification | Purpose | Retention |
|---|---|---|---|
| `actor_id` | Pseudonymous | Ties events to user | 13 months rolling |
| `ip` (hashed) | Pseudonymous | Fraud detection | 30 days |
| `user_agent` | Quasi-identifier | Device analytics | 30 days |

### 2.3 PostHog (third-party analytics)

| Data | Classification | Purpose | Retention |
|---|---|---|---|
| Distinct ID (hashed email) | Pseudonymous | Session joining | 24 months |
| Page URLs | Metadata | Funnel analysis | 24 months |
| Feature flag evaluations | Metadata | A/B testing | 24 months |

### 2.4 Sentry (error monitoring)

| Data | Classification | Purpose | Retention |
|---|---|---|---|
| User ID (in error context) | Pseudonymous | Debug attribution | 90 days |
| Request headers (scrubbed) | Metadata | Error reproduction | 90 days |

---

## 3. Third-Party Processors

| Processor | Data shared | DPA in place |
|---|---|---|
| Neon (PostgreSQL) | All user table data | Yes (SOC 2 Type II) |
| Cloudflare (Workers/KV) | Request metadata, caching | Yes (DPA) |
| Stripe | Billing references | Yes (DPA) |
| PostHog | Pseudonymous analytics | Yes (DPA) |
| Sentry | Pseudonymous error context | Yes (DPA) |
| Resend | Email address for transactional emails | Yes (DPA) |
| Anthropic | **No PII** — prompts must be anonymized before submission | N/A |

---

## 4. DSR (Data Subject Requests)

Data export and deletion endpoints are provided at:
- `GET /api/me/export` — returns all data for the authenticated user
- `DELETE /api/me` — deletes all data for the authenticated user (soft-delete, purged after 30 days)

See [admin-studio DSR routes](../apps/admin-studio/src/routes/privacy.ts) for implementation.

---

## 5. Data Flows

```
Creator ──sign-up──▶ Neon users table
Creator ──action──▶ factory_events table (pseudonymous)
Creator ──action──▶ PostHog (pseudonymous distinct_id)
Creator ──error──▶ Sentry (pseudonymous user_id)
Creator ──billing──▶ Stripe (stripe_customer_id stored in Neon)
```

---

## 6. Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-23 | Initial inventory created | @sauna |
