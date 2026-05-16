# Team Handoff — Factory @ Latimer-Woods-Tech

**Updated:** May 1, 2026
**Audience:** Anyone joining the Factory ecosystem after the April 30 org migration
**Read time:** 20 minutes
**Canonical companion:** `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md` (the strategic plan), `MASTER_INDEX.md` (every doc)

---

## What this is

Factory is a multi-app platform built on Cloudflare's edge stack. Eleven app repos consume 19 shared TypeScript packages published from one monorepo (`factory`). All apps deploy as Cloudflare Workers, back onto Neon Postgres via Hyperdrive, and share a common observability + monetization stack (Sentry + PostHog + Stripe).

You're joining a system that just finished a significant hardening sprint. The bones are sound. What remains is closing the gap to world-class via deploy gating, app-CI consolidation, and cost discipline (see `POST_ORG_MIGRATION_IMPROVEMENT_PLAN.md`).

## The org

**Owner:** `Latimer-Woods-Tech` (GitHub Team plan)
**Admin:** `adrper79-dot`
**npm scope:** `@latimer-woods-tech/*` published to `npm.pkg.github.com`

### Repos (11 + factory)

| Repo | Purpose | Surface | Status |
|---|---|---|---|
| `factory` (private) | Monorepo with 19 shared packages, scaffolding, infra orchestration | Internal | Active |
| `wordis-bond` (private) | Factory app | API | Phase 7 ready |
| `cypher-healing` (private) | Factory app | API | Phase 7 ready |
| `ijustus` (public) | Factory app | API | Phase 7 ready |
| `the-calling` (private) | Factory app | API | Phase 7 ready |
| `neighbor-aid` (private) | Factory app | API | Phase 7 ready |
| `xico-city` (private) | Mexico City experiences platform — first verticalized app | API | S-00 done, S-01–S-11 in progress |
| `factory-admin` (private) | Operator/control plane | API + UI | Phase 8 active |
| `xpelevator` (public) | Factory app | API | Phase 7 ready |
| `videoking` (public) | NicheStream — interactive video platform live at capricast.com | API + Pages | Production live, Phase 4 monetization shipped |
| `HumanDesign` (public) | Prime Self — practitioner B2B2C platform live at selfprime.net | API + Pages | Production live |

## How to log in

There are three identities to know:

1. **`adrper79-dot` (personal GitHub user)** — current sole org admin, owns the GitHub App, owns all Cloudflare account access
2. **`factory-cross-repo` (GitHub App, ID 3560471)** — cross-repo automation for factory's workflows. Installed on the `Latimer-Woods-Tech` org with full write permissions. Workflows mint short-lived installation tokens via `actions/create-github-app-token@v1` instead of using a long-lived PAT.
3. **`Cloudflare API token`** — single account-admin token in factory secrets (`CLOUDFLARE_API_TOKEN`). Will be split into per-app tokens (POM-20).

If you need to act on the system directly, you usually don't — dispatch the appropriate workflow in `Latimer-Woods-Tech/factory`.

## Where everything lives

### In the factory repo

```
factory/
├── README.md, START_HERE.md, MASTER_INDEX.md     ← read these first
├── WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md       ← canonical strategic plan
├── PROJECT_STATUS.md                             ← state of each phase
├── packages/                                     ← 19 shared @latimer-woods-tech/* packages
│   ├── auth, errors, logger, monitoring          ← Stage 1
│   ├── neon, stripe, llm, telephony              ← Stage 2
│   ├── analytics, deploy, testing, email         ← Stage 3
│   ├── copy, content, social, seo                ← Stage 4
│   └── crm, compliance, admin                    ← Stage 5
├── scripts/                                      ← phase orchestrators, scaffolders
│   ├── phase-6-orchestrator.mjs
│   └── orchestrator-v2.mjs (xico-city LLM-driven build)
├── .github/workflows/ (40 files)                 ← all factory automation
│   ├── _app-ci.yml, _app-deploy.yml              ← reusable workflows (NEW)
│   ├── scaffold-*.yml, setup-*-secrets.yml       ← per-app provisioning
│   ├── bootstrap-publish.yml                     ← package publishing
│   └── ... 30+ more
└── docs/
    ├── ESSENTIAL_OWNERS_GUIDE.md                 ← owner manual
    ├── DOCUMENTATION_HIERARCHY.md                ← how docs are organized
    ├── runbooks/
    │   ├── add-new-app.md                        ← onboard a new app
    │   ├── deployment.md, rollback-runbook.md    ← deploy ops
    │   ├── incident-response-playbook.md
    │   ├── secret-rotation.md
    │   ├── github-secrets-and-tokens.md
    │   ├── credentials-setup.md
    │   └── slo-framework.md, error-budget-policy.md
    ├── operations/
    │   ├── WORLD_CLASS_360_TASK_DASHBOARD.md     ← active execution queue
    │   ├── W360_FACTORY_REPO_HARDENING_PLAN.md
    │   └── POST_ORG_MIGRATION_IMPROVEMENT_PLAN.md  ← what to do next
    └── videoking/, packages/, rfc/               ← per-product + RFC docs
```

### Cloudflare resources (under account `a1c8a33cbe8a3c9e260480433a0dbb06`)

- **19 Workers** — one per Phase 7 app + factory-admin + admin-studio + schedule-worker + synthetic-monitor + video-cron + capricast-api + prime-self-api{,-staging,-production} + prime-self-discord. Pre-cleanup the count was 31; 12 stale Workers were deleted Apr 30.
- **6 R2 buckets** — `cache`, `cypher-healing-media`, `factory-videos`, `prime-self-exports{,-staging}`, `videoking-r2`
- **10 Hyperdrive configs** — one per Phase 7 app + xico-city + xpelevator + videoking + factory-core
- **7 KV namespaces** — rate limiting + caching for live products
- **2 Queues** — none currently live (wordisbond-transcription was deleted with its dead Worker)
- **D1**: zero (focusbro-db deleted Apr 30)

