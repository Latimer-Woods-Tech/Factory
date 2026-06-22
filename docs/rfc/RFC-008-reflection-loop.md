# RFC-008: Reflection Loop (synthesis → expression → learn — the "second brain" circuit)

## Metadata

```
RFC Number:     RFC-008
Title:          Reflection Loop (synthesis → expression → learn)
Author:         adrper79-dot
Date Filed:     2026-06-22
Status:         draft
Target Ship:    Phased — Phase 1 builds on RFC-007 Phase 3 (queue); Phases 2–4 net-new but small
Updated:        2026-06-22 — initial draft from the "second brain" infra audit
```

Builds directly on [RFC-007 Supervisor semantic memory](./RFC-007-supervisor-semantic-memory.md)
(the storage/recall substrate) · is the concrete implementation of the **LEARN (P5)** step that
[RFC-006](./RFC-006-automation-flow-operating-model.md) and the Platform Brain loop flag as unbuilt ·
complements [RFC-005 Dreaming pilot](./RFC-005-anthropic-dreaming-pilot.md) (offline consolidation).

---

## 1. Problem Statement

The Factory has a **second brain that captures and retrieves but does not think**. Every organ of
a knowledge system exists in the repo, but they are **disconnected islands** with no circulatory
system between them:

1. **Capture/store works.** `embed()` ([`packages/llm/src/embed.ts`](../../packages/llm/src/embed.ts),
   bge-base-en-v1.5, 768-dim), Vectorize indexes (`supervisor-templates`, `supervisor-incidents`),
   and `embedAndUpsert`/`queryNearest` ([`apps/supervisor/src/memory/vector.ts`](../../apps/supervisor/src/memory/vector.ts))
   are built. D1 holds `supervisor_runs`/`template_stats`; Neon holds `factory_events`; the agent
   keeps `MEMORY.md`; `scripts/generate_state.py` writes `docs/STATE.md`.

2. **Nothing flows *in*.** RFC-007 Phase 3 write-back (the `supervisor-incident-queue`) is not
   deployed and `SUPERVISOR_SEMANTIC_MODE` is `off`. Episodic recall is therefore read-only over an
   essentially empty incidents index. The stores never connect to each other.

3. **Nothing *reflects*.** The supervisor SENSEs → MODELs → EXECUTEs, but **LEARN is a stub**.
   No process reads *across* the stores and produces *new* understanding. Retrieval is lookup;
   it is not insight. Insight is an emergent property of **connection + synthesis**, and no
   component performs that synthesis.

4. **Expression emits data, not insight.** The twice-daily digest
   ([`apps/admin-studio/src/digest/`](../../apps/admin-studio/src/digest/)) collects raw
   GitHub/Sentry/Stripe/Supervisor numbers and renders them to email + ElevenLabs audio. It reports
   *what happened*; it never says *what it means* or *what is anomalous*.

5. **The human↔brain interface is a relay, not a connection.** The operator (and the agent) re-reads
   a flat `STATE.md` snapshot each session, acts, and writes a few facts back. There is no proactive
   surfacing, no feedback channel, and no shared synthesized memory — so the system never learns the
   operator's taste for what counts as insight, and continuity frays between sessions.

**In one line:** we have capture, storage, and a reporting channel, but no **reflection loop** that
connects the stores, synthesizes insight, expresses it proactively, and learns from the reaction.

## 2. Proposed Solution

A four-verb loop that **wires existing organs into a circuit**, gated end-to-end by a
`REFLECTION_MODE` flag (`off | shadow | live`) mirroring RFC-007's rollout discipline.

```
   CAPTURE ─┐
            ▼
        MEMORIZE ──▶ REFLECT ──▶ EXPRESS ──▶ (human)
            ▲                                    │
            └──────────── LEARN ◀──── FEEDBACK ──┘
```

### 2.1 MEMORIZE — connect the islands
A scheduled ingest embeds the day's knowledge into **one unified `factory-memory` Vectorize index**
(or a namespaced extension of `supervisor-incidents`), with rich metadata so it is filterable and
linkable:

- **Sources:** supervisor runs/outcomes (RFC-007 Phase 3 queue), merged PRs + issue closes
  (`factory_events`), Sentry incidents, governance decisions (`docs/decisions/*.md`), the agent
  memory facts (`MEMORY.md`), and `STATE.md` deltas.
- This is the **connection** the system lacks today: the islands become one searchable substrate.
- Reuses RFC-007's never-throw `embedAndUpsert`; this RFC's only new MEMORIZE work is widening the
  source set beyond supervisor incidents.

### 2.2 REFLECT — the synthesis pass (the new core)
A scheduled job that does **not** collect — it *thinks*:

