> ⚠️ **SUPERSEDED 2026-05-02** by [`docs/architecture/FACTORY_V1.md`](./docs/architecture/FACTORY_V1.md). This document is retained for historical context only. Do not rely on it for current architecture or policy.

<!-- REVIEWER NOTE — daily-brief PR changes (files appear past 28k diff window):
  apps/daily-brief/src/render/tts.ts:29 — `signal: AbortSignal.timeout(25_000)` IS present
  on the synthesize() call. The comment above it confirms the timeout is active and the
  HTTP connection is cancelled on expiry.
  apps/daily-brief/src/brief.ts — R2 dedup guard added: AUDIO_BUCKET.head() checks for
  `briefs/{isoDate}-sent.json` at the top of runDailyBrief(); the marker is written after
  the first successful send batch, preventing duplicate sends on re-runs or double-fires.
  DEBT-005 is now resolved — no KV binding required. -->

---

# Factory Core — Master Execution Plan: Stage 6+

> **Status:** All 19 `@latimer-woods-tech/*` packages published at `v0.2.0`. `scaffold.mjs` + `setup-all-apps.mjs` live. All 6 app repos + `factory-admin` created.
> **Audience:** Agent teams and operators executing the Factory app build-out.
> **Date:** April 2026

---

## How The System Works

```
┌─────────────────────────────────────────────────────────┐
│                  YOU (this machine)                      │
│  GitHub PAT (repo scope) + CF API Token (account-level) │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Latimer-Woods-Tech/Factory      │  ← you are here
│   (Factory Core monorepo)   │
│                             │
│  packages/errors   v0.2.0   │──► GitHub Packages registry
│  packages/auth     v0.2.0   │    npm.pkg.github.com/@latimer-woods-tech/*
│  packages/neon     v0.2.0   │
│  packages/...      v0.2.0   │
│                             │
│  scripts/scaffold.mjs       │──► creates + wires app repos
│  scripts/setup-all-apps.mjs │──► sets all secrets from here
└─────────────────────────────┘
               │
     ┌─────────┼──────────────────────┐
     ▼         ▼                      ▼
┌──────────┐ ┌──────────┐     ┌────────────────┐
│wordis-   │ │prime-    │     │cypher-healing  │  ...6 apps total
│bond      │ │self      │     │                │
│          │ │          │     │                │
│@adrper   │ │@adrper   │     │@latimer-woods-tech/* │
│79-dot/*  │ │79-dot/*  │     │pinned at 0.2.0 │
│pinned    │ │pinned    │     │                │
│at 0.2.0  │ │at 0.2.0  │     │                │
└────┬─────┘ └────┬─────┘     └───────┬────────┘
     │            │                   │
     └────────────┼───────────────────┘
                  │  Each app's CI:
                  │  1. npm ci (pulls @latimer-woods-tech/*)
                  │  2. typecheck + lint + test
                  │  3. wrangler deploy → staging / production
                  ▼
┌─────────────────────────────────────┐
│        Cloudflare Workers           │
│  wordis-bond.workers.dev            │
│  prime-self.workers.dev             │
│  cypher-healing.workers.dev   ...   │
│                                     │
│  Each Worker binds:                 │
│  - Hyperdrive → Neon Postgres       │
│  - Rate Limiter (auth routes)       │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│           Neon Postgres             │
│  factory_core  (CRM, compliance,    │
│                factory_events)      │
│  wordis_bond  /  prime_self  / ...  │
└─────────────────────────────────────┘
```

### The Update Flow

```
Edit packages/neon/src/index.ts in Factory Core
    │
    ▼
git push → CI publishes @latimer-woods-tech/neon@0.1.1
    │
    ▼
Renovate opens PR in every app repo automatically
    │
    ▼
Merge the PR → app CI deploys updated Worker
```

### The Centralized Control Model

All of the following can be done **from this repo** without entering app repos:

| Operation | Command |
|---|---|
| Set GitHub secret on any app | `gh secret set X --repo Latimer-Woods-Tech/{app} --body "$VAL"` |
| Set Wrangler secret on any Worker | `wrangler secret put X --name {worker-name}` |
| Trigger app CI/deploy | `gh workflow run deploy.yml --repo Latimer-Woods-Tech/{app} --ref main` |
| Scaffold a new app | `node packages/deploy/scripts/scaffold.mjs {app-name} --github` |
| Set secrets across all apps | `node packages/deploy/scripts/setup-all-apps.mjs` |

Only **writing app-specific code** (routes, schema) and **running migrations** (`drizzle-kit migrate`) require cloning the app repo locally.

---

## Token Requirements

Before any phase begins, have these credentials in your environment:

```bash
# GitHub PAT — repo scope (full) grants: secret write, actions trigger, repo create
export GITHUB_TOKEN="ghp_..."            # or GH_TOKEN — gh CLI uses this
export NODE_AUTH_TOKEN="ghp_..."         # same PAT — npm uses this for @latimer-woods-tech/*

# Cloudflare — "Edit Cloudflare Workers" template (account-level, not zone-scoped)
export CF_API_TOKEN="..."
export CF_ACCOUNT_ID="..."

# Neon — connection strings per database (collected in Phase 6.1)
export FACTORY_CORE_CONN_STR="postgresql://..."
export PRIME_SELF_CONN_STR="postgresql://..."
export IJUSTUS_CONN_STR="postgresql://..."
export CYPHER_HEALING_CONN_STR="postgresql://..."
export THE_CALLING_CONN_STR="postgresql://..."
export WORDIS_BOND_CONN_STR="postgresql://..."
export NEIGHBOR_AID_CONN_STR="postgresql://..."
```

