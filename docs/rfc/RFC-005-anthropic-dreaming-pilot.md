# RFC-005: Anthropic Dreaming pilot on Factory autofix loop

## Metadata

```
RFC Number:     RFC-005
Title:          Anthropic Dreaming pilot on Factory autofix loop
Author:         adrper79-dot
Date Filed:     2026-05-15
Status:         draft
Target Ship:    Q3 2026 (gated on Anthropic research-preview access)
Updated:        2026-05-15 — initial draft from operations checkpoint
```

Tracks: [docs/decisions/2026-05-15-operations-checkpoint.md §4](../decisions/2026-05-15-operations-checkpoint.md)

---

## 1. Problem Statement

Factory's supervisor autofix loop ([`.github/scripts/supervisor-core.mjs`](../../.github/scripts/supervisor-core.mjs) + [`pr-review.mjs`](../../.github/scripts/pr-review.mjs)) currently runs every 4h as a stateless Action: it reads issue → reasons → opens PR → on rejection reads feedback → patches → pushes. Each run starts cold; nothing learned in a run carries into the next beyond what's written into a memory file or the issue thread.

This produces repeated mistakes — the same constraint-violation classes, the same template mismatches, the same regex-anchor omissions — visible in the supervisor's PR rejection logs over the past month. There is no mechanism for cross-session pattern extraction.

Anthropic's research-preview "Dreaming" feature is built for exactly this gap: it replays an agent's past sessions, extracts recurring mistakes and converged workflows, and writes new memory entries to be used in future runs. Modeled on hippocampal consolidation.

**Business value:** if Dreaming reduces supervisor PR rework rate by ≥20%, it pays for itself in saved Anthropic spend (review cycles drop) and in reduced CODEOWNER fatigue.

---

## 2. Proposed Solution

### 2.1 Core Approach

Pilot Dreaming on **one loop only**: `supervisor-core.mjs` autofix (NOT pr-review.mjs initially — different prompt class, different failure modes; pilot one at a time).

