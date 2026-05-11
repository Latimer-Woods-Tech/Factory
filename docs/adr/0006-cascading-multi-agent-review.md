# ADR-0006: Cascading Multi-Agent Review — Gemini as Claude's Peer

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, ai, cost-optimization

## Context

ADR-0003 names Claude (Opus 4.7) as primary reviewer for Green + Yellow tier bot PRs. Real risk: Claude can hallucinate — approve something it shouldn't, or miss a real issue. Without a peer check in a **different model family**, hallucinations propagate to auto-merge unchallenged.

Evaluated peer options against four criteria: independent model family, code reasoning quality, cost-per-review, already-wired infrastructure.

| Peer | Independent? | Cost / PR | Already wired |
|---|---|--:|---|
| Gemini 2.5 Flash | ✅ Google | $0.0004 | ✅ `@lwt/llm@0.3.0` fallback |
| Gemini 2.5 Pro | ✅ Google | $0.009 | ✅ same |
| GPT-5-mini | ✅ OpenAI | $0.002 | ✅ `apn_1KhWlb1` |
| Grok-3-fast | ✅ xAI | $0.017 | ✅ `apn_LMhOapj` + `GROK_API_KEY` |
| GitHub Copilot | ❌ Routes to same models | varies | partial |

Always-on Gemini Pro = $0.90/100 PRs/week. Cascading (Flash screen → Pro on disagreement) = ~$0.22/100 PRs/week. Same coverage, 4× cheaper.

## Decision

Multi-agent PR review uses a **cascading consensus** pattern. Per bot PR:

1. **Claude (Opus 4.7) — primary reviewer.** Generates verdict A. ($0.022/PR)
2. **Gemini 2.5 Flash — screen.** Reviews Claude's verdict + the diff. Generates verdict B. ($0.0004/PR — runs on every PR)
3. **Decision:**
   - **Claude + Flash agree** → auto-merge eligible (Green/Yellow tier per ADR-0003). Stop.
   - **Disagree** → escalate to step 4.
4. **Gemini 2.5 Pro — adjudicator.** Deep-review with 2M context. Generates verdict C. ($0.009/PR — only on disagreement)
5. **Final decision:**
   - **Claude + Pro agree** (Flash was the outlier) → auto-merge eligible. Log Flash false-positive for calibration.
   - **Pro + Flash agree against Claude** → page human, attach all three reviews. Real hallucination signal.
6. **Red-tier tie-breaker** (Red paths only, when Claude + Pro split): **GPT-5-mini** runs as 4th opinion. Majority of all 4 verdicts wins; ties always escalate to human.

**Grok stays in its existing role** as the verifier inside `@lwt/llm`'s code-generation chain. Not used for PR review (cost/value loses to Gemini at every tier).

**GitHub Copilot is excluded** from PR review (routes to same upstream models as Claude/GPT — not independent). Inline editor autocomplete usage unchanged per the 2026-05-11 Copilot decision.

## Alternatives considered

1. **Single reviewer (Claude only).** Rejected: no hallucination safety net. ADR-0003's main weakness.

2. **Always-on Gemini Pro peer.** Rejected: 4× more expensive than cascading. Same coverage achievable for ~$0.20/week.

3. **Grok as primary peer.** Rejected: $0.017/PR vs $0.0004 for Flash. Smaller code-eval track record. Reserve for code-gen verification.

4. **Claude + GPT-5 dual primary.** Rejected: both expensive ($0.022 + $0.009 = $0.031/PR vs $0.022 + $0.0004 cascading). GPT-5 has its place as Red-tier tie-breaker but not as default peer.

5. **Three-way always-on (Claude + Gemini + GPT).** Rejected: cost explodes ($0.033/PR) without proportional coverage gain.

## Consequences

- **Positive:**
  - Hallucination safety net at near-zero cost (~$0.22/100 PRs/week).
  - Independent model family (Google) catches errors Anthropic would miss.
  - Cost cascade — Flash kills 80% of disagreements before Pro even runs.
  - Red-tier four-model coverage on highest-stakes PRs.
  - All four models already wired into the org; no new infrastructure.

- **Negative:**
  - +2–4 minutes latency per PR (Flash adds <30s; Pro adds 2–3 min when it fires).
  - Anthropic+Google dependency for PR throughput (Gemini outage = revert to Claude-only).
  - Calibration phase required before this can enforce.

- **Neutral:**
  - Compatible with ADR-0003 (Claude as primary) and ADR-0004 (sub-agent fan-out).
  - Compatible with TRUST_LADDER promotion rules — a peer-disagreement is a dirty-run signal.

## Rollback

Three rollback levels:

1. **Disable adjudicator only:** Pro stops running on disagreements; Flash + Claude verdicts go to human. Cost: minutes.
2. **Disable screen + adjudicator:** drop to Claude-only (ADR-0003 status quo). Cost: minutes.
3. **Full revert:** delete `claude-review.yml` and the cascade workflows. Restore human-only review for bot PRs. Cost: 15 minutes.

Triggers for rollback consideration:
- Claude + Gemini Pro agreement rate > 99% over 100 PRs (signal: peer is noise, not signal — degrade to Flash-screen-only or single-reviewer)
- Claude + Gemini Pro agreement rate < 70% (signal: noisy disagreement = false positives, recalibrate or rollback)
- LLM cost on PR review exceeds $10/week (kills the cost-optimization rationale)
- Gemini outage > 4h sustained (operate single-reviewer until restored)

## Implementation

- [ ] **Stage 1 (calibration):** Shadow run Claude + Gemini Flash + Gemini Pro against the **last 50 bot PRs** in the org. Measure: (a) Claude-Flash agreement rate, (b) Claude-Pro agreement rate when escalated, (c) "real hallucination" rate where Pro + Flash agree against Claude. Target: cascading catches ≥80% of actual issues a human would have flagged.
- [ ] Define the review prompt — shared across all three models, version-controlled at `docs/supervisor/prompts/peer-review.md`. Critical: each model gets the **same** prompt + diff + PR metadata; differences in verdict reflect model differences, not prompt differences.
- [ ] Define the disagreement protocol — Flash and Pro respond with structured JSON: `{verdict: "approve" | "request_changes" | "comment", reasoning: "...", concerns: [...]}` for machine adjudication.
- [ ] Write `.github/workflows/peer-review-cascade.yml` (Stage 4 enforcement).
- [ ] Wire org-level LLM cost cap (G8 from GAP_REGISTER) before this enforces. Hard cap: $5/week peer review. Alert at $3/week.
- [ ] CODEOWNERS update: `peer-approved` label = CODEOWNER approval equivalent for Green + Yellow paths (replaces ADR-0003's `claude-approved` label).
- [ ] First 7 days post-launch: shadow-only — human-shadow every peer-approved PR. Disable shadow after FN rate confirmed <5%.

## Links

- ADR-0001: Cohesion Architecture
- ADR-0002: Operating Framework
- ADR-0003: Claude as Primary Reviewer (extended by this ADR)
- ADR-0004: Sub-agent Fan-out Pattern
- ADR-0005: PR Size Budget
- `docs/PLATFORM_STANDARDS.md` §2 (code patterns — `@lwt/llm` usage)
- `docs/GAP_REGISTER.md` G5 (calibration shared with Claude reviewer); G8 (LLM cost caps)
- `docs/supervisor/TRUST_LADDER.md` — peer-disagreement is a "dirty run" signal
- `documents/factory/2026-05-11_CONCURRENCY_AND_THROUGHPUT.md` (Sauna-side working note)
