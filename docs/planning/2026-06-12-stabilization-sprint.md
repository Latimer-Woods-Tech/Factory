---
date: 2026-06-12
status: active
owner: adrper79
executor: Claude Sonnet (point agent)
builds_on: docs/decisions/2026-06-10-sell-phase-action-plan.md
review: 2026-06-26 (sprint exit)
---

# Stabilization Sprint — 2026-06-12 → 2026-06-26

Execution plan for the remaining COMPLETE and IMPROVE items from the 2026-06-11
deep-dive review. A Sonnet-class agent runs point on this plan. Everything an
executor needs is embedded here — do not assume access to the drafting
session's context or memory.

## 0. Context — what just happened and where you are

On 2026-06-11/12 an execution session repaired the platform's instrument
cluster and turned on the video cadence. Summary of what is **already done**
(do not redo):

| Done | Evidence |
|---|---|
| Dependabot: 31 → 0 open alerts | #1657 merged; rescan clean 2026-06-11T22:56Z |
| Completion tracker unfrozen (was 0.0% for 17 days) | #1661 (aggregator auth headers + fail-loud), #1662 (drift-PR `null\|null` guard), #1663 (first honest drift: **3.0% weighted / 10.9% known, 181 rows**), #1664 (snapshot allowlist) |
| STATE.md refreshed | #1665 (weekly-governance-checkpoint, dispatched manually — first-ever run) |
| Dead-man's-switch | NOT broken — its daily red runs were the designed alarm. No action. |
| Video cadence seeded | 10 jobs in schedule-worker `video_calendar`, 2026-06-12 → 06-22, idempotency keys `cadence-W2x-*` |
| Video pipeline bugs (5-layer onion) | #1666 (appId filter), #1667 (durable GITHUB_TOKEN), #1668 (build video-studio pkg), #1669 (video-studio lockfile), + WORKER_API_TOKEN tri-store sync |

**The recurring failure class in this codebase is automation that reports
success while doing nothing** (tracker "success" at 0 rows, cron "success" at
0 dispatches, drift guard "success" without creating PRs, deploys re-arming
dead tokens). Treat every green checkmark as unverified until you have seen
the *output artifact change* or a `curl` status with your own eyes.

## 1. Operating rules (binding — read before any task)

1. **Premise check first.** This plan was drafted against a moving system and
   parallel sessions were active. Before working ANY task, re-verify its
   premise with the listed probe command. If the problem no longer exists,
   record the evidence in the tracking issue, mark the task `n/a`, move on.
2. **Session start:** follow CLAUDE.md's Session Start Checklist. Read
   `docs/STATE.md` (check its `Generated:` stamp — durable refresh is weekly,
   Mondays), this plan, and `docs/GAP_REGISTER.md`.
3. **Kickoff (first session only):** open one tracking issue titled
   `Stabilization Sprint 2026-06-12 — tracking` with a checklist of all task
   IDs below, label `area:platform`. Post a short comment at the end of every
   working session: tasks touched, evidence links, blockers.
4. **One task → one branch → one PR.** Branch naming `fix/<task-id>-<slug>` or
   `chore/<task-id>-<slug>`. Conventional commits
   (`<type>(<scope>): <description>`). Respect ADR-0005 PR size budgets
   (Green ≤50 / Yellow ≤200 / Red ≤500 lines). Never push to `main` — it is
   ruleset-protected (required checks: `validate`, `Analyze (javascript)`,
   `dependency-review`; `lighthouse`/`docs-health` failures do NOT block).
   Arm auto-merge (`gh pr merge --auto --squash`) on every PR.
5. **Sub-agent isolation:** any write-capable sub-agent MUST be spawned with
   `isolation: "worktree"` (CLAUDE.md rule). Read-only explorers exempt.
6. **Verification Requirement:** a fix is done when `curl` (or equivalent
   observable output) shows the expected result on the branded domain, and
   that evidence is pasted in the PR body. CI green alone is not done.
7. **Hard constraints:** Cloudflare Workers runtime only for app code (no
   `process.env`, no Node built-ins, no `Buffer`, no CommonJS, no raw `fetch`
   without error handling, no secrets in source). `.github/scripts/**/*.mjs`
   (Node.js) exempt.
