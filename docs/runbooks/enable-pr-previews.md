# Enable PR Previews for a Factory App

Use this runbook to wire a Factory app into the `latimerwoods.dev` PR-preview pipeline. Capricast was the pilot (PR #TBD).

After this is wired, every PR against the app's repo that touches the worker code will get:

- A Neon branch forked from `staging` (named `pr/{number}`)
- An ephemeral Hyperdrive bound to that branch
- A preview Worker deployed as `{base-name}-pr-{number}`
- A live URL at `api.pr-{number}.{app}.latimerwoods.dev`
- A PR comment with the URL and `/health` probe

Closing the PR tears everything down automatically.

## Prerequisites

Before wiring an app:

- [ ] App has a Neon project with a `staging` branch (PR branches fork from this — never production).
- [ ] App's `wrangler.jsonc` has a single Hyperdrive UUID hardcoded in the production env (the sed-replace anchor).
- [ ] App's wrangler.jsonc declares production `routes` / `custom_domain` inside an `env.production` block, not at the top level. (Top-level routes get inherited by the PR-preview worker and would steal production traffic.)
- [ ] The following secrets exist in the **app's repo** (not Factory):
  - `NEON_API_KEY` — Neon API key with branch:create + branch:delete scopes.
  - `CF_API_TOKEN` — Cloudflare token with Workers:Edit + Hyperdrive:Edit + Zone:Edit on `latimerwoods.dev`.
  - `CF_ACCOUNT_ID` — Cloudflare account ID.
  - `GH_PAT` — GitHub PAT with `repo` scope (used to post PR comments).
- [ ] The following repo **variables** exist in the app's repo:
  - `NEON_PROJECT_ID` — e.g. `divine-grass-42421088`. Get from `npx neonctl projects list --org-id org-withered-wave-19602339`.
  - `PRODUCTION_HYPERDRIVE_ID` — the UUID currently in the app's wrangler.jsonc. Get from `npx wrangler hyperdrive list`.

## Step 1 — Add the PR-preview workflow to the app's repo

Create `.github/workflows/pr-preview.yml` in the app's repo:

```yaml
name: PR Preview (Neon branch + ephemeral Worker)

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]
    paths:
      - 'src/**'
      - 'wrangler.jsonc'
      - 'package.json'
      - '.github/workflows/pr-preview.yml'

jobs:
  preview:
    uses: Latimer-Woods-Tech/factory/.github/workflows/_neon-pr-lifecycle.yml@main
    with:
      neon_project_id:          ${{ vars.NEON_PROJECT_ID }}
      app_name:                 capricast       # short name used in subdomain (api.pr-{n}.capricast.latimerwoods.dev)
      worker_base_name:         capricast-api   # production wrangler `name` field
      worker_path:              .               # directory containing wrangler.jsonc (use 'apps/foo' if nested)
      worker_env:               staging         # named env whose bindings the preview inherits (CRITICAL)
      wrangler_config:          ''              # e.g. 'wrangler.staging.toml' if you use per-env files
      production_hyperdrive_id: ${{ vars.PRODUCTION_HYPERDRIVE_ID }}
      pr_number:                ${{ github.event.number }}
      pr_action:                ${{ github.event.action }}
    secrets:
      NEON_API_KEY:  ${{ secrets.NEON_API_KEY }}
      CF_API_TOKEN:  ${{ secrets.CF_API_TOKEN }}
      CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
      GH_PAT:        ${{ secrets.GH_PAT }}
```

Replace `capricast` / `capricast-api` with your app's identifiers. Leave the workflow as `@main` so improvements to the reusable workflow propagate without app-repo churn.

## Step 2 — Confirm wrangler.jsonc shape

The reusable workflow runs `wrangler deploy --name {base}-pr-{n}`, which **overrides the `name` field** but inherits everything else from the file. So:

- `routes` and `custom_domain` declarations MUST live inside `env.production` (or `env.staging`), not at the top level. Otherwise the PR-preview worker takes over production traffic.
- `name` at the top level can stay as the production name — `--name` overrides it.
- The Hyperdrive ID must appear **exactly once** with the UUID from `vars.PRODUCTION_HYPERDRIVE_ID`. The workflow sed-replaces this; multiple matches are fine but the workflow errors out if the anchor is missing.

Reference: [Factory `apps/capricast-api/wrangler.jsonc`](https://github.com/Latimer-Woods-Tech/capricast/blob/main/wrangler.jsonc) once Phase 3 is live.

## Step 3 — Open a test PR

1. Open a draft PR with a no-op change.
2. Watch the `PR Preview` workflow run in the Actions tab.
3. Check the PR comments — a bot comment should appear with the preview URL.
4. `curl https://api.pr-{n}.{app}.latimerwoods.dev/health` — must return 200.

## Step 4 — Close the PR to verify teardown

1. Close the PR (no merge needed).
2. The `destroy` job in the reusable workflow runs.
3. The PR gets a `🧹 PR Preview torn down` comment.
4. Verify in CF dashboard:
   - Worker `{base}-pr-{n}` is gone.
   - Hyperdrive `{base}-pr-{n}` is gone.
   - Domain `api.pr-{n}.{app}.latimerwoods.dev` no longer resolves.
5. Verify in Neon dashboard:
   - Branch `pr/{n}` is gone.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Workflow fails at "Create Hyperdrive" with auth error | `CF_API_TOKEN` missing Hyperdrive:Edit scope | Mint a new token with all four scopes |
| Workflow fails at "Attach preview custom domain" with `1042` | Zone not in same CF account as `latimerwoods.dev` | Confirm `vars.CF_ACCOUNT_ID` matches the account that owns the zone |
| `/health` returns 530 after deploy | DNS / cert still propagating | Wait 60s and retry; the workflow's verify step is best-effort |
| Sed replace says "anchor not found" | wrangler.jsonc was updated and `PRODUCTION_HYPERDRIVE_ID` is stale | Update the repo variable to match the new UUID |
| PR-preview worker steals production traffic | Production routes declared at top level instead of `env.production` | Move all `routes` / `custom_domain` into `env.production` block |

## What this workflow does NOT do

- **Frontend / Pages previews.** Cloudflare Pages already does this natively per commit. PR-preview here is for Workers + Neon, not for static sites.
- **Run migrations on the PR branch.** Migrations are part of the app's own CI, not the lifecycle workflow. If your app depends on schema changes, run migrations against the PR's Neon branch as part of your normal CI before this workflow fires.
- **Replace production deploys.** This workflow only creates `{base}-pr-{n}` workers. Production deploys still happen via the app's own `deploy.yml`.

## Reusable workflow source

[`.github/workflows/_neon-pr-lifecycle.yml`](../../.github/workflows/_neon-pr-lifecycle.yml) in this repo. Open an issue or PR against Factory to change behavior — every consumer will pick it up on next workflow run.
