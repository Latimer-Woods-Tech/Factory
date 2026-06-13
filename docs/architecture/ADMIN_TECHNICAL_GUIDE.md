---
date: 2026-05-25
status: living-spec
authoritative-for: admin-studio, read-model layer, better-gate, tier-0-through-tier-2 platform work
companion-to: docs/architecture/FACTORY_V1.md, docs/decisions/2026-05-25-factory-alignment.md
---

# Factory Admin Technical Guide

> **Purpose.** One living technical specification for everything between the user (Adrian / future operators) and the platform's distributed write systems. Where [`FACTORY_V1.md`](FACTORY_V1.md) defines what the system IS, this document defines what the **read layer + the seams** look like — concretely, with schemas, ingestion paths, and a Tier-0-through-Tier-2 build order.
>
> Read order: §1 (architecture frame) → §2 (Tier 0, this week) → §3 (Tier 1, two weeks) → §4 (Tier 2, one month) → §5 (cross-cutting seams) → §6 (anti-patterns).

---

## 1. The architecture in one frame

### 1.1 Control-plane principle

```
Write systems (truth — distributed, unchanged):
  ├─ GitHub Issues / PRs / Projects     → canonical tasks
  ├─ D1 (apps/supervisor)               → canonical supervisor runs + steps + locks
  ├─ GH Actions workflows               → canonical gate execution
  ├─ Cloudflare (Workers / Stream / R2) → canonical deploys + media
  ├─ Sentry                             → canonical errors
  ├─ Stripe                             → canonical billing
  └─ Neon per-app project DBs           → canonical app business state

Read layer (aggregated view — Neon factory-core project):
  ├─ factory_events       (pre-existing — business event log from @lwt/analytics)
  ├─ factory_events_ingest (NEW — immutable raw event log for platform ingestion, §2.0)
  ├─ factory_gates        (NEW — derived gate states from ingested events, §2.2)
  ├─ factory_artifacts    (NEW — derived catalog of run outputs, §2.3)
  ├─ factory_runs_mirror  (NEW — periodic mirror of supervisor D1, §2.4)
  └─ factory_audit_log    (NEW — admin-route audit trail, §1.8.3)

Admin Studio UI joins across the read layer. Never writes to it directly.
```

**Three event-prefixed tables, distinct purposes** — easy to confuse, so resolved explicitly here:

| Table | Source | What lives in it | Written by |
|---|---|---|---|
| `factory_events` (pre-existing) | App business surfaces | `signup`, `payment_succeeded`, `practitioner_invited` etc. — user-facing business events | `@lwt/analytics.track()` from app code |
| `factory_events_ingest` (NEW Tier 0) | Platform internals | Raw inbound webhook payloads, supervisor state transitions, render-pipeline completions — the immutable "what arrived" log | `factory-core-api` ingest endpoints |
| `factory_audit_log` (NEW Tier 1) | Admin route invocations | `actor + action + target + result` rows for every `/admin/*` call across every app | `@lwt/compliance.auditLog()` middleware |

**Rule.** No table in the read layer is authoritative. If it disagrees with its source-of-truth, the source wins. The read layer is a queryable cache; rebuild it from sources at any time.

**`factory_signals`** is referenced in some sections as a future read-layer table for "what triggered what." It is **deferred to Tier 1+** (per [`docs/decisions/2026-05-25-factory-alignment.md`](../decisions/2026-05-25-factory-alignment.md) — Tier 3 deferral, build only when admin UI demands it). It does not appear in Tier 0 schemas.

### 1.2 Why this shape

