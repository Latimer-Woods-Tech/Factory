# Factory Automation Audit — 2026-05-09

> **Read time:** ~10 minutes. **Audience:** Adrian + supervisor agents.
> **Purpose:** snapshot of every active GitHub automation surface in `Latimer-Woods-Tech/Factory`, what's broken, what's redundant, and a ranked plan to stop the daily firefighting.
>
> All counts are exact (counted, not estimated). Health was sampled from the **last 10 runs per workflow** via `gh run list --workflow=<f> --limit 10` on 2026-05-09.

---

## TL;DR — by the numbers

| Metric | Count |
|---|---|
| Workflow files in `.github/workflows/` | **70** (11 reusable `_*.yml` + 59 standalone) |
| Workflows registered with GitHub Actions (`gh workflow list`) | **78** (gap = stale registrations from renamed/deleted files; see §6) |
| Distinct bot identities operating on PRs/issues | **4** (`factory-cross-repo[bot]`, `dependabot[bot]`, `copilot-swe-agent`, `github-actions[bot]`) |
| Repo-scoped Actions secrets | **30** |
| Environments configured | **4** (`copilot`, `production`, `staging`, `staging - docs`) |
| Open issues | **53** (only **1** still labeled `supervisor:no-template` — the "22+" panic from earlier today is no longer accurate) |
| Cross-workflow ghost dependencies / drift items found in §4 | **14** |
| Broken / suspect items in §5 | **18** (5 FIXED today, 4 IN-FLIGHT, 9 OPEN) |
| Architectural recommendations in §7 | **10** |

---

## 1. Inventory — every active workflow

Health legend: `OK n/10` = succeeded n out of last 10 runs; `0/0` = never run since registration.
Status: ✅ green ≥ 7/10 success • ⚠️ flaky 1–6/10 success or skipped-heavy • ❌ broken ≥ 5/10 fail • 💤 unused 0 runs.

### 1a. CI / Quality gates (always-on PR & main)

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `ci.yml` | CI | push main, PR, merge_group | ✅ 9/10 | required-status `validate` (branch protection) |
| `codeql.yml` | CodeQL Security Analysis | push main, PR, merge_group, weekly Sun 03:00ET | ✅ 10/10 | required-status `Analyze (javascript)` |
| `dependency-review.yml` | Dependency Review | PR, merge_group | ✅ 10/10 | required-status `dependency-review` |
| `package-integration.yml` | Package Integration Smoke | PR/push on `packages/**`, manual | ✅ 10/10 | runs `scripts/package-integration-smoke.mjs` |
| `credential-scrub.yml` | credential-scrub | PR/push on docs/memory paths | ✅ 7/10 | gitleaks-style scan |
| `memory-single-writer.yml` | memory-single-writer | PR on `memory/**` | 💤 0/0 | enforces MA-8 single-writer |
| `secret-contract-preflight.yml` | Secret Contract Preflight | PR | ⚠️ 4/10 ok, 6 skipped | comments expected secrets per touched app |

### 1b. PR routing & review

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `pr-triage.yml` | PR Triage | PR opened/reopened (non-bot) | ✅ 9/10 | applies path/author labels |
| `pr-review.yml` | Canonical PR Review | PR, merge_group | ✅ 8/10 | factory-cross-repo App; 2-party LLM |
| `pr-quality-check.yml` | PR Quality Check (shadow) | PR | ⚠️ 3/10 ok, 7 skipped | warn-only description gate |
| `pr-size-warning.yml` | PR Size Warning (Warn-Only) | PR | ⚠️ 4/10 ok, 6 skipped | warn-only size gate |
| `pr-queue-digest.yml` | PR Queue Digest (daily) | cron 13:00 UTC weekdays | ❌ 4 fail / 6 runs | Pushover digest |
| `reviewer-class-hints.yml` | reviewer-class-hints | PR | ✅ 8/10 | informational comments |