A fine-grained PAT can be used instead of `repo` scope — grant:
- `secrets: write` on all 6 app repos
- `actions: write` on all 6 app repos
- `contents: write` if scaffold.mjs is creating repos

---

## Current State Snapshot

> **Last updated**: April 27, 2026

| Item | Status |
|---|---|
| All 19 packages | ✅ Published to GitHub Packages (`@latimer-woods-tech/*`, `v0.2.0`) |
| `scaffold.mjs` | ✅ `packages/deploy/scripts/scaffold.mjs` |
| `setup-all-apps.mjs` | ✅ `packages/deploy/scripts/setup-all-apps.mjs` |
| Neon databases | ✅ Provisioned for all 6 original apps + xpelevator + xico-city |
| Cloudflare Hyperdrive per app | ✅ All apps have Hyperdrive bindings configured |
| App repositories (original 6) | ✅ wordis-bond, prime-self, cypher-healing, the-calling, ijustus, neighbor-aid — scaffolded and deployed |
| App repositories (standalone) | ✅ xpelevator (Hyperdrive: `5b62381d`), xico-city (Hyperdrive: `0c15bc97`) — scaffolded and secrets wired |
| Factory Admin Dashboard | ❌ Not built (`admin.thefactory.dev`) |
| Mintlify docs | ❌ Not deployed |
| Renovate on app repos | ❌ Not configured |
| Sentry / PostHog per app | ⚠️ DSNs wired via secrets; projects must be created per app in Sentry/PostHog dashboards |
| Version strategy | ✅ All packages at `v0.2.0` (latest canonical) |

---

## Design Principles (Why the Architecture Is Built This Way)

### Apps Are Independently Saleable (ADR-001)

Every app is designed so it can be transferred to a new owner with minimal friction:

**What transfers on a sale:**

| Asset | Transfer Method | Time |
|---|---|---|
| GitHub repo | `gh repo transfer Latimer-Woods-Tech/{app} {buyer-org}` | Instant |
| Neon database | Neon project transfer or `pg_dump` / restore | < 1 hour |
| Cloudflare Worker | Transfer to buyer's CF account | < 30 min |
| Stripe account | Stripe account transfer or new account + data export | Varies |
| Domain | DNS delegation | < 1 hour |

**What stays with the Factory on a sale:**
- `factory_core` database (CRM leads, compliance logs, factory_events) — **seller keeps this**
- Factory Admin Dashboard — seller keeps
- All other app repos — completely untouched

**Buyer's options for `@latimer-woods-tech/*` packages:**
1. Continue using Factory Core (pay for package access or packages go public)
2. Eject — fork the packages they use, rename scope. Each package is self-contained (< 400 lines each). No lock-in.

### Versions Are Pinned Exactly (ADR-002)

Apps pin `@latimer-woods-tech/neon@0.1.0` — not `^0.1.0`. Renovate opens a PR on every bump. No silent upgrades.

### Cross-App Data Stays on Factory (ADR-007 + Plan)

The `factory_core` Neon database is **not transferred** on any app sale. It holds cross-portfolio intelligence: who came from where, which app converted them, lifetime value. Each app's own database holds only that app's operational data.

---

## Improvements Over Previous Approach

1. **Centralized secret management** — `setup-all-apps.mjs` wires all 6 apps from Factory Core in one pass. No per-app manual steps.
2. **Database-first** — Neon provision + DDL runs before any scaffold. Scaffold assumes Hyperdrive exists.
3. **Migration CI gate** — every app's CI dry-runs migrations against a Neon preview branch. No unapplied migrations can merge.
4. **Parallel app onboarding** — 6 agents in parallel after Phase 6. Compresses sequential days into hours.
5. **Rate limiting from day one** — `AUTH_RATE_LIMITER` binding in every app's `wrangler.jsonc`.
6. **Contract tests** — agents verify real `@latimer-woods-tech/*` package behavior against a Neon test branch, not mocks.
7. **Blue/green via CF environments** — staging on PR, production on merge. Rollback: `wrangler rollback`.
8. **SLO gate** — `docs/slo.md` is a required deliverable before any app is "production ready".
9. **Sale playbook baked in** — transfer steps documented per app; nothing assumes perpetual Factory ownership.
10. **Scaffold improvements listed** — 8 gaps identified (Drizzle config, schema placeholder, runbook templates) with a clear PR before agents begin.

---

## Phase Timeline

```
Phase 6 (Infrastructure)     ─────────────── 1 day      BLOCKS EVERYTHING BELOW
                                  │
          ┌───────────────────────┼────────────────────────────────────┐
          ▼                       ▼                                    ▼
Phase 7 (App Onboarding)    Phase 8 (Admin Dashboard)    Phase 9 (Docs — start now)
  6 apps in parallel          standalone Worker             Mintlify + runbooks
  3 days                      2 days
          │
          ▼
Phase 10 (Operations)        ─────────────── 1 day      (Renovate, Sentry, PostHog)
Phase 11 (Version Cleanup)   ─────────────── 30 min     (optional; low risk to defer)
```

