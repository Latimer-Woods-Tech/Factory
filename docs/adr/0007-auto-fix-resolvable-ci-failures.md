# ADR-0007: Auto-Fix for Resolvable CI Failures

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, ai, automation, throughput

## Context

A common stall pattern on bot/agent PRs: CI fails on something **mechanically resolvable** — TypeScript error, ESLint warning, missing `-- ROLLBACK:` block in a migration, missing test scaffold for a new endpoint, malformed conventional commit, conformance dimension drop. None of these need human judgment. All of them sit in the review queue waiting for someone to fix-up-and-push.

Per ADR-0006, Claude runs PR reviews; per ADR-0003 it's the primary reviewer. Extending Claude one step further — from "judge" to "fixer" on resolvable failures — closes the loop. The operator (you) sees only the PRs that genuinely need human judgment.

GitHub Copilot Workspace offers a similar capability (`@copilot fix this`), but per the 2026-05-11 decision Copilot is for inline editor autocomplete only; workflow-level AI routes through `@latimer-woods-tech/llm` (Anthropic primary). This ADR uses Claude, not Copilot.

## Decision

Bot/agent PRs (per ADR-0003 author allowlist: `Copilot`, `copilot-swe-agent`, `adrper79-dot`, supervisor templates, Sauna sub-agents) that fail CI on **resolvable** checks trigger an auto-fix attempt via Claude.

### Resolvable check classes (auto-fix eligible)

- **TypeScript errors** — missing imports, missing types, wrong signatures
- **ESLint errors + warnings** — formatting, unused vars, naming conventions, the `@latimer-woods-tech/eslint-config` rule set (when published in Stage 3)
- **Missing tests** — new route without a `*.test.ts`, coverage delta < 0 → Claude scaffolds the test
- **Schema migration missing `-- ROLLBACK:` block** — Claude generates the inverse statement
- **Conventional commit format** — title doesn't match `type(scope): subject` → Claude rewrites + force-pushes (single commit only, never rewriting history)
- **Conformance dimension drop** — when conformance workflow (Stage 1) flags a regression in a Green-tier dimension → Claude applies the canonical fix from `docs/supervisor/plans/conformance-fix-*.yml`
- **Doc drift** — `docs/api/GENERATED.md` out of sync with routes → regenerate

### Non-resolvable (auto-fix never attempts)

- **Test failures** that aren't lint/type (real assertion failures)
- **Security findings** (CodeQL, npm audit high+) — always human review
- **Sentry P0** attributable to the PR
- **Semantic correctness questions** — auto-fix can't tell if behavior is right
- **Red-tier paths** — workflows, packages, migrations, billing, wrangler, auth (per PLATFORM_STANDARDS §7)
- **Architectural decisions** — ADR-required changes never auto-fix
- **Multi-file refactors** — auto-fix is per-file scoped only

### Workflow

```
1. CI fails on a bot PR
2. auto-fix-on-failure.yml fires on workflow_run completion
3. Gate: classify the failure
   - Resolvable + Green/Yellow tier + path scope safe → proceed
   - Else → label `needs-human`, stop
4. Claude (via @lwt/llm) reads:
   - The failing check logs
   - The PR diff
   - The file containing the failure
   - PLATFORM_STANDARDS + relevant ADRs
5. Claude produces a single patch (one file, minimal diff)
6. Apply patch via factory-cross-repo[bot] (force-pushes ONLY when conventional-commit-rename is the fix; otherwise additive commit)
7. CI re-runs → cascading multi-agent review (ADR-0006) re-runs → auto-merge fires if green
8. Track: auto-fix attempt logged at `docs/supervisor/runs/auto-fix-RUN_ID.json`
```

### Safeguards

- **Max 2 auto-fix attempts per PR.** After the second, label `needs-human` and stop. Prevents infinite loops.
- **Auto-fix commits labeled `auto-fix:applied`.** Visible in PR history. Counts as a "dirty run" indicator if the same PR needs 2+ attempts.
- **Cost cap $1/PR for auto-fix.** Hard limit via `@lwt/llm-meter`.
- **Trust ladder applies.** Each fix is a template run; 3 clean runs promote, 2 dirty runs demote (TRUST_LADDER.md).
- **Cascading review re-runs on the fixed code.** ADR-0006 cascade is the gate; no shortcut around it.
- **Path scope enforcement.** Red-tier paths refused at the gate. Yellow-tier scoped to the same file as the original failure.

