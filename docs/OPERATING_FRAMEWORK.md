# Operating Framework — How We Ship Without Headaches

**Date:** 2026-05-11 · **Status:** Foundational · **Supersedes:** ad-hoc sequencing of cohesion + tracker work

This is the operating model that governs how every milestone in the cohesion + tracker + sellability roadmap is sequenced, executed, and exited. Without it, "yes to all of it" becomes 7 half-finished workstreams. With it, one big rock moves at a time, signals stay honest, and rollback is always available.

## The 10 rules

1. **One milestone in flight at a time.** Solo-founder velocity is highest when there's one rock being moved. Parallel work is allowed *inside* a milestone (sub-tasks), but milestones don't overlap. Pause to ship before starting the next.

2. **Time-boxed at 2 weeks max.** Anything longer becomes a swamp. If it can't ship in 2 weeks, it's not a milestone — it's a roadmap.

3. **Dependency-ordered.** No milestone starts until its prerequisites are merged + verified. The sequence (below) is fixed unless an ADR explicitly re-orders it.

4. **Shadow mode default for anything new that gates.** Any new conformance rule, blocking check, or required workflow runs in shadow for 14 days before it can block anything. We see the signal honestly before anyone has to live with it.

5. **WIP cap: 3 open PRs per repo.** No new PR starts until WIP drops. Memory shows the recent wave of 34 PRs in 30 hours — that's a churn smell, not a velocity win. WIP cap forces completion over starting.

6. **Definition of Ready (before starting a milestone):** spec doc exists + inputs identified + ADR drafted + owner assigned + rollback plan named + cost ceiling set. Missing any of those = not ready, don't start.

7. **Definition of Done (to exit a milestone):** PR merged + conformance score moved (or explicitly N/A) + customer signal moved (or explicitly N/A) + ADR final + rollback verified in shadow + docs updated.

8. **Every milestone has a documented rollback, tested in shadow.** Conformance check too strict? Toggle off. Standards too tight? Revert the ADR. Required workflow breaking deploys? Demote to advisory.

9. **Decision log (ADRs) for every architecturally significant call.** Including framework decisions like "we're sequencing milestones this way." The ADRs become the supervisor's hard constraints. Future agents can't violate decided-on architecture.

10. **Customer gate (quarterly review).** Does the trajectory of the 5 questions (shipping / shipping-right / buying / staying / affordable) support continuing this milestone pace? If signals say "stop building, start selling," we pivot. The framework's biggest job is making this trade-off legible.

## Cadence

- **Monday 06:30 ET — weekly review.** Open the current milestone scorecard. Validate exit criteria progress. If exit criteria met, ship it + start the next milestone. If not met, decide: continue, replan, or cancel.
- **Daily — Pushover digest.** Cohesion score + customer signals + WIP per repo + top drift to fix. Tells you in 30 seconds whether you're on track.
- **Quarterly — strategic review.** Customer gate. ICP review. Pricing experiments review. Standards file evolution. Reset milestones for the next quarter.

## The 6-stage sequence (committed)

This is the actual order. Each stage has one or two milestones. Each milestone is ≤2 weeks. Total: ~6 weeks platform work + parallel customer/revenue work after Stage 2.

### STAGE 0 — Foundation (Week 0, ~2 days, this week)
**M0.** Operating Framework (this doc) + `PLATFORM_STANDARDS.md` v1 draft + `docs/adr/` template + ADR-0001 (the "we're doing cohesion this way" decision) + ADR-0002 (the operating framework itself).

Exit criteria: one PR to factory merged with all four files. No code yet, just governance.

### STAGE 1 — Visibility (Week 1, shadow mode)
**M1.** `platform-conformance.yml` (10 dimensions, score 0–100 per repo, shadow only, no blocking) + Cohesion Score column in `COMPLETION_TRACKER.md`.

**M2.** Cost-observability daily digest (CF + Anthropic + Sentry + Stripe + GCP spend, anomaly detection). Standalone, low risk.

Exit criteria: two PRs merged. Daily digest now shows Completion, Cohesion, Cost. Nobody is blocked by anything.

### STAGE 2 — Revenue + Customer signals (Week 2)
**M3.** Launch Readiness Scorecard composite metric. Stripe MRR per product. PostHog funnel surfaced. Sentry user-facing error rate split out.

Exit criteria: daily digest now answers all 5 questions: shipping / shipping-right / buying / staying / affordable. The dashboard reflects the business, not just the codebase.

### STAGE 3 — Adoption tools (Weeks 3–4)
**M4.** `@latimer-woods-tech/eslint-config` + `@latimer-woods-tech/tsconfig-base` + `@latimer-woods-tech/biome-config` published. Adoption PRs auto-opened in all 5 repos.

