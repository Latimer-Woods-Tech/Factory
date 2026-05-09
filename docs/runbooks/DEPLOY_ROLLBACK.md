# Auto-rollback runbook

> **Scope:** Production Cloudflare Workers deployed via per-app `deploy-*.yml`
> in `Latimer-Woods-Tech/factory`. Staging is excluded.
> **Owner:** `@adrper79-dot` + `factory-cross-repo[bot]` (CODEOWNERS Red-tier).
> **Origin:** factory#535.

## TL;DR

After every prod Worker deploy, `_canary-watch.yml` runs a **single 5-minute
job** that polls Sentry and a synthetic smoke endpoint. If error rate exceeds
`baseline × 5` or the smoke fails twice, the watcher calls
`wrangler versions rollback` to the version captured immediately before the
deploy, opens a `priority:P0` / `status:incident` issue, and pages Pushover.

The watcher will **not** auto-rollback when:

1. The same top Sentry error fingerprint is hot on **two or more** sibling
   prod projects (Stripe / Neon / Cloudflare incident — rollback won't help).
2. The deploy included **DB migrations** (`apps/*/migrations/*.sql` changed
   in this commit). A human must decide whether to revert the schema.

In both cases an issue is still opened and Pushover still pages.

## Architecture

```
deploy-<app>.yml
  └─ deploy job
       ├─ capture previous version id   (pre-deploy)
       ├─ detect migrations in diff
       ├─ wrangler deploy
       └─ capture new version id        (post-deploy)
  └─ canary-watch job  (uses _canary-watch.yml)
       └─ node .github/scripts/canary-watch.mjs
```

All state needed for rollback is captured by the deploy job and passed as
workflow `outputs`. The watcher itself is stateless.

## What "trigger" means

| Signal                  | Threshold                                          | Source                                |
| ----------------------- | -------------------------------------------------- | ------------------------------------- |
| Sentry error rate       | `events/min > baseline_60m × 5` (floor: 1 ev/min)  | `events-stats` API, filtered by release |
| Synthetic smoke failure | 2 consecutive failures within the 5-minute window  | `GET ${BASE_URL}${SMOKE_PATH}`        |

Either signal alone trips the canary. The floor of 1 event/min stops a project
with near-zero baseline from rolling back on a single warning event.

## Upstream incident heuristic

When the canary trips, the watcher fetches the top issue fingerprint for the
new release, then queries the same `sibling_sentry_projects` for an issue with
the same `title`. If **≥ 2** siblings are showing the same error, the watcher
declares an upstream incident, **skips rollback**, and opens a P1 advisory
issue tagged `upstream-suspected`. Investigate Stripe / Neon / Cloudflare
status pages first.

## Deploy with migrations

The deploy workflow sets `has_migrations=true` when any
`apps/<app>/migrations/*.sql` file changed in the commit being deployed
(diff against `github.event.before`). When this flag is true and the canary
trips, the watcher:

- Does **not** call `wrangler rollback` (the schema may now be incompatible
  with the previous Worker version).
- Opens a `priority:P0` / `status:incident` / `needs-human-rollback` issue.
- Pages Pushover at **priority=2 (emergency)** — bypasses quiet hours.

Operator decision tree:

1. Is the new code shippable with a fix-forward in <15 minutes? → fix forward.
2. Is the migration **additive** (new column / table, no destructive change)?
   → roll the Worker back manually, leave the schema in place.
3. Is the migration **destructive** (column drop, type change, data backfill)?
   → page on-call DBA, do not roll back without a coordinated plan.

## Manual rollback

```bash
# List recent versions
npx wrangler versions list --name <worker-name>

# Roll the live deployment to a specific version
npx wrangler versions rollback \
  --name <worker-name> \
  --version-id <previous-version-id> \
  --yes
```

## Rollback failed

If `wrangler rollback` itself returns non-zero, the watcher pages Pushover at
`priority=2` and opens an issue tagged `rollback-failed`. The on-call should:

1. Check Cloudflare API status (`api.cloudflare.com` may be degraded).
2. Re-run `wrangler versions rollback` from a workstation with a **personal**
   `CLOUDFLARE_API_TOKEN` — sometimes the org token's cache is stale.
3. If still failing, redeploy the previous git SHA via
   `gh workflow run deploy-<app>.yml --ref <sha>`.

## Tuning

All inputs are surfaced on `_canary-watch.yml`:

| Input                   | Default                          | When to change                         |
| ----------------------- | -------------------------------- | -------------------------------------- |
| `watch_seconds`         | `300`                            | Long-tail user flows; raise cautiously |
| `poll_interval_seconds` | `30`                             | Lower for very high-traffic apps       |
| `error_rate_multiplier` | `5`                              | Lower for low-traffic apps             |
| `sibling_sentry_projects` | comma-separated list           | Add/remove apps as the fleet evolves   |

## Required org secrets (no new ones)

`SENTRY_AUTH_TOKEN`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `PUSHOVER_USER_KEY`,
`PUSHOVER_APP_TOKEN`, `FACTORY_APP_ID`, `FACTORY_APP_PRIVATE_KEY`.

## Adding to a new app

1. In the app's `deploy-<app>.yml`:
   - Add `outputs:` to the deploy job: `environment`, `previous_version_id`,
     `new_version_id`, `has_migrations`.
   - Add steps to capture pre/post version ids (see `deploy-admin-studio.yml`).
   - Add a `canary-watch` job that `uses: ./.github/workflows/_canary-watch.yml`.
2. Confirm the app exists in Sentry under `latimer-woods-tech` with the same
   slug used for `sentry_project`.
3. Confirm the Worker exposes a fast `/healthz` (or pass a custom `smoke_path`).
4. Add the app to `sibling_sentry_projects` on every other app's call site, so
   the upstream-incident heuristic sees it.

## Known limitations

- **Sentry release tagging.** The watcher filters error rate by
  `release:${NEW_VERSION_ID}`. Apps must tag releases with the Cloudflare
  Worker version id at deploy time (`SENTRY_RELEASE` env in `wrangler.toml`).
  If they don't, baseline-vs-current bleeds together and the multiplier check
  becomes useless.
- **Flapping.** A 5x baseline trigger on a project doing 0.1 events/min is
  noisy. The 1 ev/min floor mitigates this; widen `watch_seconds` or
  `error_rate_multiplier` if you still see flaps.
- **Same-fingerprint heuristic.** Sentry error titles can drift between
  projects (different framework wrappers). Tune by adding fingerprint rules
  in Sentry, not by chasing string matches here.