Dreaming is exclusive to **Claude Managed Agents** (Anthropic's hosted agents product, currently research preview). Enabling it requires porting `supervisor-core.mjs` from raw `fetch('https://api.anthropic.com/v1/messages', ...)` onto the Managed Agents SDK. This is a real port, not a flag flip.

### 2.2 Phases

- **Phase 0 — Research-preview access** (this RFC blocks here).
  - Submit Anthropic Managed Agents research-preview request via adrper79@gmail.com or workspace SSO.
  - Exit: access granted; SDK key issued.
- **Phase 1 — Parallel-run port** (~1 person-week).
  - New script `.github/scripts/supervisor-core-managed.mjs` calls Managed Agents SDK; same I/O contract as the existing core.
  - Behind feature flag `SUPERVISOR_USE_MANAGED_AGENTS` (default OFF). Existing flow runs unchanged.
  - Both flows run on every supervisor tick during pilot; only the legacy flow's output is acted on. Managed flow's output is logged for comparison.
- **Phase 2 — Compare** (2 weeks of dual-run data).
  - Metrics: PR rework rate, CODEOWNER review burden, total Anthropic spend per supervised issue, agreement rate between flows.
  - Decision gate: ship Managed path as canonical iff rework rate drops ≥20% AND total spend is within ±15% AND no constraint-violation regression.
- **Phase 3 — Cutover OR shutdown.**
  - If pass: flip default ON; archive legacy `supervisor-core.mjs`.
  - If fail: shut down Managed flow; document why; revisit at next research-preview milestone.

### 2.3 Alternatives Considered

- **A. Build our own cross-session memory layer.**
  - Pros: full control, no Anthropic lifecycle dependency, reuses our existing memory file pattern.
  - Cons: pattern-extraction is the hard part; we'd be reinventing the consolidation algorithm.
  - **Rejected because:** Dreaming exists already; if it works, buy not build. If it doesn't, we'll know in 4 weeks and the option remains.

- **B. Wait until Dreaming is on the standard `/v1/messages` API.**
  - Pros: no port required; minimal code change.
  - Cons: no timeline from Anthropic on standard-API availability; could be quarters away.
  - **Rejected because:** the supervisor's repeated-mistake problem is real today; waiting indefinitely costs more than the port.

- **C. Pilot on pr-review.mjs instead of supervisor-core.mjs.**
  - Pros: pr-review runs more frequently; faster data accumulation.
  - Cons: pr-review's 2-party Grok→Claude consensus makes attribution harder; pattern extraction is muddier when two models contribute.
  - **Rejected because:** cleaner signal on the autofix loop; revisit for pr-review in Phase 4 if Phase 2 passes.

### 2.4 Out of Scope

- pr-review.mjs port (Phase 4 if Phase 2 passes).
- Migration of other Claude-using paths (`apps/admin-studio/`, video pipeline) — not autonomous loops.
- Hosting our own consolidation algorithm — only revisit if Phase 2 fails AND we still want the capability.

---

## 3. Impact Analysis

### 3.1 User Impact

None directly. Indirect: fewer CODEOWNER-rejected supervisor PRs → less review fatigue → more attention for revenue work.

### 3.2 Team Impact

- **Engineering:** ~1 person-week Phase 1 + 2-week dual-run observation. Cutover/shutdown decision: 1 day.
- **Ops:** new dashboard tile for "Managed flow agreement rate"; existing supervisor dashboards extended.
- **Cost:** carry both flows during pilot — Anthropic spend roughly doubles for 2 weeks. Budget cap per FRIDGE rule 5 ($5/run) still applies to each flow independently; if cap hit, that flow pauses.

### 3.3 Business Impact

- If Phase 2 passes: supervisor cost-per-resolved-issue drops; CODEOWNER attention freed for revenue work. Likely net-positive within 6 weeks.
- If Phase 2 fails: -$X Anthropic spend during pilot weeks (estimate: doubled supervisor spend × 2 weeks ≈ $100-300 depending on issue volume). Recoverable; no permanent commitment.

---

## 4. Timeline & Resources

### 4.1 Estimated Effort

- Phase 0: 1 day (request + access grant — Anthropic-side latency unknown)
- Phase 1: 1 person-week
- Phase 2: 2 weeks observation, ~2 days analysis at end
- Phase 3: 1 day decision + cutover OR shutdown

Total active engineering: ~2 person-weeks over a 4-week calendar window.

### 4.2 Hard Dependencies

- **Anthropic Managed Agents research-preview access** — blocking Phase 1. Submit request immediately on RFC acceptance.
- **`llm-meter` ledger** (FRIDGE rule 5 budget cap enforcement) — already shipped.

### 4.3 Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Research-preview access denied / delayed indefinitely | Medium | Blocks entire RFC | Time-box Phase 0 to 4 weeks; if no access, this RFC moves to `rejected` and Alternative A reopens for evaluation |
| Managed Agents SDK breaking changes during preview | High | Pilot rework | Pin SDK version; treat any breaking-change burden as a signal to either delay cutover or fall back |
| Cost doubles for 2 weeks then Phase 2 fails | Medium | -$100–300 spend | Budget the pilot; cap dual-run at $500 total; if approaching cap, end pilot early with whatever data accumulated |
| Dreaming extracts the wrong patterns (overfits to noise) | Medium | Supervisor quality drops | Compare flow outputs daily; if Managed flow diverges in obvious-bad ways, end pilot at week 1 |

---

## 5. Success Criteria

- **Primary:** Managed flow PR rework rate is ≥20% lower than legacy flow over the 2-week observation window, AND Anthropic spend per supervised issue is within ±15% of legacy.
- **Secondary:** Managed flow agreement rate with legacy flow ≥75% on the canonical decision (which template to use, which fix to apply).
- **Hard stop:** any constraint-violation regression (no `process.env`, no `Buffer`, etc.) where Managed flow proposes a violation that legacy flow correctly rejects.

---

## 6. Open Questions

- **Q:** Does the Managed Agents SDK respect `llm-meter` budget caps, or does it run with its own internal accounting?
  - **A:** TBD — needs SDK docs read once research-preview access lands.
- **Q:** What's the actual research-preview wait time?
  - **A:** TBD — submit and find out.
- **Q:** Can Managed Agents return a structured output matching our existing `templates.generated.json` schema, or will the port require adapter layers?
  - **A:** TBD — likely needs adapter; budget 1 day in Phase 1 for that.
- **Q:** Is Dreaming a daily / per-N-runs / continuous process? If per-tick, the per-run budget cap (FRIDGE rule 5) is unambiguous. If batch / daily, we need a separate budget conversation.
  - **A:** TBD — SDK docs.

---

## 7. Related RFCs & ADRs

- **Decided:** [`docs/decisions/2026-05-15-operations-checkpoint.md §4`](../decisions/2026-05-15-operations-checkpoint.md) — intent confirmed; this RFC executes the path.
- **Depends on:** FRIDGE rule 5 (per-run $5 cap) — unchanged, applies to Managed flow.
- **Informs:** future RFC on pr-review.mjs Managed-Agents port (if Phase 2 passes).

---

## 8. Appendix

### A. References

- [Anthropic introduces "dreaming" — VentureBeat](https://venturebeat.com/technology/anthropic-introduces-dreaming-a-system-that-lets-ai-agents-learn-from-their-own-mistakes)
- [Anthropic letting Claude agents dream — SiliconANGLE](https://siliconangle.com/2026/05/06/anthropic-letting-claude-agents-dream-dont-sleep-job/)
- [Anthropic Managed Agents dreaming outcomes — The New Stack](https://thenewstack.io/anthropic-managed-agents-dreaming-outcomes/)

### B. Files in scope

- `.github/scripts/supervisor-core.mjs` — port target (Phase 1)
- `.github/scripts/supervisor-core-managed.mjs` — new (Phase 1)
- `apps/supervisor/wrangler.jsonc` — feature-flag wiring
- `packages/llm-meter/src/index.ts` — budget-cap integration if needed in Phase 1
