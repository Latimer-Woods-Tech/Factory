# RFC-006: Cohesive Automation Flow Operating Model

## Metadata

```
RFC Number:     RFC-006
Title:          Cohesive Automation Flow Operating Model
Author:         adrper79-dot + Codex
Date Filed:     2026-06-10
Status:         proposed
Target Ship:    Q3 2026
Review By:      2026-06-17
```

This RFC is the implementation plan for making Factory's work-management and
automation system mature, cohesive, efficient, and safely autonomous.

It operates inside:

- [`docs/OPERATING_FRAMEWORK.md`](../OPERATING_FRAMEWORK.md)
- [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md)
- [`docs/supervisor/TRUST_LADDER.md`](../supervisor/TRUST_LADDER.md)
- [`.github/workflows/REGISTRY.md`](../../.github/workflows/REGISTRY.md)
- [`docs/runbooks/definition-of-ready-done.md`](../runbooks/definition-of-ready-done.md)

It extends and, where explicitly noted, supersedes the operating assumptions in
[`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md).
The workflow tier registry, budget gate, concurrency rules, quarantine controls,
and trust ladder remain in force.

---

## 1. Executive Decision

Factory will operate one event-driven work-flow system with explicit ownership
for every state transition:

```
signal -> intake -> ready -> leased execution -> review -> deploy -> verify -> done
                     |             |                         |
                     +---------- blocked <-------------------+
```

The system will follow these rules:

1. GitHub issues are the source of truth for work intent and lifecycle state.
2. GitHub Projects is a projection for humans, not a second state database.
3. The supervisor lease manager is the only automation owner of execution
   leases and agent assignment.
4. Deployment verification, not PR merge, is the authority that marks
   production work Done.
5. Operational telemetry lives in a telemetry store or workflow artifacts, not
   in daily Git snapshot PRs.
6. Event handlers perform prompt updates; bounded reconciliation repairs drift.
7. Every mutation is idempotent, attributable, reversible where possible, and
   protected by a budget or circuit breaker.
8. New automation observes in shadow mode before it is allowed to mutate.
9. WIP is capped. The system finishes work before starting more work.
10. Automation earns autonomy through measured clean outcomes.
11. GitHub issue open/closed state is transport state, not proof of lifecycle
    completion.
12. The control plane degrades safely when GitHub, the lease store, or a
    downstream provider is unavailable.

This is a control-plane simplification, not a request to add more independent
bots.

---

## 2. Problem Statement

Factory already has sophisticated automation, but the components do not yet
behave as one operating system.

Observed during the 2026-06-10 audit; mutable counts must be reverified before
implementation:

| Signal | Observation | Effect |
|---|---:|---|
| Project size | 2,891 items | Broad reconciliation is expensive and incomplete |
| Factory open issues | 89 | Queue needs explicit intake and aging policy |
| Issues marked active | 37 | Active state overstates real execution |
| Active but unassigned | 21 | Waiting work is represented as WIP |
| Issues lacking a supervisor template | 42 | Non-executable work enters execution lanes |
| Exact roadmap duplicate pairs | 13 | Failed deduplication creates work |
| Duplicate Sentry issues | 9 | Equivalent incidents fragment attention |
| Open PRs | 51 | Review lane is carrying operational telemetry |
| Scheduled workflows | 42 | Independent schedules compete for API and attention |

Primary failure modes:

1. Multiple automations can independently mutate the same conceptual state.
2. `In Progress` can mean claimed, waiting, blocked, or merely labeled.
3. Full scans and per-item API calls consume rate limits without improving flow.
4. Duplicate detection sometimes fails open and creates more work.
5. Daily snapshots use the code-review lane as a telemetry database.
6. Generated repository-wide docs can block unrelated PRs.
7. Polling workflows duplicate event-driven capability.
8. Success is measured as automation activity rather than completed outcomes.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Make current work state truthful within five minutes.
- Keep automation-induced duplicate work below 1%.
- Keep abandoned execution leases at zero beyond their lease TTL.
- Reduce routine work-management API calls by at least 70%.
- Reduce scheduled workflow count and schedule-generated PR volume.
- Keep no more than three open implementation PRs per repo.
- Automatically clear routine blockers while escalating ambiguous or unsafe
  blockers with complete evidence.
- Make every autonomous decision inspectable from a durable receipt.
- Make automation maturity measurable and reversible.
- Preserve operator control and understandable recovery during degraded modes.

### 3.2 Non-goals

- Generative, unconstrained planning by the supervisor.
- Direct automation of irreversible actions.
- Replacing GitHub issues as the human-readable work contract.
- Turning GitHub Projects into an authoritative workflow engine.
- Auto-merging Red-tier paths.
- Adding a new workflow for every new concern.
- Preserving daily Git commits merely because they are auditable.

---

## 4. Design Principles

### 4.1 One Source of Truth per Concern

| Concern | Authority | Projections / consumers |
|---|---|---|
| Work intent, acceptance criteria, lifecycle | GitHub issue | Project, supervisor, digests |
| Human portfolio view | GitHub Project | Read-only projections |
| Execution ownership | Supervisor lease in LockDO/D1 audit | Issue labels/comments, admin UI |
| Code-review state | Pull request | Issue, supervisor |
| Deployment state | Deploy workflow receipt | Issue, Project, dashboards |
| Production verification | Post-deploy verifier | Completion transition |
| Runtime incidents | Sentry | Deduplicated issue projection |
| Operational metrics | Telemetry store / artifacts | Admin UI, digests |
| Architecture decisions | RFCs and ADRs | Supervisor constraints |
| Workflow classification | Workflow registry | Warden, dashboards |

No component may silently become a second authority.

### 4.2 Event First, Reconcile Second

- Use issue, PR, deployment, and workflow events for normal transitions.
- Use reconciliation only to repair missed events or external drift.
- Reconciliation must be bounded by repository, state, cursor, and API budget.
- Reconciliation writes only when observed state differs from desired state.
- A failed reconciliation does not invent or delete state.

### 4.3 Fail Closed for Work Creation and Unsafe Mutation

If deduplication, authorization, template matching, or risk classification
cannot complete, automation does not create or execute work. It emits an
observable failure receipt and retries with bounded backoff.

### 4.4 Leases, Not Permanent Claims

Agent ownership is a lease with:

- holder identity and type (`human` or `agent`)
- acquired timestamp
- expiry timestamp
- heartbeat
- attempt number
- execution correlation ID
- monotonically increasing fencing token
- release reason

A stale lease returns the item to `Ready` unless a blocker was discovered.
Every write performed under a lease must present the current fencing token.
Once a newer lease exists, writes from an expired holder are rejected even if
that holder resumes after a network partition.

LockDO time is authoritative for lease expiry. Worker-local clocks are not used
to decide ownership.

Concurrency uses two distinct primitives:

- one task lease per work item prevents duplicate execution of the same intent
- one resource lock per affected app/service prevents conflicting mutations
  from different work items

A cross-app item holds one task lease and acquires resource locks in a
deterministic order to avoid deadlock.

### 4.5 Visibility Before Enforcement

New scorers, gates, auto-remediation rules, and queue policies run in shadow
mode first. Promotion requires measured precision, recall, and operator impact.

### 4.6 At-Least-Once and Out-of-Order Delivery

GitHub and provider events may be duplicated, delayed, retried, or delivered
out of order. The lifecycle controller must:

- persist provider delivery IDs and reject replays
- serialize transitions per work item
- require expected-current-state or transition revision on mutation
- preserve source event time and observed time
- ignore stale transitions without discarding their audit receipt
- repair partial label writes during reconciliation

### 4.7 Backpressure Before Load Shedding

When arrival rate exceeds completion capacity, automation stops admitting
lower-value work before it exceeds WIP, API, or cost budgets. It must preserve
P0 incident intake, existing work, and blocker resolution. Queue growth,
oldest-item age, and arrival-to-throughput ratio are paging signals.

---

## 5. Canonical Work State Machine

### 5.1 States

| State | Meaning | Entry gate | Exit authority |
|---|---|---|---|
| `Intake` | Signal exists but has not passed trust/readiness checks | Issue or trusted signal created; source trust recorded | Triage policy |
| `Ready` | Executable, prioritized, dependencies clear | Definition of Ready passes | Supervisor lease |
| `In Progress` | A valid lease holder is actively executing | Lease acquired | Executor or lease reaper |
| `In Review` | A PR or explicit review artifact exists | Linked review artifact | Review/merge events |
| `Blocked` | Work cannot proceed without a named condition | Blocker record exists | Blocker resolver or human |
| `Verifying` | Change merged/deployed; outcome proof pending | Deploy or verification receipt exists | Verifier |
| `Done` | Acceptance criteria and required verification passed | Definition of Done passes | Verifier or authorized human |
| `Cancelled` | Work intentionally stopped or superseded | Reason and survivor/reference recorded | Authorized human/policy |

`Todo` may remain as a Project display label during migration, but its canonical
meaning is `Intake`. `In Progress` never means waiting.

GitHub issue open/closed state is orthogonal to lifecycle state. Closing an
issue requests either `Done` or `Cancelled`; the lifecycle controller chooses
the terminal state from evidence. Reopening a terminal issue returns it to
`Intake` unless an authorized transition request supplies a stronger target.

An unmatched supervisor template does not automatically make new intake
`Blocked`. It remains `Intake` with a readiness failure. It becomes `Blocked`
only after the work is accepted/prioritized and the missing template is the
named impediment.

Readiness and verification use work-class profiles so routine operational work
does not inherit irrelevant product-development checklist requirements.

### 5.2 Required Transition Evidence

| Transition | Required evidence |
|---|---|
| Intake -> Ready | DoR result, priority, owner class, dependencies |
| Ready -> In Progress | Active lease/owner; matched approved template for autonomous execution |
| In Progress -> In Review | Linked PR/review artifact |
| Any active state -> Blocked | Blocker type, owner, retry or review time |
| Blocked -> recorded resume state | Blocker resolution receipt |
| In Review -> In Progress | Changes requested and valid lease resumed |
| In Review -> Verifying | Merge/deploy receipt |
| In Review -> Ready or Cancelled | Review artifact closed unmerged with reason |
| Verifying -> Done | Acceptance and production verification receipts |
| Verifying -> In Progress or Blocked | Failed verification and rollback/recovery receipt |
| Any state -> Cancelled | Reason plus duplicate/superseding reference if applicable |

### 5.3 Transition Invariants

- Exactly one lifecycle status label per issue.
- Exactly one active task lease per issue; resource locks are acquired per
  affected app/service.
- `In Progress` requires a non-expired lease.
- `Blocked` requires a structured blocker record.
- `Done` requires verification appropriate to the work class.
- PR merge alone never closes production-affecting work.
- Duplicate closure always records the surviving issue.
- A manual issue close without completion evidence becomes `Cancelled` or
  awaits authorized classification; it never silently becomes `Done`.
- Human overrides require an authorized actor, reason, and expiry/review time.
- A work item may have multiple blockers; it is `Blocked` while any hard
  blocker remains unresolved.

---

## 6. Target Architecture

### 6.1 Control Loop

```
Trusted signals
  -> Intake normalizer
  -> Deduplication and correlation
  -> Readiness and risk classifier
  -> Prioritized Ready queue
  -> Supervisor lease and execution
  -> PR / review / merge
  -> Deploy and verification
  -> Done or Blocked
  -> Metrics and learning
```

### 6.2 Single-Writer Matrix

| Mutation | Single writer | Other components |
|---|---|---|
| Create normalized issue | Intake normalizer | Submit candidate signals |
| Set lifecycle status label | Lifecycle controller | Submit transition request |
| Update Project Status | Project sync | Read issue state |
| Assign execution agent | Supervisor | Read assignment |
| Acquire/release lease | Supervisor lease manager | Observe lease |
| Mark blocker resolved | Blocker resolver | Authorized human or automation submits evidence |
| Link PR to issue | PR lifecycle controller | Read link |
| Mark verification passed | Verification controller | Submit receipts |
| Close Done issue | Lifecycle controller | Request completion |
| Close duplicate | Lifecycle controller | Deduplication controller proposes survivor and evidence |
| Archive Project item | Native Project automation | Observe archive |

GitHub labels remain the first implementation of lifecycle state. A future
state service may replace labels only through a separate accepted RFC.

The single-writer matrix governs automation writers. Authorized human actions
performed through GitHub are treated as external transition requests/events;
the controller records, validates, and reconciles them rather than fighting the
human interface.

D1 remains the canonical supervisor run, lease-audit, transition-receipt, and
template-stat store. LockDO performs atomic lease acquisition and issues
fencing tokens. GitHub issues remain canonical for human-readable work intent
and lifecycle outcome; D1 must not become a second editable task backlog.

### 6.3 Idempotency Contract

Every mutating automation must:

1. Accept or derive an idempotency key.
2. Read current state before writing.
3. Perform no write when desired state already exists.
4. Emit one correlation ID across issue, PR, workflow, deploy, and verifier.
5. Retry transient failures with exponential backoff and jitter.
6. Send terminal failures to a durable dead-letter queue, then project an issue
   when GitHub is available.
7. Never treat an API/search failure as "no existing item."
8. Authorize the actor and validate untrusted event payloads before mutation.
9. Record transition revision, source delivery ID, and fencing token where
   applicable.
10. Keep secrets and unnecessary PII out of receipts and telemetry.

The system targets effectively-once outcomes, not impossible exactly-once
delivery. A non-idempotent external side effect is not eligible for autonomous
execution unless the provider supports an idempotency key or the plan defines a
safe approval and compensation strategy.

Multi-step mutations use a saga-style receipt: each completed step, failed
step, compensation, and intentionally preserved partial result is recorded.
Automation does not blindly roll back when compensation would be more harmful
than the partial state.

---

## 7. Queue and Kanban Policy

### 7.1 Queue Ordering

Ready work receives a transparent score:

```
priority score =
  customer impact
  + production risk
  + revenue impact
  + blocker removal value
  + strategic fit and cost of delay
  + age adjustment
  + confidence
  - execution risk
```

The score recommends ordering; it does not bypass legal holds, Red-tier review,
dependency order, or WIP limits. Effort is used for capacity planning, not as a
blanket penalty that indefinitely starves large important work. Human priority
overrides require a reason and review/expiry time.

Supported classes of service are `expedite`, `fixed-date`, `standard`, and
`intangible`. Expedite work is limited to one active item per repo unless an
incident commander records a temporary override.

### 7.2 WIP Limits

| Scope | Limit |
|---|---:|
| Open implementation PRs per repo | 3 |
| Active supervisor lease per app | 1 |
| Active Red-tier milestone | 1 |
| Concurrent automation-control-plane milestone | 1 |
| Auto-remediation attempts per incident | 1 before escalation |

When a WIP limit is reached, the controller works the oldest blocker or review
item instead of starting new work. The controller enforces admission for
automation-created work and reports human-created overages; it does not close
or block human work merely to satisfy a metric.

### 7.3 Aging Policy

| Condition | Action |
|---|---|
| Ready > 14 days | Re-score and confirm relevance |
| In Progress heartbeat missed | Release lease or mark Blocked |
| In Review > 2 business days | Route review reminder with evidence |
| Blocked retry time reached | Run blocker resolver |
| Blocked > 7 days | Escalate owner decision |
| Done > 30 days | Auto-archive Project item |

Native GitHub Project automation may perform auto-archive only. Project sync
remains the only automation writer for Project item addition and Project Status
so native rules cannot compete with lifecycle projection.

### 7.4 Work Item Shape and Dependencies

Only bounded executable tasks may enter `Ready` or receive a lease. Epics,
milestones, and parent issues are planning containers whose progress is derived
from child outcomes; they do not consume execution WIP.

Executable tasks must:

- have one independently verifiable outcome
- fit within the two-week milestone limit and preferably one PR
- identify affected repos/services before leasing
- link blocking dependencies explicitly
- split before execution when risk, ownership, or verification differs

Dependency edges are directional and cycle-checked. Cross-repo release trains
use child tasks and verification receipts rather than one long-lived umbrella
lease.

---

## 8. Blocker Resolution

Every blocker uses a typed record:

```yaml
id: stable-blocker-id
type: dependency | approval | credential | ci | runtime | vendor | ambiguity
severity: hard | advisory
owner: automation-name-or-human
detected_at: ISO-8601
retry_at: ISO-8601-or-null
evidence_url: URL
resolution_gate: machine-checkable condition
resume_state: ready | in_progress | in_review | verifying
attempts: 0
revision: 1
```

The blocker resolver may automatically clear:

- transient CI failures with a known high-precision signature
- expired execution leases
- merge-base drift when a clean rebase is allowed
- missing routine labels or Project projection drift
- recovered vendor/runtime health
- completed dependency issues
- acyclic dependency edges whose completion receipt is valid

It must escalate:

- ambiguous requirements
- missing approved template
- credentials requiring human creation or review
- legal or regulatory gates
- irreversible mutations
- repeated auto-remediation failure
- Red-tier approval

Automation must not clear a blocker merely because time passed.

Blockers are a collection, not one field. Clearing a blocker requires matching
its current revision so stale resolver runs cannot clear newer evidence.
Dependency intake detects cycles and escalates them instead of repeatedly
requeueing the affected items.

---

## 9. Deduplication and Intake

### 9.1 Normalization

Before issue creation, intake computes:

- source system and source identifier
- normalized title
- semantic fingerprint
- affected service/repository
- error or opportunity signature
- time window
- correlation links

### 9.2 Deduplication Policy

1. Exact source ID match: update existing issue.
2. Exact semantic fingerprint match: update or link existing issue.
3. High-confidence similarity match: propose duplicate in shadow mode.
4. Unavailable search or API: fail closed and retry.
5. Duplicate close: preserve the oldest actionable issue unless an explicit
   survivor policy selects a better canonical issue.

Recurring incidents use a group-plus-occurrence model. A new occurrence may
update/reopen a recent canonical incident, but an old closed incident is not
silently reused forever. Recurrence windows, severity escalation, and reopen
rules are defined per source.

Deduplication controllers must report:

- candidates evaluated
- matches found
- false-positive corrections
- issues prevented
- issues merged/closed

---

## 10. Telemetry and Snapshot Strategy

### 10.1 Decision

Live operational telemetry will not use pull requests as its primary storage or
delivery mechanism.

Use:

- GitHub Actions artifacts for short-lived reports and diagnostics
- an operational database or metrics store for time series and queue state
- Admin Studio/dashboard views for current operator state
- issues only for actionable threshold breaches
- Git commits only for reviewed policy, architecture, and periodic checkpoints

Use existing stores by default:

- D1 for supervisor runs, transition receipts, lease audit, and template stats
- `factory_events` in Neon for cross-app operational/business events
- Sentry for errors and incidents
- PostHog for product behavior
- GitHub Actions artifacts for short-lived diagnostics

A new telemetry store requires its own cost, retention, security, restore, and
ownership decision.

### 10.2 Retention Classes

| Data | Home | Retention |
|---|---|---|
| Current queue/work state | GitHub issues + Project projection | Life of work |
| Workflow run detail | GitHub Actions + observability | Provider retention |
| Time-series operational metrics | Metrics/telemetry store | At least 13 months |
| Daily generated reports | Artifacts/dashboard | 30-90 days |
| Weekly governance checkpoint | Git | Long-lived |
| Architecture and policy | Git | Permanent |

Telemetry schemas are versioned. Collection must define data classification,
tenant/app ownership, retention, deletion, backfill, late-arriving-event, and
restore behavior. Dashboards are projections and never mutate work state.

### 10.3 Migration of Snapshot Workflows

Cost, revenue, state, scorecard, founder stats, conformance, launch readiness,
and digest workflows will move to a shared reporting pipeline:

1. Collect normalized metrics.
2. Write one telemetry record set.
3. Render dashboard and digest views.
4. Open or update issues only for actionable breaches.
5. Produce one weekly checkpoint PR when a durable Git record is useful.

Daily timestamped snapshot branches and accumulating snapshot PRs will be
retired.

---

## 11. Workflow Orchestration

### 11.1 Orchestration Waves

Replace independent schedules with three coordinated waves:

| Wave | Purpose | Typical contents |
|---|---|---|
| Event-driven | Immediate lifecycle updates | Issue, PR, deploy, incident events |
| Operational wave | Health and remediation | Reconcile, lease reap, blocker resolve, Sentry intake |
| Reporting wave | Aggregate and communicate | Metrics rollup, digests, weekly checkpoint |

A thin wave coordinator dispatches independently runnable jobs with a
correlation ID, per-job isolation, maximum parallelism, and API budget. A
coordinator failure must not disable event-driven lifecycle updates or prevent
an operator from running a job directly. Existing reusable workflows remain
reusable execution units.

### 11.2 Workflow Admission Rules

A new workflow is allowed only when:

- no existing orchestrator or reusable workflow can own the behavior
- an owner, tier, SLO, rollback, concurrency group, and cost budget exist
- it retires or consolidates an existing workflow, or has an approved exception
- it runs in shadow mode when it will eventually mutate or block

### 11.3 API and Cost Budgets

Every control-plane run declares:

- maximum REST calls
- maximum GraphQL points
- maximum LLM spend
- maximum wall-clock duration
- maximum mutation count

At 80% budget, reduce optional work. At 100%, stop mutations, persist a cursor,
and emit one actionable receipt.

Schedule consolidation is accepted only when it reduces cost/noise without
violating a workflow SLO or creating an unacceptable shared failure domain.

---

## 12. Safety, Reliability, and Governance

### 12.1 Required Controls

- Least-privilege GitHub App tokens.
- No long-lived PAT when an installation token is viable.
- Explicit permissions in every workflow.
- Pinned third-party action SHAs.
- Concurrency controls on push, PR, schedule, and mutating event workflows.
- Circuit breakers for repeated failures and API exhaustion.
- Dead-letter handling for terminal events.
- Correlation IDs and structured receipts.
- Shadow mode before enforcement.
- Trust-ladder promotion and automatic demotion.
- Red-tier human review and irreversible-action approval.
- Automation pause control with tested recovery.
- Break-glass operation with authorized actor, expiry, audit receipt, and
  mandatory review.
- Degraded-mode runbooks for GitHub, LockDO/D1, and provider outages.
- Append-only durable receipts; GitHub comments are projections, not the audit
  authority.
- State-machine model tests, event replay tests, contract tests, and fault
  injection before mutation promotion.
- Human approvals bind to the exact plan hash, template version, target
  revision, and expiry. A changed plan requires new approval.
- Template trust and promotion evidence reset or requalify when a material
  template version changes.

### 12.2 Autonomy Promotion

| Level | Capability | Promotion gate |
|---|---|---|
| L0 Observe | Report only | Baseline established |
| L1 Recommend | Propose transition/remediation | >=95% precision in shadow |
| L2 Mutate reversible state | Labels, Project projection, retry | 30 days clean |
| L3 Execute bounded work | Green/Yellow templates under trust ladder | Template promotion rules |
| L4 Close loop | Deploy, verify, close routine work | 60 days within SLO, no severe escape |

No global promotion exists. Promotion is per action class and template.
Error-budget exhaustion freezes promotions and demotes or pauses the affected
action class; it does not automatically disable unrelated automation.

---

## 13. Service-Level Objectives and Metrics

### 13.1 Flow SLOs

| Metric | Initial target |
|---|---:|
| Event-to-Project projection p95 | < 5 minutes |
| Ready-to-lease p50 for eligible work with available capacity | < 24 hours |
| Stale lease age | < 30 minutes beyond TTL |
| In Review age p75 | < 2 business days |
| Blocked item gains owner and next action | 100% within 15 minutes |
| Duplicate issue creation rate | < 1% |
| Actionable automation-created PR backlog older than 24h | 0 |
| Project Done item archive age | <= 30 days |
| Lifecycle event dead-letter age p95 | < 30 minutes |
| Control-plane recovery point objective | <= 5 minutes |
| Control-plane recovery time objective | <= 60 minutes |

### 13.2 Efficiency SLOs

| Metric | Initial target |
|---|---:|
| API calls per completed work item | Reduce 70% from baseline |
| No-op/cancelled automation runs | Reduce 80% from baseline |
| Automation mutations that change no state | < 2% |
| Human touches per Green-tier completed item | <= 1 |
| Auto-remediation success on approved signatures | > 80% |

### 13.3 Outcome Metrics

- Lead time from Ready to Done.
- Throughput by work class.
- Aging WIP.
- Blocked time as a percentage of lead time.
- Automation yield: completed outcomes per automation run.
- Escape rate: revert, incident, or failed verification after automated work.
- Trust-tier promotion and demotion rate.
- Cost per completed outcome.

Activity counts such as issues created, PRs opened, or workflows run are
diagnostic metrics, not success metrics.

Every SLO definition must name its numerator, denominator, exclusions, owner,
measurement source, and error-budget response before enforcement. Metrics must
not reward closing, cancelling, or suppressing valid work merely to improve the
dashboard.

---

## 14. Implementation Plan

The phases below obey the Operating Framework: one control-plane milestone in
flight at a time, no more than two weeks per milestone, and shadow mode before
new enforcement.

### Phase 0: Stabilize Truth and Drain Existing Backlog

**Purpose:** stop creating misleading state before building higher autonomy.

Actions:

- Land current lifecycle, Project sync, deduplication, label-sync, and docs-gate
  corrections.
- Add the lifecycle labels and Project Status options required for `Intake`,
  `Ready`, `In Progress`, `In Review`, `Blocked`, `Verifying`, `Done`, and
  `Cancelled`.
- Establish a reviewed survivor policy, then close/link existing roadmap and
  Sentry duplicates.
- Reconcile the workflow registry, current mutation-writer inventory, and live
  trigger inventory before using them for SLOs or retirement decisions.
- Drain or supersede stale generated snapshot PRs.
- Enable native Project auto-archive for Done items after 30 days.
- Capture baseline metrics for 14 days.
- Define work-class readiness/verification profiles and manual close/reopen
  semantics.
- Establish a clean-worktree and merged-branch hygiene policy: clean merged
  worktrees may be removed automatically; dirty or unmerged worktrees are
  reported but never deleted automatically.

Exit criteria:

- `In Progress` items all have a valid owner/lease or review artifact.
- All existing blockers have a type, owner, and next action.
- Duplicate cleanup has a survivor record for every closed duplicate.
- Snapshot PR backlog older than 24 hours is zero.
- Baseline dashboard exists.
- Existing issue-close events no longer silently project every issue to Done.

Rollback:

- Revert lifecycle controller changes.
- Disable native Project automation.
- No issue is deleted; duplicate closures remain reversible.

### Phase 1: Canonical Lifecycle Controller

**Purpose:** enforce one state machine and one writer.

Actions:

- Implement transition validation and exactly-one-status-label enforcement.
- Route all status mutations through one lifecycle controller.
- Make Project sync projection-only.
- Add idempotency keys and correlation IDs.
- Add per-item serialization, transition revisions, replay protection, and
  authorized human override handling.
- Run transition enforcement in shadow mode for 14 days.

Exit criteria:

- >=99% of observed transitions are valid in shadow.
- No competing status writer remains.
- Project drift is repaired within the flow SLO.
- Mutation no-op rate is below 2%.

Rollback:

- Freeze and drain the controller, then switch back to exactly one known-good
  prior label writer. Never restore competing mutating writers in parallel.

### Phase 2: Leases, WIP, and Blocker Resolver

**Purpose:** ensure active work is truly active and blocked work moves.

Actions:

- Implement lease acquire, heartbeat, expiry, and release.
- Issue fencing tokens from LockDO and reject stale-holder mutations.
- Enforce per-app and per-repo WIP limits.
- Add typed blocker records and resolver policies.
- Add stale lease and aging-WIP sweeps.
- Route review and blocker work ahead of new starts when WIP is full.

Exit criteria:

- No `In Progress` issue lacks a valid lease.
- Stale leases clear within 30 minutes beyond TTL.
- 100% of Blocked items have owner and next action.
- Open implementation PR WIP stays within policy for 30 days.

Rollback:

- Disable automated lease expiry and blocker clearing; retain observations.

### Phase 3: Intake and Deduplication Control

**Purpose:** prevent automation from manufacturing backlog.

Actions:

- Introduce normalized intake envelopes and semantic fingerprints.
- Consolidate roadmap, opportunity, Sentry, and trusted webhook intake.
- Add fail-closed behavior, retry, and dead-letter handling.
- Add recurrence windows and group-plus-occurrence incident handling.
- Run similarity-based duplicate suggestions in shadow mode.
- Add survivor-policy-assisted duplicate closure.

Exit criteria:

- Exact duplicate creation rate below 1%.
- No duplicate is closed without a survivor reference.
- Intake failures create one observable dead-letter record.
- Similarity suggestions maintain >=95% precision before mutation promotion.

Rollback:

- Keep exact matching; disable semantic duplicate mutation.

### Phase 4: Telemetry Pipeline and Snapshot Retirement

**Purpose:** remove operational reporting from the code-review lane.

Actions:

- Define the normalized operational metrics schema.
- Confirm the existing-store allocation or document any justified new store.
- Build one shared collector and renderer pipeline.
- Migrate daily snapshot workflows to artifacts/dashboard writes.
- Replace daily snapshot PRs with one weekly governance checkpoint.
- Retire redundant snapshot workflows and branch patterns.

Exit criteria:

- Current dashboards remain available without a daily Git PR.
- No daily snapshot PR is created for 30 days.
- Weekly checkpoint is reproducible and auto-merge eligible.
- Telemetry retention and restore are tested.

Rollback:

- Re-enable one consolidated snapshot checkpoint workflow, not the retired
  independent workflows.

### Phase 5: Workflow Orchestration and Budgeted Reconciliation

**Purpose:** reduce schedule noise, API spend, and coordination collisions.

Actions:

- Inventory all schedules and map them to orchestration waves.
- Consolidate operational and reporting schedules.
- Add API, mutation, time, and LLM budgets.
- Add cursors and bounded reconciliation.
- Retire duplicate polling when event coverage is proven.
- Update the workflow registry as each workflow retires or changes tier.

Exit criteria:

- Scheduled no-op/cancelled run volume reduced by at least 80%.
- No control-plane run exceeds its declared API budget.
- Event coverage and reconciliation repair are proven for 30 days.
- Retired workflows have documented replacement and rollback.
- Coordinator failure does not prevent direct job execution or event-driven
  lifecycle updates.

Rollback:

- Restore the last known-good orchestration wave; do not restore every retired
  schedule independently unless incident evidence requires it.

### Phase 6: Outcome-Based Autonomy

**Purpose:** safely close routine loops with minimal human involvement.

Actions:

- Add transparent queue scoring and aging policies.
- Promote high-precision blocker remediations.
- Connect deploy verification to completion transitions.
- Measure automation yield, escape rate, and cost per outcome.
- Promote action classes through the autonomy ladder.
- Expose operator controls, receipts, and pause/demotion actions in Admin Studio.

Exit criteria:

- Green-tier routine work reaches Done without manual state management.
- Human touches per eligible Green-tier item are <=1.
- Escape rate remains within agreed threshold for 60 days.
- Every autonomous completion has complete correlated receipts.

Rollback:

- Demote affected action class or template without disabling unrelated
  automation.

---

## 15. Work Breakdown and Ownership

| Workstream | Primary owner | Required reviewers | First deliverable |
|---|---|---|---|
| Lifecycle controller | Factory control plane | Supervisor + platform | Transition contract |
| Project projection | Project sync | Platform | Projection-only sync |
| Lease manager | Supervisor | Security + platform | Lease schema and TTL policy |
| Blocker resolver | Supervisor | Domain owner | Typed blocker registry |
| Intake/dedup | Factory events | Sentry/roadmap owners | Normalized intake envelope |
| Telemetry migration | Observability | Finance/revenue owners | Metrics schema and store ADR |
| Workflow orchestration | Workflow registry owner | Platform | Schedule-to-wave inventory |
| Verification completion | Deploy platform | App owners | Verification receipt contract |
| Admin controls | Admin Studio | Security + operator | Pause/demote/receipt views |

Every workstream must use existing reusable workflows and shared packages where
possible. Any proposed new workflow must pass the workflow budget gate.

---

## 16. Required Decisions Before Implementation

Resolve each decision before its dependent phase begins:

1. **Telemetry store:** choose the existing operational database/metrics system
   that will replace daily Git snapshots.
2. **Lifecycle representation:** approve label-backed lifecycle state for the
   first implementation.
3. **Duplicate survivor policy:** oldest actionable issue versus highest-quality
   issue.
4. **Verification classes:** define which work types require production
   verification versus merge verification.
5. **Initial lease TTLs:** define by work class.
6. **Initial automation escape-rate threshold:** define the demotion trigger.
7. **Lease and transition authority:** confirm LockDO for atomic lease/fencing
   and D1 for append-only transition/run receipts.
8. **Manual override policy:** define authorized actors, expiry, and break-glass
   review.
9. **Incident recurrence policy:** define grouping and reopen windows by source.
10. **Work-class profiles:** define proportional Ready and Done evidence for
    docs, code, deploy, incident, and decision work.

Each decision should be recorded as an ADR or accepted amendment to this RFC.

---

## 17. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Central controller becomes a bottleneck | Stateless handlers, durable receipts, bounded reconcile, tested fallback |
| Automation closes or moves valid work incorrectly | Shadow mode, transition invariants, reversible mutations |
| WIP caps slow urgent work | Explicit P0 expedite lane with post-incident review |
| Telemetry migration loses history | Dual-write during migration and restore test |
| Schedule consolidation creates a large blast radius | Independent reusable jobs, per-job budgets, wave-level circuit breaker |
| Queue scoring hides business judgment | Explainable score components; human priority override remains authoritative |
| More controls create more maintenance | Retirement requirement and cost-per-outcome metric |
| Rate limits halt control plane | Event-first design, cursors, budgets, backoff, fail-closed creation |
| Expired lease holder resumes and writes | Monotonic fencing token checked on every leased mutation |
| Delayed event reverses newer state | Per-item serialization, transition revisions, replay protection |
| Native Project automation competes with Project sync | Native automation owns archive only; Project sync owns Status projection |
| Coordinator outage stalls all operations | Thin coordinator, isolated jobs, direct-run fallback, event path independence |
| Metrics encourage premature closure or work suppression | Explicit denominators, exclusions, and anti-gaming review |
| Human override fights reconciliation | Authorized override receipt with expiry and deterministic precedence |

---

## 18. Migration and Verification Strategy

Migration must never run old and new mutating writers concurrently.

### 18.1 Cutover Protocol

1. Inventory every current writer for status, assignment, close, Project
   Status, and verification state.
2. Replay recorded historical events against the new controller in shadow.
3. Run model-based state-machine and duplicate/out-of-order event tests.
4. Pilot one repository and one transition class.
5. Freeze the old writer, drain in-flight events, record a cutover revision,
   then enable the new writer.
6. Reconcile and compare expected versus observed state.
7. Expand by repository and action class only while error budget remains.

Rollback switches back to exactly one known-good writer after draining the new
writer. It never restores competing writers in parallel.

### 18.2 Required Failure Tests

- duplicated, delayed, and out-of-order GitHub deliveries
- partial label mutation and reconciliation repair
- lease expiry followed by stale-holder resume
- GitHub rate-limit exhaustion
- LockDO/D1 unavailable
- telemetry store unavailable
- coordinator unavailable while direct jobs continue
- automation pause and break-glass recovery
- duplicate fingerprint collision and recurring incident
- manual close, reopen, and authorized override

### 18.3 Disaster Recovery

Backups, retention, and restore tests are required for D1 receipts/lease audit
and the selected telemetry stores. Recovery rebuilds projections from durable
sources and does not infer completion from missing data.

---

## 19. Acceptance and Governance

This RFC is accepted when:

- CODEOWNER approves the single-writer matrix and state machine.
- Required decisions in section 16 are resolved or explicitly delegated to a
  phase-specific ADR.
- The implementation sequence is added to the active operations board.
- Phase 0 has an owner and measurable baseline.
- Migration and failure-test strategy has an owner.

Changes to the state machine, single-writer ownership, irreversible-action
policy, or telemetry source of truth require an RFC amendment or new ADR.

Operational thresholds may change through reviewed configuration when the
underlying policy remains intact.

---

## 20. External Best-Practice Basis

The design intentionally applies established operational practices:

- Kanban WIP limits and aging-WIP management
- SRE-style SLOs, error budgets, and toil reduction
- event-driven architecture with idempotent consumers
- leases and heartbeats for distributed work ownership
- circuit breakers, bounded retries, and dead-letter handling
- least privilege and separation of duties
- progressive delivery and shadow-mode enforcement
- immutable audit receipts and correlation IDs
- outcome metrics over activity metrics

The mature target is not maximum automation. It is maximum reliable flow with
the least necessary human and machine toil.
