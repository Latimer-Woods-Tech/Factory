---
date: 2026-06-11
decider: adrper79-dot
status: accepted
supersedes: none
rfc: RFC-006
---

# 2026-06-11 — RFC-006 Required Operating Decisions

Resolves the ten owner decisions listed in RFC-006 §16 before Phase 0
implementation begins. All defaults are calibrated for a solo operator with
AI agents; revisit at first hire or when throughput doubles.

---

## Decision 1 — Telemetry store

**Question:** which existing store replaces daily Git snapshot PRs?

**Decision:** existing stores only — no new system.

| Data class | Store | Notes |
|---|---|---|
| Supervisor run receipts, lease audit, transition receipts | D1 (`factory-supervisor` database) | Already used for run history |
| Cross-app operational/business events | `factory_events` table in Neon (production) | Already used by analytics package |
| Errors and incidents | Sentry | Already integrated |
| Product behaviour / funnel | PostHog | Already integrated |
| Short-lived diagnostics and daily reports | GitHub Actions artifacts | Free; auto-expire in 30 days |
| Weekly governance checkpoint | Single Git PR | Replaces daily snapshot PR volume |

A new dedicated metrics store (Grafana Cloud, Datadog, etc.) is not justified
until monthly recurring revenue exceeds $10k or team size exceeds three
engineers. Decision revisits when either threshold is crossed.

---

## Decision 2 — Lifecycle representation

**Question:** labels vs. a state service for the first implementation.

**Decision:** GitHub issue labels are the canonical lifecycle state representation
for Phase 0–2. A state service requires a separate RFC and migration only if
label-based implementation proves insufficient at scale.

Label namespace: `status:<value>` — one per issue at all times.

Canonical label set (must exist in all monitored repos):

| Label | Hex colour | Meaning |
|---|---|---|
| `status:intake` | `#e4e669` | Created; not yet triaged |
| `status:ready` | `#0075ca` | Executable; dependencies clear |
| `status:in_progress` | `#e99695` | Leased; agent or human executing |
| `status:in_review` | `#c5def5` | Linked PR or review artifact exists |
| `status:blocked` | `#d93f0b` | Named blocker; cannot proceed |
| `status:verifying` | `#bfd4f2` | Deployed; awaiting verification |
| `status:done` | `#0e8a16` | Acceptance + verification passed |
| `status:cancelled` | `#cccccc` | Intentionally stopped or superseded |

`status:wip` and `status:abandoned` are retired aliases; label-sync will
map existing uses to `status:in_progress` and `status:cancelled` respectively.

---

## Decision 3 — Duplicate survivor policy

**Question:** oldest actionable issue vs. highest-quality issue?

**Decision:** **oldest actionable issue** is the default survivor.

Rationale: predictable, requires no quality judgment, and protects existing
assignees and references. Override: an explicit `survivor: #NNN` comment by
`@adrper79-dot` selects a different canonical issue and is recorded by the
dedup controller before closure.

A "non-actionable" oldest issue (locked, transferred, missing body) yields to
the next oldest actionable issue, not to a quality score.

---

## Decision 4 — Verification classes

**Question:** which work types require production verification vs. merge
verification?

| Work class | Verification required | Authority |
|---|---|---|
| `code:deploy` — Worker, Pages, DO, cron deploy | Production `/health` curl ≥ 200 | post-deploy verifier |
| `code:package` — npm package publish | npm registry version exists | publish workflow receipt |
| `code:pr` — non-deploy code PR | PR merged + CI green | merge receipt |
| `docs` — documentation-only | PR merged | merge receipt |
| `ops` — label/project/registry change | Mutation observed via API | sync script receipt |
| `decision` — ADR, RFC, policy | PR merged + CODEOWNER approved | merge receipt |
| `incident` — Sentry/production issue | Error rate at/below threshold for 24h | verifier receipt |
| `infra` — Neon, Hyperdrive, secret, CF resource | Resource responds to health probe | infra verifier |

Default for unclassified work: `code:pr` (merge verification).

Work class is set by the supervisor template's `workClass:` field. Issues
without a matched template default to `code:pr` unless `@adrper79-dot` sets
`work-class: <value>` in the issue body.

---

## Decision 5 — Initial lease TTLs

**Question:** how long before a stale claim is released?

| Work class | TTL | Rationale |
|---|---|---|
| `code:deploy` | 30 minutes | Deploys are fast; >30 min means something is stuck |
| `code:package` | 30 minutes | Same as deploy |
| `code:pr` (Green tier) | 4 hours | Green execution + PR open should fit comfortably |
| `code:pr` (Yellow/Red tier) | 48 hours | Human approval required; allow time zones |
| `docs` / `ops` / `decision` | 48 hours | Low-urgency; human may be offline |
| `incident` (P0/P1) | 30 minutes | P0/P1 must never sit unclaimed |
| `incident` (P2/P3) | 4 hours | Operational cadence |
| `infra` | 4 hours | Provisioning ops should complete in one session |

The TTL clock starts at `claimed_at` stored in the supervisor claim comment.
It does not use `issue.updated_at` (which is bumped by any label/comment
activity and cannot be used as a claim-start signal).

Phase 2 will move TTL enforcement to LockDO for atomic expiry. For Phase 0–1,
the `releaseStaleClaimedIssues` sweep reads `claimed_at` from the claim comment
and uses the values above instead of the prior 7-day `issue.updated_at` heuristic.

---

## Decision 6 — Automation escape-rate threshold

**Question:** what escape rate triggers a trust-tier demotion?

