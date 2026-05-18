# PR 3l — LLM-Rank Tracker

**Status:** Drafted · **Depends on:** (independent — can ship any time)
**Owner package(s):** `apps/llm-rank-worker` (new), reads `@latimer-woods-tech/llm`
**Effort:** 2 days
**Branch:** `marketing/3l-llm-rank`

## 1. Goal

Ship a weekly cron Worker that queries ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google), and Perplexity with curated practitioner / consumer prompts like *"what's the best Human Design app for working practitioners?"* and records whether **Selfprime, Cypher of Healing, Xico City** (and competitors) appear in the answer, in what position, and with what sentiment.

This is the autonomous-loop answer to question 5 in [`icp/selfprime-practitioner.md §8`](../icp/selfprime-practitioner.md#8-what-we-dont-know-yet-autonomous-system-commitments-to-learn): *"What does 'AI tells practitioners to grow their business' actually look like in current LLM outputs?"*

Inspired by commercial trackers (Profound, Otterly, AthenaHQ) but org-internal — every result also feeds the topic queue ([PR 3g](./3g-topic-queue.md)) as a content-gap signal.

## 2. Non-goals

- ❌ Multi-language prompts (English only; defer)
- ❌ Real-time ranking — weekly cadence is sufficient and cost-controlled
- ❌ Adversarial prompt-injection probing (separate red-team workstream)
- ❌ Backfilling rank from before this PR ships
- ❌ Replacing commercial trackers — for *our* products only
- ❌ Non-allowlisted providers (no Mistral / DeepSeek / Cohere in v1)

## 3. Dependencies

Files the executor MUST read:

- [`packages/llm/src/index.ts`](../../../packages/llm/src/index.ts) — `complete()`, `LLMEnv`, tier routing; reuse Anthropic path, add HTTP clients for OpenAI/Gemini/Perplexity
- [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) — pattern for new event names
- [`docs/marketing/CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps), [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) — LLM cost budget + cap headroom per cell
- [`docs/marketing/ESCALATION_TIERS.md §6`](../ESCALATION_TIERS.md#6-special-escalations) — rank-drop alert routing
- [`docs/marketing/icp/selfprime-practitioner.md §3.2`](../icp/selfprime-practitioner.md#32-earned) — earned channel context
- [`docs/runbooks/add-new-app.md`](../../runbooks/add-new-app.md) — rate-limiter registry; **1009** taken by [PR 3e marketing-supervisor](./3e-supervisor-worker.md); this PR claims **1010**
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints (no `process.env`, no Node built-ins, ESM, Workers only, no `*.workers.dev` user-facing)

## 4. Migrations

```sql
-- 001_llm_rank_history.sql
CREATE TABLE IF NOT EXISTS llm_rank_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL DEFAULT 'lwt-internal',
  cell_key          TEXT NOT NULL,
  prompt_id         TEXT NOT NULL,                  -- stable slug from YAML
  prompt_text       TEXT NOT NULL,                  -- snapshot at query time
  provider          TEXT NOT NULL
                      CHECK (provider IN ('openai', 'anthropic', 'gemini', 'perplexity')),
  model             TEXT NOT NULL,
  brand_mentions    JSONB NOT NULL DEFAULT '[]',    -- [{brand, position, sentiment, context}]
  raw_response      TEXT NOT NULL,                  -- full LLM response for audit
  response_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(8, 4) NOT NULL DEFAULT 0,
  queried_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  week_start        DATE NOT NULL                   -- Monday of the queried week (for rollups)
);

CREATE INDEX idx_llm_rank_cell_week ON llm_rank_history (cell_key, week_start DESC);
CREATE INDEX idx_llm_rank_prompt    ON llm_rank_history (prompt_id, week_start DESC);
CREATE INDEX idx_llm_rank_provider  ON llm_rank_history (provider, queried_at DESC);

-- brand_mentions GIN for sentiment + brand queries
CREATE INDEX idx_llm_rank_mentions_gin ON llm_rank_history USING GIN (brand_mentions);

ALTER TABLE llm_rank_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY llm_rank_tenant_isolation ON llm_rank_history
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK:
-- DROP POLICY llm_rank_tenant_isolation ON llm_rank_history;
-- ALTER TABLE llm_rank_history DISABLE ROW LEVEL SECURITY;
-- DROP INDEX idx_llm_rank_mentions_gin;
-- DROP INDEX idx_llm_rank_provider;
-- DROP INDEX idx_llm_rank_prompt;
-- DROP INDEX idx_llm_rank_cell_week;
-- DROP TABLE llm_rank_history;
```

## 5. API shape

```ts
// apps/llm-rank-worker/src/types.ts

/** A single prompt definition loaded from YAML. */
export interface RankPrompt {
  /** Stable slug; never changes once a prompt is in production. */
  id: string;
  /** Matrix cell this prompt is associated with. */
  cellKey: string;
  /** The prompt text sent verbatim to every provider. */
  text: string;
  /** Brands to track in responses. Case-insensitive substring match. */
  trackBrands: string[];
}

/** A single brand mention parsed out of an LLM response. */
export interface BrandMention {
  brand: string;
  /** 1-based position in a numbered list, or `null` if mentioned in prose. */
  position: number | null;
  /** Sentiment classification of the surrounding clause. */
  sentiment: 'positive' | 'neutral' | 'negative';
  /** ≤200 char surrounding context for audit. */
  context: string;
}

export type RankProvider = 'openai' | 'anthropic' | 'gemini' | 'perplexity';

export interface RankResult {
  promptId: string;
  cellKey: string;
  provider: RankProvider;
  model: string;
  mentions: BrandMention[];
  rawResponse: string;
  tokens: number;
  costUsd: number;
}
```

```ts
// apps/llm-rank-worker/src/index.ts

/** Cron entrypoint — runs weekly Monday 09:00 UTC. */
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) { ... },
  async fetch(req: Request, env: Env): Promise<Response> { ... }   // /health + manual /run
};