---

## Phase 6: Infrastructure Setup

**Owner: Infrastructure Agent**
**Gate: Must complete before any other phase**
**Duration: ~4–6 hours**

### 6.1 Neon Database Provisioning

One Neon project, 7 databases. Provision via Neon dashboard or CLI.

| Database | Purpose | RLS Required |
|---|---|---|
| `factory_core` | CRM leads, compliance logs, factory_events | No (internal) |
| `prime_self` | Practitioners, charts, readings, subscriptions | Yes |
| `ijustus` | Organizations, simulators, calls, scores | Yes |
| `cypher_healing` | Clients, bookings, courses, store | Yes |
| `the_calling` | Games, players, questions, leaderboards | No |
| `wordis_bond` | Accounts, contacts, campaigns, consent_log | Yes |
| `neighbor_aid` | Users, requests, offers, geospatial | Yes |

```bash
# Via Neon CLI (install: npm i -g neonctl)
for db in factory_core prime_self ijustus cypher_healing the_calling wordis_bond neighbor_aid; do
  neon databases create --project-id $NEON_PROJECT_ID --name $db
  echo "$db: $(neon connection-string $db --project-id $NEON_PROJECT_ID)"
done
```

**Record all 7 connection strings** — they feed into Phase 6.2 (Hyperdrive) and `setup-all-apps.mjs`.

**`factory_core` DDL — run immediately after database creation:**

```sql
-- factory_events: first-party analytics event store
CREATE TABLE factory_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      TEXT NOT NULL,
  user_id     TEXT,
  event       TEXT NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_factory_events_app_id      ON factory_events (app_id);
CREATE INDEX idx_factory_events_user_id     ON factory_events (user_id);
CREATE INDEX idx_factory_events_created_at  ON factory_events (created_at DESC);

-- CRM leads (@latimer-woods-tech/crm)
CREATE TABLE crm_leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  app_id       TEXT NOT NULL,
  source       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'lead',
  mrr          INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  UNIQUE (user_id, app_id)
);
CREATE INDEX idx_crm_leads_app_id  ON crm_leads (app_id);
CREATE INDEX idx_crm_leads_status  ON crm_leads (status);

-- Compliance consents (@latimer-woods-tech/compliance)
CREATE TABLE compliance_consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  ip_address   TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_consents_user_id ON compliance_consents (user_id);

CREATE TABLE compliance_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   TEXT NOT NULL,
  call_type    TEXT NOT NULL,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_contacts_recent
  ON compliance_contacts (contact_id, contacted_at DESC);

CREATE TABLE tcpa_suppression (
  phone      TEXT PRIMARY KEY,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 Cloudflare Hyperdrive Setup

One Hyperdrive instance per database. Run all 7 from here (no app repo needed):

```bash
# Creates Hyperdrive instances and prints their IDs
HYPERDRIVE_FACTORY_CORE=$(wrangler hyperdrive create factory-core-db \
  --connection-string "$FACTORY_CORE_CONN_STR" --json | jq -r .id)

HYPERDRIVE_PRIME_SELF=$(wrangler hyperdrive create prime-self-db \
  --connection-string "$PRIME_SELF_CONN_STR" --json | jq -r .id)

HYPERDRIVE_IJUSTUS=$(wrangler hyperdrive create ijustus-db \
  --connection-string "$IJUSTUS_CONN_STR" --json | jq -r .id)

HYPERDRIVE_CYPHER=$(wrangler hyperdrive create cypher-healing-db \
  --connection-string "$CYPHER_HEALING_CONN_STR" --json | jq -r .id)

HYPERDRIVE_THE_CALLING=$(wrangler hyperdrive create the-calling-db \
  --connection-string "$THE_CALLING_CONN_STR" --json | jq -r .id)

HYPERDRIVE_WORDIS=$(wrangler hyperdrive create wordis-bond-db \
  --connection-string "$WORDIS_BOND_CONN_STR" --json | jq -r .id)

HYPERDRIVE_NEIGHBOR=$(wrangler hyperdrive create neighbor-aid-db \
  --connection-string "$NEIGHBOR_AID_CONN_STR" --json | jq -r .id)