| Period | Threshold | Action |
|---|---|---|
| Single event | Any revert, incident, or failed verification from automated work | Auto-record escape receipt; count toward window |
| Rolling 7 days | ≥ 1 escape per 10 completed outcomes (10%) | Demote affected action class one level; notify `@adrper79-dot` |
| Rolling 7 days | ≥ 2 escapes on the same template | Pause that template; require manual review |
| Rolling 30 days | 0 escapes on a demoted action class | Eligible for re-promotion (manual approval) |

A "severe escape" (production outage, data loss, security exposure) demotes
immediately to L0 Observe for the affected action class regardless of rate.

Baseline escape rate will be measured during the 14-day Phase 0 observation
window before any demotion rules are enforced.

---

## Decision 7 — Lease and transition authority

**Question:** confirm LockDO for atomic lease/fencing and D1 for receipts.

**Decision:** confirmed.

- **LockDO** (`supervisor` Worker Durable Object) is the sole authority for
  atomic lease acquisition, fencing token issuance, and lease expiry decisions.
  Worker-local clocks are never used to decide ownership.
- **D1** (`factory-supervisor` database) is the append-only store for
  transition receipts, run history, lease audit log, and template stats.
- **Phase 0–1 exception:** until the LockDO lease API is built (Phase 2),
  the `claimed_at` timestamp in the supervisor comment is the interim claim
  record. It is not atomic but is sufficient for a single-agent system.

---

## Decision 8 — Manual override policy

**Question:** who can override, under what conditions, and how long does it last?

**Authorized actors:** `@adrper79-dot` only until the team grows to ≥ 3 engineers,
at which point a second CODEOWNER may be nominated by ADR amendment.

**Override types:**

| Type | Mechanism | Required fields | Expiry |
|---|---|---|---|
| Priority bump | Comment `/priority <class> <reason>` | reason, class | Next re-score (≤ 14 days) |
| Status override | Label `status:<target>` + comment `override: <reason>` | reason | Until next automation cycle (≤ 1h) |
| Lease release | Comment `/release-claim <reason>` | reason | Immediate |
| WIP limit exception | Comment `/expedite <reason>` | reason | 48 hours |
| Break-glass | Comment `/break-glass <reason> expires: <ISO>` | reason, expiry | As specified (max 72h) |
| Template pause | Comment `/pause-template <id> <reason>` | id, reason | Until `/resume-template` |

All override comments are recorded by the lifecycle controller as transition
receipts. Automation reconciliation gives precedence to a manual override
that has not yet expired.

---

## Decision 9 — Incident recurrence policy

**Question:** grouping and reopen windows by source.

| Source | Group by | Reopen window | After window |
|---|---|---|---|
| Sentry | `issue.id` (Sentry group) | 30 days from last close | New issue; link predecessor |
| Roadmap duplicate | Semantic fingerprint | n/a (deduplicated at intake) | Survivor issue updated |
| Manual / ad-hoc | Issue title similarity ≥ 0.90 | 14 days | Shadow-mode suggestion only |

Severity escalation on recurrence:
- First recurrence within window: add `recurrence:1` label; bump priority one level.
- Second recurrence within window: add `recurrence:2`; notify `@adrper79-dot`; escalate to P1 minimum.
- Third+ recurrence: P0; require postmortem before closure.

A closed Sentry issue reopened by a new occurrence is not "Done" — the
lifecycle controller sets it to `In Progress` (with active assignee) or
`Intake` (unassigned), not `Done`.

---

## Decision 10 — Work-class profiles (Definition of Ready / Done per class)

**Question:** proportional Ready and Done evidence for each work class.

### Definition of Ready (DoR) — per class

| Work class | Required before leasing |
|---|---|
| `code:deploy` | Issue body present; affected service identified; deploy target (staging/prod) declared |
| `code:package` | Package name + semver bump declared; changelog entry drafted |
| `code:pr` | Issue body present; acceptance criteria present; no unresolved dependencies |
| `docs` | Target doc identified; owner confirmed |
| `ops` | Mutation target identified; idempotency confirmed |
| `decision` | RFC or ADR number assigned; §16 decisions list confirmed complete |
| `incident` | Sentry issue ID or reproduction steps present; severity declared |
| `infra` | Resource type + environment declared; cost estimate present |

### Definition of Done (DoD) — per class

| Work class | Required for Done |
|---|---|
| `code:deploy` | Merge receipt + `/health` 200 on target environment |
| `code:package` | npm registry shows new version; install smoke passes |
| `code:pr` | PR merged + CI green + acceptance criteria checked |
| `docs` | PR merged + CODEOWNER approved + no broken links |
| `ops` | Mutation confirmed via API read-back |
| `decision` | PR merged + CODEOWNER approved |
| `incident` | Error rate ≤ threshold for 24h; postmortem filed if P0/P1 |
| `infra` | Resource health probe passes; secret/binding verified in target env |

All classes: acceptance criteria from the issue body must be explicitly
checked before transitioning to Done. "CI green" alone is never sufficient
for `code:deploy` or `incident`.

---

## Consequences

- `label-sync.yml` must create the eight `status:*` labels across all
  monitored repos.
- `project-sync.mjs` `issue.closed` handler must read lifecycle labels
  before deciding Done vs. Cancelled.
- `supervisor-core.mjs` claim comment must embed `claimed_at: <ISO>` and
  `work-class: <class>` so `releaseStaleClaimedIssues` can apply TTLs
  from Decision 5 rather than the prior 7-day heuristic.
- The Project board needs the eight Status options (Intake, Ready, In Progress,
  In Review, Blocked, Verifying, Done, Cancelled). Todo may remain during
  migration as an alias for Intake.
- RFC-006 §16 is now fully resolved. Phase 0 implementation is unblocked.