**M5.** Renovate at org level with shared preset. `@lwt/*` versions pinned across all consumers.

Exit criteria: every repo has the shared lint/type/format configs. Renovate dashboards show version drift visible. Conformance scores start climbing in shadow.

### STAGE 4 — Enforcement (Week 5)
**M6.** Required org rulesets via `apply-sec-hardening`. Required workflows org-wide. Branch protection unified. Conformance check graduates from shadow to required (only after most repos score ≥80).

**M7.** Definition of Done PR template + machine-checkable status check.

Exit criteria: every PR that lands now passes conformance + DoD. Drift triggers auto-PRs. Supervisor templates expanded for the common drift cases.

### STAGE 5 — Sellability (Week 6)
**M8.** Accessibility (axe) conformance dimension live. Adoption PRs in 4 non-HD repos.

**M9.** PII inventory per product. DSR endpoint conformance. `@lwt/compliance` package wired in.

**M10.** Public status pages per product (status.selfprime.net etc.).

Exit criteria: each product can survive an enterprise procurement questionnaire on accessibility + data privacy + uptime transparency.

### CONTINUOUS — Operational maturity (Week 7+)
- Auto-rollback canary
- Agent observability + prompt versioning + org-level LLM budget cap
- ICP clarity per product (workshop output)
- Pricing experiments running
- BCP for solo-founder risk
- Quarterly Cloudflare concentration review

## What this prevents

| Headache | How the framework prevents it |
|---|---|
| 30 PRs open at once, none merging cleanly | WIP cap (rule 5) |
| Conformance rule lands and blocks every deploy | Shadow mode default (rule 4) |
| 9 days at zero customers, shipping at all-time-high | Customer gate (rule 10) + Stage 2 surfaces signals early |
| Standards drift between repos because nobody enforced them | Adoption tools (Stage 3) before enforcement (Stage 4) |
| Standards too strict, can't ship anything | Bypass label with required ADR (per cohesion design) |
| You forget why we picked option A | ADRs (rule 9) |
| Anthropic spend spikes 10x | Cost ceiling per milestone (rule 6) + cost digest (M2) |
| New agent or human onboards and can't figure out the system | ADRs + PLATFORM_STANDARDS as the entry doc |
| Solo-founder bus risk realized | Continuous stage: BCP work, documented recovery |
| Cypher-healing accidentally lands HIPAA-violating code | Stage 5 PII conformance + standards |

## Anti-headache principles baked into every milestone

1. **Reversibility before correctness.** Ship the rollback path before the change.
2. **Visibility before enforcement.** Score before block. Audit before required-check.
3. **Adoption tools before adoption mandates.** Publish the shared config before requiring its use.
4. **Test in one repo before fanning out.** Pick HumanDesign (already mature) as the proving ground for every new check. Other 4 repos inherit only after HD passes for 7 days.
5. **One source of truth per concern.** Standards in PLATFORM_STANDARDS.md. Decisions in ADRs. Active work in the daily digest. No shadow copies.
6. **Bias toward delete.** If a workflow doesn't earn its keep monthly, delete it. Existing zombie workflows (per memory) are warning signs.
7. **Bias toward generated docs.** Hand-maintained docs rot. Generated docs (API_GENERATED.md pattern from HD) stay honest.

## What we do NOT do

- We do not start Milestone N+1 before N exits.
- We do not turn on a blocking check without 14 days in shadow.
- We do not extend a milestone past 2 weeks without an explicit re-scope ADR.
- We do not ship a new package without at least one consumer migration ready.
- We do not write a new standard without removing or marking-superseded any older one it replaces.
- We do not let conformance score live anywhere except the daily digest. (No shadow trackers.)
- We do not run AI agents against PRs without the org-level LLM budget cap live (M2 covers this).

## What we owe the framework

This doc is itself versioned and modifiable. Changes require:
1. An ADR explaining the change.
2. A 7-day comment period (the supervisor reviewer + you).
3. The framework PR uses its own framework (DoD, rollback, shadow).

If we can't follow the framework on the framework's own changes, the framework is wrong and we should redesign before pretending.

## What ships with this framework — Stage 0 PR

A single PR to factory containing:
- `docs/OPERATING_FRAMEWORK.md` (this doc)
- `docs/PLATFORM_STANDARDS.md` v1 (~200 lines, the 10 dimensions)
- `docs/adr/0000-template.md` (the ADR template)
- `docs/adr/0001-cohesion-architecture.md` (decision: 3 lines of defense, lives in factory)
- `docs/adr/0002-operating-framework.md` (decision: this framework governs all platform work)

No workflows, no code, no enforcement. Just the governance layer. Stage 1 starts next week after this lands and the digest reads "Stage 0: shipped."