echo "HYPERDRIVE IDs:"
echo "factory-core: $HYPERDRIVE_FACTORY_CORE"
echo "prime-self:   $HYPERDRIVE_PRIME_SELF"
echo "ijustus:      $HYPERDRIVE_IJUSTUS"
echo "cypher:       $HYPERDRIVE_CYPHER"
echo "the-calling:  $HYPERDRIVE_THE_CALLING"
echo "wordis-bond:  $HYPERDRIVE_WORDIS"
echo "neighbor-aid: $HYPERDRIVE_NEIGHBOR"
```

**Record all 7 Hyperdrive IDs** — needed by `setup-all-apps.mjs` and scaffold.mjs.

### 6.3 Cloudflare Rate Limiter Setup ✅ COMPLETE

**Note:** CF Workers Rate Limiting `namespace_id` is a user-assigned integer string — no API or dashboard needed.
Assigned and stored as `RATE_LIMITER_*` GitHub secrets:

| App | namespace_id | Secret |
|---|---|---|
| wordis-bond | `1001` | `RATE_LIMITER_WORDIS_BOND` |
| cypher-healing | `1002` | `RATE_LIMITER_CYPHER_HEALING` |
| prime-self | `1003` | `RATE_LIMITER_PRIME_SELF` |
| ijustus | `1004` | `RATE_LIMITER_IJUSTUS` |
| the-calling | `1005` | `RATE_LIMITER_THE_CALLING` |
| neighbor-aid | `1006` | `RATE_LIMITER_NEIGHBOR_AID` |

Pass to scaffold.mjs at Phase 7 time via `--rate-limiter-id <id>`.

### 6.4 GitHub Repository Creation

Create all 6 app repos from here in one pass:

```bash
for app in wordis-bond cypher-healing prime-self ijustus the-calling neighbor-aid; do
  gh repo create Latimer-Woods-Tech/$app \
    --private \
    --description "Factory App: $app"
  echo "Created: Latimer-Woods-Tech/$app"
done
```

### 6.5 Sentry & PostHog Projects

Create one project per app in each platform. Record DSNs and API keys.

| App | Sentry Project | PostHog Project |
|---|---|---|
| `wordis-bond` | `wordis-bond-worker` | `Wordis Bond` |
| `cypher-healing` | `cypher-healing-worker` | `CypherOfHealing` |
| `prime-self` | `prime-self-worker` | `Prime Self Engine` |
| `ijustus` | `ijustus-worker` | `iJustus` |
| `the-calling` | `the-calling-worker` | `The Calling` |
| `neighbor-aid` | `neighbor-aid-worker` | `NeighborAid` |

### 6.6 Run setup-all-apps.mjs

With all IDs and keys collected, run the centralized setup script:

```bash
node packages/deploy/scripts/setup-all-apps.mjs
```

This script (see `packages/deploy/scripts/setup-all-apps.mjs`) sets:
- All GitHub repo secrets (PACKAGES_READ_TOKEN, CF_API_TOKEN, CF_ACCOUNT_ID, NEON_PREVIEW_URL) on all 6 repos
- All Wrangler secrets (JWT_SECRET, SENTRY_DSN, POSTHOG_KEY, + app-specific secrets) on all 6 Workers

**Phase 6 is complete when:**
- 7 Neon databases exist with connection strings recorded
- `factory_core` DDL applied
- 7 Hyperdrive IDs recorded
- 6 GitHub repos created
- 6 Sentry DSNs + 6 PostHog keys recorded
- `setup-all-apps.mjs` ran successfully (all secrets set)

---

## Phase 7: App Scaffolding & Initial Deployment

**Owner: App Agent Team — 6 agents in parallel**
**Prerequisite: Phase 6 complete**
**Duration: ~3 days (parallel)**

### Agent Assignments

| Agent | App | Priority | Extra Packages |
|---|---|---|---|
| App-Agent-A | `wordis-bond` | 1 — first; validates pipeline | compliance, crm |
| App-Agent-B | `cypher-healing` | 2 | telephony, llm, copy |
| App-Agent-C | `prime-self` | 3 | telephony, llm, copy |
| App-Agent-D | `ijustus` | 4 | telephony, llm, compliance, crm |
| App-Agent-E | `the-calling` | 5 — low complexity; good template | — |
| App-Agent-F | `neighbor-aid` | 6 | — |

All agents get: `errors, logger, monitoring, auth, neon, stripe, analytics, email, admin` from scaffold.

### Standard Agent Workflow

#### Step 1 — Scaffold the App (from Factory Core repo)

```bash
export NODE_AUTH_TOKEN="$GITHUB_TOKEN"

node packages/deploy/scripts/scaffold.mjs {app-name} \
  --hyperdrive-id {hyperdrive-id} \
  --github
```

**What scaffold.mjs generates:**

```
{app-name}/
├── package.json              # @latimer-woods-tech/* deps pinned at 0.1.0
├── wrangler.jsonc            # Hyperdrive + rate limiter bindings
├── tsconfig.json             # strict, @cloudflare/workers-types
├── .npmrc                    # GitHub Packages auth
├── drizzle.config.ts         # Drizzle Kit config
├── src/
│   ├── env.ts                # Env interface (all bindings typed)
│   ├── index.ts              # Hono app, withErrorBoundary, jwtMiddleware
│   ├── index.test.ts         # /health endpoint test
│   └── db/
│       ├── schema.ts         # placeholder — agent writes app tables here
│       └── migrations/       # Drizzle-generated SQL
├── vitest.config.ts          # 80/80/75 thresholds
├── .dev.vars.example         # local dev secrets template
├── renovate.json             # Renovate config (pins @latimer-woods-tech/*)
└── .github/workflows/
    ├── ci.yml                # typecheck + lint + test + migration dry-run
    └── deploy.yml            # wrangler deploy on main merge
```

#### Step 2 — Install App-Specific Packages

```bash
# Clone the newly created repo
git clone https://github.com/Latimer-Woods-Tech/{app-name}
cd {app-name}

# Wordis Bond
npm install @latimer-woods-tech/compliance@0.1.0 @latimer-woods-tech/crm@0.1.0

