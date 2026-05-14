# ADR-0003: Claude as Primary Reviewer for Green + Yellow Tier Bot PRs

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, ai, automation

## Context

The 4x throughput model requires removing the operator (you) from per-PR review on routine work. Today the bottleneck is human CODEOWNER approval — every bot/agent PR (supervisor, Sauna sub-agents, Dependabot, Copilot) waits on you, even for Green-tier docs work.

`@latimer-woods-tech/llm@0.3.x` already routes through Anthropic primary. `ANTHROPIC_API_KEY` is org-level. The supervisor loop already uses Haiku 4.5 for slot extraction. The infrastructure to add Claude as a reviewer is in place.

Memory shows the existing `copilot-auto-approve.yml` pattern (factory#551) approves Copilot PRs automatically after CI passes. Extending that pattern to cover Sauna sub-agent PRs and supervisor PRs is the smallest delta with the biggest leverage.

## Decision

Claude (Opus 4.7 via `@latimer-woods-tech/llm`) serves as the primary code reviewer for bot/agent PRs in **Green and Yellow trust tiers**:

1. A new workflow `claude-review.yml` posts a structured review on every PR opened by a bot user (factory-cross-repo[bot], copilot[bot], renovate[bot], dependabot[bot], any Sauna sub-agent).
2. Claude's review evaluates: conformance dimensions, ADR violations, security smells, test coverage delta, style/pattern deviations.
3. If Claude's verdict is **approve**, the PR gets the `claude-approved` label, which counts as a CODEOWNER approval for **Green + Yellow tier paths only**.
4. **Red tier paths always require human CODEOWNER approval**, regardless of Claude's verdict.
5. Claude's review is **non-binding** for human-authored PRs — it posts comments but doesn't auto-approve them.

Calibration is required before this is enforced. See Implementation.

## Alternatives considered

1. **Keep human-only review.** Rejected: bottlenecks at solo-operator scale. Memory shows 34 PRs in 30 hours one recent stretch — review queue is the rate-limit.

2. **Use Copilot Code Review for everything.** Rejected: GitHub's June 1 billing change makes it expensive on private repos, and the existing Copilot approval (factory#551) only covers Copilot's own PRs. Claude is more cost-effective and we already pay for the API.

3. **Auto-approve all bot PRs (no review at all).** Rejected: catastrophic if a malformed supervisor template ships bad code at scale. Need an independent check.

4. **Have Claude post comments but not approve.** Rejected: doesn't move the bottleneck. The whole point is removing the human approval step for routine work.

## Consequences

- **Positive:**
  - Bot PRs in Green + Yellow tier merge without human approval after CI + Claude review.
  - Review surface area for human (you) drops ~80% — Red tier + human-authored PRs only.
  - Claude's review is consistent (no review fatigue), fast (<2 min), and rationale-documented in PR comments.
  - Anthropic spend predictable: ~$0.05–0.20 per PR review via Opus 4.7.

- **Negative:**
  - Claude can hallucinate or miss issues. Calibration phase required before full trust.
  - Adds an external dependency on Anthropic API availability for PR throughput. Mitigated by Gemini fallback in `@lwt/llm`.
  - Templates that flood the queue could spike Anthropic costs. Mitigated by `@lwt/llm-meter` cap (per-run $5; org-level cap M2 work).

- **Neutral:**
  - Compatible with existing `copilot-auto-approve.yml` — coexist or merge into one workflow.
  - Compatible with `auto-merge-approved-prs.yml` and the PR #550 poller — Claude's approval simply provides the CODEOWNER signal they wait on.

## Rollback

If Claude's review quality is unacceptable:

1. Disable the `claude-review.yml` workflow (one toggle).
2. PRs from bots revert to needing human CODEOWNER approval (the status quo).
3. No data migration required.

Estimated rollback effort: 15 minutes.

Triggers for rollback consideration:
- False-negative rate > 5% on the calibration corpus
- ≥3 reverts in 14 days attributable to PRs Claude approved
- Anthropic cost on PR reviews exceeds $50/week sustained
- Hallucinated security or compliance approvals

## Implementation

- [ ] Calibration phase (Stage 1): run Claude reviewer in shadow on the last 50 PRs across the org. Compare verdict to actual outcomes. Target: false-negative rate < 5%, false-positive rate < 10%.
- [ ] Write the review prompt (Anthropic-hosted system prompt, version-controlled in `docs/supervisor/prompts/claude-review.md`).
- [ ] Write `.github/workflows/claude-review.yml` (Stage 4 enforcement).
- [ ] CODEOWNERS update: `claude-approved` label = CODEOWNER approval equivalent for Green + Yellow paths.
- [ ] Org-level LLM budget caps live before this enforces (Stage 1 M2).
- [ ] First 7 days post-launch: human-shadow every Claude-approved PR before auto-merge fires (paranoia mode). Disable shadow once false-negative rate confirmed < 5%.

## Links

- ADR-0001: Cohesion Architecture
- ADR-0002: Operating Framework
- ADR-0004: Sub-agent Fan-out Pattern (companion)
- ADR-0005: PR Size Budget (companion)
- `docs/supervisor/TRUST_LADDER.md` — defines "clean run" gating Claude promotions per-template
- `documents/factory/2026-05-11_CONCURRENCY_AND_THROUGHPUT.md` (Sauna-side working note)
- `.github/workflows/copilot-auto-approve.yml` (existing pattern this builds on)