/** Query one (provider, prompt) pair and return parsed mentions. */
export async function queryRank(
  prompt: RankPrompt,
  provider: RankProvider,
  env: Env,
): Promise<RankResult>;

/** Parse brand mentions out of a raw LLM response using an LLM-driven classifier
 *  (Anthropic Haiku via `@lwt/llm` tier='fast'). Returns up to 20 mentions. */
export async function parseBrandMentions(
  rawResponse: string,
  trackBrands: string[],
  env: Env,
): Promise<BrandMention[]>;

/** Compute WoW rank-change deltas; called inside the cron after writes. */
export async function detectRankDrops(
  db: FactoryDb,
  weekStart: Date,
): Promise<Array<{ cellKey: string; brand: string; deltaPct: number }>>;

/** Compute content-gap signals for the topic queue. */
export async function emitGapSignals(
  db: FactoryDb,
  weekStart: Date,
  emit: (signal: TopicGapSignal) => Promise<void>,
): Promise<void>;
```

### Provider client strategy

| Provider | Transport | Auth | Model used | Why |
|---|---|---|---|---|
| Anthropic | `@lwt/llm` `complete({ tier: 'balanced' })` | `ANTHROPIC_API_KEY` via AI Gateway | `claude-sonnet-4-6` | Already integrated, AI-Gateway audited |
| OpenAI | Raw `fetch` to `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` | `gpt-4o` | No Worker-safe SDK; Hono + fetch is standard per [`CLAUDE.md`](../../../CLAUDE.md) |
| Gemini | Raw `fetch` to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` | `GEMINI_API_KEY` | `gemini-2.5-pro` | Direct API key path (separate from Vertex token path in `@lwt/llm`) |
| Perplexity | Raw `fetch` to `https://api.perplexity.ai/chat/completions` | `PERPLEXITY_API_KEY` | `sonar` | OpenAI-compatible payload shape |