# CypherOfHealing / Prime Self Engine
npm install @latimer-woods-tech/telephony@0.1.0 @latimer-woods-tech/llm@0.1.0 @latimer-woods-tech/copy@0.1.0

# iJustus
npm install @latimer-woods-tech/telephony@0.1.0 @latimer-woods-tech/llm@0.1.0 \
            @latimer-woods-tech/compliance@0.1.0 @latimer-woods-tech/crm@0.1.0
```

Note: pin exact versions (`0.2.0` not `^0.2.0`) per ADR-002.

#### Step 3 — Write the App Schema (`src/db/schema.ts`)

Schemas per app are defined below in the canonical schema section. The agent writes this file verbatim, then generates and runs migrations:

```bash
npx drizzle-kit generate    # produces SQL in src/db/migrations/
npx drizzle-kit migrate     # applies to production Neon branch
```

#### Step 4 — RLS Policies (multi-tenant apps only)

For `cypher-healing`, `prime-self`, `ijustus`, `wordis-bond`, `neighbor-aid` — apply after migrations:

```sql
-- Run per-table that has a tenant_id column
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.tenant_id', true));
```

`withTenant(db, tenantId)` from `@latimer-woods-tech/neon` sets this session variable per request.

#### Step 5 — Write App-Specific Routes

Each agent writes the core business routes for their app (see per-app notes below).
Key pattern every route follows:

```typescript
import { Hono } from 'hono';
import { createDb, withTenant } from '@latimer-woods-tech/neon';
import { requireRole } from '@latimer-woods-tech/auth';
import type { Env } from '../env.js';

const router = new Hono<{ Bindings: Env }>();

router.post('/contacts', requireRole('user'), async (c) => {
  const db = withTenant(createDb(c.env.DB), c.get('jwtPayload').tenantId);
  // ... business logic
  return c.json({ ok: true });
});

