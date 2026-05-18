# PR 3e — Marketing Supervisor Worker (`apps/marketing-supervisor/`)

**Status:** Drafted · **Depends on:** 3a (drip sequencer), 3b (cell dimension), 3c (voice matrix)
**Owner app:** `apps/marketing-supervisor/` (new) · **Effort:** 5 days — largest PR in the bundle
**Branch:** `marketing/3e-supervisor-worker` · **Bottleneck:** unblocks 3g (TopicScout) and 3m (TripwireMonitor)

## 1. Goal

Implement the autonomous loop spec in [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md): a Cloudflare Worker running three concurrent loops (15-min cron, event-driven Queue consumer, 6h slow loop), invoking the 10 agents in [§3](../MARKETING_SUPERVISOR.md#3-agent-roster), enforcing the 4 gates (voice → budget → tier → tripwire), advancing `marketing_campaigns` through the state machine in [§5](../MARKETING_SUPERVISOR.md#5-campaign-state-machine), producing a Pushover digest of ≤3 escalations/day per [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md).

A **peer** of [`apps/supervisor/`](../../../apps/supervisor/) — same kanban `PVT_kwDOEL0sNc4BWWtg`, same label vocabulary, different agents, different gates.

## 2. Non-goals

This PR ships the *invocation surface* + state plumbing for the 10 agents — not their deep logic:

- ❌ TopicScout signal-mining (full body in 3g) — stub here that escalates
- ❌ TripwireMonitor arithmetic (full body in 3m) — stub here that escalates
- ❌ Per-channel adapters (full body in 3f) — ChannelPublisher ships the gate stack only
- ❌ Visual operator console (admin-studio "marketing" tab is a follow-up; v1 = Pushover + GitHub Issues + `/health`)
- ❌ Migration of legacy `outreach_campaigns` rows (new campaigns only)
- ❌ Multi-region failover (single-region Worker is enough for v1)
- ❌ ClickUp (per memory `feedback_kanban_canonical.md` — GitHub Issues only)
- ❌ Replacing `apps/supervisor/` (peers; share signals via [`MARKETING_SUPERVISOR.md §6`](../MARKETING_SUPERVISOR.md#6-integration-with-the-engineering-supervisor))
- ❌ Per-tenant Worker instances (singleton DO; tenant scoping enforced via RLS)

**What ships here:** loop + 4 gates + 3 tables + 1 R2 bucket + 1 queue + cron + health endpoint + 7 agents with full bodies + 3 stubs that escalate.

## 3. Dependencies

Files the executor MUST read:

- [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md) — full spec; this PR implements it verbatim
- [`apps/supervisor/`](../../../apps/supervisor/) — peer pattern: [`src/index.ts`](../../../apps/supervisor/src/index.ts), [`src/supervisor.do.ts`](../../../apps/supervisor/src/supervisor.do.ts), [`wrangler.jsonc`](../../../apps/supervisor/wrangler.jsonc)
- [`.github/scripts/supervisor-core.mjs`](../../../.github/scripts/supervisor-core.mjs) — `releaseStaleClaimedIssues`, template matching, label gates (adapt, don't duplicate)
- [`packages/schedule/src/index.ts`](../../../packages/schedule/src/index.ts) — closest existing autonomous-loop pattern (video factory)
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `CampaignService.transitionCampaignStatus` is the model for state transitions; `BRAND_PROFILES` feeds voice gate
- [`packages/email/src/index.ts`](../../../packages/email/src/index.ts) — sequencer hooks from PR 3a
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — `voiceProfiles` from PR 3c
- [`packages/content/src/surfaces.ts`](../../../packages/content/src/surfaces.ts) — `resolveSurface` from PR 3d (consumed by ChannelPublisher)
- [`packages/validation/`](../../../packages/validation/) — `validateAiOutput` (voice gate)
- [`packages/llm/`](../../../packages/llm/) — Anthropic → Grok → Groq chain per [`docs/STACK.md`](../../STACK.md)
- [`CONSTITUTION.md`](../CONSTITUTION.md) — §2 voice, §3 budget, §4 tiers, §5 channels, §6 consent, §7 tripwires
- [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) · [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md) · [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) · [`ICP_MATRIX.md`](../ICP_MATRIX.md) · [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) · [`LIFECYCLE.md`](../LIFECYCLE.md)
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers runtime, no Node built-ins, no `process.env`, ESM only, JWT via Web Crypto, no `*.workers.dev` in user-facing URLs (the `/control` endpoint needs a branded domain in production)
- [`docs/runbooks/add-new-app.md`](../../runbooks/add-new-app.md) — rate-limiter ID registry (next: **1009**), Hyperdrive UUID extraction
- [`docs/runbooks/environment-isolation-and-verification.md`](../../runbooks/environment-isolation-and-verification.md) — `/health` patterns
- Memory: [`project_supervisor_architecture.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_supervisor_architecture.md) — kanban ID, labels, stale-claim mechanics

## 4. Migrations

```sql
-- 0001_marketing_campaigns.sql
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT NOT NULL,
  campaign_id         TEXT NOT NULL,           -- per CAMPAIGN_TAGGING.md §2
  product             TEXT NOT NULL,
  icp                 TEXT NOT NULL,
  cell_key            TEXT NOT NULL,           -- `{product}:{icp}`
  channel             TEXT NOT NULL,
  surface             TEXT NOT NULL,
  state               TEXT NOT NULL DEFAULT 'draft'
                        CHECK (state IN ('draft','review','queued','published','measured','retro','escalation','archived','paused')),
  github_issue_number INTEGER,
  github_issue_node   TEXT,
  voice_key           TEXT NOT NULL,
  template_id         TEXT,
  paused_at           TIMESTAMPTZ,
  paused_by           TEXT,
  pause_reason        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, campaign_id)
);
CREATE INDEX idx_mkt_campaigns_state_cell ON marketing_campaigns (state, cell_key);
CREATE INDEX idx_mkt_campaigns_github     ON marketing_campaigns (github_issue_number) WHERE github_issue_number IS NOT NULL;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_campaigns_tenant ON marketing_campaigns
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- 0002_marketing_artefacts.sql
CREATE TABLE IF NOT EXISTS marketing_artefacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT NOT NULL,
  campaign_uuid       UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind <> ''),  -- 'linkedin_post','email_body','landing_html',...
  voice_key           TEXT NOT NULL,
  body_r2_key         TEXT NOT NULL,
  body_sha256         TEXT NOT NULL,
  voice_gate_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (voice_gate_status IN ('pending','clean','minor_logged','blocked')),
  voice_issues        JSONB NOT NULL DEFAULT '[]',
  publish_status      TEXT NOT NULL DEFAULT 'unpublished'
                        CHECK (publish_status IN ('unpublished','queued','published','publish_failed','paused')),
  published_at        TIMESTAMPTZ,
  external_id         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mkt_artefacts_campaign ON marketing_artefacts (campaign_uuid);
CREATE INDEX idx_mkt_artefacts_gate     ON marketing_artefacts (voice_gate_status, created_at);
ALTER TABLE marketing_artefacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_artefacts_tenant ON marketing_artefacts
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- 0003_marketing_runs.sql
CREATE TABLE IF NOT EXISTS marketing_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  agent           TEXT NOT NULL
                    CHECK (agent IN ('TopicScout','ContentDrafter','CopyEditor','ChannelPublisher','OutreachSender','ExperimentRunner','RetroWriter','BudgetWatcher','TripwireMonitor','DigestComposer')),
  campaign_uuid   UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  trigger         TEXT NOT NULL CHECK (trigger IN ('cron','queue','slow_loop','manual')),
  status          TEXT NOT NULL CHECK (status IN ('ok','escalated','failed','skipped')),
  duration_ms     INTEGER NOT NULL,
  llm_cost_cents  INTEGER NOT NULL DEFAULT 0,
  details         JSONB NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mkt_runs_agent_time    ON marketing_runs (agent, started_at DESC);
CREATE INDEX idx_mkt_runs_campaign      ON marketing_runs (campaign_uuid) WHERE campaign_uuid IS NOT NULL;
CREATE INDEX idx_mkt_runs_status_recent ON marketing_runs (status, started_at DESC);
ALTER TABLE marketing_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_runs_tenant ON marketing_runs
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK (reverse order): DROP POLICY/INDEX/TABLE for each, runs → artefacts → campaigns.
```

**R2 bucket:** `marketing-artefacts` (binding `MARKETING_ARTEFACTS`).
**Queue:** `marketing-events` (producer + consumer binding on this Worker).

## 5. API shape

### 5.1 Worker entrypoint

```ts
// apps/marketing-supervisor/src/index.ts
export { MarketingSupervisorDO } from './supervisor.do';
export { MarketingLockDO } from './lock.do';

export interface Env {
  SUPERVISOR: DurableObjectNamespace;
  LOCK: DurableObjectNamespace;
  DB: Hyperdrive;
  MARKETING_ARTEFACTS: R2Bucket;
  MARKETING_EVENTS: Queue<MarketingEvent>;
  RATE_LIMITER: RateLimit;                 // namespace 1009
  ANTHROPIC_API_KEY: string; GROK_API_KEY?: string; GROQ_API_KEY: string;
  FACTORY_APP_ID: string; FACTORY_APP_PRIVATE_KEY: string; FACTORY_APP_INSTALLATION_ID: string;
  PUSHOVER_TOKEN: string; PUSHOVER_USER_KEY: string;
  WORKER_API_TOKEN: string; JWT_SECRET: string;
  LINKEDIN_ACCESS_TOKEN?: string; YOUTUBE_REFRESH_TOKEN?: string;  // PR 3f
  RESEND_API_KEY: string;                                          // PR 3a
  SENTRY_DSN: string; POSTHOG_API_KEY: string;
  ENVIRONMENT: 'staging' | 'production';
}

export default {
  fetch(req, env, ctx): Promise<Response>;            // → MarketingSupervisorDO singleton
  scheduled(c, env, ctx): Promise<void>;              // cron — 15-min tick + 6h slow loop + 06:00 digest
  queue(batch, env, ctx): Promise<void>;              // event-driven agents
} satisfies ExportedHandler<Env, MarketingEvent>;
```

### 5.2 Event union

```ts
// apps/marketing-supervisor/src/events.ts
export type MarketingEvent =
  | { type: 'posthog.checkout_drop';        cell: string; magnitude: number; windowMin: number }
  | { type: 'posthog.subscription_canceled';tenantId: string; userId: string; cell: string }
  | { type: 'posthog.unlock_purchased';     tenantId: string; userId: string; cell: string }
  | { type: 'resend.bounce';                email: string; cell: string }
  | { type: 'resend.complaint';             email: string; cell: string }
  | { type: 'stripe.spend';                 cell: string; amountCents: number; channel: string }
  | { type: 'github.label_changed';         issueNumber: number; label: string }
  | { type: 'github.pr_merged';             number: number; touched: string[] }
  | { type: 'voice_corpus.reload';          voiceKey: string };
```

### 5.3 Agent contract

```ts
// apps/marketing-supervisor/src/agents/types.ts
export interface AgentContext {
  env: Env; db: FactoryDb; tenantId: string; now: Date;
  runLog: (row: MarketingRunInput) => Promise<void>;   // appends marketing_runs at end of invocation
}
export interface AgentResult {
  status: 'ok' | 'escalated' | 'failed' | 'skipped';
  campaignUuid?: string; details?: Record<string, unknown>; llmCostCents?: number;
}
export type Agent = (ctx: AgentContext, input: AgentInput) => Promise<AgentResult>;
```

Agents in `src/agents/` (full vs stub per Non-goals §2): `topic-scout.ts` (STUB→3g), `content-drafter.ts` (FULL), `copy-editor.ts` (FULL — calls `validateAiOutput`), `channel-publisher.ts` (FULL gate stack; adapters→3f), `outreach-sender.ts` (FULL — via 3a sequencer), `experiment-runner.ts` (STUB), `retro-writer.ts` (FULL), `budget-watcher.ts` (FULL), `tripwire-monitor.ts` (STUB→3m), `digest-composer.ts` (FULL).

### 5.4 Gate stack

```ts
// apps/marketing-supervisor/src/gates/index.ts
export interface GateResult { allowed: boolean; reason?: string; tier?: 1|2|3; escalate?: boolean; }

export async function voiceGate(ctx, artefactUuid: string): Promise<GateResult>;
export async function budgetGate(ctx, opts: { cell: string; channel: string; amountCents: number }): Promise<GateResult>;
export async function tierGate(ctx, opts: { action: string; declaredTier: 1|2|3 }): Promise<GateResult>;
export async function tripwireGate(ctx, cell: string): Promise<GateResult>;

/** Order: voice → budget → tier → tripwire. Short-circuits on first failure. */
export async function runGates(ctx, args: {
  artefactUuid: string; cell: string; channel: string; amountCents?: number; action: string; declaredTier: 1|2|3;
}): Promise<GateResult>;
```

### 5.5 State machine

```ts
// apps/marketing-supervisor/src/state-machine.ts
export type CampaignState = 'draft'|'review'|'queued'|'published'|'measured'|'retro'|'escalation'|'archived'|'paused';
const ALLOWED: Record<CampaignState, CampaignState[]> = {
  draft:      ['review','paused','escalation'],
  review:     ['queued','escalation','paused','draft'],
  queued:     ['published','paused','escalation'],
  published:  ['measured','paused'],
  measured:   ['retro'],
  retro:      ['archived'],
  escalation: ['draft','queued','paused','archived'],
  paused:     ['draft','review','queued','escalation','archived'],
  archived:   [],
};
export async function transitionCampaignState(
  db: FactoryDb, campaignUuid: string, to: CampaignState,
  by: 'system'|'operator', reason?: string,
): Promise<void>;  // throws on disallowed; idempotent on same-state
```

Mirror of [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) `transitionCampaignStatus`.

### 5.6 HTTP routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET`  | `/health` | none | 200 + last-tick info per [CLAUDE.md verification](../../../CLAUDE.md#verification-requirement-stop--read-this-before-declaring-anything-working) |
| `GET`  | `/queue` | JWT | Escalations beyond the top-3 (overflow view) |
| `POST` | `/control` | JWT | Operator commands: `pause-cell`, `resume-cell`, `approve-tier3`, `kill-campaign`, `force-tick`, `send-digest`, `run-agent` |
| `POST` | `/webhooks/posthog` | HMAC | → `MarketingEvent` |
| `POST` | `/webhooks/resend` | HMAC | bounces/complaints |
| `POST` | `/webhooks/stripe` | Stripe signature | spend |
| `POST` | `/webhooks/github` | GitHub App secret | label changes / PR merges |
| `POST` | `/sequencer/enroll` | `WORKER_API_TOKEN` | PR 3a `enrollInSequence` |
| `POST` | `/sequencer/tick-now` | `WORKER_API_TOKEN` | Force-advance drip — `ENVIRONMENT==='staging'` only |
| `POST` | `/sequencer/unsubscribe` | `WORKER_API_TOKEN` | PR 3a `suppress()` |

`/control` replies are idempotency-keyed by escalation id (mirrors engineering supervisor Pushover-reply path).

## 6. Test plan

- **Unit** (Vitest + `@cloudflare/vitest-pool-workers`, 90%+ lines / 85%+ branches):
  - State machine: every allowed transition succeeds; every disallowed throws; idempotent on same-state
  - Gate stack: short-circuits in fixed order; each gate has happy/fail/edge cases
  - `voiceGate`: `clean` → allow; `minor_logged` → allow + log; `blocked` → refuse + open `escalation:voice-block` issue
  - `budgetGate`: under-cap → allow; over cell-cap → refuse + tier-3; portfolio-cap also honoured
  - `tierGate`: T1 auto; T2 FYI + schedule auto-proceed at +24h; T3 block + wait
  - `tripwireGate`: paused cell → refuse
  - Concurrency caps (max 3 `queued`, max 1 A/B, max 10 `draft` per cell)
  - Stale claim release: 7d-old `agent:claimed:marketing` strips label
  - DigestComposer: 7 escalations → top 3 sent; rest at `/queue`; 0 escalations → still sends (north-star + loop health)
  - RLS regression: cross-tenant select fails
- **Integration:**
  - End-to-end happy path: stub TopicScout opens issue → ContentDrafter → CopyEditor (gate pass) → tier-1 publish via ChannelPublisher stub → draft→review→queued→published
  - Queue consumer dispatches correct agent per event type (table-driven)
  - Slow loop: `discovery` cell → TopicScout runs, ChannelPublisher does NOT
  - LLM cost: hitting daily $50 cap refuses further LLM calls
  - Pushover mocked; ≤3 escalations rendered + format matches [§7](../MARKETING_SUPERVISOR.md#7-daily-operator-digest)
  - Voice-gate block rate > 5% / 24h triggers tripwire cell-pause
- **DB:** all migrations apply + idempotent + rollback clean; RLS verified
- **Smoke (CI):** `wrangler deploy --dry-run --env staging`; clean `tsup` output

## 7. Verification

Production requires a branded custom domain ([CLAUDE.md hard constraint](../../../CLAUDE.md#hard-constraints)); staging may use `.workers.dev`. CI runs all seven curls below against staging on every merge to `main`; failure breaks the build.

```bash
BASE=https://marketing-supervisor-staging.adrper79.workers.dev
H="Authorization: Bearer $WORKER_API_TOKEN"

# 1. Health → 200 { status:"ok", lastTickAt, lastTickStatus, openEscalations, loopVersion }
curl $BASE/health

# 2. Force tick (staging only) → 200 { ticked:true, agentsRun:[...] }
curl -X POST -H "$H" $BASE/control -d '{"command":"force-tick"}'

# 3. Open marketing issue (label area:marketing + supervisor:approved-source);
#    after force-tick: `agent:claimed:marketing` label + marketing_runs row present
gh issue view <num>

# 4. PostHog webhook → 202; marketing_runs row agent='TopicScout' within ~5s
curl -X POST -H "X-PostHog-Signature: $(...)" $BASE/webhooks/posthog \
  -d '{"event":"unlock_purchased","properties":{"cell":"selfprime:practitioner"}}'

# 5. Digest → Pushover notification with ≤3 escalations
curl -X POST -H "$H" $BASE/control -d '{"command":"send-digest"}'

# 6. Voice-gate block path: insert hostile-content artefact, then:
curl -X POST -H "$H" $BASE/control \
  -d '{"command":"run-agent","agent":"CopyEditor","artefactUuid":"..."}'
# Expect: voice_gate_status='blocked'; new issue with `escalation:voice-block`

# 7. Sequencer integration (PR 3a) → 200 { enrolled:true }
curl -X POST -H "$H" $BASE/sequencer/enroll \
  -d '{"tenantId":"test","userId":"u1","email":"test@example.com","sequenceName":"practitioner_welcome_v1"}'
```

## 8. Acceptance criteria

- [ ] `apps/marketing-supervisor/` scaffolded; `wrangler.jsonc` registers D1, Hyperdrive (`DB`), R2 `marketing-artefacts`, Queue `marketing-events`, Rate Limiter namespace 1009, two DOs, three crons (`*/15 * * * *`, `0 6 * * *`, `0 */6 * * *`)
- [ ] Production uses a branded custom domain (no `*.workers.dev` outside staging); CI lint enforces
- [ ] 10 agent files exist: 7 full (ContentDrafter, CopyEditor, OutreachSender, RetroWriter, BudgetWatcher, DigestComposer + ChannelPublisher gate stack); 3 stubs that escalate (TopicScout→3g, TripwireMonitor→3m, ExperimentRunner→sibling)
- [ ] 4 gates ordered per [`§2`](../MARKETING_SUPERVISOR.md#2-architecture-overview); state machine matches [`§5`](../MARKETING_SUPERVISOR.md#5-campaign-state-machine) verbatim
- [ ] Three concurrent loops proven by integration test (cron / queue / slow loop)
- [ ] DDL migrations apply + idempotent + rollback clean; RLS verified cross-tenant
- [ ] R2 + Queue provisioned + round-trip + DLQ; all webhooks signature-verified
- [ ] `/health` returns 200 with last-tick info; Pushover digest format matches [`§7`](../MARKETING_SUPERVISOR.md#7-daily-operator-digest), never exceeds 3 escalations
- [ ] Per-cell concurrency caps enforced (max 3 `queued`, max 1 A/B, max 10 `draft`)
- [ ] Stale-claim release adapted from `.github/scripts/supervisor-core.mjs`; LLM daily $50 cap escalates on hit
- [ ] Sentry init via [`@latimer-woods-tech/monitoring`](../../../packages/monitoring/); every agent exception captured
- [ ] Coverage ≥90% lines / ≥85% branches; zero `process.env`, zero Node built-ins, zero `any` in public exports, zero `console.log`
- [ ] `docs/service-registry.yml` updated; CHANGELOG; semver 0.1.0; verification curls green in staging

## 9. File list

```
apps/marketing-supervisor/
  package.json · tsconfig.json · README.md
  wrangler.jsonc                       # crons, DOs, D1, Hyperdrive, R2, Queue, Rate Limiter 1009, branded domain
  src/
    index.ts                           # fetch/scheduled/queue handlers
    supervisor.do.ts                   # MarketingSupervisorDO — orchestration
    lock.do.ts                         # MarketingLockDO — claim dedup
    env.ts · events.ts · state-machine.ts · db.ts
    health.ts · control.ts · digest.ts · kanban.ts
    gates/{voice,budget,tier,tripwire,index}.ts
    agents/{types,topic-scout,content-drafter,copy-editor,channel-publisher,outreach-sender,experiment-runner,retro-writer,budget-watcher,tripwire-monitor,digest-composer}.ts
    webhooks/{posthog,resend,stripe,github}.ts
    planner/{templates.generated.json,match.ts}    # adapted from supervisor-core.mjs
  migrations/{0001_marketing_campaigns,0002_marketing_artefacts,0003_marketing_runs}.sql
  test/{state-machine,gates/*,agents/*,integration/*}.test.ts

docs/marketing/plans/                  # NEW — YAML templates per campaign archetype
  owned-social-post.yml · email-drip-step.yml · landing-page-refresh.yml
  video-topic.yml · experiment-launch.yml · README.md

.github/workflows/
  deploy-marketing-supervisor.yml      # mirrors deploy-supervisor.yml
  marketing-supervisor-smoke.yml       # post-deploy curl verification

docs/service-registry.yml              # MODIFY — add marketing-supervisor entry
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Supervisor crash leaves campaigns wedged | DO singleton + auto-redeploy per [`§8`](../MARKETING_SUPERVISOR.md#8-failure-modes--recovery); `releaseStaleClaimedIssues` after 7d |
| LLM spend runaway | `BudgetWatcher.preflight` blocks past daily cap; Rate Limiter (1009) caps LLM calls/sec; every run records `llm_cost_cents` |
| Voice gate blocks every artefact | TripwireMonitor cell-pauses on >5% block rate; auto-PR against `BRAND_PROFILES` per [`VOICES.md §5`](../VOICES.md#5-voice-drift-detection) |
| Queue backlog grows | DLQ + Sentry alert on depth > 1000; `BudgetWatcher` throttles producers |
| Concurrent tick fan-out | LockDO serialises per-issue claims; cron is single-instance; queue is at-least-once with idempotency via `external_id` |
| GitHub App rate-limited (5k/h) | Cache installation token; batch PATCH; exp-backoff retry |
| Pushover quota exhausted | Hard cap 3/day per [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md); overflow at `/queue` only |
| Operator floods `/control` | All commands idempotency-keyed |
| Slow loop reads KPI queries that don't exist yet | Ship the 3 priority decompositions only ([`KPI_DECOMPOSITION.md §8`](../KPI_DECOMPOSITION.md#8-decomposition-queries-reference)); rest defer |
| Label-vocabulary drift vs `apps/supervisor/` | Duplicate constants + snapshot-test parity (v1); shared package later if drift recurs |
| `.workers.dev` URL leak to production | CI lint blocks `*.adrper79.workers.dev` in wrangler `routes` or user-facing source files |

## 11. Cross-references

- [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md) — full spec
- [`CONSTITUTION.md`](../CONSTITUTION.md) · [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) · [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md) · [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) · [`ICP_MATRIX.md`](../ICP_MATRIX.md) · [`VOICES.md`](../VOICES.md) · [`CHANNEL_DOCTRINE.md`](../CHANNEL_DOCTRINE.md) · [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) · [`LIFECYCLE.md`](../LIFECYCLE.md)
- PR 3a (sequencer) · 3b (cell_key) · 3c (voice registry) · 3d (`resolveSurface`) · 3f (adapters) · 3g (TopicScout body) · 3m (TripwireMonitor body)
- [`apps/supervisor/`](../../../apps/supervisor/) — peer pattern · [`packages/schedule/src/index.ts`](../../../packages/schedule/src/index.ts) — closest autonomous loop · [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `transitionCampaignStatus` model · [`.github/scripts/supervisor-core.mjs`](../../../.github/scripts/supervisor-core.mjs) — adapted
- [`CLAUDE.md`](../../../CLAUDE.md) · [`docs/runbooks/add-new-app.md`](../../runbooks/add-new-app.md) · [`docs/runbooks/environment-isolation-and-verification.md`](../../runbooks/environment-isolation-and-verification.md)