1. Pull the recent window (e.g. last 24h / 7d) **plus its semantically-nearest historical
   neighbors** from `factory-memory` (`queryNearest`).
2. Run a bounded **reflection prompt** via `@latimer-woods-tech/llm`: *given these events and their
   historical neighbors, surface the non-obvious patterns, recurring root causes, contradictions
   with prior decisions, drift from stated plans, and emerging risks/opportunities.* Output a small,
   schema-bounded set of **Insight** records (§4.2), each with **evidence citations** (source memory
   IDs) and a **confidence**.
3. Write insights **back into `factory-memory`** as higher-order notes — so reflection compounds
   (reflections on reflections). This is the generative-agents reflection pattern and the literal
   LEARN step.

REFLECT is the difference between a filing cabinet and a mind. It runs nightly (synthesis) and
weekly (deeper cross-domain pass).

### 2.3 EXPRESS — upgrade the channel that already exists
Feed REFLECT's output into the **existing** digest/brief as a top-of-message
**"What this means / what you're not seeing"** section — citations + confidence, not raw metrics.
Same email, same ElevenLabs audio (so the operator can *listen* to synthesis on a walk), now
carrying understanding. High-confidence/high-urgency insights (a contradiction, an anomaly, a
budget breach) **interrupt** immediately via Slack/Pushover rather than waiting for the batch.

### 2.4 LEARN — close the loop
Operator reactions to insights (§5.3) become a signal that reweights future reflection: which
sources to trust, which patterns are noise, which are gold. This is what turns a generic RAG system
into *the operator's* second brain.

## 3. Phases

