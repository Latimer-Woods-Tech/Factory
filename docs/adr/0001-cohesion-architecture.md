# ADR-0001: Cohesion Architecture — Three Lines of Defense

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, workflow, security

## Context

The platform has 5 active products (selfprime.net, capricast.com, factory admin-studio, cypherofhealing.com, xicocity.com) plus the Factory hub. Today, cohesion across repos is held together by the operator (you) reading PRs and remembering rules. Memory + recent docs show:

- 19 `@latimer-woods-tech/*` packages published; 0 apps consume them
- HumanDesign has Reliability Gate, smoke, canary, axe, CodeQL, husky; other 4 repos have none of it
- Stripe / auth / email / logger plumbing implemented 3+ times across the org
- 18 vs 2 vs 4 workflow files per repo — no consistency
- Shipping velocity at all-time-high (34 PRs in 30 hours); 0 new paying customers in 9 days

Without active cohesion enforcement, scaling to 20+ apps will produce a federation of repos, not a platform. The cost of inconsistency compounds: every new app re-litigates auth, billing, observability, deployment.

Companion docs: `2026-05-11_COHESION_AND_STANDARDS_ARCHITECTURE.md`, `2026-05-11_OPERATING_FRAMEWORK.md`, `2026-05-11_MISSING_CONSIDERATIONS.md`.

## Decision

We will enforce cohesion via three lines of defense, with Factory as the canonical hub:

1. **PREVENTIVE** — `PLATFORM_STANDARDS.md` + shared `@lwt/eslint-config` / `@lwt/tsconfig-base` + Definition-of-Done PR template + required org rulesets. Bad work is blocked before merge.

2. **DETECTIVE** — `platform-conformance.yml` audits every repo nightly, scores 0–100 across 10 dimensions. Cohesion Score lives next to Completion Score in the daily digest. ADR coverage check on every PR.

3. **CORRECTIVE** — Expanded supervisor templates auto-fix common drifts. Auto-rollback canary on Sentry/latency spikes. Self-improvement loop adds new lint rules from recurring production incidents.

Standards as code, not folklore. Every constraint is something AI agents can read and obey. ADRs are non-negotiable once accepted.

## Alternatives considered

1. **Per-repo standards (status quo).** Rejected: produces federation, not platform. Doesn't scale to 20 apps. Already failing at 5.

2. **External tooling (Backstage, Cortex, etc.).** Rejected: overkill for solo founder + 5 repos. Operational overhead exceeds value at this scale. Reconsider at 20+ apps or 5+ contributors.

3. **Documented standards without enforcement.** Rejected: standards rot when not machine-checked. FRIDGE + CONTEXT + scattered architecture docs exist today and are partially enforced; that's the failure mode we're correcting.

4. **Required-checks first, standards later.** Rejected: would block everything immediately. Shadow-mode-first (per `OPERATING_FRAMEWORK §4`) avoids this.

## Consequences

- **Positive:**
  - Every new app inherits standards by default. Zero onboarding cost for repo #6 through #20.
  - AI agents (supervisor, code review) have hard constraints they cannot violate.
  - Cohesion Score becomes a managed number — visible, improvable, defensible to enterprise buyers.
  - 19 unused `@lwt/*` packages get consumers via Stage 3 adoption tools.
  - Drift becomes auto-PR'd instead of silently accumulating.

- **Negative:**
  - ~6 weeks of platform work before customer-facing features see speed-up.
  - Required-check failures will block PRs once Stage 4 lands; some friction in the transition.
  - Conformance audits cost LLM tokens (capped via `@lwt/llm-meter`).
  - Adds 3 new packages to maintain (eslint-config, tsconfig-base, biome-config).

- **Neutral:**
  - Existing FRIDGE.md / CONTEXT.md / FACTORY_V1.md remain authoritative; this ADR layers on top.
  - GitHub Copilot remains available for inline autocomplete; workflow-level AI work routes through Anthropic.

## Rollback

The cohesion layer is built in phases (per `OPERATING_FRAMEWORK §6-stage sequence`). Each stage has its own rollback:

- Stage 0 (this PR): revert the Factory PR. Restores the previous state (FRIDGE / CONTEXT remain authoritative, no platform standards file).
- Stage 1 (conformance shadow mode): delete the workflow file; no production impact.
- Stage 2 (revenue/customer signals): delete the new dashboard sections; no production impact.
- Stage 3 (adoption tools): unpublish the three new packages; consumers fall back to current per-repo configs.
- Stage 4 (enforcement): demote required workflows to advisory; revert org rulesets.
- Stage 5 (sellability): each conformance dimension independently togglable.

Estimated rollback effort: 2–4 hours from any stage. No data migration required.

Triggers for rollback consideration:
- Cohesion Score blocking >25% of legitimate PRs after Stage 4 for >7 days
- LLM spend on conformance + auto-fix exceeds $50/week sustained
- Customer signals deteriorating during platform-work weeks (acceptable for 2 weeks; not 6)

## Implementation

- [x] `docs/OPERATING_FRAMEWORK.md` written
- [x] `docs/PLATFORM_STANDARDS.md` v1 drafted
- [x] `docs/adr/0000-template.md` written
- [ ] Factory PR with all four files opened
- [ ] ADR-0002 (operating framework) accepted (this PR also accepts it as a companion)
- [ ] Stage 1 milestone kicked off (M1 + M2) after this PR merges
- [ ] Supervisor templates updated to read ADRs as hard constraints (Stage 4)

## Links

- ADR-0002: Operating Framework (companion to this ADR; merged together)
- `documents/factory/2026-05-11_COHESION_AND_STANDARDS_ARCHITECTURE.md`
- `documents/factory/2026-05-11_OPERATING_FRAMEWORK.md`
- `documents/factory/2026-05-11_MISSING_CONSIDERATIONS.md`
- `documents/factory/2026-05-11_COMPLETION_TRACKER_NEXT_MOVES.md`
- `docs/supervisor/FRIDGE.md` (Factory) — operating rules, override this ADR where conflicts arise
- `docs/architecture/FACTORY_V1.md` (Factory) — broader architecture context