8. **Secrets doctrine (learned expensively on 2026-06-11):**
   - GCP Secret Manager (project `factory-495015`) is canonical. Fetch:
     `gcloud secrets versions access latest --secret=<NAME> --project=factory-495015 | tr -d '\r\n\357\273\277'`
     (always strip CR/LF/BOM).
   - Deploy workflows re-provision worker secrets from **GitHub Actions
     secrets** at deploy time. If you hot-patch a worker secret via the CF
     API, you MUST also `gh secret set <NAME>` with the same value or the
     next deploy silently reverts your fix.
   - Worker GITHUB_TOKEN-style secrets must be **long-lived PATs** (GCP
     `FACTORY_GH_PAT`), never GitHub App installation tokens (1-hour expiry +
     revoked at workflow cleanup).
   - On Windows, `npx wrangler secret put` can hang/die silently. Prefer the
     CF API:
     `PUT https://api.cloudflare.com/client/v4/accounts/a1c8a33cbe8a3c9e260480433a0dbb06/workers/scripts/<worker>/secrets`
     with `{"name":...,"text":...,"type":"secret_text"}` — then ALWAYS verify
     with an authenticated probe request.
9. **Naming-split trap:** the platform uses BOTH `selfprime` and `prime_self`
   (and `prime-self`, `HumanDesign`) for the same product, and `coh` /
   `cypher` / `cypher-healing` for another. Any identifier equality check
   across systems must be checked against the *stored* value, not assumed.
10. **Two-strike rule:** blocked after two genuine attempts → write the
    blocker into the tracking issue (what was tried, exact errors, suspected
    cause), mark the task blocked, move to the next task. Never suppress with
    `@ts-ignore`/`eslint-disable`; never skip hooks.
11. **Platform freeze is binding** (sell-phase plan): no new packages, no new
    apps, no new admin surface. Litmus test for any tempted scope expansion:
    "does this change a number a customer or operator can see?" If not, it
    waits.
12. **Irreversible actions** (deleting CF resources, Stripe mutations, live
    email outside test mode) → stop and ask the operator. Everything else:
    proceed and document.

## 2. Phase 0 — Pipeline verification carry-overs (Day 1, ~half day)

These confirm the 2026-06-11 fixes hold **unattended**. They are checks, not
builds — but each has a contingency branch.

### T0.1 — Render pipeline end-to-end (P0)
- **Premise:** PRs #1666–#1669 merged; job `c3336e4f-9c55-436f-a01b-3282038b55b5`
  (prime_self, brief `platform-overview`) may be in `pending` or `failed`.
- **Steps:**
  1. `TOK=$(gcloud secrets versions access latest --secret=WORKER_API_TOKEN --project=factory-495015 | tr -d '\r\n\357\273\277')`
  2. Check job: `curl -s https://schedule.latwoodtech.work/jobs/c3336e4f-9c55-436f-a01b-3282038b55b5 -H "Authorization: Bearer $TOK"`
  3. If `failed`: reset → `curl -X PATCH .../jobs/<id> -d '{"status":"pending"}' -H "Content-Type: application/json"` (same auth), then
     `curl -X POST https://video-cron.latwoodtech.work/trigger -H "Authorization: Bearer $TOK"` → expect `{"dispatched":1,...}`.
  4. Watch the resulting `render-video.yml` run. **Gotcha:** push/PR runs of
     this workflow are dry-runs (`JOB_ID=dryrun-job`) — only
     `workflow_dispatch` runs are real. Filter by event.
- **Acceptance:** a `workflow_dispatch` run completes `success`; the job's
  status becomes `done`; the import step output contains a live watch-page
  URL that `curl`s 200.
- **Contingency:** if it fails at a NEW step, you've hit onion layer 6 —
  diagnose from `--log-failed`, fix via PR following the pattern of #1668/#1669
  (each prior layer is documented in those PR bodies). Budget: 2 strikes.

### T0.2 — Cadence runs unattended (P0, passive)
- **Acceptance:** the `capri-1` job (id `3f2773d3-…`, scheduled 2026-06-12
  16:00Z) dispatches via the **hourly cron with no manual trigger** and
  completes. Check after 17:30Z.
- **Gotcha:** capricast has never rendered — its voice falls back to
  `ELEVENLABS_VOICE_DEFAULT`. If the run fails at "Resolve ElevenLabs voice
  id", that GCP secret is empty → set it (any valid ElevenLabs voice id) and
  retry. Probe jobs `cypher`/`xico_city` (06-16) validate the same path.

