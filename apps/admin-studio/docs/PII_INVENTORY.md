# PII Inventory — Factory Admin Studio

**Version:** 1.0  
**Date:** 2026-05-22  
**Owner:** @adrper79-dot  
**Review cadence:** Quarterly (next: 2026-08-22)  
**Status:** Active

---

## Scope

This document covers all personal and sensitive data processed by the `factory-admin-studio` Cloudflare Worker and its companion `admin-studio-ui` frontend. Data is operator-only (internal tool); no end-customer PII transits through this surface except as incidental metadata in audit logs.

---

## Data Inventory

| Field | Category | Source | Storage | Retention | Legal basis | Notes |
|---|---|---|---|---|---|---|
| `email` | Personal Identifier | Login form / Google OAuth credential | JWT (sessionStorage, client-side only) | Session duration only — expires with JWT | Legitimate interest (operator authentication) | Never written to the Worker's D1/KV. Decoded from JWT payload in-memory on the frontend. |
| `userId` | Pseudonymous Identifier | JWT payload | JWT (sessionStorage, client-side only) | Session duration | Legitimate interest | Internal UUID; no direct link to external identity without the auth system. |
| `role` | Access Control Attribute | JWT payload | JWT (sessionStorage, client-side only) | Session duration | Legitimate interest | Values: `admin`, `operator`, `viewer`. |
| `request_id` | System Metadata | Generated per-request (`X-Request-Id` header) | Worker structured logs → Cloudflare Logpush | 30 days | Legitimate interest (debugging) | UUIDv7. No PII on its own. Rotates per request. |
| `actor_email` | Personal Identifier | Derived from verified JWT on the Worker | Audit log table in Neon (`audit_events`) | 2 years | Legal obligation (audit trail for admin operations) | Written as `actor` column. Immutable once written. |
| `IP address` | Network Identifier | Cloudflare `CF-Connecting-IP` header | Cloudflare Access logs | Per Cloudflare default (30 days) / not retained in Worker storage | Legitimate interest (rate limiting, abuse prevention) | Never written to D1 or KV by the Worker itself. |
| `Google ID token` | Authentication Credential | Google OAuth callback | Not stored; validated then discarded | Single request lifetime | Consent (user initiates Google login) | Verified via Google's JWKS endpoint. Extract claims then discard raw token. |

---

## Data Flows

```
[Operator Browser]
  → (1) POST /auth/login or /auth/google
      → Worker validates credentials / Google token
      → Issues JWT (userId, email, role, exp)
      → JWT stored in browser sessionStorage (client-managed)
  → (2) Subsequent requests carry JWT in Authorization header
      → Worker verifies JWT, extracts actor identity
      → Logs actor_email + action to audit_events table (Neon)
  → (3) On logout / session expiry
      → sessionStorage.clear() — JWT purged from browser
      → No server-side session to revoke (stateless JWT)
```

---

## Retention Schedule

| Data | Retention | Deletion mechanism |
|---|---|---|
| JWT in browser sessionStorage | Session only (tab close / expiry) | Browser-managed; enforced by `expiresAt` check in `session.ts` |
| `audit_events` rows | 2 years | Manual purge via `DELETE FROM audit_events WHERE created_at < NOW() - INTERVAL '2 years'` — to be automated in Stage 3 |
| Cloudflare structured logs | 30 days | Cloudflare Logpush default rotation |
| Cloudflare Access logs | 30 days | Cloudflare default |

---

## Data Subject Rights (DSR)

This is an internal operator tool. Operators are employees or contractors of Latimer-Woods-Tech. DSR handling:

| Right | Mechanism | SLA |
|---|---|---|
| Access | Operator can view their own audit log entries via the Audit tab | On request, within 30 days |
| Erasure | Submit ticket to @adrper79-dot; purge rows from `audit_events` where `actor = email` | 30 days |
| Rectification | Audit events are immutable by design (legal requirement). Annotation ADR required. | N/A |
| Portability | Export via `SELECT * FROM audit_events WHERE actor = ?` — CSV format on request | 30 days |

**DSR contact:** adrper79@gmail.com  
**Data Controller:** Latimer-Woods-Tech (sole operator)

---

## Third-Party Processors

| Processor | Purpose | Data shared | DPA in place? |
|---|---|---|---|
| Cloudflare | Worker runtime, Logpush, Access | IP, request metadata | Yes (Cloudflare DPA) |
| Neon (database) | `audit_events` table | `actor_email`, action metadata | Yes (Neon DPA — GDPR-compliant) |
| Google (Accounts) | OAuth token validation | Google ID token (single-use) | Yes (Google Cloud DPA) |
| Sentry | Error reporting | Stack traces (no PII in messages by policy) | Yes (Sentry DPA) |

---

## Security Controls

- JWT signed with `JWT_SECRET` (HS256) — rotated per `docs/runbooks/secret-rotation.md`
- `sessionStorage` (not `localStorage`) — cleared on tab close
- `expiresAt` enforced client-side on every render cycle
- Audit log rows: append-only, no UPDATE/DELETE by application code
- All DB connections via Neon Hyperdrive (`env.DB`) — TLS in transit

---

## Open Gaps

| ID | Gap | Target |
|---|---|---|
| G31 | JWT rotation has no dual-key window — secret rotation invalidates all live sessions | Stage 4 |
| — | `audit_events` purge job not yet automated | Stage 3 |
| — | No encrypted-at-rest control documented for Neon | Verify with Neon DPA — Stage 3 |
