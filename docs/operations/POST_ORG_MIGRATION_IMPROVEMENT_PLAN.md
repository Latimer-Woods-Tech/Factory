# Post Org Migration — Improvement Plan

**Date:** May 1, 2026
**Status:** Active execution plan, picks up after Phase B completion + April 30 org migration
**Canonical parent:** `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md`
**Active task dashboard:** `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md`
**Related:** `documents/factory/org-migration-complete-2026-04-30.md` (migration completion record), `docs/operations/W360_FACTORY_REPO_HARDENING_PLAN.md` (control-plane hardening)

---

## 1. Where we are

The April 30 hardening sprint moved Factory + the 11 ecosystem repos from `adrper79-dot/*` to the `Latimer-Woods-Tech` GitHub organization on a Team plan. Concretely:

- All 11 repos transferred, npm scope renamed `@adrper79-dot/*` → `@latimer-woods-tech/*`, 19 packages republished, 460 file references rewritten
- GitHub App `factory-cross-repo` (App ID 3560471) installed on the org with full automation permissions; 19 factory workflows refactored to use App-issued tokens instead of `GH_PAT`
- Repository rulesets active on all 11 repos blocking force-push, deletion, and non-linear history on `main`
- Renovate auto-merge configured for minor/patch dependency updates
- 48 secrets centralized at org level; 44 redundant per-repo copies removed (factory vault: 75 → 31)
- Cloudflare estate cleaned: 12 Workers, 2 queues, 1 Hyperdrive, 2 KV namespaces, 1 D1 database, 1 R2 bucket deleted (39% Worker reduction)
- 4 orphan repos deleted from `adrper79-dot/*` (`thecalling-web`, `CallMonitor`, `prime-self`, `prime-self-ui`)
- Reusable workflow templates scaffolded at `Latimer-Woods-Tech/factory/.github/workflows/_app-ci.yml` and `_app-deploy.yml` (not yet adopted by app repos)

The original `BLOCKED.md` issue (npm scope vs GitHub user mismatch) is finally resolved cleanly.

## 2. Score against best-practice axes

| Axis | Pre-sprint | Post-sprint | World-class target |
|---|---|---|---|
| Identity & Access | 7/10 | 9/10 | 10/10 |
| Infrastructure as Code | 6/10 | 6/10 | 9/10 |
| CI/CD pipeline structure | 3/10 | 7/10 | 9/10 |
| Security scanning | 4/10 | 6/10 | 8/10 |
| Observability | 6/10 | 6/10 | 9/10 |
| Monorepo / package sharing | 7/10 | 9/10 | 10/10 |
| Documentation | 7/10 | 8/10 | 9/10 |
| Cost management | 3/10 | 7/10 | 9/10 |
| Deploy gating | 4/10 | 4/10 | 9/10 |
| **Net** | **~5/10** | **~7/10** | **~9/10** |

Closing the remaining ~2 points to world-class is the work this plan describes.

## 3. Priority model

Inherits the W360 task dashboard convention.

| Priority | Meaning | Rule |
|---|---|---|
| P0 | Blocks downstream work or risks money-moving safety | Fix before starting dependent feature work |
| P1 | Required for World Class 360 ready state | Queue immediately after P0 |
| P2 | Important scale/polish work | Build once core loops prove green |
| P3 | Cleanup or future leverage | Schedule, do not interrupt the core path |

## 4. Active work register

### P0 — finish unblocking the migration

| ID | Task | Effort | Exit criteria |
|---|---|---|---|
| **POM-01** | Refactor every app repo's CI workflow to call `Latimer-Woods-Tech/factory/.github/workflows/_app-ci.yml@main` instead of inlined steps. Same for deploy. | 3–4 hrs | Every app repo's `.github/workflows/ci.yml` is ≤10 lines; full green CI on each |
| **POM-02** | Verify all app repos' deploys still work after the npm scope rename — run `wrangler deploy --dry-run` on each via dispatched workflow | 1 hr | All 11 deploys complete successfully against staging |
| **POM-03** | Update the Sauna PAT connection (`conn_pvMtrQjxhkoZ`) to the rotated value with `admin:org` and `delete_repo` scopes | 5 min | Connection's whoami reflects the new scope set |
| **POM-04** | Rotate the GitHub App private key one more time (the Apr 30 PEM was in chat history during the migration) | 10 min | New key uploaded to org-level `FACTORY_APP_PRIVATE_KEY`; old key revoked in App settings |
| **POM-05** | Deprecate the old `@adrper79-dot/*` packages on npm.pkg.github.com (mark deprecated, point to new scope) | 30 min | All 19 old-scope packages return deprecated warning when installed |

### P1 — production gating + reliability

| ID | Task | Effort | Exit criteria |
|---|---|---|---|
| **POM-10** | Create GitHub Environments named `staging` and `production` on each app repo. Production requires manual approver = repo admin. | 2 hrs | Every prod deploy of an app waits for explicit approval; each app repo shows two environments in Settings → Environments |
| **POM-11** | Bind production secrets to the `production` environment specifically (rather than repo-level) so staging never touches prod credentials | 2 hrs | Staging deploys cannot read `STRIPE_SECRET_KEY`/`CF_API_TOKEN` for production accounts |
| **POM-12** | Add a `post-deploy-verify` reusable workflow that hits `/health` and `/ready` after every deploy and rolls back on failure (existing `release-procedure.md` references this) | 3 hrs | Every successful deploy ends with a verified `/health` 200; failure triggers automated rollback within 90s |
| **POM-13** | Stand up a single status dashboard: GitHub Action runs uptime + Worker availability + last-deploy timestamp per app | 4 hrs | One URL shows green/red state of all 11 apps |
| **POM-14** | Resolve the 10 open W360 hardening PRs (`#27`–`#37`) — merge or close, do not leave drift | 2 hrs | Open PR count = 0 on factory main |

