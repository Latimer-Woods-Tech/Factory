# Factory Admin Studio — Master Plan

**Date:** 2026-04-28 (plan) · **Status refreshed:** 2026-06-22  
**Status:** **Live in production** at `https://api.apunlimited.com` (`/health` 200-verified). Tiers 1–4 + much of 5–8 are delivered; see the admin-studio [README Roadmap](../../apps/admin-studio/README.md#roadmap) and [03-API-SURFACE.md](./03-API-SURFACE.md) for the per-phase reality.  
**Codename:** `factory-admin-studio`  
**API:** `https://api.apunlimited.com` (prod) · `https://api.admin.latimerwoods.dev` (staging)

> **Scope deltas since this plan was written (read before trusting the tiers below):**
> - ➕ **Capability Studio** — a governed provisioning + visual-graph subsystem that appears in no tier here. It shipped and is council-approved ([golden design](../CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md)). Treat it as a first-class tier.
> - ➕ **Governance** (feature flags, blocking gates, command center) and **daily digest** shipped beyond the Tier-7 sketch.
> - ➖ **Creator-economy / Stripe Connect** (Tier-7 "Subscription Manager" adjacent) was built then **removed (#1790)**: it duplicated Capricast & SelfPrime on the single shared Stripe platform `acct_1SlCcFAW1229TZte`. Connect now lives in the shared `@latimer-woods-tech/stripe` package (#1791).

---

## North Star

A **unified browser-based control plane** for the Factory ecosystem that lets a solo founder or small team:

1. **See** every app's health, logs, metrics, and deployments in one place
2. **Edit** code, content, schemas, and configs without VS Code or local git
3. **Test** any test suite (or subset) with one click and watch live results
4. **Deploy** with explicit environment selection and rigid safeguards
5. **Chat** with AI to generate code, explain errors, and propose changes
6. **Operate** the entire Factory without ever opening a terminal

**Constraint:** Zero degradation of the existing CI/CD pipeline. Studio is an **interface layer**, not a replacement.

---

## The Pain Points Driving This (Why Now)

| Pain | Today | Studio Solution |
|------|-------|-----------------|
| **Wrong environment errors** (deploying staging code to prod, editing prod DB by accident) | Implicit context — easy to forget which terminal/branch you're in | **Environment Context Lock** — every action requires explicit env selection with visual confirmation |
| Cannot edit without VS Code | Local clone + git workflow required | Monaco editor in browser + GitHub API commits |
| Cannot run tests selectively | Must run `npm test` locally or wait for full CI | Test Runner UI — pick suites, files, or single tests |
| AI assistance trapped in IDE | GitHub Copilot only works in VS Code | Native AI chat using `@latimer-woods-tech/llm` |
| Non-technical team blocked | All changes require developer | Visual CMS + role-based gates |
| Deployment opacity | "Did it deploy? Is it healthy?" | Live deployment dashboard with health checks |
| Log archaeology | Tabs across Sentry, PostHog, Cloudflare | Unified log viewer with cross-service correlation |
| Database changes are scary | Drizzle + Neon branch + apply = error-prone | Schema designer with diff preview + dry-run |

---

## Core Principle: Environment Safety First

**The #1 design constraint.** Every single feature must answer: *"Which environment is this affecting?"*

### The Three Environments

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   LOCAL             │    │   STAGING           │    │   PRODUCTION        │
│   (developer)       │    │   (preview)         │    │   (live customers)  │
│                     │    │                     │    │                     │
│   Color: GRAY       │    │   Color: AMBER      │    │   Color: RED        │
│   DB: ephemeral     │    │   DB: staging       │    │   DB: production    │
│   Auth: dev-only    │    │   Auth: test users  │    │   Auth: real users  │
│   Risk: none        │    │   Risk: low         │    │   Risk: HIGH        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### The Five Safeguards

#### Safeguard 1: Persistent Environment Banner
- **Always visible** at top of every page
- Color-coded: gray (local) → amber (staging) → red (production)
- Shows: app name, environment, current user, last action timestamp
- Cannot be dismissed or hidden

#### Safeguard 2: Action Scope Confirmation
Every mutating action (deploy, schema change, content publish, user suspend) requires:
1. **Pre-flight check** showing target environment in red box
2. **Type-to-confirm** for production (`type "prod" to confirm`)
3. **Two-key approval** for destructive actions (drop table, delete user)
4. **Audit log entry** with who/what/when/where/why

#### Safeguard 3: Environment Lock-In Per Session
- User picks environment **once** at login
- Switching environments requires re-authentication
- Studio refuses cross-environment operations (cannot edit prod schema while looking at staging data)

#### Safeguard 4: Dry-Run by Default
- All schema migrations show **diff preview** before apply
- All deployments show **changed files + risk assessment** before trigger
- All bulk operations require **preview** step

#### Safeguard 5: Reversibility Indicators
Every action labeled with **reversibility tier**:
- 🟢 **Trivial** — undo button (e.g., toggle UI setting)
- 🟡 **Reversible** — git revert + redeploy (e.g., code edit)
- 🟠 **Manual rollback** — wrangler rollback (e.g., production deploy)
- 🔴 **Irreversible** — backup required (e.g., drop table, delete user)

---

## Feature Catalog (Full Wishlist + Hidden Needs)

### Tier 1 — MVP (Weeks 1-4)
Core safety + observability. Foundation for everything else.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **Environment Context Lock** | Pick local/staging/prod at login, persistent banner | 🟢 | Planned |
| **App Dashboard** | Cross-app health, MRR, error rate, deploy status | 🟢 | Planned |
| **Audit Log** | Every Studio action recorded to `factory_events` | 🟢 | Planned |
| **Auth + RBAC** | JWT login, roles: viewer/editor/admin/owner | 🟢 | Planned |
| **Live Health Monitor** | Real-time `/health` checks for all 6 apps + studio | 🟢 | Planned |
| **Sentry Integration** | Recent errors per app with stack traces | 🟢 | Planned |
| **PostHog Integration** | Funnel charts, event timelines | 🟢 | Planned |

### Tier 2 — Test Runner (Weeks 5-6)
Run tests on demand, watch live, get AI-assisted failure analysis.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **Test Suite Browser** | Tree of all test files across all apps | 🟢 | Planned |
| **Selective Test Run** | Pick app → suite → file → single test | 🟢 | Planned |
| **Live Test Output** | SSE-streamed Vitest output with color | 🟢 | Planned |
| **Failure Diff View** | Expected vs actual with syntax highlighting | 🟢 | Planned |
| **AI Failure Analyst** | "Explain this failure" → LLM root-cause | 🟢 | Planned |
| **Coverage Reports** | Drill into uncovered lines per file | 🟢 | Planned |
| **Flaky Test Detector** | Mark tests that fail intermittently | 🟢 | Planned |
| **Test History Graph** | Pass/fail timeline per test over weeks | 🟢 | Planned |

### Tier 3 — Code Editor + AI (Weeks 7-9)
Edit and ship code from browser with AI assistance.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **File Tree Browser** | All repo files via GitHub API | 🟢 | Planned |
| **Monaco Code Editor** | VS Code's editor in browser | 🟢 | Planned |
| **TypeScript IntelliSense** | LSP via WebAssembly | 🟢 | Planned |
| **AI Chat (Side Panel)** | Generate code, explain errors, refactor | 🟢 | Planned |
| **Diff Preview** | Side-by-side before commit | 🟢 | Planned |
| **Branch Manager** | Create/switch/delete feature branches | 🟡 | Planned |
| **Commit + Push** | Via GitHub API to feature branch only | 🟡 | Planned |
| **Auto-PR Creation** | Studio creates PR with description from AI | 🟡 | Planned |
| **CI Status Watch** | Live GitHub Actions logs in Studio | 🟢 | Planned |

### Tier 4 — Deployment Control (Weeks 10-11)
Deploy with explicit guardrails.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **Deploy Dashboard** | All workers + their current deploy versions | 🟢 | Planned |
| **One-Click Staging Deploy** | Deploy any branch to staging | 🟡 | Planned |
| **Production Deploy Gate** | Requires CI green + staging smoke + type-to-confirm | 🟠 | Planned |
| **Live Deploy Logs** | Stream Wrangler/CI output via SSE | 🟢 | Planned |
| **Smoke Test Trigger** | Auto-run smoke tests after deploy | 🟢 | Planned |
| **Rollback Button** | One-click `wrangler rollback` with preview | 🟠 | Planned |
| **Blue-Green Toggle** | Cut traffic between deployed versions | 🟠 | Planned |
| **Schedule Deploy** | Deploy at specific time (after business hours) | 🟡 | Planned |

### Tier 5 — Database Studio (Weeks 12-13)
Schema and data management.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **Schema Browser** | Visual table tree per database | 🟢 | Planned |
| **Visual Schema Designer** | Drag-drop columns, FK relationships | 🟡 | Planned |
| **Migration Generator** | Generate Drizzle migration from visual diff | 🟡 | Planned |
| **Migration Dry-Run** | Show SQL + estimated impact before apply | 🟡 | Planned |
| **Data Browser** | Query/filter/edit rows (with RLS respected) | 🟠 | Planned |
| **Query Console** | Run SQL with EXPLAIN ANALYZE | 🟢 | Planned |
| **Backup + Restore** | Trigger Neon branch + restore from PITR | 🟠 | Planned |
| **Index Recommendations** | AI suggests missing indexes from slow queries | 🟢 | Planned |

### Tier 6 — Content Studio (Weeks 14-15)
Visual CMS for non-technical users.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **Content Library** | All content items across all apps | 🟢 | Planned |
| **WYSIWYG Editor** | TipTap-based markdown editor | 🟢 | Planned |
| **Workflow States** | draft → review → approved → published | 🟢 | Planned |
| **Scheduled Publishing** | Calendar view, schedule for future | 🟢 | Planned |
| **AI Copy Assistant** | "Write a launch post" → drafts via @latimer-woods-tech/copy | 🟢 | Planned |
| **SEO Editor** | Meta tags, OG images, schema.org JSON-LD | 🟢 | Planned |
| **Image Library** | R2-backed asset manager | 🟢 | Planned |
| **Video Studio Integration** | Trigger video generation from content | 🟢 | Planned |

### Tier 7 — Operations (Weeks 16-17)
Day-2 operations made easy.

| Feature | Description | Reversibility | Status |
|---------|-------------|---------------|--------|
| **User Management** | Search, view, suspend users across apps | 🟠 | Planned |
| **Subscription Manager** | View Stripe subscriptions, refund, comp | 🟠 | Planned |
| **Lead Funnel Viewer** | CRM funnel per app + cross-app | 🟢 | Planned |
| **Support Inbox** | Email + chat tickets (Resend integration) | 🟢 | Planned |
| **Email Campaigns** | Compose + send transactional + marketing | 🟠 | Planned |
| **Compliance Audit** | TCPA/FDCPA logs, consent verification | 🟢 | Planned |
| **Secret Vault** | Rotate JWT/API keys with one click | 🟠 | Planned |
| **Cost Dashboard** | CF/Neon/Anthropic spend per app | 🟢 | Planned |

### Tier 8 — Hidden Needs (You're Not Asking For Yet)
Things you'll want once you start using Studio.

| Feature | Why You'll Want It |
|---------|-------------------|
| **Workspace Switcher** | When you have 12+ apps, you'll need favorites |
| **Saved Queries** | Re-run "active users last 7 days" without re-typing |
| **Custom Dashboards** | Pin metrics that matter to you (drag-drop tiles) |
| **Notifications Center** | Bell icon: "deploy failed", "test broke", "Sentry spike" |
| **Activity Feed** | Twitter-like stream of all team actions |
| **AI Memory** | Studio remembers your past decisions ("you prefer compact code") |
| **Keyboard Shortcuts** | Cmd+K command palette like VS Code |
| **Mobile View** | Approve deploys from phone (with extra confirmations) |
| **Shareable Links** | "Look at this error" → link to filtered Sentry view |
| **Time Travel Debugging** | Replay an error with state at that moment |
| **Slack/Discord Webhooks** | "PR created" → Slack message with one-click approve |
| **Cron Job Manager** | Edit Worker cron schedules visually |
| **Feature Flags UI** | Toggle features on/off without deploys |
| **A/B Test Designer** | Split traffic + measure conversion |
| **AI Code Reviewer** | LLM reviews PRs before human review |
| **Performance Profiler** | Flame graphs of slow Worker requests |
| **Dependency Graph** | Visual map of which apps use which packages |
| **Onboarding Wizard** | Step-by-step "create new app" flow |
| **Disaster Recovery Drill** | Practice restore from backup safely |

---

## Architecture

### High-Level Diagram

```
                          ┌─────────────────────────┐
                          │    Browser (Studio UI)  │
                          │  React + Vite + Monaco  │
                          │  Tailwind + shadcn/ui   │
                          └────────────┬────────────┘
                                       │ HTTPS + JWT
                                       ▼
                          ┌─────────────────────────┐
                          │  studio.thefactory.dev  │
                          │  Cloudflare Worker      │
                          │  (Hono + @latimer-woods-tech/*)│
                          └────────────┬────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────────┐
            ▼                          ▼                              ▼
   ┌─────────────────┐     ┌─────────────────────┐         ┌─────────────────┐
   │  GitHub API     │     │  All 6 App Workers  │         │  Cloudflare API │
   │  Code + CI      │     │  via Service        │         │  Wrangler ops   │
   │                 │     │  Bindings (RPC)     │         │                 │
   └─────────────────┘     └─────────────────────┘         └─────────────────┘
            │                          │                              │
            ▼                          ▼                              ▼
   ┌─────────────────┐     ┌─────────────────────┐         ┌─────────────────┐
   │ GitHub Actions  │     │  Hyperdrive → Neon  │         │  CF Workers +   │
   │ test/deploy CI  │     │  All app DBs        │         │  Pages + R2     │
   └─────────────────┘     └─────────────────────┘         └─────────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │  factory_core DB        │
                          │  factory_events         │
                          │  studio_audit_log       │ (new)
                          │  studio_sessions        │ (new)
                          └─────────────────────────┘
```

### Repository Layout

Studio is built as a monorepo workspace inside Factory:

```
Factory/
├── apps/
│   ├── admin-studio/              # Cloudflare Worker (Hono backend)
│   │   ├── src/
│   │   │   ├── index.ts           # Main Hono app
│   │   │   ├── env.ts             # Env interface
│   │   │   ├── middleware/
│   │   │   │   ├── env-context.ts # 🛡️ Environment safety guard
│   │   │   │   ├── audit.ts       # Audit log middleware
│   │   │   │   └── auth.ts        # JWT + RBAC
│   │   │   ├── routes/
│   │   │   │   ├── apps.ts        # Cross-app dashboard
│   │   │   │   ├── tests.ts       # Test runner endpoints
│   │   │   │   ├── code.ts        # GitHub integration
│   │   │   │   ├── deploy.ts      # Deployment control
│   │   │   │   ├── ai.ts          # LLM chat endpoints
│   │   │   │   ├── db.ts          # Schema + data ops
│   │   │   │   ├── content.ts     # CMS ops
│   │   │   │   └── users.ts       # User mgmt
│   │   │   └── services/
│   │   │       ├── github.ts      # GitHub API client
│   │   │       ├── cf-api.ts      # Cloudflare API client
│   │   │       └── audit.ts       # Audit log writer
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   │
│   └── admin-studio-ui/           # Cloudflare Pages (React frontend)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── EnvironmentBanner.tsx  # 🛡️ Always-visible banner
│       │   │   ├── ConfirmDialog.tsx       # Type-to-confirm dialog
│       │   │   ├── Layout.tsx
│       │   │   └── ui/                     # shadcn components
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Tests.tsx
│       │   │   ├── Code.tsx
│       │   │   ├── Deploy.tsx
│       │   │   ├── Database.tsx
│       │   │   ├── Content.tsx
│       │   │   └── AIStudio.tsx
│       │   ├── lib/
│       │   │   ├── api.ts              # Studio API client
│       │   │   ├── env-context.ts      # 🛡️ Frontend env state
│       │   │   └── auth.ts
│       │   └── stores/
│       │       └── env-store.ts        # Zustand store for env lock
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── package.json
│
└── packages/
    └── studio-core/               # Shared types between API + UI
        └── src/
            ├── env-context.ts     # EnvContext type + helpers
            ├── audit.ts           # AuditEntry type
            └── index.ts
```

### Why Two Apps (Worker + Pages)?

- **`admin-studio`** (Worker): API only, can call other Workers via Service Bindings, can use `@latimer-woods-tech/llm` server-side, holds secrets
- **`admin-studio-ui`** (Pages): Static React, deployed to CF Pages with custom domain, talks to API via fetch
- **Why split?** CF Workers max 1MB, React bundle is ~500KB. CF Pages serves static + Worker handles API. Standard pattern.

---

## Environment Context System (The Safety Layer)

### Data Flow

```
1. User logs in
   │
   ▼
2. Studio shows env picker: [Local] [Staging] [PRODUCTION]
   │
   ▼
3. User picks "Production"
   │
   ▼
4. Studio creates env-locked JWT:
   { sub, role, env: 'production', envLockedAt: <ts>, sessionId }
   │
   ▼
5. JWT sent with every request
   │
   ▼
6. Backend `envContextMiddleware`:
   - Verifies JWT signature
   - Extracts env claim
   - Sets c.set('envContext', { env, app, sessionId })
   - Refuses any request without env claim
   │
   ▼
7. Each route handler reads envContext to:
   - Pick correct DB binding (DB_PROD vs DB_STAGING)
   - Pick correct CF API token
   - Pick correct Sentry/PostHog project
   │
   ▼
8. Frontend `<EnvironmentBanner>` reads JWT and renders:
   - GRAY for local
   - AMBER for staging
   - RED for production (with pulsing border)
   │
   ▼
9. Production-only safeguards activate:
   - Type-to-confirm modals
   - Two-key approval for destructive ops
   - Slack notification on every action
```

### TypeScript Types

```typescript
// packages/studio-core/src/env-context.ts

export type Environment = 'local' | 'staging' | 'production';

export interface EnvContext {
  env: Environment;
  app?: string;          // Optional: scoped to a specific app
  sessionId: string;
  userId: string;
  role: 'viewer' | 'editor' | 'admin' | 'owner';
  envLockedAt: number;   // Unix timestamp when env was chosen
}

export interface EnvJWTPayload extends EnvContext {
  iat: number;
  exp: number;
  iss: 'factory-admin-studio';
}

// Risk levels for actions
export type ReversibilityTier = 'trivial' | 'reversible' | 'manual-rollback' | 'irreversible';

export interface ActionDescriptor {
  action: string;                     // "deploy.production"
  tier: ReversibilityTier;
  description: string;
  requiresTypeConfirm?: boolean;       // Only for production destructive
  requiresTwoKey?: boolean;            // Two admins must approve
  notifyChannels?: string[];           // Slack channels to notify
}

// Helper: enforce env match
export function requireEnv(ctx: EnvContext, allowed: Environment[]): void {
  if (!allowed.includes(ctx.env)) {
    throw new Error(`Action requires env in [${allowed.join(', ')}], got '${ctx.env}'`);
  }
}
```

### Backend Middleware

```typescript
// apps/admin-studio/src/middleware/env-context.ts

import { createMiddleware } from 'hono/factory';
import { verifyToken } from '@latimer-woods-tech/auth';
import type { EnvJWTPayload, EnvContext } from '@latimer-woods-tech/studio-core';

export const envContextMiddleware = createMiddleware<{
  Variables: { envContext: EnvContext };
  Bindings: Env;
}>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/, '');
  if (!token) return c.json({ error: 'Unauthorized', code: 'NO_TOKEN' }, 401);

  let payload: EnvJWTPayload;
  try {
    payload = await verifyToken<EnvJWTPayload>(token, c.env.STUDIO_JWT_SECRET);
  } catch {
    return c.json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, 401);
  }

  if (!payload.env || !['local', 'staging', 'production'].includes(payload.env)) {
    return c.json({ error: 'Token missing env claim', code: 'NO_ENV_CONTEXT' }, 401);
  }

  // Re-auth required if env was chosen > 4 hours ago and is production
  if (payload.env === 'production' && Date.now() - payload.envLockedAt > 4 * 60 * 60 * 1000) {
    return c.json({ error: 'Production session expired, re-authenticate', code: 'ENV_SESSION_EXPIRED' }, 401);
  }

  c.set('envContext', {
    env: payload.env,
    app: payload.app,
    sessionId: payload.sessionId,
    userId: payload.sub,
    role: payload.role,
    envLockedAt: payload.envLockedAt,
  });

  await next();
});
```

### Frontend Banner Component

```tsx
// apps/admin-studio-ui/src/components/EnvironmentBanner.tsx

import { useEnvStore } from '@/stores/env-store';

const COLORS = {
  local:      { bg: 'bg-gray-700',   border: 'border-gray-500',   label: 'LOCAL DEVELOPMENT' },
  staging:    { bg: 'bg-amber-700',  border: 'border-amber-500',  label: 'STAGING' },
  production: { bg: 'bg-red-700',    border: 'border-red-500',    label: 'PRODUCTION — LIVE CUSTOMERS' },
};

export function EnvironmentBanner() {
  const { env, user, sessionStartedAt } = useEnvStore();
  const c = COLORS[env];
  const pulse = env === 'production' ? 'animate-pulse' : '';

  return (
    <div
      role="banner"
      aria-live="polite"
      className={`${c.bg} text-white px-4 py-2 border-b-4 ${c.border} ${pulse} sticky top-0 z-50 flex items-center justify-between`}
    >
      <div className="flex items-center gap-3 font-mono text-sm font-bold">
        <span>⚠️ {c.label}</span>
        <span className="opacity-75">|</span>
        <span>{user.email}</span>
        <span className="opacity-75">|</span>
        <span>Locked {new Date(sessionStartedAt).toLocaleTimeString()}</span>
      </div>
      <button
        onClick={() => location.href = '/login'}
        className="text-xs underline opacity-75 hover:opacity-100"
      >
        Switch environment
      </button>
    </div>
  );
}
```

---

## Test Runner Architecture

### Why This Is Hard
Vitest runs in Node, not Workers. Studio cannot execute tests in itself.

### Solution: GitHub Actions as Test Executor

```
1. User clicks "Run Tests" in Studio UI
   │
   ▼
2. Studio API → POST /api/tests/run
   { app: 'wordis-bond', filter: 'src/auth/**' }
   │
   ▼
3. Studio dispatches GitHub Actions workflow:
   gh workflow run test-on-demand.yml
     --repo Latimer-Woods-Tech/wordis-bond
     -f filter="src/auth/**"
     -f studio_run_id="run_abc123"
   │
   ▼
4. GitHub Actions job:
   - Checks out code
   - Installs deps
   - Runs vitest with --reporter=json + filter
   - Streams output to Studio webhook (POST /api/tests/events)
   - Uploads coverage as artifact
   │
   ▼
5. Studio API receives events via webhook:
   - Parses test result objects
   - Forwards to UI via WebSocket/SSE
   - Stores in test_runs table for history
   │
   ▼
6. UI shows live test tree:
   ✓ src/auth/login.test.ts (8 passed)
   ✗ src/auth/jwt.test.ts (1 failed)
     └─ "expires in 7 days"
        Expected: 604800
        Got: 86400
   │
   ▼
7. User clicks failed test → AI Failure Analyst
   - Sends test code + failure to LLM
   - Gets explanation + fix suggestion
   - Optionally creates fix branch
```

### test-on-demand.yml Template

Lives in every app repo, copied by scaffold.mjs:

```yaml
# .github/workflows/test-on-demand.yml
name: Test on Demand (Studio)
on:
  workflow_dispatch:
    inputs:
      filter:
        description: 'Vitest test filter pattern'
        required: false
      studio_run_id:
        description: 'Studio run ID for webhook callbacks'
        required: true
      env_target:
        description: 'Environment context'
        required: true
        type: choice
        options: [local, staging]   # NEVER production

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Notify Studio: started
        run: |
          curl -X POST ${{ secrets.STUDIO_WEBHOOK_URL }}/api/tests/events \
            -H "Authorization: Bearer ${{ secrets.STUDIO_WEBHOOK_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"runId":"${{ inputs.studio_run_id }}","event":"started"}'
      - name: Run tests
        id: vitest
        continue-on-error: true
        run: npx vitest run --reporter=json --outputFile=results.json ${{ inputs.filter }}
      - name: Notify Studio: results
        if: always()
        run: |
          curl -X POST ${{ secrets.STUDIO_WEBHOOK_URL }}/api/tests/events \
            -H "Authorization: Bearer ${{ secrets.STUDIO_WEBHOOK_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data-binary @results.json
```

---

## AI Chat Architecture

### The Three Modes

1. **Generate Mode** — "Add a /contacts endpoint"
   - LLM has access to: file tree, existing schemas, package APIs
   - Returns: proposed file changes (diff format)
   - User clicks "Apply" → Studio creates branch + commit

2. **Explain Mode** — "Why is this test failing?"
   - LLM has access to: test code, error message, related source
   - Returns: root cause + fix suggestion
   - User clicks "Apply Fix" → branch + commit

3. **Refactor Mode** — "Convert this callback to async/await"
   - LLM has access to: selected code, file context
   - Returns: refactored code
   - User clicks "Apply" → in-place edit in Monaco

### Provider Chain (Already Exists)
Reuses `@latimer-woods-tech/llm`: Claude → Grok → Groq fallback.

### Context Window Strategy
- **Default:** Current file + 3 imports/imported-by + relevant schema
- **Expanded:** Full app source (only if context fits in 200k tokens)
- **Workspace-aware:** Studio tracks which app you're editing, includes that app's CLAUDE.md

### Safety Rails
- AI never directly commits — always shows diff first
- AI cannot push to `main` branch (Studio blocks at GitHub API layer)
- AI cannot modify infrastructure (`wrangler.jsonc`, `.github/workflows/**`) without explicit confirmation
- All AI-generated commits tagged: `[ai-assisted]` in commit message

---

## Phased Execution Plan

### Phase A — Foundation (Week 1) — *Building Now*
- ✅ Master plan documented
- 🔄 Workspace scaffolding (`apps/admin-studio`, `apps/admin-studio-ui`, `packages/studio-core`)
- 🔄 Environment Context system (types + middleware + frontend store)
- 🔄 Login page + JWT issuance with env claim
- 🔄 Persistent Environment Banner
- 🔄 Audit log table + middleware
- 🔄 Health endpoint + basic dashboard

### Phase B — Observability (Week 2)
- App health monitor (live SSE)
- Sentry recent errors integration
- PostHog metrics tiles
- Cross-app deploy version dashboard
- Activity feed (audit log viewer)

### Phase C — Test Runner (Weeks 3-4)
- `test-on-demand.yml` workflow rolled to all 6 apps
- Webhook receiver in studio API
- Test tree UI with live updates
- Failure diff view
- AI Failure Analyst integration

### Phase D — Code Editor + AI (Weeks 5-7)
- GitHub API service layer
- Monaco editor integration
- File tree browser
- AI chat side panel (Generate / Explain / Refactor)
- Diff preview + commit-to-branch

### Phase E — Deploy Control (Weeks 8-9)
- Deploy dashboard
- One-click staging deploy
- Production deploy gate (type-to-confirm)
- Live deploy logs (SSE)
- Rollback button

### Phase F — DB Studio (Weeks 10-11)
- Schema browser
- Query console
- Migration generator + dry-run
- Data browser with RLS

### Phase G — Content + Operations (Weeks 12-14)
- WYSIWYG content editor
- User management
- Subscription manager
- Email composer

### Phase H — Polish (Weeks 15-16)
- Cmd+K command palette
- Notifications center
- Keyboard shortcuts
- Mobile responsive
- Onboarding wizard

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Wrong-environment incidents | 0 / quarter | Audit log + post-incident reviews |
| Time to deploy a code change | < 3 min (vs ~15 min today) | Studio audit log timestamps |
| Tests run per developer per week | > 50 (vs ~10 today) | Test runner usage stats |
| Non-developer self-service tasks | > 30% (vs 0% today) | Audit log by user role |
| Studio uptime | 99.95% | CF Workers monitoring |
| AI suggestions accepted | > 40% | accept_rate from suggestion events |
| Mean time to detect production issue | < 2 min | Sentry alert → Studio notification |

---

## Best Practices Enforced by Design

1. **No direct production writes** — All prod changes go through PR + CI gates
2. **Audit everything** — Every API call logged with who/what/when/where
3. **Type-safe end-to-end** — `studio-core` shared between API + UI
4. **Env-aware secrets** — Studio holds keys per environment, never mixes
5. **Idempotent operations** — All deploys/migrations safe to retry
6. **Reversibility-first UX** — Risk tier always visible before action
7. **Observability-driven** — Every action emits a `factory_event`
8. **Progressive disclosure** — Hide power-user features behind a "More" menu until needed
9. **Mobile-friendly safety** — Production actions blocked on mobile by default
10. **AI as collaborator, not autopilot** — All AI changes require explicit approval

---

## Open Questions / Decisions Pending

| # | Question | Default Answer | Reasoning |
|---|----------|----------------|-----------|
| 1 | Should Studio host its own auth or federate with Google/GitHub? | Federate with GitHub OAuth | You're already in the GitHub ecosystem |
| 2 | Should AI use Claude only or full chain? | Full chain (Claude → Grok → Groq) | Already paid for, same as apps |
| 3 | Should test runner support Playwright (E2E)? | Yes, in Phase C+ | E2E test demand will grow |
| 4 | Should Studio be open-sourced eventually? | Yes, after MVP stable | Differentiator vs. Vercel/Netlify |
| 5 | Multi-tenant Studio (one Studio for multiple Factories)? | No — start single-tenant | Avoid premature abstraction |
| 6 | Native mobile app? | No — responsive web only | Maintenance cost > value |
| 7 | Custom domain or subdomain? | `studio.thefactory.dev` | Standard pattern |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User accidentally runs prod-destructive op | Medium | Critical | Five Safeguards (above) |
| GitHub API rate limit | Low | High | Aggressive caching + multiple PATs in pool |
| Monaco bundle size | High | Medium | Lazy-load editor, split chunks |
| AI hallucinates schema changes | High | High | Always dry-run + diff preview |
| Studio itself goes down | Low | High | Studio is *interface only* — apps still work directly |
| Secret leakage from AI context | Medium | Critical | Strip secrets from LLM context, redact `.dev.vars` |
| LSP performance in browser | Medium | Low | Fall back to syntax highlighting only |
| Cross-environment data corruption | Low | Critical | Env Context Lock (above) |

---

## Document Index

| Doc | Purpose |
|-----|---------|
| [00-MASTER-PLAN.md](./00-MASTER-PLAN.md) | This document |
| [01-ENVIRONMENT-SAFETY.md](./01-ENVIRONMENT-SAFETY.md) | Detailed env safety design |
| [02-API-SPEC.md](./02-API-SPEC.md) | OpenAPI-style backend spec |
| [03-UI-COMPONENTS.md](./03-UI-COMPONENTS.md) | Component library + design system |
| [04-DEPLOYMENT.md](./04-DEPLOYMENT.md) | How to deploy Studio |
| [05-OPERATIONS.md](./05-OPERATIONS.md) | Day-2 ops runbook |

---

**Status:** Phase A execution starting now. See `apps/admin-studio` and `apps/admin-studio-ui` for live code.