### T0.3 — Instruments run unattended (P0, passive)
- **Acceptance (all on 2026-06-12/13 without manual help):**
  - 10:30Z aggregator run → drift PR auto-created AND auto-merged (snapshot
    allowlist fix #1664 should let `snapshot-pr-helper` approve it).
  - 11:11Z dead-man's-switch run → **green** (first time since 06-08).
  - Monday 06-15 08:00Z: `weekly-governance-checkpoint` fires on schedule and
    its PR auto-merges (STATE.md `Generated:` advances).
- **Contingency:** if the drift PR sits open >2h, inspect which check
  rejected it; the helper script is `.github/scripts/snapshot-pr-helper.mjs`.

### T0.4 — PR reconciliation (P1)
- **Premise check:** two sessions created PRs for the same branch content:
  #1658 and #1660 (`feat/rate-limiters-and-deploy`). Also confirm #1665,
  #1667, #1669 merged.
- **Steps:** `gh pr view 1658 1660 --json state,title`. Keep whichever is
  open with the fuller diff; close the other with a cross-reference comment.
  Merge-conflict resolution allowed; content is supervisor dedup guards +
  UAT framework (both wanted).
- **Acceptance:** exactly one of the two is MERGED, the other CLOSED with a
  comment; `git log main` shows the dedup-guard and testing-infra changes.

## 3. Phase 1 — COMPLETE: product defects (Days 1–5)

### C1 — Capricast Sentry tunnel route (P1 · ~1 day · repo: `Latimer-Woods-Tech/capricast`)
- **Why:** client-side error reporting is silently dead — the only real
  failure in the 71/73 Capricast UAT.
- **Premise probe:** `curl -s -o /dev/null -w '%{http_code}' -X POST https://capricast.com/api/sentry/envelope` → currently 404.
- **Steps:**
  1. In the capricast worker (Hono), add `POST /api/sentry/envelope`:
     - Read raw body as text. The first newline-delimited JSON line is the
       envelope header containing `dsn`.
     - Validate the DSN: host must end in `.ingest.sentry.io` (or
       `sentry.io`) AND the project id must equal the one in the
       `capricast-web` DSN (GCP secret `CAPRICAST_WEB_SENTRY_DSN`) — this is
       an open-relay guard, do not skip it.
     - Forward: `POST https://<dsn-host>/api/<projectId>/envelope/` with
       `Content-Type: application/x-sentry-envelope`, body passthrough,
       try/catch with a 502 on upstream failure.
     - Do not log envelope contents (may contain PII).
  2. Deploy via the repo's normal deploy workflow.
- **Acceptance:** `curl -X POST https://capricast.com/api/sentry/envelope --data-binary '<minimal envelope>'` returns 200; throw a deliberate error in the
  frontend (or use Sentry's test event) and see it arrive in the
  `capricast-web` Sentry project (org `latwood-tech`). Paste both in the PR.
- **Gotchas:** Sentry API token that works is `FACTORY_SENTRY_API`
  (`SENTRY_AUTH_TOKEN` 403s). Capricast repo has had stale-auto-merge issues —
  confirm the deployed commit matches your merge SHA.

### C2 — xicocity.com root route 404 (P1 · ~0.5 day · repo: `Latimer-Woods-Tech/xico-city`)
- **Why:** a customer-facing branded domain 404s at `/`.
- **Premise probe:** `curl -s -o /dev/null -w '%{http_code}' https://xicocity.com/` → currently 404 (while `/health` is 200).
- **Steps:** Diagnose first — is the apex served by the Worker (route
  pattern) or should it be a Pages project? (`gh api` the CF zone routes, or
  check the repo's wrangler.jsonc `routes`.) Then either: (a) mount a `/`
  handler in the worker serving the marketing landing page, or (b) narrow the
  worker route to `/api/*` so Pages serves the apex. Smallest diff that makes
  `/` a 200 wins; do not build a new frontend (freeze rule).
- **Acceptance:** `curl -s -o /dev/null -w '%{http_code}' https://xicocity.com/` → 200, HTML body, in the PR.

### C3 — Sign-out discoverability (P2 · ~0.5 day combined · repos: HumanDesign + capricast)
- **Why:** both UAT runs warn "sign-out control not discoverable"
  (selfprime `#/more`, capricast account menu).
- **Premise probe:** run the UAT harness (in Factory repo after T0.4:
  `scripts/e2e-runner.mjs`; force TCP — it already passes `--disable-quic`)
  or manually inspect the rendered nav.
- **Steps:** add a visible "Sign out" item to selfprime's `#/more` navigation
  and capricast's account/profile menu. Copy-level change, not an auth
  change — the sign-out endpoints already work.
- **Acceptance:** UAT warnings clear on re-run; screenshot or DOM-selector
  evidence in the PR.

### C4 — packages/neon DTS build errors (P2 · premise likely RESOLVED)
- **Premise probe (do this first — a parallel session on 2026-06-11 reported
  "no action; builds pass"):**
  `cd packages/neon && npm ci --ignore-scripts && npm run build`, then run
  the two admin-studio test files:
  `cd apps/admin-studio && npx vitest run src/**/capabilities.test.ts src/**/handoff-store.test.ts` (adjust paths via glob).
- **If green:** mark `n/a — resolved upstream`, link the passing output, done.
- **If red:** the historical failure was missing `postgres`/`drizzle-orm`
  type deps in the DTS build — add them as devDependencies or mark external
  in `tsup` config. Quality gates apply (zero TS errors, no suppressions).

### C5 — Tracker data gaps: capricast + xico-city matrices (P1 · ~0.5 day · repos: capricast, xico-city)
- **Why:** the now-honest tracker still can't see 2 of 5 repos: capricast
  `docs/FUNCTIONS_MATRIX.md` 404s (deleted/moved) and xico-city's matrix is
  pre-G10 11-column (29 malformed rows → scores 0).
- **Premise probe:** run the aggregator locally:
  `GITHUB_TOKEN=$(gh auth token) OUTPUT_DIR=/tmp/tracker python scripts/aggregate_completion.py`
  → look for `fetch_matrix_fail` (CC) and `malformed` count (XC).
- **Steps:**
  1. capricast: find the deletion —
     `gh api 'repos/Latimer-Woods-Tech/capricast/commits?path=docs/FUNCTIONS_MATRIX.md&per_page=5'` —
     restore the last version, convert to the 12-column schema (insert
     `Sentry Project` column after Endpoint), and reset any stale `✅` to `🔍`
     (unverified) rather than asserting old claims.
  2. xico-city: apply the same 12-column migration
     (`scripts/update_matrix_schema.py` in Factory was used for the other
     repos in G10 — reuse it or edit manually; 29 rows).
- **Acceptance:** local aggregator run shows `parsed CC rows>0 malformed:0`
  and `parsed XC rows>0 malformed:0`; the next drift PR on Factory reflects
  both repos. Paste the log lines in the PRs.
- **Schema reference (12 columns):**
  `|ID|Feature|Endpoint/Component|Sentry Project|Manual Test|Automated Test|Status|Owner|Last Verified|Issue/PR|Weight|Notes|`

## 4. Phase 2 — IMPROVE: hygiene at scale (Days 6–9)

### I1 — Bulk-close duplicate issue floods (P1 · ~2h · repo: Factory)
- **Premise probe:** `gh issue view 1516 1606` — confirm same title/body class.
- **Targets:**
  - Roadmap dupes: close **#1516–#1528** (13 issues) as duplicates of
    **#1606–#1618** (keep the higher-numbered set — it is the lifecycle
    controller's active set).
  - Sentry flood: of the NeonDbError-530 set (**#1623, #1629–#1637**), keep
    **#1623** as canonical, close the rest. **Do NOT touch** #1622
    (admin-studio TypeError — different bug) or #1659 (cypher-healing P1 —
    real, handled in I4).
- **Command pattern:**
  `gh issue close <N> --comment "Duplicate of #<canonical>. Flood caused by the pre-#1660 dedup-guard gap (fail-loud guards merged 2026-06-12)."`
- **Acceptance:** open issue count drops ~23; each closure comment
  cross-links its canonical.

### I2 — Approved-idle + stale-snapshot PR sweep (P1 · ~half day · repo: Factory)
- **Why:** the sell-phase plan's own exit criterion is "zero approved-idle
  PRs older than 48h".
- **Disposition table (re-verify each; states move):**

| PR | Likely disposition |
|---|---|
| #1061 (perf: CI parallelization, APPROVED since May) | Rebase on main; if `validate` passes, merge. If conflicts are deep (CI changed a lot since), close with rationale + file a fresh issue. |
| #1385 (dependabot hono, synthetic-monitor) | Superseded by #1657 → close. |
| #1395 (video-cron props threading) | Check if still applicable after #1666–#1669; merge if clean, else close-with-reason. |
| #1451, #1452, #1468, #1477, #1529, #1620, #1638 (founder-stats / stack snapshots) | Superseded by newer dailies and/or RFC-006 §10 artifact policy → close. |
| #1489, #1652, #1469 (conformance), #1653, #1624 (cost), #1654, #1625, #1626 (revenue), #1655, #1627 (scorecard), #1656, #1628, #1475 (digests/sync) | Same — close with comment citing RFC-006 §10 (snapshots are artifacts now). If the snapshot *class* still opens daily PRs after RFC-006 Phase 4, flag that workflow in the tracking issue. |
| #1494 (register analytics-proxy) | Registry entry was added by #1649 → verify `docs/service-registry.yml` contains analytics-proxy, then close as superseded. |
| #1474 (admin-chat hardening, DRAFT) | Leave — author intent unknown; ping in tracking issue. |
| #1424 (Copilot platform-gate, DRAFT) | Operator decision (S3). Do not merge or close unilaterally. |
| #1650 (logger package metadata) | Review normally; small, likely mergeable. |
- **Acceptance:** `gh pr list` shows zero APPROVED PRs older than 48h and
  <10 open PRs total (excluding fresh dailies).

### I3 — Remote branch prune (P2 · ~2h · repo: Factory)
- **Premise:** ~462 remote branches, ~329 bot-generated.
- **Method (squash-merge breaks ancestry — cross-ref PR state, never
  `git branch --merged`):** for each remote branch matching prefixes
  `supervisor/`, `copilot/`, `chore/`, `completion-tracker/`, `fix/`,
  `dependabot/`, `claude/`: look up its PRs (`gh pr list --head <branch> --state all`);
  delete the branch iff ALL its PRs are MERGED or CLOSED and it is not a
  protected/default branch. Skip branches with zero PRs unless older than 30
  days (then list them in the tracking issue for operator review instead of
  deleting).
- **Safety:** deletion is reversible (commits remain reachable via PR refs);
  still, dump the deleted-branch list + head SHAs as a comment in the
  tracking issue before deleting.
- **Acceptance:** remote branch count < 100.

### I4 — Stale in-progress claims + #1659 triage (P2 · ~3h · repo: Factory)
- **Stale claims:** for each open issue labeled `status:in_progress` or
  `agent:claimed:supervisor` with no activity since 2026-05-25: check for
  linked open PRs/commits; if none, remove the status/claim labels and
  comment `Released stale claim (no linked activity since <date>) — returning to triage.`
  Do not close the issues.
- **#1659 (P1, cypher-healing):** real bug — Sentry reports a failed query
  selecting `id,email,password_hash,…`. Likely schema drift (column missing
  in prod) — the same class as capricast's drift incident. Mint a Neon
  connection string (per CLAUDE.md Neon access note), inspect the table, and
  either apply the missing migration via the repo's migration path or fix
  the query. Verify with an authed request to the failing endpoint.
- **Acceptance:** zero issues claimed >14 days without linked activity;
  #1659 closed with curl/psql evidence or escalated with root cause written
  up.

### F1 — Fail-loud hardening (P2 · ~2h · repo: Factory)
- **Why:** codify the sprint's core lesson where it bit hardest.
- **Steps:** in `apps/video-cron/src/index.ts`: if `fetchPendingJobs` returns
  >0 due jobs and `dispatched === 0`, log at error level AND throw (so the
  cron invocation is marked failed and Sentry captures it). Mirror the
  aggregator's pattern (`no_rows_any_repo` guard in
  `scripts/aggregate_completion.py`, PR #1661).
- **Acceptance:** unit test covering the guard; deploy; `/trigger` with a
  forced-empty dispatch path returns 500 with the error payload.

## 5. Phase 3 — Stretch (only if Phases 0–2 are done and verified)

### S1 — docs-health ratchet (P3 · ~0.5–1 day)
- Current: 392 pre-existing broken links fail every PR advisory; permanently
  red = ignored. Convert to a ratchet: commit a baseline count
  (`docs/_generated/docs-health-baseline.json`); the check fails only if the
  current count **exceeds** baseline; a scheduled job (or the same check)
  lowers the baseline automatically when the count drops. Acceptance: a
  docs-touching PR that adds no new broken links passes docs-health.

### S2 — Root-directory doc purge (P3 · ~3h, WS-1.4)
- Move the 20+ stale root-level phase/status MDs (`PHASE_6_*`, `SUP-2.3_*`,
  `EXECUTION_SUMMARY_*`, `ADMIN_AGENT_DEPLOYMENT_CHECKLIST.md`, …) into
  `docs/archive/`. Target end state: root holds README, CLAUDE.md, SECURITY,
  START_HERE, MASTER_INDEX + config only. **Gotcha:** regenerate the docs
  catalog in the same PR (`npm run docs:catalog`) or docs-health degrades
  further; fix inbound links the catalog reports.

### S3 — Operator decision memo (P3 · ~1h, no code)
- Draft a one-page memo (comment on the tracking issue + Pushover-able
  summary) laying out options for: the two open P0s **#1431 / #1412**
  ("Factory Platform Completion Gate") and Copilot draft **PR #1424** —
  options: adopt (sequence the phases), redirect (fold into this sprint's
  framework), or close (stale P0s devalue the priority system). Include a
  recommendation. The operator decides; you do not.

## 6. Sequencing

```
Day 1:      T0.1 → T0.4  +  C4 premise probe  +  I1 (mechanical)
Days 2–3:   C5 (matrices)  +  C1 (capricast tunnel)
Days 3–4:   C2 (xico root)  +  C3 (sign-out ×2)
Day 5:      I2 (PR sweep)  + buffer for onion layers found in T0.x
Days 6–7:   I3 (branch prune)  +  F1 (fail-loud)
Days 8–9:   I4 (stale claims + #1659)
Day 10:     Stretch (S1 → S2 → S3) or burn-down of blocked items
Day 14:     Sprint exit review against §7
```

Dependencies: T0.1 blocks nothing but informs everything; C5 should land
before the 06-16 probe renders (better tracker visibility); I2 should follow
T0.4 (PR reconciliation first). All of Phase 1 is parallelizable across
isolated worktrees if multiple agents run.

## 7. Definition of done (sprint exit, with evidence)

1. A `workflow_dispatch` render completed end-to-end and ≥4 cadence videos
   are live on watch pages (T0.1/T0.2 + cadence).
2. Three consecutive days of: aggregator drift PR auto-merged, dead-man's-
   switch green, no manual intervention (T0.3).
3. Capricast client errors visible in Sentry; xicocity.com `/` returns 200;
   sign-out discoverable on both products (C1–C3).
4. Aggregator parses all 5 repos with `malformed: 0` (C5).
5. Zero approved-idle PRs >48h; open PRs <10; open issues reduced by ≥25;
   remote branches <100 (I1–I3).
6. video-cron fails loud on zero-dispatch (F1).
7. Tracking issue closed with a final report comment linking every PR and
   probe output.

## 8. Appendix — quick reference

- **Account/IDs:** CF account `a1c8a33cbe8a3c9e260480433a0dbb06`; GCP project
  `factory-495015`; Sentry org `latwood-tech`.
- **Live endpoints:** schedule-worker `https://schedule.latwoodtech.work`
  (auth: `WORKER_API_TOKEN`, strict bearer equality); video-cron
  `https://video-cron.latwoodtech.work` (`/health`, `/trigger`).
- **Seeded job IDs:** prime-1 `c3336e4f-…b55b5` (due 06-12), capri-1
  `3f2773d3-…097da` (06-12 16:00Z), cypher probe `01c0d3e7-…` (06-16
  15:00Z), xico probe `157cb849-…` (06-16 16:00Z); idempotency keys
  `cadence-W24/25/26-*` — re-POSTing with the same key is safe.
- **Render workflow truth table:** `push`/`pull_request` events → dry-run job
  only (fixtures, `JOB_ID=dryrun-job`); `workflow_dispatch` + `dry_run≠'true'`
  → real render. Required job inputs are sent by video-cron; manual dispatch
  with a synthetic `job_id` makes the final PATCH-back 404 (non-fatal).
- **Useful probes:**
  - Tracker freshness: `git show origin/main:docs/completion-tracker.json | python -c "import json,sys; print(json.load(sys.stdin)['generated_at'])"`
  - Drift PR state: `gh pr list --search "completion-tracker drift" --state all --limit 3`
  - Dependabot count: `gh api 'repos/Latimer-Woods-Tech/Factory/dependabot/alerts?state=open&per_page=100' --jq 'length'`
