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
| A — Safety net | [coh#48](https://github.com/Latimer-Woods-Tech/coh/pull/48) | open, pr-check.yml green |
| B — Test coverage | [coh#49](https://github.com/Latimer-Woods-Tech/coh/pull/49) | open, 220 tests passing (was 25); 61% lines / 73% branches / 93% functions |
| Dual-domain alias | [coh#50](https://github.com/Latimer-Woods-Tech/coh/pull/50) | open, registers cipherofhealing.com as alias of cypherofhealing.com |
| Stripe/booking bug fixes | [coh#51](https://github.com/Latimer-Woods-Tech/coh/pull/51) | open, fixes subscription status mapping + appointment transition guard |
| C — Planning reconciliation | [Factory#839](https://github.com/Latimer-Woods-Tech/Factory/pull/839) | open (this PR) |
| Sprint tracking issue (parent) | [coh#47](https://github.com/Latimer-Woods-Tech/coh/issues/47) | open |

The Factory PR (Team C, this PR) is the *meta* PR that documents the sprint; the coh PRs are the actual shipped changes.

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
- [x] **Naming:** Resolved 2026-05-19 in coh#50 — wrangler.jsonc was authoritative; `cypher-of-healing-api` is the canonical worker name and CLAUDE.md was the stale artifact. CLAUDE.md updated to match.
- [x] **Dual-domain alias:** Resolved 2026-05-19 in coh#50 — both `cypherofhealing.com` and `cipherofhealing.com` are intentional aliases of the same product (DNS for both resolves to Cloudflare anycast). Worker custom_domain routes now bind both API hostnames; CORS allows both frontend origins.

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

## Contradictions found during reconciliation — RESOLUTIONS

These were surfaced during the sprint; resolutions ratified 2026-05-19:

1. **Two-repo name collision — RESOLVED:** `Latimer-Woods-Tech/coh` is the live product. `Latimer-Woods-Tech/cypher-healing` is the older multi-tenant scaffold and its spec'd hostname `api.cipherofhealing.com` is now an alias of coh (coh#50). Default disposition for `cypher-healing` repo: RETIRE unless someone makes the case for keeping it. Service-registry note updated accordingly.

2. **Worker-name disagreement inside coh — RESOLVED:** `wrangler.jsonc` was authoritative; the canonical worker name is `cypher-of-healing-api`. coh#50 fixes CLAUDE.md to match (was stale, said "coh"). Service-registry `name` field corrected in this PR amendment.

3. **FUNCTIONS_MATRIX scope — DEFERRED:** `.bootstrap/cypher-healing/FUNCTIONS_MATRIX.md` describes the OLDER cypher-healing scaffold, not coh. The 36 unverified rows cannot legitimately be marked "shipped" against coh's routes — different worker. A fresh `.bootstrap/coh/FUNCTIONS_MATRIX.md` is a follow-up PR.

4. **Dual-domain ratification (NEW, 2026-05-19):** Both `cypherofhealing.com` and `cipherofhealing.com` are intentional aliases. This dissolves the naming collision noted in #1 from "two competing products" to "one product, two domain spellings" — cleaner from a customer-acquisition standpoint (catches typos in either direction).

5. **Issue count off by 2 (minor):** Brief said 19 stale issues; only 17 actually open at sprint start (3 of the 2026-05-08 wave were already closed pre-sprint).
