# Factory Supervisor — Execution Tracker

> Mirror of the LatWood Operations board. Canonical operational truth is the board itself (`PVT_kwDOEL0sNc4BWWtg`). This file is narrative; board is state.

**Last updated:** 2026-05-06 ET · **Owner:** Adrian + Sauna · **Plan:** `ARCHITECTURE_PLAN_2026-05-02_SUPERVISOR_v2.1.md`

Live mirror of LatWood Operations board (`PVT_kwDOEL0sNc4BWWtg`). Kanban is operational truth; this is narrative truth. Sauna updates after every working session.

---

## Epics on board

| Epic | Issue | Gate to exit | Status |
|---|---|---|---|
| **SUP-0** Weekend kickoff | factory#94 | 1 verified selfprime conversion + GCP key rotated | 🟡 In progress |
| **SUP-1** Control plane primitives | factory#96 | 8/9 kanban→prod hands-off + Vertex proven | 🟡 In progress |
| **SUP-2** LLM substrate | factory#100 | Every org LLM call metered + gateway-routed | 🟡 In progress |
| **SUP-3** Capabilities + templates + scaffold | factory#103 | Supervisor compiles + runs fixture end-to-end | 🟢 Code complete (PRs #359, #360 — pending deploy) |
| **SUP-4** First supervised Green runs | (not yet filed) | 4 Green closures, 0 reverts, ≥2 new templates | — |
| **SUP-5** Yellow + Dreamstate + steady budget | (not yet filed) | Yellow-tier VK work under supervisor review | — |

---

## SUP-0 — This weekend (human-led)

Adrian owns. Sauna drafts migration PRs on request.