## Alternatives considered

1. **GitHub Copilot Workspace (`@copilot fix this`).** Rejected: per the 2026-05-11 decision, Copilot is for inline only. Workflow-level AI through Anthropic.

2. **Always-on auto-fix (every failed CI).** Rejected: many CI failures are semantic and shouldn't be touched by an LLM. Class-based gate prevents this.

3. **Manual `/sauna fix` slash-command in PR comments.** Rejected: doesn't close the loop without human action. The whole point is removing the click.

4. **Auto-fix with no attempt limit.** Rejected: infinite loops + cost runaway. Hard cap at 2 attempts.

5. **Auto-fix on `adrper79-dot` PRs only, not bot PRs.** Rejected: bot PRs are the higher-volume failure case; restricting to human PRs misses the leverage.

## Consequences

- **Positive:**
  - Mechanical CI failures (TypeScript, lint, missing tests, missing rollback blocks) auto-resolve without human input.
  - Closes the "stuck PR" failure mode that historically required manual fix-up commits.
  - Trust ladder + cost cap + path scope keeps the blast radius small.
  - Combined with ADR-0006 cascading review, mechanical failures resolve in <5 min wall-clock end-to-end.

- **Negative:**
  - Anthropic spend per failed PR: ~$0.05–0.20. Bounded by the $1 cap.
  - 2-attempt limit means some genuinely-fixable issues still land in your queue when Claude misses on the second try (small false-negative risk).
  - Auto-fix commits clutter PR history (mitigated by squash-merge default).

- **Neutral:**
  - Compatible with ADR-0003 (Claude as primary reviewer — now also primary fixer).
  - Compatible with ADR-0004 (sub-agent fan-out — each sub-agent's failed PR gets one auto-fix attempt).
  - Compatible with ADR-0005 (PR size budget — auto-fix commits inherit the same budget).
  - Compatible with ADR-0006 (cascading review re-runs on fixed code).

## Rollback

Three rollback levels:

1. **Disable the workflow only:** delete `.github/workflows/auto-fix-on-failure.yml`. Failed PRs revert to status quo (stuck pending human fix). Minutes.
2. **Restrict to a single failure class:** e.g., lint-only. Bigger gate, smaller blast radius.
3. **Full revert this ADR:** mark Status: Superseded, remove the workflow, document why.

Triggers for rollback consideration:
- Auto-fix success rate < 60% over 50 attempts (signal: too aggressive on what's "resolvable")
- Auto-fix introduces regressions in 5%+ of fixed PRs (signal: Claude's fix is wrong, ADR-0006 cascade not catching it)
- Anthropic cost on auto-fix exceeds $10/week sustained (kills the throughput rationale)
- Any auto-fix that touches a Red-tier file or violates an ADR (immediate kill)

## Implementation

- [ ] Define the failure classifier — regex + check name → resolvable class taxonomy (`docs/supervisor/auto-fix-classes.yml`)
- [ ] Define the fix prompt — versioned at `docs/supervisor/prompts/auto-fix.md`
- [ ] Write `.github/workflows/auto-fix-on-failure.yml` (Stage 4 enforcement)
- [ ] Wire `@lwt/llm-meter` per-PR cap ($1)
- [ ] Add `auto-fix:applied` and `auto-fix:max-attempts-reached` labels to the org label set
- [ ] Shadow run for 14 days post-launch — log proposed fixes but don't apply. Calibrate success rate.
- [ ] Promote to apply mode only after shadow shows ≥80% would-have-succeeded fixes

## Links

- ADR-0001: Cohesion Architecture
- ADR-0002: Operating Framework
- ADR-0003: Claude as Primary Reviewer (extended — now also primary fixer)
- ADR-0004: Sub-agent Fan-out Pattern
- ADR-0005: PR Size Budget
- ADR-0006: Cascading Multi-Agent Review (gates the auto-fix output)
- `docs/PLATFORM_STANDARDS.md` §7 (Red-tier path scoping)
- `docs/supervisor/TRUST_LADDER.md` (trust progression applies)
- `docs/GAP_REGISTER.md` (the "stuck PR" failure mode)