### Neon (Postgres)

11 Hyperdrive configs map to 10+ Neon projects. Connection strings live in factory's vault as `<APP>_CONNECTION_STRING` (and at org level as of Apr 30).

### External services

- **Sentry** — DSN per app in factory vault and at org level (`SENTRY_DSN_<APP>`)
- **PostHog** — admin URL + project token in vault
- **Stripe** — single shared `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` (Stripe Connect for marketplace apps)
- **Anthropic + Grok + Groq** — LLM fallback chain for the xico-city orchestrator
- **Resend** — transactional email
- **Telnyx + Deepgram + ElevenLabs** — voice/SMS pipeline (per `@latimer-woods-tech/telephony`)
- **Mintlify** — public docs hosting

## Daily operations

### Deploy a change

The default flow is `git push main` → CI runs → deploy gates run → Worker deploys. As of May 1 there's no manual production gate yet (POM-10 will add one). Until then, `main` is production.

For multi-package changes:
1. Open PR against factory main (rulesets enforce squash-only + linear history)
2. CI runs `package-integration.yml` smoke test
3. Merge → Renovate auto-creates PRs in every consuming app within an hour
4. Auto-merge fires when each app's CI passes

### Add a new app

Follow `docs/runbooks/add-new-app.md` exactly. The runbook covers:
- Rate limiter ID registry (next available: 1009 as of Apr 28)
- Hyperdrive provisioning
- Scaffold + secrets workflows
- App-specific CI

### Rotate a secret

Follow `docs/runbooks/secret-rotation.md`. Updates go to org-level secrets (preferred) so all repos pick up the new value. App-specific secrets stay per-repo.

### Handle an incident

Follow `docs/runbooks/incident-response-playbook.md`. Sentry alerts → on-call investigates → rollback if necessary via `rollback-runbook.md`. Post-incident: schedule a sync (`postmortem-sync-agenda.md`) and append lessons to `lessons-learned.md`.

### Push directly to main

You can't. Rulesets block force-push, deletion, and non-linear history on `main` for all 11 repos. Make a PR or use the bypass actor (which is currently the repo admin = you).

## What changed on April 30

If you're picking up where the prior session left off:

- **Org migration** moved 11 repos from `adrper79-dot/*` to `Latimer-Woods-Tech/*`. All historical commit SHAs are preserved.
- **npm scope rename** `@adrper79-dot/*` → `@latimer-woods-tech/*`. Old packages still resolve but should be considered deprecated.
- **Cloudflare estate cleanup** removed 12 stale Workers and related orphans. If you remember a Worker that's gone, check `org-migration-complete-2026-04-30.md` to see if it was deliberately deleted.
- **Per-repo `GH_PAT` references in workflows replaced by GitHub App tokens.** When a workflow needs a GitHub token, it now looks for `FACTORY_APP_*` secrets. If you write a new workflow, follow that pattern (see existing `setup-app-secrets.yml`).
- **48 secrets centralized at org level.** Don't add new secrets per-repo unless they're truly app-specific. Default to org-level via the org admin UI or API.

## What's next

The active execution queue is in `docs/operations/POST_ORG_MIGRATION_IMPROVEMENT_PLAN.md`. P0 items finish closing the migration; P1 adds production gating and reliability discipline; P2 covers cost + observability; P3 is future leverage.

If you're picking what to work on first: **POM-01 (refactor app repos onto reusable workflows)** has the highest leverage. It cuts CI maintenance from 11 places to 1.

## Glossary

- **Factory** — the shared monorepo + the org's identity for the platform layer
- **Phase 1–8** — Factory's historical build phases. Phase 6 = infra provisioning, Phase 7 = app scaffolding, Phase 8 = control plane (factory-admin)
- **W360** — World Class 360, the current iteration's north star (see `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md`)
- **App repo** — any of the 10 non-factory repos that consume `@latimer-woods-tech/*` packages
- **Standing orders** — `CLAUDE.md` at the factory root; non-negotiable rules every agent and engineer follows
- **Release train** — the coordinated package-bump → consumer-update → deploy flow Renovate drives
- **Reusable workflow** — `_app-ci.yml`, `_app-deploy.yml` — called from app repos via `uses:` syntax. Single source of truth for CI logic.

## Where to ask for help

For now, ask `adrper79-dot`. As the team grows, this section gets a real ownership map (see POM-31 in the improvement plan).

## Quick command reference

```bash
# Dispatch a factory workflow (need GH PAT or App token):
gh workflow run scaffold-xico-city.yml --repo Latimer-Woods-Tech/factory

# Read an org-level secret list:
gh api /orgs/Latimer-Woods-Tech/actions/secrets

# Check ruleset on an org repo:
gh api /repos/Latimer-Woods-Tech/<repo>/rulesets

# Verify factory's GitHub App is healthy:
# (use a JWT signed with FACTORY_APP_PRIVATE_KEY)
curl -H "Authorization: Bearer $JWT" https://api.github.com/app
```

## A note on operating discipline

`CLAUDE.md` at the factory root is the enforced standing-orders document. Read it before changing anything that involves multiple repos or production traffic. The most-violated rules in past sprints have been:
1. Editing `wrangler.jsonc` `vars` block for secrets (always use `wrangler secret put` or GitHub Secrets)
2. Skipping the post-deploy curl gate
3. Cross-package coupling that leaks app logic into `@latimer-woods-tech/*` packages

If you find yourself doing one of these three, stop and re-read the relevant runbook.