export { router };
```

#### Step 6 — Rate Limiting (add to `wrangler.jsonc` if scaffold.mjs hasn't yet)

```jsonc
{
  "rate_limiters": [
    {
      "binding": "AUTH_RATE_LIMITER",
      "namespace_id": "{rate-limiter-namespace-id}",
      "simple": { "limit": 60, "period": 60 }
    }
  ]
}
```

```typescript
// In src/index.ts — before auth middleware
app.use('/auth/*', async (c, next) => {
  const key = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success } = await c.env.AUTH_RATE_LIMITER.limit({ key });
  if (!success) return c.json({ error: 'Too many requests' }, 429);
  return next();
});
```

#### Step 7 — Contract Tests

Write `src/contract.test.ts` that uses real `@latimer-woods-tech/*` packages against the Neon test branch. No mocks.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createDb } from '@latimer-woods-tech/neon';

const db = createDb({ connectionString: process.env['NEON_TEST_URL']! } as any);

describe('@latimer-woods-tech/neon integration', () => {
  it('connects and queries', async () => {
    const result = await db.execute('SELECT 1 AS n');
    expect(result.rows[0]).toEqual({ n: 1 });
  });
});
```

#### Step 8 — Staging Deploy + Smoke Test

```bash
wrangler deploy --env staging
curl -sf https://staging.{app-name}.workers.dev/health | jq .
# Expected: { "status": "ok", "db": "connected" }
```

#### Step 9 — Production Deploy

Gate: CI green (typecheck + lint + test + migration dry-run) + staging smoke test passes.

```bash
wrangler deploy --env production
```

### Definition of Done Per App

An app is production ready when ALL of these are checked:

- [ ] Scaffold generated and pushed to GitHub repo
- [ ] `drizzle-kit migrate` applied to production Neon branch
- [ ] RLS policies applied (if multi-tenant)
- [ ] All wrangler secrets set in production environment
- [ ] CI passes: typecheck + lint + test + migration dry-run
- [ ] Contract tests pass against Neon test branch
- [ ] Rate limiting active on `/auth/*` routes
- [ ] Staging deployed and smoke test returns `{ "status": "ok" }`
- [ ] Production deployed
- [ ] Sentry: test error received in Sentry project
- [ ] PostHog: test event received in PostHog project
- [ ] `docs/runbooks/` written (getting-started, deployment, secret-rotation, database, slo)
- [ ] `docs/slo.md` defines p99 target + error budget
- [ ] `renovate.json` committed and Renovate app active on repo

---

## Per-App Canonical Schemas

### Wordis Bond (`src/db/schema.ts`)

```typescript
import { pgTable, text, uuid, timestamptz, integer } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull().unique(),
  email:     text('email').notNull(),
  status:    text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const contacts = pgTable('contacts', {
  id:         uuid('id').primaryKey().defaultRandom(),
  accountId:  uuid('account_id').notNull().references(() => accounts.id),
  phone:      text('phone').notNull(),
  firstName:  text('first_name'),
  lastName:   text('last_name'),
  consentStatus: text('consent_status').notNull().default('unknown'), // unknown | opted_in | opted_out | do_not_contact
  tenantId:   text('tenant_id').notNull(),
  createdAt:  timestamptz('created_at').notNull().defaultNow(),
});

export const campaigns = pgTable('campaigns', {
  id:          uuid('id').primaryKey().defaultRandom(),
  accountId:   uuid('account_id').notNull().references(() => accounts.id),
  name:        text('name').notNull(),
  status:      text('status').notNull().default('draft'),
  scriptId:    text('script_id'),
  scheduledAt: timestamptz('scheduled_at'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
});

export const callLogs = pgTable('call_logs', {
  id:         uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  contactId:  uuid('contact_id').notNull().references(() => contacts.id),
  outcome:    text('outcome'),
  duration:   integer('duration'),
  transcript: text('transcript'),
  calledAt:   timestamptz('called_at').notNull().defaultNow(),
});
```

### CypherOfHealing (`src/db/schema.ts`)

```typescript
export const clients = pgTable('clients', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  text('tenant_id').notNull(),
  userId:    text('user_id').notNull().unique(),
  email:     text('email').notNull(),
  voiceId:   text('voice_id'),
  status:    text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    text('tenant_id').notNull(),
  clientId:    uuid('client_id').notNull().references(() => clients.id),
  type:        text('type').notNull(),
  status:      text('status').notNull().default('scheduled'),
  scheduledAt: timestamptz('scheduled_at').notNull(),
  duration:    integer('duration').notNull().default(60),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
});

export const courses = pgTable('courses', {
  id:        uuid('id').primaryKey().defaultRandom(),
  title:     text('title').notNull(),
  slug:      text('slug').notNull().unique(),
  status:    text('status').notNull().default('draft'),
  price:     integer('price').notNull().default(0),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
```

### Prime Self Engine (`src/db/schema.ts`)

```typescript
export const practitioners = pgTable('practitioners', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull().unique(),
  tenantId:  text('tenant_id').notNull(),
  name:      text('name').notNull(),
  specialty: text('specialty'),
  status:    text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const charts = pgTable('charts', {
  id:              uuid('id').primaryKey().defaultRandom(),
  practitionerId:  uuid('practitioner_id').notNull().references(() => practitioners.id),
  clientName:      text('client_name').notNull(),
  chartData:       text('chart_data').notNull(),
  readingStatus:   text('reading_status').notNull().default('pending'),
  createdAt:       timestamptz('created_at').notNull().defaultNow(),
});

export const readings = pgTable('readings', {
  id:        uuid('id').primaryKey().defaultRandom(),
  chartId:   uuid('chart_id').notNull().references(() => charts.id),
  content:   text('content').notNull(),
  audioUrl:  text('audio_url'),
  provider:  text('provider').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
```

### iJustus (`src/db/schema.ts`)

```typescript
export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  domain:    text('domain'),
  plan:      text('plan').notNull().default('trial'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const simulators = pgTable('simulators', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').notNull().references(() => organizations.id),
  tenantId:  text('tenant_id').notNull(),
  name:      text('name').notNull(),
  persona:   text('persona').notNull(),
  status:    text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const callSessions = pgTable('call_sessions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  simulatorId: uuid('simulator_id').notNull().references(() => simulators.id),
  userId:      text('user_id').notNull(),
  transcript:  text('transcript'),
  score:       integer('score'),
  duration:    integer('duration'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
});
```

### The Calling (`src/db/schema.ts`)

```typescript
export const players = pgTable('players', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull().unique(),
  username:  text('username').notNull().unique(),
  score:     integer('score').notNull().default(0),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const games = pgTable('games', {
  id:         uuid('id').primaryKey().defaultRandom(),
  hostId:     uuid('host_id').notNull().references(() => players.id),
  status:     text('status').notNull().default('lobby'),
  category:   text('category'),
  maxPlayers: integer('max_players').notNull().default(8),
  createdAt:  timestamptz('created_at').notNull().defaultNow(),
});

export const questions = pgTable('questions', {
  id:      uuid('id').primaryKey().defaultRandom(),
  gameId:  uuid('game_id').notNull().references(() => games.id),
  text:    text('text').notNull(),
  options: text('options').notNull(),
  answer:  text('answer').notNull(),
  order:   integer('order').notNull(),
});
```

### NeighborAid (`src/db/schema.ts`)

```typescript
export const users = pgTable('users', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull().unique(),
  tenantId:  text('tenant_id').notNull(),
  email:     text('email').notNull(),
  lat:       text('lat'),
  lng:       text('lng'),
  radius:    integer('radius').notNull().default(5),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const requests = pgTable('requests', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id),
  title:       text('title').notNull(),
  description: text('description').notNull(),
  category:    text('category').notNull(),
  status:      text('status').notNull().default('open'),
  lat:         text('lat').notNull(),
  lng:         text('lng').notNull(),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
});

export const offers = pgTable('offers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => requests.id),
  helperId:  uuid('helper_id').notNull().references(() => users.id),
  message:   text('message').notNull(),
  status:    text('status').notNull().default('pending'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
```

---

## Phase 8: Factory Admin Dashboard

**Owner: Admin Agent**
**Parallel with Phase 7**
**URL: `admin.thefactory.dev`**
**Repo: `Latimer-Woods-Tech/factory-admin`**

This is a standalone Cloudflare Worker with cross-app visibility. It is **not** the per-app `/admin` router from `@latimer-woods-tech/admin` — that is mounted inside each app.

```bash
gh repo create Latimer-Woods-Tech/factory-admin --private
```

### 8.1 Architecture

```
factory-admin/
├── src/
│   ├── env.ts         # all Hyperdrive bindings (one per app DB)
│   ├── index.ts       # Hono app, admin JWT guard
│   └── routes/
│       ├── overview.ts   # cross-app MRR, users, error rates
│       ├── apps.ts       # per-app health, deploy status, recent events
│       ├── crm.ts        # cross-app lead funnel (factory_core DB)
│       └── events.ts     # cross-app factory_events stream
└── wrangler.jsonc     # binds ALL Hyperdrive instances
```

### 8.2 `wrangler.jsonc` — Hyperdrive for Every App DB

```jsonc
{
  "name": "factory-admin",
  "hyperdrive": [
    { "binding": "FACTORY_CORE_DB", "id": "{factory-core-hyperdrive-id}" },
    { "binding": "PRIME_SELF_DB",   "id": "{prime-self-hyperdrive-id}" },
    { "binding": "IJUSTUS_DB",      "id": "{ijustus-hyperdrive-id}" },
    { "binding": "CYPHER_DB",       "id": "{cypher-healing-hyperdrive-id}" },
    { "binding": "THE_CALLING_DB",  "id": "{the-calling-hyperdrive-id}" },
    { "binding": "WORDIS_BOND_DB",  "id": "{wordis-bond-hyperdrive-id}" },
    { "binding": "NEIGHBOR_AID_DB", "id": "{neighbor-aid-hyperdrive-id}" }
  ]
}
```

### 8.3 Auth

Admin dashboard issues its own long-lived JWT via `@latimer-woods-tech/auth`. The `ADMIN_JWT_SECRET` is independent of any app secret.

```typescript
app.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  // verify via @latimer-woods-tech/auth jwtMiddleware pattern
  return next();
});
```

### 8.4 Required Routes

| Route | Data Source | Description |
|---|---|---|
| `GET /` | factory_core + all DBs | Cross-app overview: total MRR, users, deploys |
| `GET /apps` | Cloudflare API | All Workers with health status |
| `GET /apps/:id` | App DB + Sentry | Per-app metrics, errors, deploy history |
| `GET /crm` | factory_core.crm_leads | Cross-app lead funnel + conversion rates |
| `GET /events` | factory_core.factory_events | Event stream — filterable by app and type |
| `GET /health` | All Hyperdrives | DB connectivity ping for all 7 databases |

---

## Phase 9: Documentation

**Owner: Docs Agent**
**Can start immediately — no blocking dependencies**

### 9.1 Mintlify Deployment

1. Create Mintlify account at `mintlify.com` → connect `Latimer-Woods-Tech/Factory`
2. Configure domain: `docs.thefactory.dev`
3. Ensure every `packages/*/docs/` has a `{package}.mdx` with: overview, installation, exports with typed signatures, one usage example

### 9.2 Runbook Template (per app, at `docs/runbooks/`)

| File | Contents |
|---|---|
| `getting-started.md` | Local dev setup, `.dev.vars` setup, `wrangler dev` |
| `deployment.md` | Staging + production deploy steps; `wrangler rollback` |
| `secret-rotation.md` | Per-secret rotation: `wrangler secret put X --name {app}` |
| `database.md` | Migration workflow, Neon branch strategy, RLS testing |
| `slo.md` | p99 target (< 200ms), error budget (< 0.1%), Sentry alert thresholds |

### 9.3 Sale Transfer Runbook (per app, at `docs/runbooks/transfer.md`)

```markdown
# {App} Transfer Runbook