### 1c. Auto-merge & Copilot loop

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `auto-merge-approved-prs.yml` | Auto Merge Approved PRs | PR review submitted, PR labeled/sync | ✅ 4/10 ok, 6 skipped (correct gating) | enables `gh pr merge --auto` |
| `copilot-auto-approve.yml` | Copilot Auto-Approve Loop | PR events + workflow_run("validate","CodeQL") | ✅ 6/10 ok, 4 skipped | 2-of-2 LLM judges (Claude+Grok), then APPROVE via factory-cross-repo |
| `copilot-pr-poller.yml` | Copilot PR Poller | cron `25 * * * *` (hourly; was `*/10`, trimmed PR #1211), manual | ✅ 10/10 | replaces brittle event cascade for Copilot PRs |

### 1d. Issue triage & supervisor loop

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `auto-triage.yml` | Auto-triage Issue | issue opened/reopened | ✅ 9/10 | adds priority/area labels (mutex bug, see §5) |
| `sync-agent-labels.yml` | Sync agent labels | push on `.github/agent-labels.json`, manual | ✅ 10/10 | reconciles label set |
| `supervisor-loop.yml` | Supervisor Loop | cron 4h, issue labeled, manual | ⚠️ 0/10 ok, 10 skipped | runs `.github/scripts/supervisor-core.mjs` (always skipped — gating bug §5) |
| `supervisor-template-author.yml` | Supervisor Template Author | issue labeled `supervisor:no-template` | ⚠️ 0/10 ok, 10 skipped | drafts new templates (idle b/c §5 mutex shrank queue to 1) |
| `sentry-to-github.yml` | Sentry to GitHub Issues | cron 4h offset | ✅ 10/10 | opens issues from Sentry |

### 1e. Project board & dashboards

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `auto-add-to-project.yml` | Auto Project Sync | issue/PR opened or reopened | ✅ 9/10 | `actions/add-to-project@v2.0.0` |
| `project-board-sync.yml` | Project Board Sync | issues *, issue_comment, PR closed, cron, manual | ⚠️ 0/10 ok, 9 skipped | assigns Copilot, moves cards |
| `project-status-sync.yml` | Sync PR status to project board | PR open/sync/close | ⚠️ 3/10 ok, 7 skipped | flips Status column |
| `factory-status-dashboard.yml` | Factory Status Dashboard | hourly cron | ✅ 10/10 | regenerates `docs/status/*` |

### 1f. Branch protection & security

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `policy-drift-guard.yml` | Policy Drift Guard | cron `17 */6 * * *`, manual | ❌ 8 fail / 10 (NEW canonical contexts but stale failures recorded today; should green up next cycle) | reads org/repo state |
| `apply-sec-hardening.yml` | Apply Security Hardening | cron `47 */6 * * *`, manual | 💤 0/0 (added today PR #583) | reads `.github/security/main-branch-protection.json`, PUTs to API |
| `sync-security-md.yml` | Sync Security Policy | push on `SECURITY.md`, manual | ⚠️ 0/1 ok, 1 fail | mirrors `SECURITY.md` to public sibling repos |

### 1g. Deploy automation (per app)

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `deploy-supervisor.yml` | Deploy factory-supervisor | push main on supervisor paths | ⚠️ 0/10 ok, 9 skipped | `wrangler deploy` |
| `deploy-admin-studio.yml` | Deploy admin-studio (Worker) | push main, manual | ⚠️ 0/10 ok, 9 skipped | `wrangler deploy`; chains `_canary-watch.yml@main` |
| `deploy-admin-studio-ui.yml` | Deploy admin-studio-ui (Pages) | push main, manual | ⚠️ 2/10 ok, 6 skipped | `cloudflare/wrangler-action@v3` |
| `deploy-schedule-worker.yml` | Deploy Schedule Worker | push main, manual | ✅ 10/10 | wrangler |
| `deploy-video-cron.yml` | Deploy Video Cron Worker | push main, manual | ⚠️ 4/10 ok, 2 fail, 2 skip | wrangler |
| `deploy-synthetic-monitor.yml` | Deploy Synthetic Monitor | push main, manual | ✅ 9/10 | wrangler |
| `smoke-prime-self.yml` | Smoke — Prime Self Production | daily cron 08:00 UTC | ❌ 1/10 ok (issue #526) | Playwright vs `selfprime.net` |

### 1h. Cross-repo plumbing

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `setup-app-secrets.yml` | Setup App Secrets (Phase 6.6) | manual | ⚠️ 4/5 ok, 1 fail | needs `GH_PAT` |
| `set-jwt-secrets.yml` | Set JWT Secrets (Phase 7.5) | manual | ❌ 3 ok / 5 fail / 8 runs | wrangler secret put |
| `setup-sentry-alerts.yml` | Setup Sentry Alert Rules | manual | ✅ 3/3 | Sentry API |
| `validate-sentry-auth-token.yml` | Validate Sentry Auth Token | manual | ⚠️ 1/3 ok, 2 fail | sanity-check secret |
| `run-app-migrations.yml` | Run App Migrations | manual | ⚠️ 4/7 ok, 3 fail | drizzle migrate |
| `run-migrations.yml` | Run DB Migrations (Phase 7.5) | manual | ⚠️ 1 ok / 1 fail / 2 | per-app migration |
| `regenerate-app-lockfiles.yml` | Regenerate App Lockfiles | manual | ❌ 0/3 ok | matrix across apps |
| `regen-lockfile-on-branch.yml` | Regen Lockfile On Branch | manual w/ inputs | ✅ 7/7 | targeted single-branch regen |
| `update-app-lockfiles.yml` | Update App Lockfiles | manual | ⚠️ 2/2 ok but rare use | bumps deps |
| `generate-app-lockfiles.yml` | Generate App Lockfiles | manual | ❌ 1/5 ok, 4 fail | initial bootstrap |
| `mirror-org-secrets-to-dependabot.yml` | Encrypt org secrets for Dependabot | manual | ❌ 0/5 ok | libsodium encrypt → artifact |
| `capricast-rename.yml` | Capricast Rename | manual w/ step input | 💤 0/0 | step-gated rename runbook (videoking → capricast) |
| `refresh-vertex-token.yml` | Refresh Vertex AI Access Token | cron `0,45 * * * *`, manual | ✅ 10/10 | mints GCP token for supervisor |
| `offsite-mirror.yml` | Off-Platform Mirror | cron 05:17 UTC daily | ✅ 1/1 | BCP mirror to Codeberg/GitLab |

### 1i. Publishing

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `publish.yml` | Publish Package | push tag `*/v*` | ❌ 4 ok / 6 fail / 10 | OIDC trusted publisher to npmjs |
| `bootstrap-publish.yml` | Bootstrap Publish All Packages | manual | ❌ 2 ok / 8 fail / 10 | bulk publish (PR #584 OIDC migration in flight) |

### 1j. Monitoring / KPIs / docs

| File | Display name | Trigger | Health | Touches |
|---|---|---|---|---|
| `automation-reliability-loop.yml` | Automation Reliability Loop | cron daily + Mon, manual | ✅ 4/4 | reliability digest |
| `doc-freshness-audit.yml` | Documentation Freshness Audit | cron Mon 09:00 UTC | ⚠️ 1/1 (low N) | flags stale docs |
| `generate-scorecard.yml` | Generate Implementation Scorecard | cron Mon 11:00 UTC | ❌ 0/1 (issue #528) | scoreboard md |
| `track-kpis.yml` | Track Delivery KPIs | cron Mon 10:00 UTC | ❌ 0/1 (issue #527) | KPI digest |
| `videoking-slo-collect.yml` | VideoKing SLO Collection (Weekly) | cron Mon 09:00 UTC | ❌ 0/2 ok | should be moved to videoking repo (orphaned) |
| `detect-flaky-checks.yml` | detect-flaky-checks | cron Mon 09:00 UTC | 💤 0/0 | duplicate of `flaky-check-report.yml` (see §6) |
| `flaky-check-report.yml` | Flaky Check Report (weekly) | cron Mon 08:00 UTC | 💤 0/0 | duplicate (see §6) |

### 1k. Reusable workflows (`_*.yml`)

| File | Caller(s) found in `.github/workflows/` | Health |
|---|---|---|
| `_canary-watch.yml` | `deploy-admin-studio.yml` (line 209) | 💤 0/0 |
| `_app-ci.yml` | none in this repo (consumer is downstream app repos) | 💤 0/0 |
| `_app-ci-pnpm.yml` | none in this repo | 💤 0/0 |
| `_app-deploy.yml` | none in this repo | 💤 0/0 |
| `_app-deploy-pnpm.yml` | none in this repo | 💤 0/0 |
| `_app-deploy-pages.yml` | none in this repo | 💤 0/0 |
| `_app-prod-canary.yml` | none in this repo | 💤 0/0 |
| `_app-reliability-gate.yml` | none in this repo | 💤 0/0 |
| `_post-deploy-verify.yml` | none in this repo | 💤 0/0 |
| `_migration-drift-guard.yml` | none in this repo | 💤 0/0 |
| `_hello-reusable.yml` | none — appears to be an example/test | 💤 0/0 |

> **Important:** the `_*` cluster is intentionally consumed by **downstream app repos** (cypher-healing, ijustus, the-calling, etc.). `gh workflow list` shows them registered because the `workflow_call:` declaration alone registers them. They are not dead in the multi-repo sense — but only `_canary-watch.yml` has a same-repo caller. See §4 for the open question of which app repos actually call which.

---

## 2. Bot / app inventory

| Identity | What it does in this repo | Workflows / paths it owns | Permissions / scopes | Known issues today |
|---|---|---|---|---|
| **`factory-cross-repo[bot]`** (GitHub App) | Mints short-lived installation tokens via `actions/create-github-app-token@v3`. Acts as CODEOWNER on Green/Yellow paths so its 2-of-2 LLM APPROVE satisfies branch protection without a human. | Used by ~30 workflows (any using `FACTORY_APP_ID` / `FACTORY_APP_PRIVATE_KEY` secrets). Owns merges in `pr-review.yml`, `copilot-auto-approve.yml`, `auto-merge-approved-prs.yml`, `apply-sec-hardening.yml`, `pr-queue-digest.yml`, etc. | Org-installed; needs `contents:write`, `pull_requests:write`, `issues:write`, `actions:read`, `administration:write` (for branch protection), `secrets:write` (for `setup-app-secrets`). | Token mint **fails on Dependabot PRs** because Dependabot context blocks org-secret access; mitigated by mirror workflow (PR #570) and GH_TOKEN fallback (PR #580). Org Apps installation list `gh api orgs/.../installations` returns 404 — caller's PAT lacks `admin:org`, so we cannot enumerate scopes from CLI. |
| **`dependabot[bot]`** | Opens monthly grouped PRs for GitHub Actions versions only (npm is on Renovate). | Triggered by `.github/dependabot.yml`. PRs auto-routed through `pr-triage` + `pr-review`. | Standard Dependabot scopes; cannot read org secrets unless mirrored via `mirror-org-secrets-to-dependabot.yml`. | Mirror workflow is **❌ 0/5 ok** today — Dependabot PRs lose access to `FACTORY_APP_*` until manually re-mirrored. PR #570/#571 hardened the path but it has never had a green run on schedule. |
| **`copilot-swe-agent`** (per-user GitHub Copilot identity) | Authors feature PRs from issue assignments. Auto-approved by `copilot-auto-approve.yml` when both LLM judges agree. | Owns `copilot/*` branches. Touched by `copilot-auto-approve.yml`, `copilot-pr-poller.yml`, `auto-merge-approved-prs.yml`. | **Personal Copilot Pro+ covers org repos — no Business/Enterprise seat needed** (verified 2026-05-30 via `suggestedActors` GraphQL). Agent consumes AI Credits (Pro+ = $39/mo budget); credits exhaust mid-cycle and reset on billing date — not a code bug. **Assignment must use GraphQL `replaceActorsForAssignable` — REST `assignees` silently drops Bot actors** (fixed PR #1217). | Supervisor now uses GraphQL assignment; agent self-reports "insufficient AI Credits" when exhausted. 30 Copilot PRs authored successfully before credits ran out this cycle. |
| **`github-actions[bot]`** | Default token used as fallback when App-token mint fails (e.g. Dependabot context). | Owns merges of `chore(actions):` PRs from Dependabot when App token unavailable. | Standard `GITHUB_TOKEN` permissions per workflow; capped by repo `permissions:` block. | None today, but its PRs cannot satisfy CODEOWNER (it's not a co-owner of any path) — relies on admin merge or Dependabot's own auto-merge path. |

**Org context** (from `gh api orgs/Latimer-Woods-Tech`):
- Plan: `team`, 1 filled seat / 1 seat total
- 2FA enforcement: **enabled**
- Default repo permission: `admin`
- Public repos: 9, private repos: 6
- Advanced security, Dependabot alerts, secret scanning: **all disabled at org level for new repos** (manually enabled per repo only)

---

## 3. Configuration that lives OUTSIDE workflow files

### 3a. Branch protection

`gh api repos/Latimer-Woods-Tech/Factory/branches/main/protection`:

| Field | Value |
|---|---|
| `required_status_checks.contexts` | `["validate", "Analyze (javascript)", "dependency-review"]` ✅ matches canonical file (today's #581 fix) |
| `required_status_checks.strict` | `true` |
| `enforce_admins` | `false` |
| `required_pull_request_reviews.dismiss_stale_reviews` | `true` |
| `required_pull_request_reviews.require_code_owner_reviews` | `true` |
| `required_approving_review_count` | `1` |
| `required_linear_history` | `true` |
| `required_conversation_resolution` | `true` |
| `allow_force_pushes` / `allow_deletions` | `false` / `false` |
| `required_signatures.enabled` | `false` |

Source of truth: `.github/security/main-branch-protection.json` (added in PR #583). Drift detector: `policy-drift-guard.yml`. Repair workflow: `apply-sec-hardening.yml`.

> **Note:** the user's MEMORY references "ruleset id 15843812" — that is a **classic** ruleset created in parallel (not visible in this branch-protection blob). The fact that we now have BOTH a classic ruleset and a JSON branch-protection definition is itself §7 item #4.

### 3b. CODEOWNERS coverage

85 lines, three trust tiers (Green/Yellow/Red). All paths explicitly default to `* @adrper79-dot @factory-cross-repo[bot]`, so **no path is unowned**. `memory/**` is the one path stripped of bot co-ownership (single-writer enforcement) — PRs to memory always need a human.

### 3c. Repo-level settings (visible)

| Setting | State |
|---|---|
| Repo Actions permissions | "all" (verified by Policy Drift Guard) |
| Copilot coding-agent toggle (per-repo) | ON (re-confirmed today) |
| Pages | Configured for docs (Mintlify) |
| Environments | 4 (see below) |

### 3d. Environments

`gh api repos/.../environments`:

| Environment | Protection rules | Used by |
|---|---|---|
| `copilot` | none | Copilot SWE Agent runs |
| `production` | required reviewer = `adrper79-dot` (cannot self-review = false) | `deploy-*` workflows promoting to prod |
| `staging` | required reviewer = `adrper79-dot` | `deploy-*` workflows targeting staging |
| `staging - docs` | none | Mintlify docs deploys |

> Two environments require the user as gate, but `prevent_self_review = false`, so the user can self-approve. That defeats the gate's intent for true 4-eyes. See §7 item #6.

### 3e. Org-level settings

| Setting | State |
|---|---|
| Org Copilot seats | **0 SWE Agent seats** (team plan, individual sub only) |
| Org 2FA | enabled |
| Org Actions permissions | "all" (per Policy Drift Guard) |
| Org-level secret listing | Caller PAT lacks `admin:org`; could not enumerate. Documented gap. |

### 3f. Repo Actions secrets (30 total)

Sample (full list reachable via `gh api repos/.../actions/secrets`):
`ADMIN_STUDIO_PROD_URL`, `ADMIN_STUDIO_STAGING_URL`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CYPHEROFHEALING_CONNECTION_STRING`, `FACTORY_APP_*` (4 keys), `FACTORY_SENTRY_API`, `FLAG_METER_DATABASE_ID`, `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`, `GROQ_API_KEY`, `HYPERDRIVE_*` (8 apps), `KAIROSCOUNCIL_*` (3), `MEXXICO_CITY_CONNECTION_STRING`, `NICHESTREAM_CONNECTION_STRING`, `PRIME_SELF_LOGO_URL`, `RATE_LIMITER_*` …

**Observation:** the secret naming reveals a sprawl of per-app secrets in the *Factory* repo even though most apps live in their own repo. This is required for the cross-repo `setup-app-secrets`, `set-jwt-secrets`, `run-app-migrations` workflows but means a leak in this repo blasts every downstream app. (See §7 item #5.)

### 3g. Dependabot scope

`.github/dependabot.yml`: GitHub Actions only, monthly, grouped, max 3 PRs, labels `dependencies` + `supervisor:approved-source`. npm is delegated to Renovate. Conservative, low-traffic — no immediate concerns.

### 3h. npm publishing

PR #584 (merged today) flipped `publish.yml` and `bootstrap-publish.yml` to **OIDC trusted publishers**. Bootstrap is still **❌ 8/10 fail** because trusted-publisher config has not been set in npmjs registry for every package yet (only the ones touched after the cutover succeed). `docs/runbooks/npm-oidc-publishing.md` was added today and documents the per-package config still owed.

---

## 4. Cross-references — what depends on what

Format: `<consumer>` → `<required>` — status.

| # | Consumer | Required | Status |
|---|---|---|---|
| 1 | `apply-sec-hardening.yml` | `.github/security/main-branch-protection.json` | ✅ wired (PR #583) |
| 2 | `policy-drift-guard.yml` | branch protection contexts `validate`, `Analyze (javascript)`, `dependency-review` | ✅ wired (PR #581 today) |
| 3 | `deploy-admin-studio.yml` | `Latimer-Woods-Tech/factory/.github/workflows/_canary-watch.yml@main` | ✅ wired |
| 4 | `pr-review.yml` (Dependabot path) | `mirror-org-secrets-to-dependabot.yml` mirroring `FACTORY_APP_*` to Dependabot scope | ⚠️ **wrong shape** — mirror workflow ❌ 0/5 ok; `pr-review` falls back to `GITHUB_TOKEN` (PR #580) |
| 5 | `auto-merge-approved-prs.yml` | `copilot-auto-approve.yml` posting an APPROVE review | ✅ wired |
| 6 | `copilot-auto-approve.yml` | `workflow_run` events for workflows literally named `"validate"` and `"CodeQL"` | ⚠️ **wrong shape** — actual workflow names are `"CI"` (job `validate`) and `"CodeQL Security Analysis"`. `workflow_run` matches **workflow name** not job name → these triggers may never fire. Verify before next change. |
| 7 | `supervisor-loop.yml` | issue label prefix `agent:*` to enter the job | ✅ wired |
| 8 | `supervisor-loop.yml` matching | `triggers.labels_any_of` field in supervisor templates | ❌ **bug** — match.ts ignores it (issue #582) |
| 9 | `supervisor-template-author.yml` | `apps/supervisor/node_modules/js-yaml`, `scripts/template-author.mjs`, `scripts/generate-supervisor-templates.mjs` | ✅ wired |
| 10 | `auto-triage.yml` | label set defined in `.github/agent-labels.json` (synced by `sync-agent-labels.yml`) | ⚠️ wired but **additive** — POST /labels never removes prior `priority:*` / `status:*` (PR #576 OPEN) |
| 11 | `pr-queue-digest.yml` | `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` | ⚠️ wired but ❌ 4/6 fail — secret rotation candidate |
| 12 | `mirror-org-secrets-to-dependabot.yml` | hardcoded `PUBLIC_KEY` + `KEY_ID` for Dependabot scope | ⚠️ brittle — keys would change on Dependabot scope reset; no detection |
| 13 | `setup-app-secrets.yml` | classic GitHub PAT secret `GH_PAT` (separate from `FACTORY_APP_*`) | ⚠️ legacy — dual-token model contradicts the App-only pattern documented in `auto-add-to-project.yml` |
| 14 | `videoking-slo-collect.yml` | videoking infrastructure that lives in the **videoking repo, not Factory** | ❌ orphaned — should be moved or deleted |

---

## 5. Known broken / suspect items

Severity: P0 outage-grade · P1 silent breakage · P2 noisy/manual workaround · P3 cosmetic.
State: **FIXED** (this session) · **IN-FLIGHT** (PR open) · **OPEN** (no PR yet).

| # | Item | Severity | State | Action needed |
|---|---|---|---|---|
| 1 | Branch protection contexts referenced workflow-prefixed names, broke required-status enforcement (#529) | P0 | FIXED PR #581 | none — verify next Policy Drift Guard run |
| 2 | `apply-sec-hardening.yml` referenced from runbooks but did not exist | P0 | FIXED PR #583 | wait for first scheduled run on `47 */6 * * *` |
| 3 | `bootstrap-publish.yml` 8/10 fail — npm token type mismatch (granular 2FA token in OIDC slot) | P1 | IN-FLIGHT PR #584 (merged) but per-package trusted-publisher config still owed in npmjs UI | manually enable trusted publisher for the 30 `@latimer-woods-tech/*` packages per `docs/runbooks/npm-oidc-publishing.md` |
| 4 | Copilot SWE Agent driven by individual subscription, org has 0 seats | P1 | OPEN | buy Copilot Business org seat; flip per-user `copilot-swe-agent` to org identity |
| 5 | `supervisor-loop.yml` `match.ts` ignores `triggers.labels_any_of` | P1 | OPEN (#582) | implement label match in match.ts; supervisor cannot match label-driven templates |
| 6 | Supervisor created PRs from empty branches (~10 stuck issues) | P1 | IN-FLIGHT (PR by another agent) | none — monitor merge |
| 7 | `auto-triage.yml` POST /labels is additive; duplicate `priority:*` / `status:*` labels on issues | P2 | IN-FLIGHT PR #576 | merge after review |
| 8 | 4 workflows had YAML duplicate-key parse errors | P0 | FIXED PR #579 | none |
| 9 | `pr-review.yml` excluded Dependabot PRs | P1 | FIXED PR #580 | none |
| 10 | `copilot-auto-approve.yml` `workflow_run` triggers reference names `"validate"` and `"CodeQL"` that do **not** match real workflow names `"CI"` and `"CodeQL Security Analysis"` | P1 | OPEN (just discovered in §4) | rename the strings to `"CI"` and `"CodeQL Security Analysis"` |
| 11 | `mirror-org-secrets-to-dependabot.yml` 0/5 ok | P1 | OPEN | re-test path; check `PUBLIC_KEY`/`KEY_ID` for Dependabot scope haven't rotated |
| 12 | `smoke-prime-self.yml` 1/10 ok (issue #526) | P2 | OPEN | smoke is failing not the app; investigate Playwright config drift |
| 13 | `generate-scorecard.yml` (#528) and `track-kpis.yml` (#527) 0/1 each | P3 | OPEN | both newly registered; first scheduled run failed — likely missing secret or path |
| 14 | `videoking-slo-collect.yml` 0/2 ok — orphaned (videoking is its own repo now) | P3 | OPEN | move to videoking repo or delete |
| 15 | `set-jwt-secrets.yml` 5/8 fail | P2 | OPEN | wrangler secret put is per-app and brittle; investigate |
| 16 | Org-level Copilot seats hidden / unconfigured in org settings | P2 | OPEN | requires admin:org access to inspect via API; visit org settings UI |
| 17 | Per-repo Copilot coding-agent toggle "not properly anchored" — was reset today | P2 | OPEN | document expected state in `apply-sec-hardening` repair logic so it's restored on drift |
| 18 | 5 PRs (#346, #491, #495, #496, #497, #488) carried unrelated workflow drift in their base branches today (cleaned up) | P2 | FIXED today via #579 + housekeeping | future: enforce no `.github/workflows/` edits in feature PRs without explicit `meta` label |

---

## 6. Redundancies and dead code

### 6a. Confirmed redundancies

| Cluster | Workflows | Redundancy |
|---|---|---|
| PR Size Warning | `pr-size-warning.yml` (active) + stale registration `.github/workflows/pr-size-warn.yml` showing in `gh workflow list` but no file present | 2 → 1 already done in PR #579; stale `pr-size-warn.yml` registration should be deleted from gh side |
| Project board sync | `auto-add-to-project.yml`, `project-board-sync.yml`, `project-status-sync.yml`, `factory-status-dashboard.yml`, `sync-agent-labels.yml` | 5 workflows touching the same project board; consolidation target = #540 |
| PR review cluster | `pr-review.yml`, `pr-quality-check.yml`, `pr-size-warning.yml`, `pr-triage.yml`, `reviewer-class-hints.yml` | 5 workflows posting comments on every PR; consolidation target = #539 |
| Flaky check reports | `detect-flaky-checks.yml` AND `flaky-check-report.yml` | both Mon-morning crons doing the same job from different scripts; one should be deleted |
| Lockfile management | `generate-app-lockfiles.yml`, `regenerate-app-lockfiles.yml`, `regen-lockfile-on-branch.yml`, `update-app-lockfiles.yml` | 4 workflows for the lockfile lifecycle of downstream app repos; only `regen-lockfile-on-branch.yml` (✅ 7/7) is actually reliable |
| Stale gh-side registrations | `gh workflow list` shows `.github/workflows/pr-size-warn.yml` and `.github/workflows/factory-admin-ui-ci.yml` with no file present in the tree | unregister or recreate the file; right now they sit as zombies |

### 6b. Workflows with **0 successful runs in last 30 days (sampled 10)**

| Workflow | Last 10 outcomes |
|---|---|
| `bootstrap-publish.yml` | 2 ok / 8 fail |
| `policy-drift-guard.yml` | 2 ok / 8 fail (will improve next cycle) |
| `mirror-org-secrets-to-dependabot.yml` | 0 ok / 5 fail |
| `regenerate-app-lockfiles.yml` | 0 ok / 3 fail |
| `set-jwt-secrets.yml` | 3 ok / 5 fail |
| `smoke-prime-self.yml` | 1 ok / 9 fail |
| `videoking-slo-collect.yml` | 0 ok / 2 fail |
| `track-kpis.yml`, `generate-scorecard.yml`, `sync-security-md.yml` | 0/1 each |

### 6c. Workflows never run since registration

`memory-single-writer.yml`, `apply-sec-hardening.yml` (just created), `capricast-rename.yml`, all 10 of the `_*.yml` reusable workflows except `_canary-watch.yml`, `detect-flaky-checks.yml`, `flaky-check-report.yml`.

### 6d. Reusable workflows with zero same-repo callers

10 of 11 — only `_canary-watch.yml` is called from this repo (by `deploy-admin-studio.yml`). The others are intended for cross-repo use; whether they actually have downstream callers is unknown without scanning sibling repos.

---

## 7. Architectural recommendations — ranked plan

> Goal: stop the daily firefighting. Each item lists what / why / effort / risk.

| # | Recommendation | Why | Effort | Risk |
|---|---|---|---|---|
| **1** | **Run `apply-sec-hardening.yml` on a 1h cadence + on push to `.github/security/*.json` and add the Copilot per-repo toggle + the classic ruleset state to its repair scope.** | Closes the entire "branch protection mysteriously regressed" class of incident (today's #529). Today's coverage only handles the JSON file; the toggle was reset today by hand. | S | low |
| **2** | **Consolidate the 5 project-sync workflows (#540) into one event-driven script.** | 5 workflows competing on the same Project board produce ⚠️ skipped-heavy traces (no signal whether the board is actually being updated). Single source = observable. | M | low |
| **3** | **Delete or move the 4 orphaned workflows: `videoking-slo-collect.yml`, `detect-flaky-checks.yml` OR `flaky-check-report.yml`, and any of the `_*.yml` reusable that have no downstream caller.** Inventory the downstream-caller side first. | Removes false-positive failure noise. Lets the user trust that "❌ on the badge" actually means broken. | S | low |
| **4** | **Pick ONE branch-protection mechanism — JSON-via-`apply-sec-hardening` OR classic ruleset 15843812 — and delete the other.** | Today we have both. They will drift. Doc lies become incidents. | M | medium (one cycle without protection during cutover) |
| **5** | **Move per-app secrets out of Factory repo and into each app repo (or use GitHub Environments per app).** | A `CF_API_TOKEN` leak in Factory blasts every app. Today's Factory holds 8 `HYPERDRIVE_*`, 3 `KAIROSCOUNCIL_*`, etc. that the app repos themselves should own. Cross-repo workflows can reach with App-token impersonation. | L | medium |
| **6** | **Buy 1 Copilot Business seat for the org and migrate `copilot-swe-agent` from individual to org identity. Set `prevent_self_review = true` on `production` and `staging` environments.** | Today the autonomous loop dies if the user's individual sub lapses. Both environments today let the user self-approve their own deploys → 4-eyes is theatre. | S | low |
| **7** | **Fix the 3 hidden P1 silent-breakage bugs in §5: items #5 (label match), #10 (workflow_run name mismatch), #11 (Dependabot mirror).** Each is one or two lines but each silently disables a critical loop. | Without these, the supervisor loop, the Copilot auto-merge loop, and the Dependabot review loop are all running on luck. | S each | low |
| **8** | **Adopt a single canonical "feature PR" gate: any PR touching `.github/workflows/**` requires a `meta:workflow-change` label and a separate human review.** | Five PRs today carried accidental workflow drift in feature branches. This is how supply-chain security incidents happen. | S | low |
| **9** | **Triage the 4-workflow lockfile cluster: keep `regen-lockfile-on-branch.yml` (the ✅ 7/7 one), delete or rewrite the other three.** | Today only the targeted one works reliably; the matrix versions hide failures behind matrix noise. | S | low |
| **10** | **Add a weekly "automation-health" digest to Pushover that publishes §1 health column + §6 redundancy count.** | Same reason a fridge has a thermometer: you cannot trust what you do not measure, and right now the user is the thermometer. | M | low |

---

## 8. Definition of "operational stability" — exit criteria

The user can stop checking on this every 5 minutes when **all of the following** are true for **14 consecutive days**:

1. **Required-status checks** (`validate`, `Analyze (javascript)`, `dependency-review`) are green on every PR merged to `main` and Policy Drift Guard reports `enabled` continuously.
2. **Apply-sec-hardening** has run on its 6h schedule with **0 manual interventions**, and any drift events were repaired within one cycle.
3. **Every workflow listed in §1 with health ≥ ⚠️** has either been **fixed to ✅**, **deliberately deleted**, or **migrated to a downstream repo** — i.e. no item in §1 is in ❌ or 💤 unjustified.
4. **Supervisor loop** has had at least 1 successful end-to-end run per template per 30-day window, AND no open issue has the `supervisor:no-template` label for more than 24h.
5. **Copilot loop** has merged at least 5 Yellow-tier PRs with no human approve action in the path, AND `auto-merge-approved-prs.yml` has skipped no PRs incorrectly.
6. **Dependabot mirror** has 5 consecutive green scheduled runs and the next Dependabot PR mints a Factory App token successfully without GH_TOKEN fallback.
7. **Branch protection mechanism** is **single-source** — either the JSON file OR the classic ruleset, never both — and that source is in `.github/security/`.
8. **Per-app secrets** have either been moved to their app repos OR are documented in `docs/runbooks/secret-rotation.md` with explicit cross-repo justification.
9. **No workflow** has 0 successful runs in the last 30 days (every workflow is either green or deleted).
10. **The weekly automation-health digest** (rec #10) has shipped without manual edits for 4 consecutive weeks.

If every one of those is true, the firefighting is over. If any is false, that is the next thing to fix.

---

*Audit generated 2026-05-09. Re-run by walking §1 (workflow list + last-10-runs), §3 (branch-protection JSON + environments JSON), and §5 (open issues + open PRs).*