Control planes are almost universally **write-distributed, read-centralized**. Forcing writes into a centralized DB creates dual-write hazards, migration risk, and conflicts with existing optimized write paths (GitHub Issues + branch protection + the supervisor's lock model). A read-only aggregation layer gives us observability without disturbing any of those.

This document is the spec for that read layer plus the gate/quality work that runs alongside it.

### 1.3 Surfaces this guide covers

| Tier | Surface | Time horizon |
|---|---|---|
| **Tier 0** | Raw-event log · Better Gate · `factory_gates` · `factory_artifacts` · `factory_runs_mirror` · Stuck-watcher · Admin UI wire-up | this week |
| **Tier 1** | `capabilities.yml` per app · `@lwt/llm-meter` · `_migration-drift-guard.yml` · template library | next 2 weeks |
| **Tier 2** | `@lwt/llm@0.3.0` · reliability gate rollout · Sentry sourcemap retroactive · HD DSR E2E | next month |
| **Inward sweep** | Each tier names the connections that build back inward — see §5 |

---

## 1.4 Operating invariants

Five rules every implementer must respect. These came out of the 2026-05-25 review pass; violating any of them silently corrupts the system.

### 1.4.1 Side-effect boundary

**The Admin UI never performs side effects directly.** It is an *intent-collection* surface, not a query-only surface: it gathers operator inputs, previews, and confirmations and submits a typed action request — but every authoritative outcome (authentication, policy re-evaluation, mutation, audit, receipt identity) is computed by the **Admin Studio API**, which is authoritative. The UI explains and collects intent; it does not calculate authoritative outcomes. (Boundary of record: [docs/decisions/2026-06-08-admin-studio-boundary.md](../decisions/2026-06-08-admin-studio-boundary.md).)

> Correction (2026-06-08): an earlier version of this section said "the UI is a query surface only." Admin Studio is now an operational mutation surface — the UI collects intent and confirmation for mutations. The invariant is not "no mutations" but **"no *direct* side effects from the UI; all mutations flow through governed orchestrator APIs."**

When the UI surfaces "PR #298 is blocked on CI" and the operator clicks an action, the click goes through a governed Admin Studio API / orchestrator endpoint that authenticates the request, re-evaluates policy, validates the requested action against `capabilities.yml`, writes a `factory_audit_log` row + receipt, then performs the side effect against the source-of-truth. The UI never POSTs directly to a domain mutation endpoint, never writes to Neon directly, never calls GitHub/Stripe/Cloudflare/provisioners, and never infers success from an HTTP 200.

**Enforcement.** The Admin UI Worker has read-only DB credentials (Hyperdrive binding scoped to `SELECT` only). Action-triggering endpoints live on the Admin Studio API (and `factory-core-api`), authenticated with a write-scoped JWT — never on the UI Worker.

### 1.4.2 Append-first, derive-latest

**Gate and artifact rows are append-only.** When CI re-runs, when a review is dismissed and resubmitted, when a deploy is rolled back — every state transition is a new row, not an UPDATE on the prior row.

The "current state" of any gate is computed by a view (`factory_gates_latest`) that selects the most recent row per `(subject_ref, gate_type, source_ref)`. History is preserved; truth is derived.

**Why this matters.** Overwrite-first means a CI re-run silently destroys evidence of the first failure. Audits become impossible. Append-first means the timeline reads forward; you can replay it.

**Precision on the two terms (they're related but distinct).** *Append-first* is the **rule** for ingestion code: write the new row before considering the operation complete; never UPDATE in place. *Append-only* is the **schema property** enforced by the table: no UPDATEs allowed on prior rows. The first describes how callers must behave; the second is the database guarantee that makes the rule unbreakable. Both apply to `factory_gates`, `factory_artifacts`, `factory_events_ingest`, and `factory_audit_log`.

### 1.4.3 Raw-event log as foundation

Every ingestion path writes to `factory_events_ingest` (immutable, append-only) **before** any derivation runs. Failed derivations don't lose the event; they leave a row marked `derivation_status = 'pending'` for replay.

**Replay mechanism.** A `factory-events-replay` Worker reads pending events, re-runs the derivation logic, marks success or failure. If a derivation bug is fixed, history can be re-derived without re-ingesting.

This is the foundation that makes "rebuild the read layer at any time" actually true rather than aspirational.

### 1.4.4 Stuck detection

**Track what's missing, not just what's present.** Define expected-gate-set per subject type:

- A `pr` subject expects: `ci`, `constraints`, `claude-review`, eventually `codeowner-review`
- A `deploy` subject expects: `canary` within 30 min of deploy SHA appearing
- A `supervisor-run` subject expects: `verifier` row within 5 min of `status='running'` → `status='passed'`

A cron Worker (`apps/factory-stuck-watcher`) runs every 10 min, scans the last 4 hours of subjects, fabricates `gate_type='stuck-detection', state='failed', evidence_summary={missing:[...]}` rows for anything that didn't fire. Those show up in Command Center as **first-class blockers**, not silent failures.

### 1.4.5 Budget is a first-class gate

When `@lwt/llm-meter` trips a per-run, per-day, or per-month cap, it writes a `gate_type='budget', state='failed'` row. That row appears in Command Center alongside CI and review blockers — operators see "this run is blocked because it exceeded $5" exactly the same way they see "CI failed."

Cost without gating visibility is just a number on a digest; cost as a gate is something a system can act on.

---

## 1.5 Auth + secrets architecture

The ingestion paths in §2 need three different auth models depending on the source:

### 1.5.1 The three auth modes

| Mode | Used by | Mechanism |
|---|---|---|
| **Scoped JWT** | trusted workflow runs (canary, reliability gate, video pipeline) | GitHub OIDC token exchange → short-lived JWT minted by `factory-core-api` with `aud` claim limiting scope to one ingestion topic |
| **Webhook HMAC signature** | GitHub webhooks (check_run, pull_request_review) | `X-Hub-Signature-256` verified against per-source secret stored in `GH_WEBHOOK_SECRET` |
| **App installation token** | `webhook-fanout` → `factory-core-api` server-to-server | factory-cross-repo App's installation token; rotated hourly by GitHub automatically |

### 1.5.2 Why scoped JWTs, not per-source standalone secrets

Per-source standalone secrets sound clean but multiply key-management overhead — every new source needs its own secret, its own rotation schedule, its own audit trail. Per-source scoped JWTs achieve the same blast-radius isolation with a single root identity to rotate.

**Pattern.** Workflows authenticate to GitHub OIDC, exchange the OIDC token at `factory-core-api/v1/auth/token`, receive a JWT with `aud: gates-ci` (or `aud: artifacts-video`, etc.). The JWT is valid for 10 minutes. The ingestion endpoint validates `aud` against the route — `/v1/gates` accepts only `aud: gates-*`, `/v1/artifacts` accepts only `aud: artifacts-*`.

**Blast radius.** A leaked JWT lets the attacker write to one ingestion topic for 10 minutes. The root signing key (in Worker secret) rotates quarterly.

### 1.5.3 Sync cadence model (`supervisor-mirror`)

Two-mode cadence:

- **Steady-state cron: every 5 minutes.** Sweeps `supervisor_runs` rows where `mirrored_at < started_at OR mirrored_at < finished_at`. Captures everything within 5 min.
- **Push-on-write from supervisor:** when a run transitions to a terminal state (`passed`, `failed_*`), the supervisor Worker POSTs directly to `factory-core-api/v1/runs/mirror` with the row. Sub-second latency for critical events.

Belt-and-suspenders: the cron catches anything the push missed (e.g., supervisor crashes between transition and POST), the push avoids the worst-case 5-min staleness on critical events.

**Not adopted: variable-cadence ("5 min for 60 min, then 60 min"-style adaptive backoff).** Considered. Rejected because the complexity isn't worth it — 5-min cron is cheap (one Neon upsert per run, often 0-2 runs per cycle) and push-on-write already handles the latency-critical case.

---

## 1.6 Supply chain hardening

Audit done 2026-05-25: **86 of 316 `uses:` lines in Factory workflows are SHA-pinned (27%)**. The other 230 reference tag refs (`@v4`, `@main`) which are mutable — a maintainer of any of those actions could ship malware via a tag move. Dependabot is correctly configured for github-actions ecosystem with SHA-bump support, but most workflows haven't been migrated to SHA-pinned syntax.

### 1.6.1 The pinning rule

**Every third-party `uses:` line must be SHA-pinned with a trailing version comment.**

```yaml
# ✅ correct
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

# ❌ tag-pinned (mutable, supply-chain risk)
- uses: actions/checkout@v6

# ❌ branch-pinned (worse — moves daily)
- uses: actions/checkout@main
```

The trailing `# vX.Y.Z` comment is load-bearing: Dependabot reads it to know which release the SHA corresponds to, and it's how human reviewers verify the version when reviewing bump PRs.

**Exemptions** (do not need SHA-pinning):
- **First-party reusable workflows** in `Latimer-Woods-Tech/factory` — these are version-controlled by us
- **GitHub-published official actions** when called from a Factory-internal trusted path — still strongly recommended but not blocking

### 1.6.2 Repo-level enforcement

Each repo's GitHub Actions permissions must set `sha_pinning_required: true` via API:

```bash
# Per repo (admin only)
gh api -X PUT repos/Latimer-Woods-Tech/HumanDesign/actions/permissions \
  --raw-field allowed_actions=selected \
  --raw-field sha_pinning_required=true
```

When this is set, GitHub rejects any workflow that uses a tag- or branch-pinned action.

**State today** (verified 2026-05-25): `sha_pinning_required: false` on all 9 private repos. Flipping it to `true` requires migrating the unpinned actions first (otherwise existing workflows break).

### 1.6.3 Dependabot config — already correct

The org's `.github/dependabot.yml` (in Factory) is properly configured:

```yaml
- package-ecosystem: github-actions
  directory: /
  schedule: { interval: weekly }
  groups:
    actions-minor-patch:
      patterns: ["*"]
      update-types: [minor, patch]
  labels: [dependencies, supervisor:approved-source]
  commit-message: { prefix: chore(actions) }
  open-pull-requests-limit: 5
```

This needs replication into every app's `.github/dependabot.yml`. HD already has it; capricast / xico-city / coh / wordis-bond / others need to inherit the pattern.

### 1.6.4 Migration approach

Sweeping ~230 unpinned uses lines is mechanical but tedious. Approach:

1. **A new script `scripts/pin-action-shas.mjs`** that walks all `.github/workflows/*.yml` files, finds `uses: <action>@<tag>` lines, looks up the tag's SHA via `gh api repos/<action_repo>/git/refs/tags/<tag>`, replaces in-place with `uses: <action>@<sha> # <tag>`.
2. **One PR per repo** running this script — auto-mechanical, no behavior change, reviewer just confirms SHAs match the tag comments.
3. **After all PRs merge**, flip `sha_pinning_required: true` on each repo via the API call in §1.6.2.
4. **Dependabot then takes over** — it bumps the SHAs weekly on patch/minor releases, opens grouped PRs.

### 1.6.5 What about npm packages?

Per `CLAUDE.md`: "**Pinned exact versions + Renovate automation. No `^` or `~` ranges on platform packages.**" This is the npm equivalent of SHA pinning. Already enforced for `@latimer-woods-tech/*` packages. Apps should default to exact versions for ALL npm deps via `.npmrc` `save-exact=true` or by explicit policy.

### 1.6.6 What about wrangler `actions/upload-pages-artifact`-style trusted publishers?

Cloudflare Pages deploys use OIDC token exchange where supported. For workflows that still use `CLOUDFLARE_API_TOKEN`, the token is scoped to specific accounts and rotated quarterly per `docs/runbooks/secret-rotation.md`.

### 1.6.7 Acceptance criteria

- [ ] `scripts/pin-action-shas.mjs` shipped
- [ ] All 230 unpinned `uses:` lines in Factory migrated to SHA + comment format
- [ ] Same migration applied to HD, capricast, xico-city, coh (5 repos total)
- [ ] `sha_pinning_required: true` set on Factory + the 4 production app repos
- [ ] Dependabot github-actions config present in HD, capricast, xico-city, coh
- [ ] Next Dependabot SHA-bump PR is grouped and reviewable (one PR for all patch+minor bumps)

---

## 1.7 Marketing surface standards

User-facing marketing pages (selfprime marketing HTML, capricast public watch pages, latwoodtech-web, future LWT corporate site) have their own hardening discipline. These are **not** admin surfaces — they're consumer-facing, performance-sensitive, and have a different threat model than `/admin/*` routes.

### 1.7.1 Security headers (Worker-emitted)

Every Worker serving HTML to end users must emit:

| Header | Value pattern | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' <explicit-allowlist>; ...` | XSS defense — no `unsafe-inline` for scripts (Vue/React handle this) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | HTTPS enforcement |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Privacy |
| `Permissions-Policy` | `interest-cohort=(), browsing-topics=(), camera=(), microphone=()` unless needed | Default-deny privacy features |

The HD#201 incident (SRI/CSP regen failure) was the canonical reminder that these matter. Captured in [`docs/decisions/`](../decisions/) as the cost of getting it wrong.

### 1.7.2 SRI (Subresource Integrity) for external scripts

Every `<script src="https://cdn.example.com/...">` in marketing HTML must include `integrity="sha384-..."` + `crossorigin="anonymous"`. This is enforced by a build step — the build computes the SHA-384 of each external script at build time and injects the `integrity` attribute.

**Pattern.** Use `@latimer-woods-tech/seo` (the SEO package) to provide an SRI-injection helper. Or for static HTML pages, a `scripts/inject-sri.mjs` build step in Cloudflare Pages.

### 1.7.3 Cache + performance headers

| Surface | Cache-Control |
|---|---|
| Static assets with content hash in filename (`/assets/app.<hash>.js`) | `public, max-age=31536000, immutable` |
| HTML pages | `public, max-age=300, s-maxage=3600` (5 min browser, 1 hour CDN) |
| API responses | `no-store` unless explicitly cacheable |

### 1.7.4 Performance budgets per page

Marketing pages must pass `lighthouse-ci`:

| Metric | Budget |
|---|---:|
| LCP (Largest Contentful Paint) | <2.5s |
| TTI (Time to Interactive) | <3.0s |
| CLS (Cumulative Layout Shift) | <0.1 |
| Total page weight | <500KB (gzipped) |
| Lighthouse Performance score | ≥90 |

Lighthouse CI runs are already wired via `.github/workflows/lighthouse-ci-admin-studio.yml` and similar. Extending to every marketing surface is part of Pass 2.

### 1.7.5 Vocab carveout per ICP

Per memory `project_selfprime_vocab_carveout.md`: marketing surfaces use canonical Human Design terms (gates, channels, profiles) while in-product uses brand vocab (Energy Blueprint). The dividing line is the post-login surface. This is captured in [`docs/PRODUCT_PRINCIPLES.md`](../PRODUCT_PRINCIPLES.md) §8.

### 1.7.6 What's NOT a marketing surface

- `/admin/*` (admin surfaces — see §1.8)
- `/api/*` (machine surfaces — different headers, JSON-only)
- App-internal authenticated pages (in-product surfaces)
- Webhooks (see `apps/webhook-fanout`)

---

## 1.8 Admin surface standards (every `/admin/*` route in every app)

The Admin UI defined in §2.5 is one consumer of admin surfaces. Every app exposes its own `/admin/*` routes — these are *not* covered by the read-layer Admin UI, they're the *targets* of it. Each app's admin routes must meet a common standard.

### 1.8.1 Required for every `/admin/*` route

| Property | Mechanism |
|---|---|
| **Auth** | JWT via Web Crypto (`@lwt/auth`); short-lived (1h); scope claim limits which routes |
| **Authorization** | CODEOWNER check OR explicit `requires_codeowner_oob: true` in `capabilities.yml` (FRIDGE rule 4) |
| **Audit logging** | `@lwt/compliance.auditLog()` middleware writes to `factory_audit_log` (§1.8.3) via `POST /v1/audit` (§1.8.6) with actor + target + action + result |
| **Rate limit** | `@lwt/rate-limit` middleware; default 30 req/min/user; lower for mutation routes |
| **Declared in `capabilities.yml`** | Route + method + `supervisor_access` tier; lint workflow rejects PRs adding undeclared routes |
| **Tier path** | All `/admin/*` paths are at least Yellow tier; mutation routes are Red |

### 1.8.2 The route shape (Hono middleware composition)

```ts
// apps/<app>/workers/src/handlers/admin.ts
import { Hono } from 'hono';
import { requireJWT } from '@latimer-woods-tech/auth';
import { auditLog } from '@latimer-woods-tech/compliance';
import { rateLimit } from '@latimer-woods-tech/rate-limit';

const admin = new Hono<{ Bindings: Env }>();

admin.use('*', requireJWT({ scopes: ['admin'] }));      // auth
admin.use('*', rateLimit({ limit: 30, window: '1m' })); // rate limit
admin.use('*', auditLog({ surface: 'admin' }));         // audit

admin.get('/users', async (c) => { ... });
admin.post('/users/:id/grant-credits', async (c) => {
  // FRIDGE rule 4: out-of-band CODEOWNER ✅ required regardless of tier
  // ...
});
```

### 1.8.3 audit_log table (new in `factory-core` Neon project)

```sql
CREATE TABLE factory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  app TEXT NOT NULL,             -- 'humandesign', 'capricast', etc.
  surface TEXT NOT NULL,         -- 'admin', 'api', 'internal'
  actor TEXT NOT NULL,           -- 'user:<id>', 'supervisor:<run_id>', 'oob:<codeowner>'
  action TEXT NOT NULL,          -- 'admin.users.grant-credits'
  target TEXT,                   -- 'user:42'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'error'))
);

CREATE INDEX ix_audit_app_ts ON factory_audit_log (app, ts DESC);
CREATE INDEX ix_audit_actor ON factory_audit_log (actor, ts DESC);
CREATE INDEX ix_audit_action_ts ON factory_audit_log (action, ts DESC);
```

Closes [GAP_REGISTER](../GAP_REGISTER.md) G-36 (no audit logging for payout/admin mutating operations).

#### 1.8.6 `/v1/audit` ingest endpoint

`@lwt/compliance.auditLog()` middleware writes audit rows by POSTing to `factory-core-api` (same two-step ingest pattern as gates and artifacts):

```
POST https://api.factory.latwood-tech.internal/v1/audit
Authorization: Bearer <scoped-JWT, aud: audit-{app}>
Content-Type: application/json

{
  "app": "humandesign",
  "surface": "admin",
  "actor": "user:42",
  "action": "admin.users.grant-credits",
  "target": "user:99",
  "ip_address": "203.0.113.42",
  "user_agent": "...",
  "metadata": { "credits": 100 },
  "result": "success"
}
```

**Auth.** Per §1.5.1, the bearer is a scoped JWT with `aud: audit-<app>` minted via OIDC token exchange. The endpoint validates `aud` matches `app` in the body.

**Two-step ingest** (per §2.0.2): the endpoint writes a `factory_events_ingest` row (`source_event_type='audit.<app>'`) BEFORE deriving the `factory_audit_log` row. Failed derivations leave the raw event for replay.

**Idempotency.** The middleware generates `metadata.request_id = crypto.randomUUID()` per request; the endpoint dedupes on `(app, actor, action, target, request_id)` within a 24h window.

**Failure mode.** If `factory-core-api` is unreachable, the middleware **logs locally to the app's existing structured logger** (`@lwt/logger`) AND returns normally — audit logging never blocks the request. A `factory-stuck-watcher` rule (§2.2.6) catches the missing audit row.

### 1.8.4 Stripe-handling admin routes — additional rule

Per FRIDGE rule 8 (irreversible actions require explicit human approval), any `/admin/*` route that mutates Stripe state must additionally:

- Use Stripe idempotency keys (closes G-32)
- Persist the idempotency key to `stripe_idempotency_keys` table before the Stripe call
- Return the cached response on replay

```sql
CREATE TABLE stripe_idempotency_keys (
  key TEXT PRIMARY KEY,            -- the idempotency key sent to Stripe
  endpoint TEXT NOT NULL,          -- '/v1/transfers', '/v1/charges', etc.
  request_hash TEXT NOT NULL,      -- SHA256 of canonicalized request body
  response_body JSONB,             -- cached response on success
  response_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX ix_idempotency_created ON stripe_idempotency_keys (created_at DESC);
```

### 1.8.5 Acceptance criteria (admin surface)

Per app:
- [ ] All `/admin/*` routes declared in that app's `capabilities.yml`
- [ ] `requireJWT`, `rateLimit`, `auditLog` middleware applied
- [ ] Mutation routes write `factory_audit_log` rows
- [ ] Stripe-mutating routes use idempotency keys via `stripe_idempotency_keys`
- [ ] Capability lint workflow blocks undeclared routes (per §3.1)

---

## 1.9 Targeting / portfolio surface (the executive layer)

The 15th platform surface and the only one that's not currently anywhere in code: **which app gets attention this week, and why.** Without this, the system becomes excellent at doing too many things.

### 1.9.1 What it answers

A single document that, when read, tells you:
- The current portfolio priority order
- The week's primary focus
- The trigger that would change priorities
- What's deliberately on hold and why

This is the executive lens. It's not a roadmap (too granular) and not a backlog (those live in GitHub Issues). It's the *prioritization* that selects from the backlog.

### 1.9.2 Where it lives

`docs/PORTFOLIO_FOCUS.md` — a short, weekly-updated doc with this shape:

```markdown
# Portfolio focus — week of YYYY-MM-DD

## Priority order (this week)
1. Selfprime (HumanDesign) — revenue anchor
2. Factory — platform stability
3. Capricast — beta operations
4. Cipher of Healing — design-stage, deferred
5. Xico City — design-stage, deferred

## Primary focus
<one paragraph: what's the single most important thing this week>

## Triggers that change this
- A paying customer signs → resume acquisition (per 2026-05-15 op checkpoint)
- A P0 incident on selfprime → drop everything
- Specific deadline: <date> / <event>

## Deliberately on hold
- wordis-bond: TCPA/FDCPA risk, FRIDGE rule 1
- focusbro: AdWords approval pending
- ...

## What I'm NOT working on this week
<one sentence explicitly: the temptations I'm refusing>
```

### 1.9.3 Cadence

- **Author/update Monday morning** as part of the weekly review
- **Read by every agent and operator on session start** — Claude Code prompts, supervisor templates, fresh contributors all reference this before deciding what to work on
- **Revisit immediately if a trigger fires** — don't wait for next Monday

### 1.9.4 Why it lives here, not in `docs/decisions/`

Decisions are immutable once accepted. Portfolio focus is **mutable every week**. They're different kinds of artifact. Keeping them separate prevents the "decisions doc bloated with stale priorities" failure mode.

### 1.9.5 Acceptance criteria

- [ ] `docs/PORTFOLIO_FOCUS.md` exists with the §1.9.2 shape
- [ ] Referenced from [`docs/STATE.md`](../STATE.md) (auto-generated) as a standing read
- [ ] Referenced from [`CLAUDE.md`](../../CLAUDE.md) as a session-start read
- [ ] Updated within 7 days of every Monday for at least 4 consecutive weeks (proves the cadence)

### 1.9.6 Build-back-inward connections

- The supervisor's planner can prefer issues whose `subject_app` matches the current priority-1 app — automatic focus
- Cost digests can attribute spend per-app and flag mismatches ("priority-3 app got 60% of LLM spend")
- Stuck-detection thresholds can be tighter on priority-1 surfaces — what matters most gets watched closest

---

## 2. Tier 0 — this week

### 2.0 `factory_events_ingest` — the immutable raw-event log

**Why this comes first.** Per §1.4.3, every other Tier 0 surface depends on this existing. The raw-event log is what makes derivation replay-able and ingestion debuggable.

#### 2.0.1 Schema

```sql
CREATE TABLE factory_events_ingest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHERE the event came from
  source_system TEXT NOT NULL,    -- 'github-webhook', 'video-pipeline', 'supervisor-d1',
                                  -- 'wrangler-canary', 'llm-meter', 'manual'
  source_event_type TEXT NOT NULL, -- 'check_run.completed', 'render-video.success', etc.
  source_event_id TEXT,           -- upstream event id where available (GH delivery id, etc.)

  -- THE RAW PAYLOAD
  payload JSONB NOT NULL,
  payload_size_bytes INTEGER GENERATED ALWAYS AS (octet_length(payload::text)) STORED,
  payload_sha256 TEXT GENERATED ALWAYS AS (encode(sha256(payload::text::bytea), 'hex')) STORED,

  -- AUTH context (which JWT/secret authenticated the ingest)
  ingest_actor TEXT NOT NULL,     -- 'github-app:factory-cross-repo', 'jwt-aud:gates-ci', etc.

  -- DERIVATION status (what fan-out has been applied)
  derivation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (derivation_status IN ('pending', 'derived', 'failed', 'replayed')),
  derivation_targets TEXT[],      -- ['factory_gates', 'factory_artifacts', 'factory_audit_log']
  derivation_error TEXT,          -- error if status=failed
  derivation_at TIMESTAMPTZ,

  -- TEMPORAL
  observed_at TIMESTAMPTZ NOT NULL,   -- when source produced it (from payload if available)
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_events_pending ON factory_events_ingest (ingested_at DESC)
  WHERE derivation_status = 'pending';
CREATE INDEX ix_events_source ON factory_events_ingest (source_system, source_event_type, ingested_at DESC);
CREATE INDEX ix_events_actor ON factory_events_ingest (ingest_actor, ingested_at DESC);

-- This table is immutable. UPDATEs only allowed on derivation_status/derivation_at/derivation_error.
-- Achieved via a trigger that rejects non-derivation column updates.
CREATE OR REPLACE FUNCTION enforce_events_immutability() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.source_system IS DISTINCT FROM OLD.source_system
     OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
     OR NEW.ingested_at IS DISTINCT FROM OLD.ingested_at THEN
    RAISE EXCEPTION 'factory_events_ingest is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_events_immutability_t
  BEFORE UPDATE ON factory_events_ingest
  FOR EACH ROW EXECUTE FUNCTION enforce_events_immutability();
```

#### 2.0.2 The two-step ingest pattern

Every ingestion endpoint on `factory-core-api` follows this shape:

```ts
// Pseudocode for POST /v1/gates
async function ingestGate(req: Request, env: Env) {
  const payload = await req.json();
  await validateJWT(req, { audience: /^gates-/ });

  // STEP 1: Persist raw event FIRST. Never derive before this commits.
  const eventId = await db.insert(factory_events_ingest, {
    source_system: payload.source_system,
    source_event_type: `gate.${payload.gate_type}`,
    source_event_id: payload.source_ref,
    payload: payload,
    ingest_actor: req.jwt.sub,
    derivation_status: 'pending',
    derivation_targets: ['factory_gates'],
    observed_at: payload.observed_at,
  });

  // STEP 2: Derive. Failures here leave the event for replay.
  try {
    await db.insert(factory_gates, deriveGateRow(payload));
    await db.update(factory_events_ingest, { id: eventId },
      { derivation_status: 'derived', derivation_at: 'now()' });
  } catch (err) {
    await db.update(factory_events_ingest, { id: eventId },
      { derivation_status: 'failed', derivation_error: err.message, derivation_at: 'now()' });
    throw err;  // 5xx to caller; raw event already saved
  }

  return Response.json({ ok: true, event_id: eventId });
}
```

#### 2.0.3 Replay mechanism

`apps/factory-events-replay` Worker (cron, every 15 min):

```ts
// Pseudocode
const pending = await db.select(factory_events_ingest)
  .where({ derivation_status: 'failed' })
  .where({ ingested_at: lessThan(now() - '1 hour') });  // settle time

for (const event of pending) {
  try {
    await deriveAllTargets(event);  // re-runs derivation; idempotent
    await db.update(factory_events_ingest, { id: event.id },
      { derivation_status: 'replayed', derivation_at: 'now()', derivation_error: null });
  } catch (err) {
    // Track replay attempt; eventually escalate
    await pushoverAlert(`replay failed for event ${event.id}: ${err.message}`);
  }
}
```

#### 2.0.4 Retention policy

`factory_events_ingest` grows monotonically. Retention rule:

- Retain `derivation_status IN ('pending', 'failed')` indefinitely (these are bugs, not history)
- Retain `derivation_status IN ('derived', 'replayed')` for 90 days, then archive to R2 (`factory-core-events-archive` bucket) and delete from Neon
- Archive policy enforced by `apps/factory-events-archiver` cron Worker (weekly, runs Saturday)

#### 2.0.5 Acceptance criteria

- [ ] Schema deployed with immutability trigger
- [ ] First POST to `/v1/gates` produces a row in `factory_events_ingest` with `derivation_status='derived'`
- [ ] Killing the derivation step mid-flight leaves a row with `derivation_status='failed'` — replay Worker picks it up and succeeds on retry
- [ ] An UPDATE to `factory_events_ingest.payload` raises an error (immutability test)
- [ ] Archive Worker correctly moves 90-day-old derived rows to R2

#### 2.0.6 Build-back-inward connections

- Every other §2 ingest path writes here first — the foundation for "rebuild from sources"
- Future audit queries ("when did we first see CI fail on PR #298?") read this table
- A debugging surface for any ingest issue: "show me the last 10 events from `source_system='github-webhook'`"

---

### 2.1 The Better Gate (replaces CodeQL)

**Status:** CodeQL workflows disabled on HD + capricast (2026-05-25). Better Gate ships into the resulting hole.

#### 2.1.1 Layer 1 — `_app-constraints-gate.yml` (deterministic, ~5 sec)

A reusable workflow in Factory that any app can call:

```yaml
# .github/workflows/_app-constraints-gate.yml in Factory
name: App Constraints Gate
on:
  workflow_call:
    inputs:
      ref:
        type: string
        required: false
        default: ${{ github.event.pull_request.head.sha }}

permissions: { contents: read, pull-requests: write }

jobs:
  constraints:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@<pinned>
        with: { ref: ${{ inputs.ref }}, fetch-depth: 0 }
      - name: Fetch canonical constraint patterns
        run: |
          curl -sSfL \
            https://raw.githubusercontent.com/Latimer-Woods-Tech/factory/main/.github/scripts/constraints-check.mjs \
            -o /tmp/constraints-check.mjs
      - name: Run constraint check on PR diff
        run: node /tmp/constraints-check.mjs
        env:
          GH_TOKEN: ${{ github.token }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          REPO: ${{ github.repository }}
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
```

#### 2.1.2 Canonical constraint patterns

Lives at `.github/scripts/constraints-check.mjs` in Factory. Each Hard Constraint from [`CLAUDE.md`](../../CLAUDE.md) maps to a deterministic detector:

| Constraint (CLAUDE.md) | Detector | Severity | Allowlist |
|---|---|---|---|
| No `process.env` | `\bprocess\.env\b` | error | `.github/scripts/**/*.mjs` (Node CI scripts exempt) |
| No `node:` built-ins | `from\s+['"]node:` | error | `.github/scripts/**/*.mjs` |
| No CommonJS `require()` | `\brequire\(['"]` | error | `.github/scripts/**/*.mjs` |
| No `Buffer` | `\bBuffer\.(from|alloc|isBuffer)\b\|\bnew\s+Buffer\b` | error | none |
| No raw `fetch` w/o handling | AST: `CallExpression[callee.name="fetch"]` not inside try/catch or `.catch()` | warn | `.github/scripts/**`, `tests/**` |
| No `*.workers.dev` in user-facing | `\.workers\.dev` in `.html`, `.tsx`, `.ts` under `client/`, `apps/web/`, `public/` | error | none (use service-registry url) |
| No secrets in source | reuse `credential-scrub.yml` patterns | error | (already enforced) |
| ESM only (no CJS in src/) | filename `*.cjs` in `src/`, `packages/*/src/` | error | none |

The script outputs a structured report (JSON) AND posts an inline review comment on the PR for each violation found, with file + line + suggestion.

#### 2.1.3 Layer 2 — Biome only (no ESLint on new apps)

**Decision.** New apps default to Biome (`@latimer-woods-tech/biome-config`) for both lint AND format. Existing apps keep ESLint until natural migration.

Update `scripts/scaffold.mjs` to:
- Drop the `eslint`, `eslint-config-*`, and `prettier` packages from new-app templates
- Install `@biomejs/biome` + `@latimer-woods-tech/biome-config`
- Add `npm run check` script → `biome check --apply-unsafe`
- Add to `_app-ci.yml` matrix: `biome ci`

#### 2.1.4 Layer 3 — Augment `pr-review.mjs` to be the security reviewer

Current state: [`.github/scripts/pr-review.mjs`](../../.github/scripts/pr-review.mjs) already runs on every PR via `factory-cross-repo`. Tier detection + Claude call already there.

**Changes required:**

```js
// New module: .github/scripts/constraints-loader.mjs
export async function loadHardConstraints(repo, ref) {
  // Fetch CLAUDE.md from the repo's ref
  // Parse the "## Hard Constraints" section
  // Return as structured rules array
}

// In pr-review.mjs:
import { loadHardConstraints } from './constraints-loader.mjs';

const hardConstraints = await loadHardConstraints(REPO, PR_SHA);

const systemPrompt = `
You are reviewing a PR for the Latimer-Woods-Tech ${REPO} repository.
Your job is to enforce these Hard Constraints (any violation = REQUEST_CHANGES):

${hardConstraints.map(c => `- ${c.rule} (${c.rationale})`).join('\n')}

You are also a security reviewer. Flag:
- Untrusted input flowing to: SQL, shell, eval-like patterns, JWT signing
- Missing error handling on external calls (fetch, db, stripe, anthropic)
- Race conditions in shared state (KV, D1, Durable Object)
- Credential-shaped strings in source

For each finding, post an inline review comment on the specific line with
a precise quote of the offending code and a one-line fix suggestion.
`;
```

#### 2.1.5 Acceptance criteria for the Better Gate

- [ ] `_app-constraints-gate.yml` callable from any app's caller workflow
- [ ] `constraints-check.mjs` covers all 8 constraints in §2.1.2 with allowlists
- [ ] HD + capricast caller workflows updated to invoke it
- [ ] First PR on HD after this lands runs Layer 1 in <10 sec
- [ ] `pr-review.mjs` posts inline comments referencing Hard Constraint rule names
- [ ] One end-to-end test PR demonstrates: a `process.env` introduction is blocked by Layer 1 in <10 sec; a missing-error-handling pattern is flagged by Layer 3 within 2 min

#### 2.1.6 Build-back-inward connections

- The constraints file becomes a single source of truth that the supervisor's planner can also consume (§3.4 templates can reference "must not introduce constraint X" as preconditions).
- The Claude reviewer's findings can write to `factory_gates` (§2.2) with `gate_type='claude-review'` for the Admin UI to surface "PRs blocked on Claude review."

---

### 2.2 `factory_gates` read model

**What it is.** A Neon table in the `factory-core` project (`THE_FACTORY` / `morning-dust-88304389`) that ingests gate states from across the platform. Read-only; nothing reads here for control-flow decisions — only for visualization and analytics.

#### 2.2.1 Schema (append-only)

**Per §1.4.2, this table is append-only.** Every state transition is a new row; the current state is derived from `factory_gates_latest`. No UNIQUE constraint on subject — that would prevent appending transitions.

```sql
CREATE TABLE factory_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- LINK back to the raw event that produced this row (§2.0)
  ingest_event_id UUID NOT NULL REFERENCES factory_events_ingest(id),

  -- WHAT KIND of gate
  gate_type TEXT NOT NULL CHECK (gate_type IN (
    'ci', 'canary', 'codeowner-review', 'budget',
    'verifier', 'claude-review', 'constraints', 'reliability',
    'capability-check', 'migration-drift', 'stuck-detection'
  )),

  -- WHERE the truth lives
  source_system TEXT NOT NULL CHECK (source_system IN (
    'github-actions', 'github-review', 'sentry',
    'wrangler-canary', 'supervisor-d1', 'llm-meter',
    'factory-cross-repo', 'factory-stuck-watcher'
  )),
  source_ref TEXT NOT NULL,  -- workflow_run URL, review ID, deploy ID, etc.

  -- WHAT it applies to
  subject_type TEXT NOT NULL CHECK (subject_type IN (
    'pr', 'issue', 'deploy', 'supervisor-run', 'video-render'
  )),
  subject_repo TEXT,         -- e.g. 'Latimer-Woods-Tech/HumanDesign'
  subject_ref TEXT NOT NULL, -- PR#, issue#, deploy SHA, supervisor_run_id

  -- WHAT state the gate is in (this transition)
  state TEXT NOT NULL CHECK (state IN (
    'pending', 'passed', 'failed', 'skipped', 'override', 'expired'
  )),
  evidence_url TEXT,
  evidence_summary JSONB NOT NULL DEFAULT '{}',

  -- TEMPORAL — sequence on the (subject, gate_type, source_ref) trio
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_gates_subject ON factory_gates (subject_repo, subject_type, subject_ref, observed_at DESC);
CREATE INDEX ix_gates_state ON factory_gates (state, observed_at DESC);
CREATE INDEX ix_gates_type ON factory_gates (gate_type, observed_at DESC);
CREATE INDEX ix_gates_event ON factory_gates (ingest_event_id);

-- Latest-state view: one row per (subject, gate_type, source_ref) with the most recent transition
CREATE VIEW factory_gates_latest AS
SELECT DISTINCT ON (subject_type, subject_ref, gate_type, source_ref)
  id, ingest_event_id, gate_type, source_system, source_ref,
  subject_type, subject_repo, subject_ref,
  state, evidence_url, evidence_summary,
  observed_at, ingested_at
FROM factory_gates
ORDER BY subject_type, subject_ref, gate_type, source_ref, observed_at DESC;

-- Blocking view: current pending/failed gates ranked for Command Center
CREATE VIEW factory_gates_blocking AS
SELECT *
FROM factory_gates_latest
WHERE state IN ('pending', 'failed')
ORDER BY
  CASE state WHEN 'failed' THEN 0 ELSE 1 END,
  observed_at DESC;
```

**Audit pattern.** "Show me the timeline of CI on PR #298":

```sql
SELECT observed_at, state, evidence_url
FROM factory_gates
WHERE subject_type = 'pr' AND subject_ref = '298'
  AND gate_type = 'ci'
ORDER BY observed_at;
-- → pending → failed → pending (re-run) → passed
```

That's the audit trail. Overwrite-first would have destroyed the failed row when the rerun happened.

#### 2.2.2 Ingestion paths

All 11 gate types and how they're written. All ingestion paths POST to `factory-core-api/v1/gates`; the differences are *who* posts and *when*.

| Gate type | Source | Ingestion mechanism |
|---|---|---|
| `ci` | GitHub Actions `check_run.completed` event | `webhook-fanout` Worker; HMAC-verified; auth via App installation token |
| `canary` | `_app-prod-canary.yml` completion | Workflow step at end uses OIDC→JWT (`aud: gates-canary`) and POSTs via `curl` |
| `codeowner-review` | GitHub `pull_request_review.submitted` event | `webhook-fanout` Worker; HMAC-verified |
| `budget` | `@lwt/llm-meter` cap breach | `@lwt/llm-meter` Worker writes directly with `aud: gates-budget` JWT |
| `verifier` | `supervisor_verifications` D1 table | `apps/supervisor-mirror` cron Worker (5 min) writes with `aud: gates-verifier` JWT |
| `claude-review` | `.github/scripts/pr-review.mjs` decision | Script uses workflow OIDC→JWT (`aud: gates-claude-review`); POSTs review URL as `evidence_url` |
| `constraints` | `_app-constraints-gate.yml` step | Workflow step uses OIDC→JWT (`aud: gates-constraints`); posts pass/fail per check |
| `reliability` | `_app-reliability-gate.yml` completion | Same pattern as `canary` (OIDC→JWT, `aud: gates-reliability`) |
| `capability-check` | Supervisor planner refusal | `apps/supervisor` Worker writes directly with `aud: gates-capability-check` JWT when planner rejects a route not in `capabilities.yml` |
| `migration-drift` | `_migration-drift-guard.yml` (Tier 1) | Workflow step uses OIDC→JWT (`aud: gates-migration-drift`); fires when repo migration count differs from prod |
| `stuck-detection` | `apps/factory-stuck-watcher` cron | Worker writes with `aud: gates-stuck-detection` JWT (§2.2.6) |

#### 2.2.3 Ingest API endpoint

A new Worker, `apps/factory-core-api`, exposes:

```
POST https://api.factory.latwood-tech.internal/v1/gates
Authorization: Bearer <scoped-JWT, aud: gates-{type}>
Content-Type: application/json

{
  "gate_type": "ci",
  "source_system": "github-actions",
  "source_ref": "https://github.com/Latimer-Woods-Tech/HumanDesign/actions/runs/12345",
  "subject_type": "pr",
  "subject_repo": "Latimer-Woods-Tech/HumanDesign",
  "subject_ref": "298",
  "state": "passed",
  "evidence_url": "...",
  "evidence_summary": { "duration_s": 240, "jobs": ["..."] },
  "observed_at": "2026-05-25T20:00:00Z"
}
```

**Auth.** Per §1.5, the bearer is a scoped JWT with `aud: gates-ci` (or `gates-canary`, etc.) obtained via OIDC token exchange from the workflow run. The endpoint validates `aud` against the requested `gate_type`.

**Idempotency.** Per §1.4.2 the table is append-only, so "idempotency" here means: a replayed request with the same `(source_system, source_ref, subject_ref, observed_at)` produces a no-op response because `factory_events_ingest` already has a row with the same `payload_sha256`. Implementation: `factory_events_ingest` checks for an existing row matching the SHA in the last 24h and short-circuits if found.

#### 2.2.4 Acceptance criteria

- [ ] Schema deployed to `THE_FACTORY` Neon project via Drizzle migration
- [ ] `apps/factory-core-api` Worker scaffolded with `/v1/gates` POST
- [ ] `webhook-fanout` Worker enhanced to translate GH `check_run` + `pull_request_review` events into gate writes
- [ ] One end-to-end test: a PR opened on HD produces `factory_gates` rows for `ci` (pass/fail), `claude-review` (state), and `codeowner-review` (when approved)
- [ ] Query "what is blocking PR #298 right now" returns a structured list of pending/failed gates

#### 2.2.5 Build-back-inward connections

- Admin UI's "Command Center" (§2.5) shows pending+failed gates as the primary blocker list
- Cost digest can include "budget gate trip rate" as a metric
- Template library (§3.4) acceptance gates can be checked against `factory_gates` rows post-execution
- A retrospective report ("which gates failed most this week") becomes a single Neon query

#### 2.2.6 Stuck detection (`apps/factory-stuck-watcher`)

Per §1.4.4 — detect missing gates, not just failing ones.

**Expected-gate-set declarations** live in a new file `docs/observability/expected-gates.yml`:

```yaml
# What gates must appear within what window for each subject type
pr:
  - gate_type: ci
    deadline_minutes: 30
  - gate_type: constraints
    deadline_minutes: 5
  - gate_type: claude-review
    deadline_minutes: 10
  - gate_type: codeowner-review
    deadline_minutes: 1440      # 24h — softer, since human

deploy:
  - gate_type: canary
    deadline_minutes: 45

supervisor-run:
  - gate_type: verifier
    deadline_minutes: 10
    only_if_status: passed       # only expected on passed runs
```

**Watcher cron** (every 10 min):

```ts
// Pseudocode in apps/factory-stuck-watcher
const subjects = await db.execute(sql`
  SELECT DISTINCT subject_type, subject_repo, subject_ref, MIN(observed_at) AS first_seen
  FROM factory_gates
  WHERE observed_at > now() - interval '4 hours'
  GROUP BY subject_type, subject_repo, subject_ref
`);

for (const subj of subjects) {
  const expected = expectedGatesFor(subj.subject_type);
  for (const exp of expected) {
    const alreadyHas = await db.query(sql`
      SELECT 1 FROM factory_gates_latest
      WHERE subject_type = ${subj.subject_type}
        AND subject_ref = ${subj.subject_ref}
        AND gate_type = ${exp.gate_type}
      LIMIT 1
    `);
    const ageMinutes = (now() - subj.first_seen) / 60_000;
    if (!alreadyHas && ageMinutes > exp.deadline_minutes) {
      // Fabricate a stuck-detection gate row through normal ingest path
      await postGate({
        gate_type: 'stuck-detection',
        source_system: 'factory-stuck-watcher',
        source_ref: `stuck/${subj.subject_type}/${subj.subject_ref}/${exp.gate_type}`,
        subject_type: subj.subject_type,
        subject_repo: subj.subject_repo,
        subject_ref: subj.subject_ref,
        state: 'failed',
        evidence_summary: {
          missing_gate: exp.gate_type,
          deadline_minutes: exp.deadline_minutes,
          age_minutes: Math.round(ageMinutes),
        },
        observed_at: new Date().toISOString(),
      });
    }
  }
}
```

#### 2.2.7 Acceptance criteria for stuck detection

- [ ] `expected-gates.yml` shipped with the four subject types
- [ ] `apps/factory-stuck-watcher` deployed; cron runs every 10 min
- [ ] A PR opened with constraints-gate workflow disabled produces a `stuck-detection` gate row within 15 min
- [ ] Command Center query (`factory_gates_blocking`) surfaces stuck rows alongside CI failures
- [ ] Replay-safe: re-running the watcher doesn't produce duplicate stuck rows (idempotency via `source_ref` containing the subject+gate combo)

---

### 2.3 `factory_artifacts` table

**Why this is the real gap.** Today, video pipeline outputs (R2 paths, Stream UIDs, transcripts), deploy URLs, build artifacts, Lighthouse reports, audit JSONs — all of these exist but are scattered across R2 keys, workflow run logs, GitHub artifact uploads, and per-app schedule tables. No single query answers "what did this run produce?"

#### 2.3.1 Schema

```sql
CREATE TABLE factory_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHAT KIND
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'video',           -- Stream UID or R2 MP4
    'audio',           -- ElevenLabs narration MP3
    'thumbnail',       -- R2 image
    'transcript',      -- text content or R2 ref
    'deploy-url',      -- e.g. https://capricast.com after deploy
    'build-artifact',  -- GH Actions artifact
    'preview',         -- CF Pages preview URL
    'lighthouse',      -- Lighthouse report JSON
    'audit-report',    -- e.g. HD audit-cron output
    'logs',            -- captured workflow logs (R2 URI)
    'report'           -- generic catch-all
  )),

  -- WHO PRODUCED IT
  producer_type TEXT NOT NULL CHECK (producer_type IN (
    'github-workflow', 'supervisor-run', 'video-pipeline',
    'cloudflare-deploy', 'manual'
  )),
  producer_ref TEXT NOT NULL,

  -- WHAT IT'S ABOUT
  subject_app TEXT,            -- 'humandesign', 'capricast', 'factory'
  subject_repo TEXT,
  subject_ref TEXT,            -- PR#, commit SHA, supervisor_run_id

  -- WHERE IT LIVES
  uri TEXT NOT NULL,           -- R2: r2://bucket/key, Stream: stream:UID, URL, etc.
  uri_scheme TEXT GENERATED ALWAYS AS (split_part(uri, ':', 1)) STORED,

  -- ABOUT THE BLOB
  checksum TEXT,
  size_bytes BIGINT,
  mime_type TEXT,
  duration_ms BIGINT,          -- for video/audio

  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,      -- nullable; for ephemeral artifacts

  CHECK (uri ~ '^[a-z0-9+-]+:')
);

CREATE INDEX ix_artifacts_subject ON factory_artifacts (subject_app, subject_ref);
CREATE INDEX ix_artifacts_type ON factory_artifacts (artifact_type, created_at DESC);
CREATE INDEX ix_artifacts_producer ON factory_artifacts (producer_type, producer_ref);
```

#### 2.3.2 Ingestion paths

| Producer | When | What writes |
|---|---|---|
| `render-video.yml` | end of pipeline (step 9 in CLAUDE.md video pipeline) | POSTs 4 artifact rows: video (Stream UID), audio (R2 URI), thumbnail (R2 URI), transcript |
| `_app-deploy.yml` | post-deploy verify | POSTs `deploy-url` + `build-artifact` (commit SHA reference) |
| `lighthouse-ci-*.yml` | end of run | POSTs `lighthouse` row with JSON metadata |
| HD `audit-cron.yml` | end of audit | POSTs `audit-report` with R2 URI of `audits/YYYY-MM-DD.json` |
| Supervisor runs (Cloudflare Pages preview) | step that opens PR | POSTs `preview` URL |

All writes go to the same `POST /v1/artifacts` endpoint on `factory-core-api`.

#### 2.3.3 Acceptance criteria

- [ ] Schema deployed to `THE_FACTORY` Neon project
- [ ] `render-video.yml` writes 4 artifact rows on every successful video render
- [ ] `_app-deploy.yml` writes deploy-url + build-artifact rows
- [ ] Query "show me all videos rendered for capricast in the last 7 days" returns the right Stream UIDs
- [ ] Query "what did supervisor run XYZ produce?" returns the connected artifact rows

#### 2.3.4 Build-back-inward connections

- Admin UI's "Run detail" view shows the artifacts a run produced (replacing the need to dig through workflow logs)
- Cost digest can size artifact storage by app (e.g., "capricast has X GB of video in R2")
- Retention policies become trivial: a cron Worker reads `factory_artifacts WHERE expires_at < now()` and deletes
- The supervisor's `step_result_json` is a deep object; promoting key artifact references out into `factory_artifacts` makes them queryable without parsing JSON every time

---

### 2.4 `factory_runs_mirror` (Neon mirror of supervisor D1)

**Truth stays in D1.** This is a periodic mirror for joining across the read layer.

#### 2.4.1 Schema (minimal mirror)

```sql
CREATE TABLE factory_runs_mirror (
  id UUID PRIMARY KEY,             -- == supervisor_runs.id (TEXT in D1, UUID-cast here)
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  pr_url TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_runs_mirror_template ON factory_runs_mirror (template_id, started_at DESC);
CREATE INDEX ix_runs_mirror_status ON factory_runs_mirror (status, started_at DESC);

-- Convenience view: join runs to their gates and artifacts
CREATE VIEW factory_runs_v AS
SELECT
  r.id, r.template_id, r.template_version, r.description, r.status, r.pr_url,
  r.started_at, r.finished_at,
  (SELECT COUNT(*) FROM factory_gates g WHERE g.subject_type = 'supervisor-run' AND g.subject_ref = r.id::text) AS gate_count,
  (SELECT COUNT(*) FROM factory_gates g WHERE g.subject_type = 'supervisor-run' AND g.subject_ref = r.id::text AND g.state = 'failed') AS gates_failed,
  (SELECT COUNT(*) FROM factory_artifacts a WHERE a.subject_ref = r.id::text) AS artifact_count
FROM factory_runs_mirror r;
```

#### 2.4.2 Sync mechanism

A new lightweight Worker, `apps/supervisor-mirror`, runs on cron (every 5 minutes):

```ts
// pseudocode
const newOrUpdated = await env.SUPERVISOR_D1.prepare(
  `SELECT * FROM supervisor_runs WHERE finished_at IS NULL OR finished_at > ?`
).bind(lastSyncTime).all();

for (const run of newOrUpdated.results) {
  await neon.execute(sql`
    INSERT INTO factory_runs_mirror (...) VALUES (...)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      finished_at = EXCLUDED.finished_at,
      pr_url = EXCLUDED.pr_url,
      mirrored_at = now()
  `);
}
```

Idempotent. 5-minute staleness ceiling is fine for Admin UI; for real-time, the supervisor can also POST directly to `/v1/runs/mirror` on important state changes.

#### 2.4.3 Acceptance criteria

- [ ] `factory_runs_mirror` schema deployed
- [ ] `apps/supervisor-mirror` Worker deployed with 5-min cron
- [ ] `factory_runs_v` view returns a populated row for at least 10 supervisor runs
- [ ] Admin UI can query "show me all failed supervisor runs in the last 24h with their failed gates"

#### 2.4.4 Build-back-inward connections

- Once the mirror is reliable, the supervisor can read `factory_runs_v` to find stale runs that need cleanup
- Template stats can join across mirror + gates: "which templates have the highest gate-failure rate?"
- Cost ledger (Tier 1 §3.2) can attribute LLM spend per `template_id` via mirror join

---

### 2.5 Admin UI wire-up (consumer side)

`factory-admin-studio` and `factory-admin-studio-ui` already exist (per [`docs/STATE.md`](../STATE.md), cohesion 55/100). The read-layer plumbs cleanly into them.

#### 2.5.1 The five canonical screens

| Screen | Primary query | Read-layer surfaces |
|---|---|---|
| **Command Center** | "what's blocking what right now" | `factory_gates WHERE state IN ('pending','failed') ORDER BY observed_at DESC` |
| **Runs** | "what has the supervisor done lately" | `factory_runs_v` with filters by template, status, time window |
| **Gates** | "gate history for $subject" | `factory_gates WHERE subject_ref = $1` |
| **Artifacts** | "what has been produced" | `factory_artifacts` grouped by `subject_app` + `artifact_type` |
| **Signals** *(Tier 1+ — deferred)* | "what triggered what" | `factory_signals` — schema not yet defined; ships when admin UI explicitly needs it per alignment doc Tier 3 deferral |

#### 2.5.2 API surface (read-only)

`factory-admin-studio` Worker exposes:

```
GET /v1/gates?subject_ref=298&state=failed
GET /v1/runs?template_id=hd-migration-fix&status=running
GET /v1/artifacts?subject_app=capricast&artifact_type=video&since=2026-05-18
GET /v1/blocking         → top 50 currently-blocking gates
GET /v1/runs/:id/detail  → run + its gates + its artifacts (joined)
```

All endpoints are GET-only against Neon. No writes (writes go through `factory-core-api`).

#### 2.5.3 Acceptance criteria

- [ ] All five screens render with real data from the read layer
- [ ] Command Center loads in <300ms p95
- [ ] Drilling into a failed gate from Command Center shows the `evidence_url` and the full gate row in <1 click
- [ ] Drilling into a run shows its produced artifacts inline with playable previews for `video`/`audio` types

---

## 3. Tier 1 — next two weeks

### 3.1 `capabilities.yml` per app

**Status today.** Per [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) G-2: not present in any app. Required for supervisor visibility.

#### 3.1.1 Schema (full)

```yaml
# Repo root: capabilities.yml
version: 1
app:
  id: humandesign            # service-registry.yml key
  name: HumanDesign / selfprime
  custom_domain: api.selfprime.net
  product_tier: revenue      # revenue | beta | utility | design-stage

routes:
  - path: /admin/users
    method: GET
    handler_class: read-internal
    side_effects: none
    supervisor_access: green       # green | yellow | red | denied

  - path: /admin/users/:id/grant-credits
    method: POST
    handler_class: mutate-internal
    side_effects: write-app
    supervisor_access: yellow
    requires_codeowner_oob: true   # FRIDGE rule 4

  - path: /api/stripe/webhook
    method: POST
    handler_class: webhook-external
    side_effects: write-external
    supervisor_access: denied      # never; user-facing payment surface

capabilities_exposed:
  - synthesize-energy-blueprint
  - generate-practitioner-pdf

capabilities_required:
  - "@latimer-woods-tech/llm@^0.3.0"
  - "@latimer-woods-tech/stripe@^0.2.0"

side_effects_summary:
  read_external: ["sentry-api", "posthog"]
  write_external: ["stripe", "anthropic", "resend"]
  write_app: ["neon:divine-grass-42421088"]
```

#### 3.1.2 Adoption pattern

- Author once per app in a single PR to that app's repo
- Validated by `_app-capability-lint.yml` (new reusable workflow in Factory) — schema check + cross-reference to `service-registry.yml`
- Supervisor's tool surface filters routes by `supervisor_access` tier on every plan
- `capabilities-loader.mjs` in Factory caches the latest validated `capabilities.yml` per app

#### 3.1.3 Acceptance criteria per app

- [ ] HD ships `capabilities.yml` declaring every `/admin/*` route
- [ ] capricast ships `capabilities.yml`
- [ ] xico-city ships `capabilities.yml`
- [ ] factory-admin-studio ships `capabilities.yml`
- [ ] `_app-capability-lint.yml` blocks PRs that introduce undeclared `/admin/*` routes
- [ ] Supervisor refuses to call a route not declared in the matching `capabilities.yml`

#### 3.1.4 Build-back-inward connections

- §3.4 templates declare which capabilities they require; planner rejects templates without matching `capabilities_exposed` in the target app
- §2.2 `factory_gates` can record `gate_type='capability-check'` rows when supervisor tries to call undeclared routes
- §3.2 llm-meter can attribute spend per capability when annotated in routes

---

### 3.2 `@lwt/llm-meter` package

**Status:** documented in dependency order at slot 8 ([`CLAUDE.md`](../../CLAUDE.md)), tracked as gap G-7. Closes the LLM cost-attribution gap.

#### 3.2.1 Package surface

```ts
// @latimer-woods-tech/llm-meter
export interface MeterContext {
  project: string;        // 'humandesign', 'supervisor', 'video-cron'
  actor: string;          // 'user:<id>', 'supervisor:<run_id>', 'cron:render-video'
  capability?: string;    // from capabilities.yml capabilities_exposed
  run_id?: string;        // links to supervisor_runs.id when applicable
}

export interface MeterBudget {
  per_run_usd?: number;        // FRIDGE rule 5: $5 default
  per_day_usd?: number;        // KV-backed (per G8 closed)
  per_month_usd?: number;
}

export class LLMMeter {
  constructor(env: { LLM_COST_KV: KVNamespace; LLM_LEDGER_D1: D1Database }) {}

  async preflight(ctx: MeterContext, budget: MeterBudget): Promise<void>;
    // throws RateLimitError if any cap exceeded

  async record(
    ctx: MeterContext,
    provider: 'anthropic' | 'groq' | 'gemini',
    model: string,
    tokens: { input: number; output: number; cached: number },
    cost_usd: number
  ): Promise<void>;
    // writes to D1 ledger + updates KV counters

  async summary(window: 'day' | 'month'): Promise<MeterSummary>;
}
```

#### 3.2.2 D1 ledger schema

```sql
CREATE TABLE llm_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,           -- epoch ms
  project TEXT NOT NULL,
  actor TEXT NOT NULL,
  capability TEXT,
  run_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  tokens_cached INTEGER NOT NULL DEFAULT 0,
  cost_usd_micros INTEGER NOT NULL  -- cost × 1_000_000 to avoid float
);

CREATE INDEX ix_ledger_project_ts ON llm_ledger (project, ts DESC);
CREATE INDEX ix_ledger_actor_ts ON llm_ledger (actor, ts DESC);
CREATE INDEX ix_ledger_run ON llm_ledger (run_id);
```

#### 3.2.3 Integration with `@lwt/llm`

`@lwt/llm@0.3.0` (Tier 2 §4.1) routes every call through `LLMMeter.preflight()` and `LLMMeter.record()`. App code doesn't touch the meter directly — the LLM client does.

#### 3.2.4 Acceptance criteria

- [ ] Package published to registry as `@latimer-woods-tech/llm-meter@0.1.0`
- [ ] HD migrated to use `@lwt/llm@0.3.0` which calls the meter
- [ ] D1 ledger has rows from at least 100 production LLM calls
- [ ] Daily digest pulls from `llm_ledger` instead of placeholder
- [ ] Per-run $5 hard stop fires correctly when a misbehaving template hits the cap

#### 3.2.5 Build-back-inward connections

- §2.2 `factory_gates` writes `gate_type='budget'` rows when meter trips a cap
- §2.4 `factory_runs_v` can join to ledger to show "cost per run" without re-aggregating
- Admin UI's "Cost" screen reads `llm_ledger` via Hyperdrive (D1 has its own SQL surface; admin reads via mirror to Neon if needed)

---

### 3.3 `_migration-drift-guard.yml` reusable workflow

**Status:** documented but not active per gap G-5. Catches the HD#65-class incident where prod schema lags repo migrations.

#### 3.3.1 Mechanism

```yaml
# .github/workflows/_migration-drift-guard.yml in Factory
on:
  workflow_call:
    inputs:
      neon_project_id: { type: string, required: true }
      migrations_dir:  { type: string, default: 'workers/src/db/migrations' }
    secrets:
      NEON_CONNECTION_STRING: { required: true }

jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      - name: Count repo migrations
        run: ls ${{ inputs.migrations_dir }}/*.sql | wc -l > repo_count
      - name: Query applied migrations in prod
        run: |
          psql "${{ secrets.NEON_CONNECTION_STRING }}" -t -c \
            "SELECT COUNT(*) FROM drizzle.__drizzle_migrations" > prod_count
      - name: Compare
        run: |
          REPO=$(cat repo_count)
          PROD=$(cat prod_count)
          if [ "$REPO" -ne "$PROD" ]; then
            echo "::error::Migration drift: repo has $REPO, prod has $PROD"
            exit 1
          fi
```

Apps add a 5-line caller that runs this on a daily cron OR before every deploy.

#### 3.3.2 Acceptance criteria

- [ ] Reusable workflow merged to Factory main
- [ ] HD calls it daily on cron
- [ ] capricast calls it daily on cron
- [ ] Drift detected within 24h of any divergence
- [ ] Failure writes a `factory_gates` row with `gate_type='migration-drift', state='failed'`

#### 3.3.3 Build-back-inward connections

- Drift gate failures show up in Command Center
- Template library (§3.4) gains a `fix-migration-drift` template that applies missing migrations via `npm run migrate`

---

### 3.4 Template library expansion

**Status:** empty per gap G-3. 6-8 starter templates needed before supervisor can ride live work.

#### 3.4.1 Template authoring policy (from [`docs/supervisor/TEMPLATE_SPEC.md`](../supervisor/TEMPLATE_SPEC.md))

Every template:
- Sourced from a closed real PR (no imagination)
- Has strict-typed slots with validators
- Declares preconditions (`capability_exists`, label patterns)
- Declares `acceptance_gate` with `verifier_query` where possible
- Has a fixture at `tests/supervisor/fixtures/<slug>.yml`
- Tested by `template-suite.yml` workflow

#### 3.4.2 The initial 6-8

Mining from closed PRs in HD + capricast + Factory:

| Template slug | Source PR pattern | Tier | Capability required |
|---|---|---|---|
| `docs-fix-typo` | typo fixes in `docs/**` | green | none |
| `bump-dep-patch` | Dependabot PRs at patch level | green | none |
| `add-runbook-entry` | new file under `docs/runbooks/` | green | none |
| `fix-migration-drift` | apply missing SQL migrations | yellow | `migrations` capability |
| `add-service-registry-entry` | new app added | yellow | `service-registry-update` |
| `add-capability-route` | new `/admin/*` route declared | yellow | `capability-update` |
| `update-pinned-version` | shared package version bump | red | `package-update` |
| `apply-credential-rotation` | secret rotation playbook | red | `secret-rotation` |

#### 3.4.3 Acceptance criteria

- [ ] 6-8 templates in `docs/supervisor/plans/`
- [ ] Each has a fixture and passes `template-suite.yml`
- [ ] One blessed (≥3 clean runs, 0 reverts) within 14 days of merge
- [ ] `template_stats` D1 table populating

#### 3.4.4 Build-back-inward connections

- Each template instance creates a `supervisor_runs` row → mirrors to `factory_runs_mirror` → shows in Admin UI
- Acceptance gates write `factory_gates` rows
- LLM spend per template attributable via `llm_ledger.template_id`

---

## 4. Tier 2 — next month

### 4.1 `@lwt/llm@0.3.0`

Per gap G-6. Mandatory AI Gateway routing. Removes Grok from the chain (no current workload). Adds Gemini long-context fallback. Integrates with `@lwt/llm-meter` from §3.2.

**Key changes:**
- Single entrypoint `complete()` routes through AI Gateway by default
- Gemini fallback triggers at >150k token context (with prompt caching savings)
- Per-call `MeterContext` required as a parameter
- Returns structured `{ text, usage, cost_usd, provider, model }` for ledger writes

### 4.2 Reliability gate rollout

`_app-reliability-gate.yml` exists per [`docs/architecture/FACTORY_V1.md`](FACTORY_V1.md) §3.3. Adoption rollout:

- [ ] HD calls reliability-gate as required check
- [ ] capricast calls reliability-gate
- [ ] xico-city calls reliability-gate
- [ ] factory-admin-studio calls reliability-gate

Each failure writes a `factory_gates` row with `gate_type='reliability'`.

### 4.3 Sentry sourcemap retroactive fix

Per gap G-8. Each worker's deploy step needs `actions/upload-sourcemaps` wired. Rolling fix during each app's next deploy. Confirmation: stack traces in Sentry show real file:line, not minified.

### 4.4 HumanDesign DSR E2E test

Per gap G-15. Cypress-style E2E that:
1. Creates a fake practitioner account
2. Logs in
3. Hits the DSR-request endpoint
4. Confirms the exported JSON contains all expected fields
5. Confirms the delete-request path purges all rows from `factory_events` + app tables

Required before signing any CA/VA/CO/CT/UT/NV/TX-resident practitioner.

---

## 5. Cross-cutting seams (the connective tissue)

This is what "build back inward" means in practice. Each row below is a connection across the tiers above; the seam **is** the value, more than any individual feature.

| From | To | Mechanism |
|---|---|---|
| §2.1 Better Gate findings | §2.2 factory_gates | `pr-review.mjs` POSTs `gate_type='claude-review'` rows |
| §2.2 factory_gates | §2.5 Admin UI Command Center | Read endpoint `GET /v1/blocking` |
| §2.3 factory_artifacts | §2.5 Admin UI Run Detail | Join via `subject_ref` on `factory_runs_v` |
| §2.4 factory_runs_mirror | §2.5 Admin UI Runs screen | Read endpoint `GET /v1/runs` |
| §3.1 capabilities.yml | §2.2 factory_gates | Capability-check failures write `gate_type='capability-check'` |
| §3.1 capabilities.yml | Supervisor planner | Tool surface filtered per app per tier |
| §3.2 llm-meter ledger | §2.2 factory_gates | Budget-cap breaches write `gate_type='budget'` |
| §3.2 llm-meter ledger | §2.4 factory_runs_v | Join via `run_id` → cost-per-run column |
| §3.3 migration-drift | §2.2 factory_gates | Drift detection writes `gate_type='migration-drift'` |
| §3.4 templates | §2.4 factory_runs_mirror | Each template invocation produces a mirrored run |
| §3.4 templates | §2.3 factory_artifacts | Templates that produce outputs catalog them |
| §4.1 llm@0.3.0 | §3.2 llm-meter | Every call routed through meter — no exceptions |
| §4.2 reliability-gate | §2.2 factory_gates | Each invocation writes `gate_type='reliability'` |
| Cost digest (existing) | §3.2 llm_ledger | Replaces placeholder GCP/Anthropic data with real ledger |

### 5.1 The single composite query that exercises the seams

When you can answer this one query, the read layer is fully wired:

```sql
SELECT
  r.id AS run_id,
  r.template_id,
  r.status,
  r.pr_url,
  r.gate_count,
  r.gates_failed,
  r.artifact_count,
  l.total_cost_usd
FROM factory_runs_v r
LEFT JOIN (
  SELECT run_id, SUM(cost_usd_micros)/1e6 AS total_cost_usd
  FROM llm_ledger
  WHERE ts > extract(epoch from now() - interval '24 hours') * 1000
  GROUP BY run_id
) l USING (run_id)
WHERE r.started_at > now() - interval '24 hours'
ORDER BY r.gates_failed DESC, r.started_at DESC
LIMIT 100;
```

This returns "the last 24 hours of supervisor runs with their gate status, artifact count, and LLM cost." If this query runs cleanly, every Tier 0 + Tier 1 piece is wired correctly.

---

## 6. Anti-patterns (captured so they don't reappear)

These came out of today's debugging — preserved here so a future operator (Adrian-tomorrow, a new agent) doesn't relearn them.

| Anti-pattern | Why we don't do this | Reference |
|---|---|---|
| Move HD CI to Factory via cross-repo dispatch | Branch protection requires same-repo status checks; engineering > savings | this session |
| Centralize task state in Neon | Conflicts with GitHub-canonical kanban (FRIDGE rule 7); dual-write risk | §1.1 |
| Disable Secret Scanning across all private repos | Loses push-time credential block; `credential-scrub.yml` is post-hoc | 2026-05-25 session |
| Activate Copilot Business at the org | Duplicates what `factory-cross-repo` Claude reviewer already does | 2026-05-25 session |
| Run CodeQL on a Cloudflare Workers + React stack | Noise > signal; constraints-gate + Claude review > generic SAST | §2.1 |
| Generative supervisor planning | Templates beat imagination; G-3 mandates real-PR sourcing | FRIDGE rule 9 |
| Forget to set the GH Actions spending limit | Without a ceiling, wordis-bond-class anomalies burn unbounded | this session |
| Write to `factory_gates` from Admin UI | Read layer is read-only; writes go through `factory-core-api` | §1.1 |
| Couple Admin UI directly to D1 | D1 is supervisor's truth; UI reads from Neon mirror | §2.4 |
| Skip `capabilities.yml` for "small" apps | Without it, the supervisor is blind to that app | §3.1 |

---

## 7. Document maintenance

This is a living spec. Updates land via PR to Factory `main` with the `documentation` + `architecture` labels. Material changes to acceptance criteria or schemas require a CODEOWNER review. New seams discovered while building should be added to §5 in the same PR that introduces them.

When a Tier 0/1/2 item ships, update its acceptance checklist with check marks AND add a line to the alignment decision doc ([`docs/decisions/2026-05-25-factory-alignment.md`](../decisions/2026-05-25-factory-alignment.md)) — that's how progress against the strategic frame gets visible.