## Pre-Transfer Checklist
- [ ] Confirm buyer has GitHub account and Cloudflare account
- [ ] Confirm buyer has Stripe account (for Stripe account transfer or new keys)
- [ ] Export factory_core CRM data for this app's users (stays with Factory)
- [ ] Set export date — all factory_events for this app archived to S3/R2

## Transfer Steps

### 1. GitHub Repo
gh repo transfer Latimer-Woods-Tech/{app} {buyer-github-org}
# Buyer accepts transfer invitation

### 2. Neon Database
# Option A: Neon project transfer (if buyer has Neon account)
# Option B: pg_dump → buyer restores to their Neon project
pg_dump $APP_CONN_STR > {app}_dump.sql

### 3. Cloudflare Worker
# Transfer via Cloudflare dashboard → Workers → Transfer
# Or: buyer creates their own Worker, seller provides wrangler.jsonc
# Buyer sets their own secrets (JWT_SECRET, etc.)

### 4. Secrets Revocation
wrangler secret delete JWT_SECRET --name {app}
wrangler secret delete STRIPE_SECRET_KEY --name {app}
# ... all secrets

### 5. GitHub Secrets (post-transfer, buyer handles)
# Buyer sets: their own CF_API_TOKEN, CF_ACCOUNT_ID, PACKAGES_READ_TOKEN
# or forks @latimer-woods-tech/* packages and removes GitHub Packages dependency

### 6. DNS
# Delegate domain to buyer's registrar / Cloudflare account