| Phase | Scope | Depends on |
|------|-------|-----------|
| **0** | `REFLECTION_MODE` flag; `factory-memory` index/namespace; `insights` D1 table (§4) | none |
| **1 — MEMORIZE** | Deploy RFC-007 Phase 3 queue; widen ingest to PRs/issues/decisions/`MEMORY.md`/`STATE.md` deltas | RFC-007 Phase 3 (queue + flag → `live`) |
| **2 — REFLECT** | Nightly + weekly reflection job; writes `Insight` records back to `factory-memory` + `insights` table. Runs in `shadow` first (write, don't surface) | Phase 1 |
| **3 — EXPRESS** | "Insights" section in digest/brief (text + audio); urgent-interrupt path via Slack/Pushover | Phase 2; existing digest |
| **4 — interface + LEARN** | Brain query mode (RAG over memory) in `/ai/chat`; Brain tab; one-tap feedback; feedback → reflection reweighting | Phases 2–3 |

Each phase is independently shippable and flag-gated; `shadow` (compute + log, do not surface)
precedes `live` at every step, matching RFC-007.

## 4. Data model

### 4.1 Memory record (Vectorize metadata)
```
{ id, vector,
  type: 'run'|'pr'|'issue'|'incident'|'decision'|'fact'|'state-delta'|'insight',
  source, sourceId, title, summary, occurredAt, links: string[], env? }
```

### 4.2 Insight record (`insights` D1 table + embedded into factory-memory)
```
{ id, createdAt, window: '24h'|'7d',
  kind: 'pattern'|'contradiction'|'root-cause'|'drift'|'risk'|'opportunity',
  statement, evidence: memoryId[],   -- grounding; no evidence ⇒ rejected
  confidence: number,                -- 0–1
  surfacedAt?, feedback?: 'useful'|'noise'|'wrong', feedbackAt? }
```

Insights with zero `evidence` are dropped at generation (anti-hallucination gate). Every surfaced
insight carries its citations so the operator can trace the claim to source memories.

## 5. Interface (how the operator lives in it)

Ordered **push-first** — insight you must ask for is just a search.

### 5.1 PUSH (it comes to you) — primary
- Morning/evening **digest + audio** carries the Insights section (existing channel).
- **Interrupts** for high-confidence/urgent insights via Slack/Pushover (existing webhook infra).

### 5.2 PULL (you interrogate it)
- A **Brain mode** in `/ai/chat` ([`apps/admin-studio/src/routes/ai.ts`](../../apps/admin-studio/src/routes/ai.ts)
  / `AiTab`): RAG over `factory-memory` instead of the current static `CONTEXT.md`+`STATE.md`
  snapshot — answers *"why did we decide X?"*, *"what recurs across Capricast and SelfPrime?"*,
  *"what did I say about pricing in April?"* with citations across time and projects.
- A **Brain tab** (or repurposed CommandCenter): a board of latest reflections, open
  contradictions, resurfaced notes, and the connection graph — not chat.

### 5.3 FEEDBACK (you teach it — what makes it *yours*)
- Every surfaced insight gets one tap: **useful / noise / wrong** — a link in email, a button in the
  tab, or a 👍/👎 reply to the digest. Writes `insights.feedback`; LEARN consumes it.

### 5.4 CAPTURE (you feed it)
- One low-friction door — reply to the digest, a Slack DM, or `/remember` in the tab — embedded into
  `factory-memory`. (Mirrors the agent's existing `/remember` pattern, now unified with the Factory brain.)

## 6. Cohesion, guardrails & failure modes

- **Anti-hallucination:** insights require ≥1 evidence citation or are dropped; surfaced insights
  always show citations + confidence. Reflection prompt is schema-bounded (forced structured output).
- **Never-throw:** ingest/reflect inherit RFC-007's never-throw, time-budgeted contracts; a failed
  reflection degrades the digest to today's data-only behaviour, never breaks it.
- **Cost cap:** reflection is one bounded LLM call per window (nightly/weekly), not per-event; routed
  through the AI Gateway with the cheap tier for synthesis. Embedding is Workers-AI (≈$0).
- **Privacy:** `factory-memory` is operator-internal; no end-user PII is embedded (sources are
  ops/engineering artifacts). DSR/PII rules from the privacy surface apply if that ever changes.
- **Drift:** operator corrections (§5.3/§5.4) are written as authoritative memories so the brain
  updates rather than compounding stale conclusions.

## 7. Alternatives considered

- **Bigger digest (more raw data).** Rejected — more reporting is not more insight; it worsens the
  signal problem.
- **Per-event reflection.** Rejected — cost-prohibitive and noisy; windowed batch reflection is the
  generative-agents-validated shape.
- **A standalone "brain" app.** Rejected — premature; the organs (embed, Vectorize, digest, `/ai/chat`)
  already live in-repo. This RFC wires them, not rebuilds them.
- **Wait for RFC-005 Dreaming.** Complementary, not blocking — Dreaming is offline consolidation; the
  Reflection Loop is the online synthesis→expression circuit and ships without external research access.

## 8. Observability & testing

- Shadow-mode metrics before `live`: insight count/window, citation coverage (must be 100%),
  operator feedback ratio (useful : noise) as the north-star quality signal.
- Unit tests: reflection prompt schema validation, evidence-gate (zero-evidence dropped), digest
  Insights-section render, feedback write path. Reuses the `worker.fetch` + real-JWT harness already
  used by the admin-studio route tests.

## 9. File touch list (implementation map)

- `apps/supervisor/wrangler.jsonc` — `supervisor-incident-queue` + DLQ bindings; flip `SUPERVISOR_SEMANTIC_MODE`; add `REFLECTION_MODE`.
- `apps/supervisor/src/memory/` — widen ingest sources; Phase 3 queue consumer (RFC-007).
- `apps/<brain-host>/src/reflect/` — new REFLECT job (nightly/weekly cron) + reflection prompt + `Insight` writer.
- `apps/admin-studio/src/digest/{collect,render}.ts` — query nearest insights; add Insights section (text + audio).
- `apps/admin-studio/src/routes/ai.ts` + `admin-studio-ui` AiTab — Brain (RAG) mode; new Brain tab; feedback endpoints.
- `migrations/` — `insights` D1 table; `incident_embeddings` ledger (RFC-007 §4).

## 10. Decisions (ADR-style, load-bearing)

1. **Reflection is windowed + scheduled, not per-event.** Cost + signal quality.
2. **Insights must be grounded (≥1 citation) or dropped.** Trust is the product.
3. **Express through the existing digest/audio, not a new channel.** The operator already lives there.
4. **Feedback is a first-class input, not a nicety.** It is the only thing that personalizes the brain.
5. **Flag-gated `off → shadow → live` at every phase.** No silent behavioural change in a prod loop.

## 11. Open questions

1. **Which app hosts REFLECT?** Supervisor (owns the memory substrate) vs admin-studio (owns the
   digest + `/ai/chat`). Leaning supervisor for MEMORIZE/REFLECT, admin-studio for EXPRESS/interface.
2. **One unified `factory-memory` index, or namespaces within `supervisor-incidents`?** Affects
   metadata-filter ergonomics and isolation.
3. **Reflection model tier** — cheap-tier synthesis is the default; does cross-domain weekly warrant
   a stronger model?
4. **Feedback granularity** — per-insight only, or also per-source trust weights surfaced to the operator?

---

> **Status note (2026-06-22):** the deploy-dependent steps (queue provisioning, flag flips) are
> currently gated behind the org-wide GitHub Actions spending cap; the design, schemas, and the
> REFLECT job + digest Insights section are buildable and testable locally ahead of that.
