---
date: 2026-06-11
from: Claude Code (remote session, branch claude/vigilant-pascal-0rjnrs)
to: VS Code agent
status: open — work transfers with this doc
related: docs/decisions/2026-06-10-sell-phase-action-plan.md
---

# Handoff: Stabilization-first work (worker collisions, UAT, sell-phase plan)

## Context in one paragraph

Operator directive (2026-06-10): there are 0 customers; Capricast and Selfprime
appeared to be failing UAT; stabilization comes first, metrics/revenue reporting
last. This session established ground truth (most UAT failures were sandbox
transport noise, not product defects), fixed three production-class issues, and
root-caused the worker-name collision pattern. Everything below is committed and
pushed on branch `claude/vigilant-pascal-0rjnrs` (2 commits ahead of main, no PR
opened — operator did not request one).

## Branch state

```
claude/vigilant-pascal-0rjnrs  (pushed, clean working tree)
  f75cc09 fix(infra): resolve worker-name collision, restore video-cron domain, de-noise e2e runner
  2d0dd95 docs(decisions): add 30-day sell-phase action plan from 2026-06-10 estate review
```

The full plan (4 workstreams + revised stabilization-first ordering + ground
truth + evidence table) lives in
`docs/decisions/2026-06-10-sell-phase-action-plan.md`. Read it first.

## What was fixed and verified this session (all curl-verified, deployed live)

| Fix | Detail | Evidence |
|---|---|---|
| video-cron unreachable since 2026-06-05 | The `video-cron.latwoodtech.work` Workers custom domain was never attached. NOTE: do NOT create AAAA records manually — that conflicts (CF error 100117). Use `PUT /accounts/{acc}/workers/domains`. | `curl /health` → 200 |
| **Worker-name collision (P0)** | `apps/inbound-oracle/wrangler.jsonc` had `env.production.name: "prime-self"` — its deploys silently overwrote the legacy Selfprime API worker. Renamed to `inbound-oracle-production`, deployed, secrets re-wired from GCP SM (TELNYX/ELEVENLABS/ANTHROPIC/GROQ), custom domain moved. | `curl inbound-oracle.latwoodtech.work/health` → 200 |
| Consumers of hijacked URL repointed | `smoke-prime-self.yml`, `prime-self-smoke` spec, `synthetic-monitor` host map + `PRIME_SELF` service binding (→ `prime-self-api`), `admin-studio` SLO test fixtures — all moved from `prime-self.adrper79.workers.dev` to `api.selfprime.net`. | `curl api.selfprime.net/health` → 200 `{"service":"selfprime-api"}` |
| False UAT failures | e2e runner (`scripts/e2e-runner.mjs`) now launches Chromium with `--disable-quic` and `--disable-features=EncryptedClientHello`; opt-in `E2E_INSECURE_TLS=1` for MITM'd CI networks. The earlier 14–16 "failures" were `ERR_QUIC_PROTOCOL_ERROR`/`ERR_ECH_FALLBACK_CERTIFICATE_INVALID` sandbox noise. | Selfprime 66/68 PASS (0 fail), Capricast 71/73 PASS (1 real fail) |
| Registry updated | `docs/service-registry.yml`: video-cron → live; prime-self entry carries a hijack warning; new `inbound-oracle` entry with a `NEVER "prime-self"` note. | committed |

## Root cause of the collision pattern (analysis delivered to operator 2026-06-11)

Cloudflare Workers is a flat account-scoped namespace; `wrangler deploy`
overwrites any same-named worker silently, keeping the old worker's bound
secrets. The monorepo's 29 apps each carry an independent
`env.production.name` with no cross-file uniqueness constraint, and
`docs/service-registry.yml` is authoritative but unread by any tooling. The
Worker Rename Protocol in CLAUDE.md only fires when someone *perceives* a
rename — writing a wrong name into a new config never triggers it. This is a
recurring class, not a one-off.

## Remaining queue (priority order)

1. **[HUMAN APPROVAL REQUIRED — FRIDGE rule 8]** Delete the stale `prime-self`
   CF worker. It currently serves inbound-oracle code at
   `prime-self.adrper79.workers.dev` while still holding the old Selfprime
   production secret set (JWT_SECRET, STRIPE_SECRET_KEY, NEON_URL). Irreversible
   deletion → operator must authorize explicitly. Do not delete autonomously.
2. **Collision gate (the structural fix).** Add a deterministic check to
   `scripts/constraints-check.mjs` (or `.github/scripts/`): parse every
   `apps/*/wrangler.jsonc`, collect all `name` + `env.*.name` values, fail CI on
   any duplicate, and verify each production name exists in
   `docs/service-registry.yml`. Run the audit first — the inbound-oracle
   collision was found by accident; others may be hiding.
3. **Redeploy `synthetic-monitor`** so the corrected `PRIME_SELF` service
   binding (`prime-self-api` in `apps/synthetic-monitor/wrangler.jsonc`) takes
   effect — only config was changed, no deploy happened.
4. **[capricast repo scope needed]** `POST capricast.com/api/sentry/envelope`
   → 404. The frontend Sentry tunnel has no backend route; client-side error
   reporting is silently dead. The only real Capricast UAT failure.
5. **[xico-city repo scope needed]** `xicocity.com/` root route → 404
   (`/health` is 200) on a customer-facing branded domain.
6. Sign-out discoverability warnings on Selfprime (`#/more` nav) and Capricast.
7. Dependabot: 110 vulnerabilities on default branch (47 critical) — triage
   runtime-reachable vs dev-tooling noise.
8. Pre-existing (not from this session): `packages/neon` DTS build errors
   (missing `postgres`/`drizzle-orm` type deps) break admin-studio
   `capabilities.test.ts` and `handoff-store.test.ts`.

After the queue empties and UAT is green, the plan's workstreams resume in
revised order: WS-3 (COH safety) → WS-4 items 4.2/4.3 → WS-1 (Trust the
Numbers) last. See the decision doc for full tables.

## Operational gotchas the next agent must know

- **GCP SM secrets**: create with `printf '%s'` (never `echo` — trailing
  newline trap); some stored values carry a UTF-8 BOM — strip with
  `tr -d '\r\n\357\273\277'`.
- **Neon access exists** — mint fresh connection strings with `neonctl` per
  CLAUDE.md; the stored `*_CONNECTION_STRING` copies are frequently stale.
- **Local build chain**: wrangler bundling of an app requires its
  `@latimer-woods-tech/*` deps built in dependency order first. If `tsup` fails
  with the npm optional-deps bug, `npm i @rollup/rollup-linux-x64-gnu --no-save`
  at repo root.
- **Workers custom domains**: attach via the Workers domains API, never by
  manually creating zone DNS records.
- **Verification standard**: CI green is not done; `curl` with the expected
  status on the branded domain is done (CLAUDE.md Verification Requirement).

## Suggested first action for the receiving agent

Merge or PR branch `claude/vigilant-pascal-0rjnrs` into main (operator's call
on process), then take queue item 2 (the collision CI gate) — it is fully
specified, self-contained, zero-risk, and prevents the P0 class from recurring.
