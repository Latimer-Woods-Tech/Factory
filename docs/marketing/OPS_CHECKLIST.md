# Marketing Ops Checklist — Per New App / Worker

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot

> The grand review identified D1 — each new Worker the marketing system spins up needs ~10 operational touchpoints that none of the builder briefs enumerated. This doc is the **checklist** every new app brief must reference and every new app PR must satisfy.

> Pairs with [`docs/runbooks/add-new-app.md`](../runbooks/add-new-app.md) which covers the generic "new app" steps. This doc adds the **marketing-specific** steps on top.

---

## 1. Scope

A "new app/Worker" in marketing context means any of:

- A new entry in `apps/` (e.g. `apps/marketing-supervisor`, `apps/embed-worker`, `apps/llm-rank-worker`, `apps/shareables-worker`)
- A new package in `packages/` that needs a DB binding or external API (e.g. `@lwt/topics`, `@lwt/attribution`, `@lwt/referrals`)

If the work is purely a code change to an existing package with no new bindings or runtime surface, this checklist doesn't apply.

---

## 2. The 12 ops touchpoints

Every new marketing Worker must satisfy these. The PR can't merge without all 12 done.

| # | Step | Where | Who | Doc reference |
|---|---|---|---|---|
| 1 | **Rate-limiter ID claimed** | `docs/runbooks/add-new-app.md` "Rate limiter ID registry" | Builder agent / human | Currently 1009 & 1010 claimed (proposed) by future marketing PRs; next free is 1011 |
| 2 | **Hyperdrive UUID extracted** (if Neon) | Cloudflare dashboard → Hyperdrive | Operator | Add to `wrangler.jsonc` `hyperdrive` binding |
| 3 | **Custom domain attached** (no `*.workers.dev` user-facing) | Cloudflare dashboard → Worker → Custom Domains | Operator | Per [`CLAUDE.md` Worker Rename Protocol](../../CLAUDE.md#worker-rename-protocol) |
| 4 | **DNS record created** | Cloudflare DNS for target domain | Operator | A/CNAME pointing at Worker route |
| 5 | **`docs/service-registry.yml` entry added** | `docs/service-registry.yml` | Builder | Mirror existing entries: `id`, `name`, `repo`, `url`, `workers_dev_url`, `custom_domain`, `custom_domain_status`, `health_endpoint`, `telemetry_required`, `critical_endpoints`, `consumers` |
| 6 | **GitHub Secrets configured** | `gh secret set` per env | Operator | See §3 below — secrets are env-specific |
| 7 | **GCP Secret Manager entries** (if cross-cuts other apps) | GCP project `factory-495015` | Operator | Per [`reference_gcp_secret_manager_wiring.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/reference_gcp_secret_manager_wiring.md) — WIF-only, no SA keys |
| 8 | **Sentry project created + DSN added** | Sentry org → New Project; secret `SENTRY_DSN_<APP>` | Operator | Per [`PLATFORM_STANDARDS §4`](../PLATFORM_STANDARDS.md#4-observability) |
| 9 | **PostHog event-name allowlist** updated | `packages/analytics/src/event-schemas.ts` `CRITICAL_EVENT_SCHEMAS` | Builder | If new app emits new event types |
| 10 | **CI workflow added** | `.github/workflows/_app-ci.yml` reusable invocation | Builder | Per [`PLATFORM_STANDARDS §7`](../PLATFORM_STANDARDS.md#7-workflows) — ≤5 workflows per repo |
| 11 | **`/health` endpoint live** + smoke test | Worker code + verification curl | Builder | Per [`CLAUDE.md` Verification Requirement](../../CLAUDE.md#verification-requirement-stop--read-this-before-declaring-anything-working) — `curl https://{domain}/health` returns 200 |
| 12 | **README + CHANGELOG.md** | New package/app docs | Builder | Per [`PLATFORM_STANDARDS §8`](../PLATFORM_STANDARDS.md#8-release) — semver + changelog every change |

---

## 3. GitHub Secrets per marketing Worker

Secret names follow `{SCOPE}_{NAME}_{ENV?}` convention. Configure per repo via `gh secret set` and per env via `--env staging` / `--env production`.

### Universal (every Worker)

| Secret | Source | Used for |
|---|---|---|
| `CF_API_TOKEN` | Cloudflare → API Tokens | wrangler deploy |
| `CF_ACCOUNT_ID` | Cloudflare → Account home | wrangler deploy |
| `SENTRY_AUTH_TOKEN` | Sentry → Account Settings → Auth Tokens | sourcemap upload on deploy |
| `SENTRY_DSN_<APP>` | Sentry → New Project | runtime Sentry init |
| `ANTHROPIC_API_KEY` | GCP Secret Manager (per WIF pattern) | LLM calls via `@lwt/llm` |

### Per marketing Worker (proposed)

| Worker | Additional secrets |
|---|---|
| `marketing-supervisor` | `WORKER_API_TOKEN` (cross-Worker auth); `PUSHOVER_API_TOKEN` (digest); `PUSHOVER_USER_KEY` |
| `embed-worker` | `EMBED_SIGNING_KEY` (JWT for embed tokens) |
| `shareables-worker` | `SHAREABLE_SIGNING_KEY` (URL signing) |
| `llm-rank-worker` | `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` (in addition to Anthropic) |
| `email/sequencer` | `RESEND_API_KEY`, `POSTMARK_API_KEY` (fallback per pending ADR) |
| `topic-queue` | `REDDIT_USER_AGENT` (Reddit API requires it; no token); `YOUTUBE_API_KEY` |
| `social-adapters` | `LINKEDIN_OAUTH_CLIENT_ID/SECRET`; `YOUTUBE_OAUTH_CLIENT_ID/SECRET`; `TIKTOK_OAUTH_CLIENT_ID/SECRET`; `INSTAGRAM_OAUTH_CLIENT_ID/SECRET` |

### Tenant secrets (per-practitioner OAuth)

Stored in `tenant_secrets` DB table, NOT in GitHub Secrets. Each practitioner connects their own LinkedIn / YouTube / etc. via OAuth flow; tokens stored encrypted at rest, accessed via secret-vault helper (or fold into `@lwt/auth`).

---

## 4. External account dependencies

Some Worker work blocks on external account onboarding that takes 2-6 weeks:

| External | Lead time | Used by | Status |
|---|---|---|---|
| **Stripe Connect Express platform** | 2-6 weeks (form + review) | Referral commission payouts | ⏳ Operator-initiated |
| **TikTok Content Posting API** | 2-4 weeks (app review) | TikTok adapter | ⏳ Operator-initiated |
| **Meta Instagram Graph API** | 1-2 weeks (app review) | Instagram adapter | ⏳ Operator-initiated |
| **YouTube Data API quota raise** | 1-2 weeks (form + review) | YouTube adapter (default 10k units/day insufficient for content uploads) | ⏳ Operator-initiated |
| **Postmark account** + domain verification | 1-3 days | Email fallback (Resend fallback) | ⏳ Operator-initiated |
| **PostHog paid tier** (if free quota exhausted) | Same-day | All analytics | Monitor free-tier consumption |

These should kick off **before** the corresponding sub-PR starts code work. The builder briefs reference this checklist; the operator owns the external initiation.

---

## 5. Pre-flight checklist (before PR opens)

For the builder agent / human:

- [ ] Rate-limiter ID claimed via PR to `docs/runbooks/add-new-app.md`
- [ ] `wrangler.jsonc` has all required bindings (D1 / Hyperdrive / R2 / KV / Queue / Rate Limiter / DO / cron)
- [ ] `wrangler.jsonc` `routes` uses custom domain, NOT `*.workers.dev` (per [`CLAUDE.md` constraint](../../CLAUDE.md))
- [ ] `docs/service-registry.yml` entry drafted (will be committed in the same PR)
- [ ] `/health` endpoint implemented + integration test
- [ ] README.md drafted (purpose, env vars, dev setup, deploy steps)
- [ ] CHANGELOG.md created
- [ ] Tests at ≥90% coverage per [`CLAUDE.md` Quality Gates](../../CLAUDE.md#quality-gates)
- [ ] External account dependencies listed + flagged to operator

For the operator (parallel to builder work):

- [ ] External account initiated for any lead-time dependency (§4)
- [ ] GitHub Secrets seeded in staging env
- [ ] Sentry project created + DSN added to staging secrets
- [ ] Cloudflare custom domain pre-created (can be staged before Worker deploys)

---

## 6. Post-deploy checklist

After `wrangler deploy` succeeds:

- [ ] `curl https://{custom-domain}/health` returns 200 (Verification Requirement per CLAUDE.md)
- [ ] Sentry receives a test error
- [ ] PostHog receives a test event
- [ ] First production smoke test from a real client (matches use case)
- [ ] Add row to `docs/service-registry.yml` `custom_domain_status: attached` with date
- [ ] Update `docs/STATE.md` if this affects shipping/cohesion (auto-regenerates daily)

---

## 7. When NOT to add a new Worker

Default to **folding into existing** apps before creating new ones:

- The marketing-supervisor is the canonical home for cron-driven autonomous work. Don't spin up sibling apps for marketing logic; add an agent module instead.
- New packages should follow the [`CLAUDE.md` Package Dependency Order](../../CLAUDE.md#package-dependency-order); inserting in the middle requires an ADR.
- Per [`PLATFORM_STANDARDS §7`](../PLATFORM_STANDARDS.md#7-workflows), each repo gets ≤5 workflow files; adding a new app with its own CI pipeline costs one of those.

If a new app is genuinely justified (different runtime, different domain, different security boundary), the brief must include §1 justification.

---

## 8. Cross-references

- [`docs/runbooks/add-new-app.md`](../runbooks/add-new-app.md) — generic new-app process this builds on
- [`CLAUDE.md`](../../CLAUDE.md) — Worker Rename Protocol, Verification Requirement, Hard Constraints
- [`docs/PLATFORM_STANDARDS.md`](../PLATFORM_STANDARDS.md) — workflow / observability / release norms
- [`docs/service-registry.yml`](../service-registry.yml) — canonical service registry
- [`docs/marketing/BUDGET_CAPS.md`](./BUDGET_CAPS.md) — budget impact of new Workers
- [`docs/marketing/CONSTITUTION.md`](./CONSTITUTION.md) — §5 allowlist (new channel = new ADR)

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — 12 ops touchpoints; per-Worker secret table; external account lead-time table; pre-flight + post-deploy checklists |