- [ ] ~~`SUP-0.1` (factory#95) — Rotate GCP SA key `factory-sa@factory-495015`~~ — **deferred to end of SUP-3 per Adrian** (single rotation cycle after `supervisor-sa` is minted and Vertex is wired; blast radius bounded to factory-495015 / xico-city). Issue still sits under SUP-0's sub-issue tree cosmetically (proxy strips DELETE bodies) but labels and priority reflect SUP-3.
- [ ] `SUP-0.2` (HumanDesign#65) — MIGRATION: apply pending migrations to prod Neon (Sentry 14×/day) — runbook ready at `file://session/hd-65-migration-runbook.md`. Column `psn.shared_at` defined in `081_session_handoff_tracking.sql`; prod just hasn't applied it. Your psql session, ~15 min. SUP-1.4 (factory#109) filed to prevent recurrence.
- [ ] `SUP-0.3` (HumanDesign#66) — MIGRATION: fix prepared-statement param-count mismatch (Sentry 18×/day) — **✅ PR #69 open, ready to review/merge.** Root cause: `QUERIES.getRecentReferrals` hardcoded `LIMIT 10` vs caller passing `[user.id, 30]`. One-line fix: `LIMIT 10` → `LIMIT $2`.
- [ ] `SUP-0.4` (HumanDesign#67) — Stripe funnel walk, verify one real checkout_session status=complete
- [ ] Install Stripe test-mode `rk_test_*` key (no issue — Adrian direct)

**Exit gate:** 1 verified real conversion on selfprime.

---

## SUP-1 — Week 1 (Mon onwards)

Split ownership: Adrian for UI-only (App install, Vertex enable), Sauna for everything else.

- [ ] `MA-4` (factory#82) — Path-scoped CODEOWNERS (Sauna drafts, Adrian reviews)
- [ ] `SUP-1.1` (factory#97) — Install factory-cross-repo App on `Latimer-Woods-Tech` org (Adrian UI)
- [ ] `SUP-1.2` (factory#98) — Enable Vertex AI API + mint `supervisor-sa` least-privilege (Adrian UI or Sauna if proxy auth works) — **Code ready**: `scripts/provision-vertex-ai-sa.sh` (gcloud steps 1–4) + `.github/workflows/verify-vertex-ai.yml` (step 5 test) + `docs/runbooks/rotate-gcp-sa.md`. **Pending Adrian**: run provision script + set `SUPERVISOR_VERTEX_SA_KEY` org secret + trigger verify workflow.
- [ ] `SUP-1.3` (factory#99) — `credential-scrub.yml` doc-lint workflow (Sauna drafts)

**Parallel work not on supervisor track but Week 1 safe:** VK-7 (videoking deploy.yml rewrite), any safe Dependabot minor/patch batch.

**Exit gate:** 8/9 kanban-to-prod runs hands-off for Green-tier + Vertex path proven via one test generateContent call.

---

## SUP-2 — Week 2 (LLM substrate)

Sauna drafts all PRs. Adrian reviews Red-tier (these all are — revenue code).

- [x] `SUP-2.1` (factory#101) — `@latimer-woods-tech/llm@0.3.1` (AI Gateway mandatory, workload-split routing, Gemini fallback, prompt caching, `AbortController`, 3-attempt backoff, deps fix) — **Published to npm.pkg.github.com May 4, 2026 ✅**
- [⏳] `SUP-2.2` (factory#102) — `@latimer-woods-tech/llm-meter@0.1.0` (D1 ledger, per-run $5 cap, BUDGET_EXCEEDED). Supersedes factory#49. — **Code complete, publish workflow fixed (PR #250), tag created — republishing May 4, 2026**
- [ ] `SUP-2.3` (HumanDesign#68) — Consume `@latimer-woods-tech/llm`, delete `workers/src/lib/llm.js`, validate on 20 historical syntheses. Supersedes HumanDesign#39. — **SUP-2.1 ✅ published; SUP-2.2 publishing; implementation roadmap & documentation complete (PR #248, #249)**

**Exit gate:** every LLM call org-wide metered + gateway-routed + 20 historical syntheses validated without regression.

---

## SUP-3 — Week 3 (capabilities + templates + scaffold)

Sauna does the work. Adrian reviews templates and the supervisor scaffold.

- [x] `SUP-3.1` (factory#104) — `@latimer-woods-tech/admin@0.3.0` — **Published ✅**
- [x] `SUP-3.2` (factory#105) — `capabilities.yml` in selfprime, videoking, xico-city, factory-admin — **4 YAML files + code generator merged in PR #359 ✅**
- [x] `SUP-3.3` (factory#106) — 15 templates total (11 original + migration-drift-fix, sentry-stripe-error-triage, user-account-suspend, worker-health-degraded) — **merged in PR #359 ✅**
- [x] `SUP-3.4` (factory#107) — `apps/supervisor` scaffold: SupervisorDO + LockDO + ToolRegistry + planner + memory + template_stats D1 — **merged in PR #359 ✅**
- [x] `SUP-3.5` (factory#108) — capabilities.generated.ts, stats wiring (recordRun/dry_run), GET /capabilities, daily cron trigger in wrangler.jsonc — **PR #360 in auto-merge queue ✅** (enable after D1 provisioned)

**Exit gate:** supervisor compiles, one fixture issue runs end-to-end on test branch with no production effects.

---

## SUP-4 — Week 4 (first supervised Green runs)

Gates opened by SUP-3 exit. Not yet filed — will file as atomic issues when we get there.

- First Green-tier supervised closure (SYN-7 or SYN-8)
- 3 more Green closures
- Template library grows by ≥2 from real runs
- Plan-approval still required for every run this week

**Exit gate:** 4 Green closures, 0 reverts, ≥2 new templates from production usage.

---

## SUP-5 — Weeks 5–6 (Yellow + Dreamstate + steady budget)

Gated on SUP-4. Not yet filed.

- Blessing threshold activates: ≥3 clean runs → template skips plan-approval on Green
- Template test harness on `capabilities.yml` PRs
- Ship `scripts/dreamstate-to-issues.mjs` (webhook + ETag cached)
- Pilot Dreamstate spec: videoking VK-11
- Phase 2 budget caps set from observed p95 × 1.5

**Exit gate:** Supervisor handles Yellow-tier VK work with human PR review only.

---

## Parallel tracks not blocked on supervisor

| Track | Who | Status |
|---|---|---|
| VK-7 videoking deploy.yml rewrite | Copilot or Sauna | Todo, Week 1 or 2 |
| xico-city first artist payload | Adrian | Todo, Weeks 2–3 |
| focusbro AdWords acceptance | External (Google) | Waiting |
| wordis-bond compliance decision | Adrian + legal | Waiting |
| Dependabot minor/patch triage | Copilot / Sauna | 12 open across repos |

---

## Non-negotiable rails (never drop)

1. wordis-bond mechanical 3-layer lockout — CODEOWNERS, service-registry, supervisor denylist
2. Credential-leak scrub — no key fragments in docs/memory/plans/PRs/comments
3. Red-tier never auto-merges
4. Every `/admin` mutation requires out-of-band CODEOWNER `✅`
5. Per-run $5 budget hard cap during calibration
6. Single-writer lock per app (Phase-1: label-based; Phase-2: LockDO)
7. `supervisor:approved-source` label required before any supervisor pickup

---

## Cadence

- **Daily** (weekdays, 7 AM ET): Pushover digest from scheduled task (once enabled). For now, Sauna posts manually when running a session.
- **Weekly** (Fridays): retro — did the phase close? Slip? Demoted templates? Budget anomalies?
- **Per-phase gate**: named, falsifiable criterion above. No starting next phase until current one closes.

---

## Open decisions left

- ~~**O1** Supervisor runtime: standalone `apps/supervisor` worker~~ — **RESOLVED 2026-05-06:** Standalone CF Worker with SupervisorDO. Closed factory#110.
- ~~**O2** Memory backend default: Agent Memory primary + D1 dual-write~~ — **RESOLVED 2026-05-02:** CF Agent Memory primary (`MEMORY_BACKEND=agent` default), D1 dual-write. [factory#111](https://github.com/Latimer-Woods-Tech/factory/issues/111)
- ~~**O3** Template authoring surface: YAML in factory repo~~ — **RESOLVED 2026-05-06:** YAML in `docs/supervisor/plans/` + build-time codegen. Closed factory#112.

---

## Change log

- **2026-05-06 ET** — SUP-3 fully code-complete. PRs #359 (merged) + #360 (auto-merge queue). 4 capabilities.yml files (26 caps), 15 templates, template_stats D1 migration, SUP-1.4 migration drift guard, capabilities code generator, supervisor DO wired with stats/capabilities/cron. O1+O3 decision issues closed. Remaining blocker: D1 database provisioning (REPLACE_AFTER_PROVISIONING in wrangler.jsonc).
- **2026-05-02 10:30 ET** — Tracker created. SUP-0/1/2/3 epics + 15 sub-issues filed, linked, added to board with Priority + Status. HumanDesign#39 closed as dup of HumanDesign#68. 19 new labels on factory. Scheduled supervisor task drafted (DISABLED). Template bootstrap candidates analyzed in `file://session/template-bootstrap-candidates.md`.
- **2026-05-05** — SUP-1.2 code-side complete: `scripts/provision-vertex-ai-sa.sh`, `.github/workflows/verify-vertex-ai.yml`, `docs/runbooks/rotate-gcp-sa.md`. Pending Adrian: run provision script + trigger verify workflow.