All four clients use `withRetry` from [`@lwt/errors`](../../../packages/errors/) and abort after 30s.

### Prompt configs

Live at `docs/marketing/llm-rank-prompts/{cell}.yaml`. Example:

```yaml
# docs/marketing/llm-rank-prompts/selfprime-practitioner.yaml
prompts:
  - id: best-hd-tool-practitioner
    cell_key: selfprime-practitioner
    text: "What's the best Human Design app for a working practitioner who reads charts professionally?"
    track_brands: [Selfprime, Jovian Archive, Genetic Matrix, MyBodyGraph]
  - id: chart-prep-workflow
    cell_key: selfprime-practitioner
    text: "I'm an astrology practitioner. What tools do you recommend to speed up client chart prep?"
    track_brands: [Selfprime, TimePassages, Solar Fire, Astro.com, Janus]
```

Target volume: ~30 prompts total at launch (8–12 per active cell × 3–4 active cells).

### Cost envelope

| Item | Monthly |
|---|---:|
| 30 prompts × 4 providers × ~1k in/out tokens weekly | ~$2–6 |
| Parse step (120 Haiku calls/wk × ~500 tokens) | ~$0.20 |
| Retry + new-prompt headroom | ~$15 |
| **Budget envelope** | **≤$25/mo** |

Charged against a new `llm-rank` channel in [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) — $5/mo per cell, $25/mo org ceiling. Tier-3 if breached.

## 6. Test plan

- **Unit tests** (Vitest, ≥90% lines):
  - `parseBrandMentions` extracts brand/position/sentiment from numbered-list response; returns `position: null` for prose-only; case-insensitive; capped at 20
  - `queryRank` returns normalised `RankResult` per provider (mocked fetch); honours 30s abort signal
  - `detectRankDrops` flags brands whose mention rate dropped >25% WoW
  - `emitGapSignals` produces one signal per (cell, prompt) where Selfprime is missing from all 4 providers
- **Integration tests** (`@cloudflare/vitest-pool-workers`):
  - Cron handler writes ≥1 row per (prompt × provider); RLS isolation works; budget cap refuses spend over per-cell envelope
- **Cost test:** dry-run mode (mocked providers) reports projected weekly cost ≤$2

## 7. Verification

After deploy to staging (worker name: `llm-rank-worker`, custom domain TBD per [`docs/service-registry.yml`](../../service-registry.yml) — never expose `.workers.dev` per [`CLAUDE.md`](../../../CLAUDE.md)):

```bash
# Health check
curl https://llm-rank-worker.adrper79.workers.dev/health
# Expect: 200 with {"status":"ok","lastRunAt":"...","promptCount":30}

# Manual one-prompt run (admin auth)
curl -X POST https://llm-rank-worker.adrper79.workers.dev/run \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"promptId":"best-hd-tool-practitioner","providers":["anthropic"]}'
# Expect: 200 with RankResult; mentions array populated

# Verify row written
psql $STAGING_DATABASE_URL -c \
  "SELECT provider, jsonb_array_length(brand_mentions) AS n
   FROM llm_rank_history
   WHERE prompt_id='best-hd-tool-practitioner'
   ORDER BY queried_at DESC LIMIT 1;"
# Expect: provider=anthropic, n≥0

# Full cron dry-run (no DB writes)
curl -X POST https://llm-rank-worker.adrper79.workers.dev/run?dryRun=true \
  -H "Authorization: Bearer $WORKER_API_TOKEN"
# Expect: 200 with summary {prompts:30, providers:4, projectedCostUsd:<2}
```

## 8. Acceptance criteria

