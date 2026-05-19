# coh — World-class Polish Sprint

**Sprint date:** 2026-05-19
**Target repo:** [`Latimer-Woods-Tech/coh`](https://github.com/Latimer-Woods-Tech/coh) (the five-stream personal brand platform at https://cypherofhealing.com / https://api.cypherofhealing.com)
**Parent doc updates:** [`docs/APP_SCOPE_REGISTRY.md`](../APP_SCOPE_REGISTRY.md) · [`docs/service-registry.yml`](../service-registry.yml) · [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) (G41–G48)

## Why this sprint exists

coh shipped to production WITHOUT waiting for the W360-032 template buildout. All five product streams (Chair / Vault / Academy / Stage / Inner Circle) are live at the route level, 31 commits in the last 30 days, CI green, custom domains attached. But the underlying conformance score sits at **25/100 against a world-class threshold of 70** — the app is shipped at a sub-bar standard and the gap needs explicit retroactive closure rather than a silent demotion of expectations.

Three parallel teams run today to close that gap in one synchronized sprint instead of three sequential weeks.

## Parallel teams

| Team | Branch | Scope | Repo |
|------|--------|-------|------|
| **A — Safety net** | `worldclass/safety-net` | CI test gate on `deploy.yml`, Sentry initialization, remove 3 hardcoded `.workers.dev` URLs from frontend, guard `/__db/reset` + `/__db/stripe-bootstrap` in production | `Latimer-Woods-Tech/coh` |
| **B — Test coverage** | `worldclass/test-coverage` | Add tests across the 17-route surface; target 70% coverage this sprint, 90% for world-class graduation | `Latimer-Woods-Tech/coh` |
| **C — Planning reconciliation** | `worktree-agent-a89ba65ec85248067` → `docs/coh-reconcile-planning-2026-05-19` | Factory monorepo doc updates: APP_SCOPE_REGISTRY, service-registry, GAP_REGISTER, sprint tracker (this file), triage 17 stale `agent-task` issues on coh | `Latimer-Woods-Tech/factory` (this PR) |

## PR links

| Team | PR | Status |
|------|----|--------|
| A — Safety net | <!-- TBD --> | <!-- not yet opened at time of writing --> |
| B — Test coverage | <!-- TBD --> | <!-- not yet opened at time of writing --> |
| C — Planning reconciliation | <!-- TBD this PR's URL --> | open (Factory PR) |
| Sprint tracking issue (parent) | `Latimer-Woods-Tech/coh` issue — see below | open after this PR |

Update this table as PRs land. The Factory PR (Team C) is the *meta* PR that documents the sprint; the coh PRs (Teams A + B) are the actual shipped changes.

## Target bar (definition of world-class for coh)

A "world-class" coh ships when **all** of the following hold simultaneously:

- [ ] **CI:** Push to `main` runs `typecheck` + `test` BEFORE `wrangler deploy`. Deploy job has `needs:` test job. (closes G41)
- [ ] **Test coverage:** ≥90% lines, ≥85% branches measured by Vitest coverage report. Stretch target this sprint = 70%; world-class = 90%. (closes G42)
- [ ] **Observability:** Sentry initialized via `@latimer-woods-tech/monitoring.sentryMiddleware(c.env.SENTRY_DSN)`. A test error in production appears in the Sentry project inbox within 60s. (closes G43)
- [ ] **No `*.workers.dev` URLs in user-facing code:** `grep -r '\.workers\.dev' coh/web/` returns zero hits in `.html`, `.tsx`, `.ts` files. All frontend API calls go via `https://api.cypherofhealing.com`. (closes G44)
- [ ] **No dangerous prod endpoints:** `/__db/reset` and `/__db/stripe-bootstrap` either deleted in prod or wrapped in `c.env.ENVIRONMENT !== 'production' && return 404`. `curl -X POST https://api.cypherofhealing.com/__db/reset` returns 404. (closes G45)
- [ ] **Docs hygiene:** Root of repo has ≤5 `.md` files (README + LICENSE + CHANGELOG + CONTRIBUTING + SECURITY). All operational docs live in `coh/docs/runbooks/`. README is internally consistent (no broken intra-repo links, no contradictory deployment instructions). (closes G46; deferred — stage-3)
- [ ] **Service registry:** Factory `docs/service-registry.yml` has a `coh` entry with verified `workers_dev_url` (curl proof attached to PR). (closes G47 — this PR)
- [ ] **Cohesion score:** ≥70/100 on the `cypher-healing` row in `docs/conformance/summary.md`. Currently 25/100. (closes G48 as a roll-up)
- [ ] **Naming:** The wrangler.jsonc `name` field and the `coh/CLAUDE.md` health URL agree. Today they disagree (`cypher-of-healing-api` in wrangler vs `coh` in CLAUDE.md). Sprint owner decides which is canonical and follows the [Worker Rename Protocol](../../CLAUDE.md#worker-rename-protocol).

## Acceptance criteria for THIS PR (Team C)

- [x] `docs/APP_SCOPE_REGISTRY.md`: `coh` row reflects shipped reality (not "📚 Planning")
- [x] `.bootstrap/cypher-healing/FUNCTIONS_MATRIX.md`: header note documents the two-repo naming collision
- [x] `docs/service-registry.yml`: new `coh` entry added with all bindings, secrets, vars, critical endpoints
- [x] `docs/GAP_REGISTER.md`: G41–G48 added with severity tier + assigned owner
- [x] `docs/runbooks/coh-world-class-sprint.md`: this file exists and is linked from all four artifacts above
- [ ] 17 stale coh `agent-task` issues triaged (closed if shipped, commented + `wc-polish` label if partial, untouched if unstarted)
- [ ] Sprint tracking issue created in `Latimer-Woods-Tech/coh` titled "World-class sprint — coh — 2026-05-19" with the three PR links as a checklist
- [ ] Single Factory PR opened against `main` with all six commits

## Acceptance criteria for the SPRINT as a whole

Sprint is "done" when **all** target-bar checkboxes above are checked AND:

- [ ] Three sprint PRs merged (Teams A + B + C)
- [ ] coh deploy verified post-merge: `curl https://api.cypherofhealing.com/health` returns 200
- [ ] coh frontend verified post-merge: `curl https://cypherofhealing.com/` returns 200 with no `.workers.dev` requests in the network tab
- [ ] Sentry project receives a synthetic test event from production
- [ ] Test coverage report attached to Team B PR shows ≥70% lines
- [ ] Cohesion score in `docs/conformance/summary.md` reflects the new state (or, if the conformance job runs on a cron, the next run after merge shows ≥40 — gradual improvement is acceptable as long as the underlying gaps are closed and the score will follow)

## Rollback

If the sprint reveals that any of the three teams is destabilizing production:

1. Revert that team's merge commit on `main` (the others can stay if independent)
2. Re-open the matching gap(s) in `docs/GAP_REGISTER.md` and re-assign for the next sprint
3. Update this tracker with a postmortem section
4. File an incident report in `docs/runbooks/INCIDENT.md`

The Factory-side reconciliation (Team C, this PR) is doc-only and has zero deploy risk; the rollback story for it is `git revert`.

## Contradictions found during reconciliation

These are intentional surfacings — flagged here so future readers don't trust the planning artifacts blindly:

1. **Two-repo name collision:** `Latimer-Woods-Tech/cypher-healing` is an older multi-tenant scaffold at `api.cipherofhealing.com`; `Latimer-Woods-Tech/coh` is the live five-stream product at `api.cypherofhealing.com`. The names look identical to a human reader. Decision needed: keep both, retire one, or rename one to disambiguate.
2. **Worker-name disagreement inside coh:** `coh/wrangler.jsonc` declares `name: "cypher-of-healing-api"`, but `coh/CLAUDE.md` says the health URL is `https://coh.adrper79.workers.dev/health`. Both cannot be true simultaneously. The service-registry entry created in this PR follows CLAUDE.md (per the user's instruction to Team C) and flags this loudly with a `legacy_names: [cypher-of-healing-api]` field and a verification TODO.
3. **FUNCTIONS_MATRIX scope:** `.bootstrap/cypher-healing/FUNCTIONS_MATRIX.md` describes the OLDER cypher-healing scaffold (tenants/clients/bookings/courses), not the coh five-stream surface. The 36 unverified rows in that matrix cannot legitimately be marked "shipped" against coh's routes — they describe a different worker. A fresh `.bootstrap/coh/FUNCTIONS_MATRIX.md` is needed and is deferred to a follow-up PR.