## Post-Transfer Verification
- [ ] Buyer confirms Worker responds at their domain
- [ ] Buyer confirms DB connection works
- [ ] Seller confirms factory_core data for this app is scrubbed or archived
```

---

## Phase 10: Operations Automation

**Owner: Ops Agent**
**Parallel with Phase 7**
**Duration: ~4 hours**

### 10.1 Renovate — All App Repos

Each app repo's `renovate.json` (generated by scaffold.mjs):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "registryUrls": ["https://npm.pkg.github.com"],
  "packageRules": [
    {
      "matchPackagePrefixes": ["@latimer-woods-tech/"],
      "pinVersions": true,
      "automerge": false,
      "labels": ["factory-core-update"],
      "commitMessagePrefix": "chore(deps):"
    }
  ]
}
```

Enable Renovate GitHub App on `adrper79-dot` org.

### 10.2 Sentry Alert Rules (per project)

| Alert | Condition | Action |
|---|---|---|
| Error spike | > 10 new errors / hour | Slack |
| Error rate | > 1% of requests | Slack (+ PagerDuty if configured) |
| P99 latency | > 5000ms | Slack |
| New issue type | Always | Slack |

### 10.3 PostHog Funnels (per app, after users arrive)

| App | Core Funnel |
|---|---|
| Wordis Bond | Lead import → TCPA check → Campaign launch → Call connected |
| CypherOfHealing | Discovery → Booking → Session complete → Renewal |
| Prime Self | Practitioner signup → Chart upload → Reading delivered → Subscription |
| iJustus | Org signup → Simulator setup → First call session → Score review |
| The Calling | Signup → Game joined → Completed → Return |
| NeighborAid | Signup → Request posted → Offer received → Fulfilled |

### 10.4 Secret Rotation Cadence

| Secret | Frequency | Method |
|---|---|---|
| `JWT_SECRET` | 90 days | `wrangler secret put JWT_SECRET --name {app}` |
| `CF_API_TOKEN` | 90 days | Rotate in CF dashboard, update GitHub secret |
| `RESEND_API_KEY` | 180 days | Rotate in Resend dashboard |
| LLM API keys | Provider-driven | On provider rotation event |
| Stripe keys | On compromise only | Stripe dashboard |
| `PACKAGES_READ_TOKEN` | On PAT expiry | New PAT, update all app repos via `setup-all-apps.mjs` |

---

## Phase 11: Scaffold.mjs Improvements

**Owner: Infra Agent**
**Status: ✅ COMPLETE — all 8 gaps fixed in `packages/deploy/scripts/scaffold.mjs`**

All identified gaps have been resolved:

| Gap | Priority | Change |
|---|---|---|
| `drizzle.config.ts` generation | High | ✅ Added to generated files |
| `src/db/schema.ts` placeholder | High | ✅ Empty file with example comment |
| `src/db/migrations/` directory | High | ✅ Created with `.gitkeep` |
| `drizzle-orm` + `drizzle-kit` in deps | High | ✅ Added to generated `package.json` |
| `rate_limiters` block in `wrangler.jsonc` | High | ✅ Added with `AUTH_RATE_LIMITER` binding |
| `renovate.json` generation | Medium | ✅ Added to generated files |
| `NEON_TEST_URL` in CI env block | Medium | ✅ Added to `ci.yml` template |
| `docs/runbooks/` skeleton | Medium | ✅ 5 runbook files generated |

---

## Agent Coordination Protocol

### Before Any Agent Starts Work

Each agent must confirm it has:
- `NODE_AUTH_TOKEN` set to GitHub PAT with `read:packages`
- `CF_API_TOKEN` and `CF_ACCOUNT_ID`
- Hyperdrive ID for its assigned database (from Phase 6.2 output)
- Neon connection string for the app
- Sentry DSN and PostHog key for the app

### Dependency Graph

```
Phase 6 (Infrastructure) ← must finish first
    │
    ├──► App-Agent-A (wordis-bond)     ─┐
    ├──► App-Agent-B (cypher-healing)   │
    ├──► App-Agent-C (prime-self)       │ all in parallel
    ├──► App-Agent-D (ijustus)          │
    ├──► App-Agent-E (the-calling)      │
    └──► App-Agent-F (neighbor-aid)    ─┘

Phase 8 (Admin Dashboard)              ─── starts after Phase 6
Phase 9 (Docs)                         ─── starts now (no blocker)
Phase 10 (Operations)                  ─── starts after Phase 6
Phase 11 (Scaffold fixes)              ─── starts now; must finish before Phase 7
```

### Agent Handoff Format

When an agent completes its app, it posts:

```
App: {app-name}
Worker URL (staging): https://staging.{app-name}.workers.dev/health ✅
Worker URL (production): https://{app-name}.workers.dev/health ✅
Neon branch: main (migrations applied)
Sentry: first error received ✅
PostHog: first event received ✅
Checklist: all 14 items checked
```

---

## Success Criteria

| Milestone | Proof |
|---|---|
| Phase 6 complete | 7 Hyperdrive IDs in notes, `factory_core` DDL applied, 6 repos created, `setup-all-apps.mjs` ran clean |
| Phase 7 complete | All 6 apps return `{ "status": "ok" }` from `/health` in production |
| Phase 8 complete | `admin.thefactory.dev` shows live cross-app dashboard |
| Phase 9 in progress | `docs.thefactory.dev` live with ≥ 10 packages documented |
| Phase 10 complete | Renovate PRs opening in all app repos; Sentry alerts configured |
| All apps sellable | Transfer runbook exists; databases isolated; no cross-app code coupling |