- [ ] Migration applies + idempotent; RLS verified
- [ ] All 4 provider clients implemented with retry + 30s abort
- [ ] Brand-mention parser uses `@lwt/llm` `tier: 'fast'` (Haiku) — no manual regex parsing
- [ ] Cron handler runs Monday 09:00 UTC; idempotent if re-invoked same week
- [ ] Rank-drop emits Tier-2 escalation per [`ESCALATION_TIERS.md §2`](../ESCALATION_TIERS.md#2-the-three-tiers) when WoW mention rate drops >25%
- [ ] Gap-signal emitter writes to PR 3g topic queue when Selfprime missing across all 4 providers
- [ ] Cost stays ≤$25/mo (verified via dry-run report); budget check refuses spend past per-cell `llm-rank` cap → Tier-3
- [ ] Test coverage ≥90% lines, ≥85% branches; zero `any`; no `console.*`; no `process.env`
- [ ] `/health` returns 200 via `curl` in staging (per [`CLAUDE.md`](../../../CLAUDE.md) Verification Requirement)
- [ ] Worker registered in [`docs/service-registry.yml`](../../service-registry.yml) with custom domain; rate-limiter ID `1010` claimed
- [ ] `BUDGET_CAPS.md` updated with `llm-rank` channel lines per cell

## 9. File list

```
apps/llm-rank-worker/
  src/
    index.ts                       # Worker entry (cron + /health + /run)
    providers/{anthropic,openai,gemini,perplexity}.ts   # one per provider
    parse-mentions.ts              # LLM-driven brand parser (Haiku)
    rank-drops.ts                  # WoW delta detection
    gap-signals.ts                 # topic-queue emission
    prompts.ts                     # YAML loader (bundled)
    budget-check.ts                # per-cell envelope from BUDGET_CAPS
    types.ts
  test/{parse-mentions,rank-drops,providers,integration}.test.ts
  migrations/001_llm_rank_history.sql
  wrangler.jsonc                   # cron + bindings (no .workers.dev exposed)
  package.json · tsconfig.json

docs/marketing/llm-rank-prompts/
  {selfprime-practitioner,selfprime-consumer,cypher-seeker,xicocity-creator}.yaml
  README.md                        # prompt-curation discipline
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| LLM responses non-deterministic — WoW noise looks like a rank drop | Smooth with rolling 3-week median; alert only when delta exceeds 2σ |
| Provider TOS — automated querying may violate consumer scraping rules | API access only (not web scraping); each provider's API terms permit programmatic queries; audited at PR review |
| Provider outage skews dataset | Per-provider rows independent; missing-week comparison uses last successful run, not calendar week |
| Cost spike | Per-cell budget cap + dry-run report on every cron; hard cap = pause + Tier-3 |
| Parser hallucinates positions | `tier:'fast'` (Haiku) with structured-output prompt; `assertGrounding` from [`@lwt/llm`](../../../packages/llm/src/index.ts) verifies brand names appear in raw response |
| New prompts skew historical comparison | `prompt_id` immutable; new prompts get fresh slugs and fresh series |
| Operator noise from rank fluctuations | 2σ threshold; weekly digest only — no per-prompt Pushover |

## 11. Cross-references

- [`ROADMAP.md`](../ROADMAP.md), [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps), [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) — budget context; this PR adds `llm-rank` channel
- [`ESCALATION_TIERS.md §2`](../ESCALATION_TIERS.md#2-the-three-tiers) — Tier-2 rank-drop routing
- [`icp/selfprime-practitioner.md §8`](../icp/selfprime-practitioner.md#8-what-we-dont-know-yet-autonomous-system-commitments-to-learn) — drives the learning question
- [PR 3g brief](./3g-topic-queue.md) — consumes gap signals
- [`packages/llm/src/index.ts`](../../../packages/llm/src/index.ts) · [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) — extend with `marketing.llm_rank.*` events
- [`docs/runbooks/add-new-app.md`](../../runbooks/add-new-app.md) · [`docs/service-registry.yml`](../../service-registry.yml) · [`CLAUDE.md`](../../../CLAUDE.md)