### P2 — cost, observability, and discipline

| ID | Task | Effort | Exit criteria |
|---|---|---|---|
| **POM-20** | Cloudflare token resplit — replace the current omni-token with per-app least-privilege tokens (Workers Scripts:Edit on specific scripts only) | 2 hrs | One token per app, each scoped to that app's Workers + R2 + KV; old omni-token revoked |
| **POM-21** | Inventory + delete remaining stale Cloudflare resources (KV namespaces, R2 buckets) that survived the Apr 30 cleanup | 1 hr | All KV namespaces have a known owner; R2 bucket count = 5 (down from 6) |
| **POM-22** | Audit Neon project list — orphan projects from deleted Workers should be deleted | 1 hr | Neon project count matches Hyperdrive config count (10) |
| **POM-23** | Add Sentry release tracking to every deploy (currently DSN is wired but releases aren't tagged) | 2 hrs | Sentry shows release-tagged events for every deploy of every app |
| **POM-24** | Stand up cost dashboard: Cloudflare + Neon + GitHub Actions monthly burn, broken down by app | 3 hrs | One markdown report regenerated weekly via scheduled workflow |
| **POM-25** | Onboard `videoking` and `HumanDesign` to the same release-train discipline as the 6 Phase 7 apps (currently they have their own ad-hoc deploy patterns) | 4 hrs | Both repos use `_app-ci.yml` + `_app-deploy.yml` with environments |
| **POM-26** | Deprecate the legacy `_external_reviews/videoking` reference in `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md` now that videoking lives in the org as a first-class peer | 15 min | Dashboard mentions `Latimer-Woods-Tech/capricast` directly |

### P3 — future leverage

| ID | Task | Effort | Exit criteria |
|---|---|---|---|
| **POM-30** | GitHub Advanced Security trial on factory only — see how much CodeQL/secret-push-protection actually finds before committing $49/seat/month | 1 hr setup, 30 days observation | Decision recorded on whether to expand to all repos |
| **POM-31** | Per-app `.github/CODEOWNERS` refinement — currently uses `@adrper79-dot` as fallback owner; should reference org teams as the org grows | 30 min | CODEOWNERS uses team handles rather than user handles |
| **POM-32** | Migrate `bootstrap-publish.yml` away from `npm publish`-per-package to a single batched `changesets`-managed release flow | 4 hrs | One PR ships a coordinated version bump across all packages; manual version-bumping retired |
| **POM-33** | Documentation prune: `MASTER_INDEX.md` lists 40+ top-level `.md` files. Move historical "_COMPLETE.md" files to `docs/archive/` | 1 hr | Top-level `.md` count ≤ 10; archive dir holds historical phase-completion docs |
| **POM-34** | Move `documents/factory/*` (the Apr 30 session artifacts) into `docs/sessions/` inside the factory repo so they live with the code | 30 min | Session docs are reachable from inside the factory repo |

## 5. Recommended sequence

Two-week sprint, May 1–15:

| Day(s) | Focus |
|---|---|
| Mon May 4 | POM-01 (reusable workflow adoption) — biggest leverage move |
| Tue May 5 | POM-02 verify; POM-04 rotate App key; POM-10 environments; POM-11 prod-secret binding |
| Wed May 6 | POM-12 post-deploy verify + rollback; POM-14 close W360 PRs |
| Thu May 7 | POM-25 onboard videoking + HumanDesign to release train |
| Fri May 8 | POM-13 status dashboard; POM-23 Sentry release tracking |
| Mon May 11 | POM-20 CF token resplit; POM-21 + POM-22 estate cleanup tail |
| Tue May 12 | POM-24 cost dashboard; POM-05 deprecate old packages |
| Wed–Fri May 13–15 | P3 backlog (POM-30 through POM-34) |

By end of May 15, the score should reach 9/10 across all axes.

## 6. Dependencies + risks

- **POM-10 (environments) depends on POM-01 (reusable workflows)** — environment gating belongs inside the reusable deploy workflow, not duplicated 11 times
- **POM-25 (videoking + HumanDesign on release train) depends on POM-01** — need the reusable workflow before refactoring those two repos
- **POM-04 (App key rotation) is independent** but should happen before any sensitive automation runs
- **POM-20 (CF token resplit) depends on POM-21/POM-22** — can't scope tokens to apps if some Workers are still legacy

Risk: refactoring 11 app repos' CI in a single day (POM-01) is aggressive. If any app's CI has surprises (build steps that don't fit the reusable shape), drop them onto a smaller "ci-custom.yml" that calls the reusable for the common parts only.

## 7. Owner assignments

Solo dev today. As the org grows, suggested track ownership:

| Track | Owner role |
|---|---|
| POM-01–05 (migration finalization) | Tech lead |
| POM-10–14 (deploy gating + reliability) | Platform lead |
| POM-20–26 (cost + observability) | Ops lead |
| POM-30–34 (future leverage) | Engineering manager |

## 8. Definition of done for this plan

The plan is "done" when:

- [ ] All P0 tasks complete
- [ ] All P1 tasks complete
- [ ] At least 50% of P2 tasks complete
- [ ] WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md scoring updated to 9/10 across the relevant axes
- [ ] A successor plan replaces this one in `docs/operations/`
