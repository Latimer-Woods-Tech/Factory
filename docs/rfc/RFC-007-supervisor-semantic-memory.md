# RFC-007: Supervisor semantic memory (template recall + episodic learning)

## Metadata

```
RFC Number:     RFC-007
Title:          Supervisor semantic memory (template recall + episodic learning)
Author:         adrper79-dot
Date Filed:     2026-06-16
Status:         draft
Target Ship:    Phased — Phase 0–1 shippable now (no external dependency)
Updated:        2026-06-16 — initial draft from Neon/agentic-memory audit
```

Tracks: agentic-memory audit 2026-06-16 · supersedes the parked `SUP-3.5` note in
[`apps/supervisor/src/planner/match.ts`](../../apps/supervisor/src/planner/match.ts#L15) ·
complements (does not replace) [RFC-005 Dreaming pilot](./RFC-005-anthropic-dreaming-pilot.md)

---

## 1. Problem Statement

The supervisor is the platform's highest-leverage agent — every approved issue is triaged
through it ([`supervisor.do.ts → handleScheduled`](../../apps/supervisor/src/supervisor.do.ts#L288)).
Its "memory" today is **not semantic**:

1. **Template matching is keyword/regex only.**
   [`matchTemplate`](../../apps/supervisor/src/planner/match.ts#L31) scores a `trigger_keywords`
   hit-ratio plus structured `title_pattern`/`body_patterns` regex. A paraphrased issue that
   uses none of a template's literal keywords scores 0 and gets labelled
   `supervisor:no-template` — a silent miss that routes work to a human that a template could
   have handled.

2. **There is no episodic recall.** The supervisor writes terminal outcomes to D1
   (`supervisor_runs`, `template_stats` with `runs_merged`/`runs_reverted`/`blessed_at`) but
   has no way to ask *"have we seen an issue like this before, and how did it go?"* The
   [`memory` table](../../apps/supervisor/src/memory/d1.ts) is a plain key/value store
   (exact-key + prefix `LIKE`). This is exactly the **LEARN** step that
   [RFC-006](./RFC-006-automation-flow-operating-model.md) and the Platform Brain loop flag as
   unbuilt (P5).

3. **The planned fix has been parked indefinitely on a dependency that never shipped.**
   `match.ts:15` says *"replace keyword scoring with embedding similarity once
   `@latimer-woods-tech/llm` supports embeddings (0.4.x)."* The package is now at **0.4.4 and
   still exports no embeddings API**, so SUP-3.5 has stalled. Meanwhile **zero `VECTORIZE`
   bindings are deployed anywhere** on the platform — the only embedding work in flight is
   capricast video-recommendation (`video_embedding_jobs`, PR #617), which is the *lowest*
   agentic-leverage target.

**Relationship to RFC-005.** RFC-005 (Dreaming) is *offline, cross-session consolidation* gated
on Anthropic research-preview access (blocked). This RFC is the *online, in-platform, ship-now
retrieval substrate*. They are complementary: semantic memory is the store Dreaming would later
write consolidated lessons **into**. We should not wait on RFC-005 to get retrieval.

**Business value.** (a) Fewer false `no-template` routes → less CODEOWNER fatigue and more
autonomous coverage (the Autonomy Principle). (b) Plans carry "similar past incidents and their
outcomes," so reviewers approve/reject with history in hand and the loop stops repeating
reverted approaches. (c) Removes a self-imposed block on an already-designed feature.

---

## 2. Proposed Solution

### 2.1 Core approach

Give the supervisor a **vector-backed semantic memory** with two responsibilities, layered on
top of — never replacing — the existing deterministic machinery:

- **Template recall:** an additive similarity signal in `matchTemplate` that catches
  paraphrased issues the keyword/regex floor misses.
- **Episodic recall (LEARN):** embed every terminal run (`issue → template → outcome`) and, on
  each new issue, surface the *k* nearest past incidents **as advisory context** in the plan
  comment and in confidence scoring.

### 2.2 Storage: Cloudflare Vectorize (binding-native)

Use **Cloudflare Vectorize**, bound the same way D1/DO already are. Two indexes:

| Index | Contents | Lifecycle |
|---|---|---|
| `supervisor-templates` | one vector per template (id, tier, keywords-as-text) | rebuilt when templates regenerate |
| `supervisor-incidents` | one vector per terminal run | append-only; written on each run |

Metadata stored per incident vector: `{ template_id, template_version, tier, outcome:
passed|failed_execution|failed_verification|merged|reverted, run_id, pr_url, model_version,
embedded_at }`. **No raw issue body** is stored in metadata — only the bounded text needed for
recall is embedded, and only structured fields are persisted (see §5 PII).

> Why not pgvector / Neon? The supervisor is a **pure D1 + Durable Object worker** — it holds
> no Neon/Hyperdrive binding. Adding pgvector would mean introducing a Neon dependency into a
> worker that deliberately has none, breaking its isolation. Vectorize is the cohesive,
> Workers-native choice and reuses the pattern capricast is already standing up. See §6.

### 2.3 Embeddings: add `embed()` to `@latimer-woods-tech/llm`

Do **not** keep waiting on a phantom 0.4.x API, and do **not** call `env.AI` directly from app
code (that would violate the standing rule *"all LLM calls go through
`@latimer-woods-tech/llm`"*). Instead, **add the missing capability where it belongs:**

```ts
// packages/llm/src/embed.ts
export async function embed(
  ai: Ai,                         // Workers AI binding (env.AI), injected — no vendor SDK import
  input: string | string[],
  opts?: { model?: EmbeddingModel },
): Promise<{ vectors: number[][]; model: string; dims: number }>;

export const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'; // 768-dim, pinned
```

`bge-base-en-v1.5` (768-dim) matches what capricast uses, so the platform has one embedding
standard. The model id is pinned and recorded with every vector (`model_version`) so a future
model swap triggers a controlled re-embed rather than silently poisoning similarity.

### 2.4 Matcher integration — additive, deterministic floor preserved

`matchTemplate` keeps all three existing signals as the **floor**. We add **Signal 4** behind a
flag:

```
score += SEMANTIC_WEIGHT * cosineSimilarity(issueVec, templateVec)   // only when >= SIM_FLOOR
```

Invariants that keep this cohesive with the current design:
- The deterministic signals can **never be regressed**: any match the keyword/regex floor makes
  today still matches. Signal 4 can only *promote* a borderline candidate, never demote a
  deterministic hit.
- If Vectorize or AI is unavailable, Signal 4 contributes 0 and the matcher behaves exactly as
  today (mirrors the existing `.catch(() => null)` resilience throughout the DO).

### 2.5 Episodic recall respects the gate model

Recall is **advisory only**. The green/yellow/red tiers and plan-approval flow
([`handleScheduled`](../../apps/supervisor/src/supervisor.do.ts#L403)) are untouched. Similar
incidents are rendered into the plan comment, e.g.:

```
🧠 Semantic memory — 2 similar past incidents:
   • #1487 (template hd-cache-invalidate) → merged, no revert
   • #1209 (template hd-cache-invalidate) → REVERTED after 3 days  ⚠
```

A nearby **reverted** incident can raise the routing tier (e.g. green→yellow, forcing plan
approval) but can **never** lower one or auto-execute. Semantic memory informs humans and
confidence; it does not bypass approval.

### 2.6 Write path: queue-backed incident ingestion (not `.catch()`-and-pray)

The episodic **write** (embed + Vectorize upsert on each terminal run) is a side effect that must
**never block or fail a run** — but a naive best-effort `.catch(() => null)` *silently drops* the
incident, and the slow lane rots without anyone noticing. We use a **Cloudflare Queue** instead,
matching the producer/consumer/DLQ pattern already proven in capricast (`capricast-export-queue`)
and lead-gen (`factory-lead-gen-queue`):

```
handleRun (terminal) ──produce──▶ supervisor-incident-queue ──consume(batch)──▶ embed() + Vectorize.upsert
                                                                   │ retries: 3
                                                                   ▼ on exhaustion
                                                          supervisor-incident-dlq  (inspect/replay)
```

Why a queue beats best-effort for this specific write:
- **Non-blocking + durable.** `handleRun` produces a tiny `{ run_id, issue_ref, template_id,
  outcome }` message in microseconds and returns. The run never waits on — or fails because of —
  embedding. (Fast-lane guarantee, §11.)
- **Retry, not silent loss.** A transient Workers-AI/Vectorize hiccup is retried (`max_retries:
  3`); a poison message lands in the DLQ for inspection instead of vanishing.
- **Built-in rate-limiting.** `max_batch_size` throttles Workers-AI embed calls so the write path
  can't 429 itself — the same mechanism makes the **Phase 3 backfill** safe (drain history through
  the queue rather than a hot loop that trips AI rate limits).

The consumer is a `queue()` handler exported from the supervisor worker alongside `fetch()` and
`scheduled()`. Queue bindings (producer + consumer + DLQ) go in
[`wrangler.jsonc`](../../apps/supervisor/wrangler.jsonc) **both top-level and under
`env.production`** — same non-inheritance trap the file already documents for `vars`/`d1_databases`.

> **Template recall reads stay synchronous.** Only the *write* lane is queued. Query-time recall
> (`queryNearest`) is an inline, time-budgeted, never-throw read (§11 slow lane) — a queue there
> would add latency for no benefit.

---

## 3. Phases

- **Phase 0 — Foundations** (no external dependency; ship now).
  - Add `embed()` to `@latimer-woods-tech/llm` (+ unit tests with a mocked `Ai` binding).
  - Provision the two Vectorize indexes; add `AI`, `VECTORIZE_TEMPLATES`, `VECTORIZE_INCIDENTS`
    bindings to [`wrangler.jsonc`](../../apps/supervisor/wrangler.jsonc) **both top-level and
    under `env.production`** (named environments do not inherit bindings — the documented trap
    that left `FACTORY_CORE_API_URL` dormant). Extend the `Env` interface in
    [`index.ts`](../../apps/supervisor/src/index.ts).
  - New `src/memory/vector.ts`: best-effort `embedAndUpsert()` / `queryNearest()` helpers that
    **never throw** (same contract as `writeMemory`).
  - **Exit:** `embed()` unit-tested; both indexes queryable from a deployed `/health` probe.

- **Phase 1 — Template recall in shadow mode.**
  - Embed the template corpus at build time (extend the
    [`templates.generated`](../../apps/supervisor/src/planner/templates.generated.ts) step).
  - Add Signal 4 to `matchTemplate`, gated by `SUPERVISOR_SEMANTIC_MODE=shadow`: compute the
    semantic match, **log** it alongside the deterministic result, but route on the
    deterministic result only. Surface agreement metrics in `/aos/status`.
  - Stand up an nDCG@5 relevance eval reusing capricast's
    `semantic-relevance-evaluation.mjs` harness (cosine + nDCG already implemented there).
  - **Exit:** nDCG@5 ≥ 0.80 on a labelled fixture of past issues→templates; **zero**
    deterministic regressions across the existing matcher test suite.

- **Phase 2 — Template recall live + advisory incident recall.**
  - Flip `SUPERVISOR_SEMANTIC_MODE=live`: Signal 4 now promotes matches.
  - On each issue, `queryNearest()` the incident index and render "similar past incidents" into
    the plan comment; apply the revert-aware tier bump (§2.5).
  - **Exit:** measured drop in `supervisor:no-template` rate; reviewers see recall context on
    real plans.

- **Phase 3 — Episodic write-back (close the loop), queue-backed (§2.6).**
  - Provision `supervisor-incident-queue` + `supervisor-incident-dlq`; add producer + consumer +
    DLQ bindings to `wrangler.jsonc` (top-level **and** `env.production`).
  - On every terminal run in [`handleRun`](../../apps/supervisor/src/supervisor.do.ts#L658),
    **produce** a `{ run_id, issue_ref, template_id, outcome }` message (non-blocking) instead of
    embedding inline.
  - Add the `queue()` consumer handler: batch-embed via `embed()` and upsert into
    `supervisor-incidents`, writing the `incident_embeddings` provenance row; retries + DLQ.
  - One-time backfill over existing `supervisor_runs` by **enqueuing** rows (drains through the
    rate-limited consumer — no hot-loop 429s).
  - **Exit:** incident index reflects real history; DLQ empty under normal operation; recall draws
    on it.

- **Phase 4 — (optional) bridge to RFC-005.** When/if Dreaming access lands, Dreaming writes
  consolidated lessons into `supervisor-incidents` instead of a flat memory file. No rework —
  the store already exists.

---

## 4. Data model & provenance

- **Vectorize** holds the vectors + structured metadata (§2.2).
- A small **D1 ledger** `incident_embeddings (run_id PK, model_version, dims, embedded_at)` in
  the existing `MEMORY` database tracks what has been embedded — so backfills are idempotent and
  a model swap can find the rows needing re-embed (mirrors the `schema_version` provenance
  pattern from ADR-003). The consumer writes this row in the same batch it upserts the vector;
  the producer checks it to avoid re-enqueuing already-embedded runs (idempotent backfill).
- **Cloudflare Queues** carry the write lane: `supervisor-incident-queue` (producer in
  `handleRun`, consumer in the worker's `queue()` handler, `max_batch_size` ~10, `max_retries` 3)
  + `supervisor-incident-dlq`. Messages hold structured refs only — **no raw issue body** (§5 PII).

---

## 5. Cohesion, guardrails & failure modes

- **Determinism floor (§2.4):** semantic is purely additive; deterministic behaviour is a
  regression test, not a hope.
- **Gate-respecting (§2.5):** advisory only; never auto-executes or lowers a tier.
- **Best-effort everywhere:** every embed/upsert/query is wrapped to never block or fail a run,
  matching the DO's existing `.catch()` discipline.
- **Model pinning:** `model_version` on every vector; a swap is a deliberate re-embed.
- **PII:** issue bodies may contain secrets. We embed `title + body.slice(0, 500)` (the bound
  `handleScheduled` already uses) and persist **no** raw body in Vectorize metadata.
- **Cost:** Vectorize ≈ $0.04/100M queried dims + ~$0.05/100M stored dims·mo; Workers AI
  embeddings are pennies at this volume — low single-digit $/mo total (see the 2026-06-16 audit;
  contrast with the rejected MongoDB-on-GCP-VM at +$25–60/mo fixed).
- **Rollout flag:** `SUPERVISOR_SEMANTIC_MODE = off | shadow | live`, default `off`, set
  per-environment (named-env vars do not inherit — set it under `env.production.vars`).

---

## 6. Alternatives considered

| Option | Verdict |
|---|---|
| **pgvector on Neon** | ❌ Adds a Neon/Hyperdrive dependency to a pure-D1+DO worker, breaking its isolation. Fine for selfprime (single Neon DB) — out of scope here. |
| **D1 brute-force cosine** | 🟡 Acceptable *fallback* for the tiny template corpus; ❌ for incidents (unbounded growth, full-scan per query). |
| **Wait for `@latimer-woods-tech/llm` 0.4.x embeddings** | ❌ Never shipped (still absent at 0.4.4). Building `embed()` ourselves *is* delivering that API. |
| **Call `env.AI` directly in the supervisor** | ❌ Violates "all LLM calls go through the llm package." Route through `embed()` instead. |
| **External vector DB / Mongo Atlas Vector Search** | ❌ Off-platform, egress + ops burden, no Hyperdrive equivalent — same conclusion as the 2026-06-16 datastore analysis. |
| **Inline `.catch()` embed on the write path (no queue)** | ❌ Non-blocking but *silently lossy* — a transient AI/Vectorize error drops the incident forever and rots the slow lane; also no rate-limit control for backfill. Queue gives the same non-blocking property **plus** retries + DLQ + batching (§2.6). |
| **Queue the read/recall path too** | ❌ Recall must be synchronous to inform the plan in-flight; a queue adds latency for no durability benefit. Only the write lane is queued. |

---

## 7. Observability & testing

- **`/aos/status`** gains a `semantic` block: index sizes, `model_version`, shadow-mode
  agreement %, last embed latency, **incident-queue depth + DLQ count** (a non-zero DLQ is the
  signal that the slow lane's write path needs attention).
- **Tests:** `embed()` unit tests (mocked `Ai`, deterministic vectors); additive-signal matcher
  tests proving no deterministic regression; nDCG eval wired into CI (reused harness);
  integration test for shadow-mode logging.

---

## 8. File touch list (implementation map)

```
packages/llm/src/embed.ts                         # new — embed() over Workers AI binding
packages/llm/src/index.ts                         # export embed, DEFAULT_EMBEDDING_MODEL
apps/supervisor/wrangler.jsonc                    # +AI, +2 Vectorize, +queue producer/consumer/DLQ (top-level AND env.production)
apps/supervisor/src/index.ts                      # Env: AI, VECTORIZE_*, INCIDENT_QUEUE, SUPERVISOR_SEMANTIC_MODE; export queue() handler
apps/supervisor/src/memory/vector.ts              # new — embedAndUpsert / queryNearest (never-throw)
apps/supervisor/src/planner/match.ts              # Signal 4 (additive, flag-gated); delete the SUP-3.5 TODO
apps/supervisor/src/planner/templates.generated.* # build step embeds the template corpus
apps/supervisor/src/supervisor.do.ts              # handleScheduled: incident recall→plan comment; handleRun: produce incident message
apps/supervisor/src/learn.ts                      # new — queue consumer: batch embed+upsert+ledger on terminal run; backfill enqueuer
apps/supervisor/migrations/NNN_incident_embeddings.sql  # D1 provenance ledger
apps/supervisor/test/semantic-*.{test.ts,mjs}     # nDCG eval + matcher regression + embed unit
docs/rfc/RFC-007-supervisor-semantic-memory.md    # this file
```

---

## 9. Decisions (ADR-style, load-bearing)

1. **Vectorize, not pgvector or an external store** — preserves the supervisor's D1+DO
   isolation and reuses the platform's emerging embedding standard. (§2.2, §6)
2. **Embeddings live in `@latimer-woods-tech/llm` via the Workers AI binding** — honours the
   "LLM calls go through the package" boundary and unblocks SUP-3.5 without an external
   dependency. (§2.3)
3. **Semantic is additive and advisory** — deterministic matching is the floor; recall informs
   humans and confidence but never bypasses the green/yellow/red gates. (§2.4, §2.5)
4. **The episodic write lane is queue-backed, not best-effort** — a Cloudflare Queue +DLQ makes
   the write non-blocking *and* durable (retry instead of silent loss) and rate-limits the embed
   step; recall reads stay synchronous. (§2.6, §11)

---

## 10. Open questions

- Single multi-tenant Vectorize index with a `kind` metadata filter vs. two indexes? Drafted as
  two for clean lifecycle separation; revisit if index-count limits bite.
- Backfill scope: all historical `supervisor_runs`, or only `blessed`/`reverted` outcomes (the
  highest-signal ones)? Lean toward the latter first.
- Should the revert-aware tier bump (§2.5) be a hard rule or a per-template policy?
```

---

## 11. Memory tier architecture (fast lane / slow lane)

The design constraint: **every memory type has a fast lane and a slow lane.** The fast lane is
synchronous, deterministic, and must-succeed — it *makes the decision*. The slow lane is
asynchronous, approximate, and best-effort — it *informs the decision* and may be absent without
consequence. The slow lane can **never block, fail, or demote** the fast lane.

| Memory type | **Fast lane** (synchronous · deterministic · routes the decision) | **Slow lane** (async · semantic · advisory only) |
|---|---|---|
| **Working** | DO in-memory state — in-process, microseconds | *(none needed)* |
| **Procedural** (templates) | D1 k/v + keyword/regex `matchTemplate` (the §2.4 floor) | Vectorize `supervisor-templates` cosine recall — **read**, time-budgeted, never-throw (Signal 4) |
| **Episodic** (runs) | D1 `supervisor_runs` / `template_stats` exact lookup | Vectorize `supervisor-incidents` similarity recall — **read** inline; **write** via queue+DLQ (§2.6) |
| **Institutional** (runbooks/lessons) | human grep of `lessons-learned.md` | *(future — opportunity A: same Vectorize fabric, out of scope here)* |

**Lane contract (the load-bearing invariant):**
- **Reads** on the slow lane are inline but **time-budgeted** (hard cap, e.g. ~200 ms) and wrapped
  to return empty on timeout/error — recall absent ⇒ route on the fast lane alone, exactly as today.
- **Writes** on the slow lane are **off the request path** (Queue, §2.6) — durable via retry+DLQ,
  never blocking a run.
- A slow-lane match can **promote** a borderline fast-lane candidate or **raise** a routing tier
  (green→yellow); it can never demote, lower a tier, or auto-execute.

This is the cache-aside contract: the fast lane is correct on its own; the slow lane only ever
makes it *smarter*, never *slower or wrong*.

---

## 12. Provisioning & release sequencing (readiness gaps closed)

Three things the phase list assumes but that are **not automatic** — pinned here so the push
doesn't stall mid-flight:

**(a) Resource provisioning is explicit, idempotent, one-time.** Run before the bindings deploy
(manual the first time; then encode in `deploy-supervisor.yml` as create-if-absent):
```
wrangler vectorize create supervisor-templates  --dimensions=768 --metric=cosine
wrangler vectorize create supervisor-incidents  --dimensions=768 --metric=cosine
wrangler queues    create supervisor-incident-queue
wrangler queues    create supervisor-incident-dlq
```
`--dimensions=768 --metric=cosine` **must** match `bge-base-en-v1.5`; a mismatch is rejected at
upsert, not at deploy. No new **secrets** are required — `AI`, Vectorize, and Queues are all
bindings, not API keys (a deliberate simplification vs. the GCP-secret matrix).

**(b) Template corpus is embedded in-worker, not at build time.** `embed()` needs the `Ai`
*binding*, which exists only inside a deployed Worker — the Node CI step that emits
`templates.generated.ts` cannot call it. Correct approach: a **post-deploy, idempotent
`ensureTemplateVectors()`** that embeds any template whose `id@version` is absent from
`supervisor-templates` (keyed by template id), triggered on first `/scheduled` tick or a
`POST /admin/reindex-templates` route. Re-embeds only on template regeneration. (Supersedes the
"embed at build time" wording in Phase 1.)

**(c) `@latimer-woods-tech/llm` release is the critical-path gate.** `embed()` is inert until the
package is **published with `dist/`** and the supervisor consumes the new version. Sequence:
1. Add `embed()` + tests → bump `llm` (minor, e.g. `0.5.0`) → publish via the **fixed** publish
   pipeline, and **`npm pack`-inspect the tarball for `dist/embed.*`** before trusting it (the
   `constellation@0.1.0` empty-publish failure mode — publish.yml not building the target package).
2. Bump the supervisor's dependency **and lockfile** to the new version (single lockfile here, no
   dual-lockfile trap — but verify `npm ls @latimer-woods-tech/llm` resolves the new one).
3. Only then does Phase 0's `vector.ts` compile against a real `embed()`.

**Eval fixture is a deliverable, not a freebie.** Phase 1's `nDCG@5 ≥ 0.80` exit needs a
human-labelled `issue → correct-template` fixture (~30–50 historical issues). Building/labelling it
is a Phase 1 task, owned before the gate can be evaluated.
