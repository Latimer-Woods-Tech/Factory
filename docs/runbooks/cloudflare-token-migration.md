---
status: active
owner: platform
doc_type: runbook
last_updated: 2026-06-17
scope: Migrating CI workflows from the near-admin CF_API_TOKEN onto the least-privilege cf-token-* suite.
---

# Cloudflare Token Migration Runbook

Moves every CI consumer off the broad/near-admin Cloudflare tokens (notably **FACTORY MAIN**, ~165 permissions, 5 separate tokens carry `API Tokens Write`) onto the **least-privilege `cf-token-*` suite**. Governing policy: [`docs/_governance/cloudflare-key-policy.md`](../_governance/cloudflare-key-policy.md). Suite definition + tooling: [`scripts/cloudflare/`](../../scripts/cloudflare/).

## Status (2026-06-17)

All 7 scoped tokens are **minted, scoped, and stored in GCP Secret Manager** (`factory-495015`), each verified `active`:

| GCP secret | CF token | Scope |
|---|---|---|
| `cf-token-workers-deploy` | factory-workers-deploy | Workers Scripts/Routes Write + Account Settings Read + **binding-validation reads** (D1/KV/R2/Queues/Hyperdrive/Vectorize Read). DOs ride on Scripts Write. |
| `cf-token-pages-deploy` | factory-pages-deploy | Pages Write |
| `cf-token-cache-purge` | factory-cache-purge | Cache Purge |
| `cf-token-stream` | factory-stream | Stream Write |
| `cf-token-dns` | factory-dns | DNS Write |
| `cf-token-infra` | factory-infra | Resource **create** writes (D1/KV/R2/Queues/Hyperdrive/Vectorize Write) — provisioning only |
| `cf-token-supervisor-deploy` | factory-supervisor-deploy | Workers Scripts/Routes Write + Account Settings Read + D1 Write + Vectorize Write (supervisor-specific) |

**Nothing is wired yet** — every workflow still uses `secrets.CF_API_TOKEN`. This runbook is the adoption plan.

> Runtime note: a deployed Worker's `env.DB` / `env.KV` / `env.MY_DO` access uses **no API token**. Tokens only matter at deploy/provision time in CI.

## The map — which token each operation needs

It is **per-operation, not per-workflow**; a few workflows do two things and need two tokens (one per step).

| Token | Consumers |
|---|---|
| **supervisor-deploy** | `deploy-supervisor.yml` (deploy step) — *currently on near-admin FACTORY MAIN* |
| **workers-deploy** | `_app-deploy.yml`, `_app-deploy-pnpm.yml`, `deploy-admin-studio`, `deploy-agent-gateway`, `deploy-daily-brief`, `deploy-factory-core-api`, `deploy-factory-cross-repo`, `deploy-factory-events-replay`, `deploy-inbound-oracle`, `deploy-lead-gen`, `deploy-linkedin-publisher`, `deploy-qa-tools-worker`, `deploy-schedule-worker`, `deploy-status-prober`, `deploy-synthetic-monitor`, `deploy-video-cron`, `deploy-webhook-fanout` |
| **pages-deploy** | `_app-deploy-pages.yml`, `deploy-admin-studio-ui`, `deploy-latimerwoods-dev`, `deploy-latwoodtech-web`, `deploy-qa-tools-ui` |
| **dns** | `cf-domain-reconcile.yml`; domain-attach step in `deploy-qa-tools-ui`, `capricast-rename` |
| **infra** | `provision-app-staging`, `_neon-pr-lifecycle`; create-if-absent steps in `deploy-supervisor` (Vectorize), `deploy-qa-tools-ui`, `deploy-qa-tools-worker`, `deploy-latimerwoods-dev` |
| **stream** | `render-video.yml` — ⚠️ reconcile first: a dedicated `CF_STREAM_TOKEN` already exists (policy §2); `cf-token-stream` may be redundant |
| **cache-purge** | ⚠️ no consumer in this monorepo — real purge calls live in **app repos** (e.g. HumanDesign login-cache fix). Provisioned and waiting for downstream adoption. |

Multi-token workflows: `deploy-supervisor` (supervisor-deploy + infra), `deploy-qa-tools-ui` (pages + dns + infra), `deploy-latimerwoods-dev` (pages + infra).

## Wiring pattern (GCP source of truth)

For each step, add a fetch that exports the scoped token, replacing `secrets.CF_API_TOKEN` **for that step only**. Workflows already authenticate to GCP via WIF (`factory-sa`).

```yaml
- name: Fetch scoped CF token
  run: |
    echo "CLOUDFLARE_API_TOKEN=$(gcloud secrets versions access latest \
      --secret=cf-token-workers-deploy --project=factory-495015 | tr -d '\r\n')" >> "$GITHUB_ENV"
```

Provisioning + deploy in the same job use **different** tokens per step (e.g. supervisor: `cf-token-infra` for the Vectorize create-if-absent step, `cf-token-supervisor-deploy` for the deploy step).

## Migration order (lowest risk first)

1. **`deploy-supervisor.yml`** — biggest risk cut (off near-admin), freshly working, isolated. Verify: `curl https://supervisor.latwoodtech.work/health` → 200.
2. **One single-purpose worker deploy** (`deploy-status-prober` or `deploy-synthetic-monitor`) — reference pattern for the other 15. Verify: its `/health`.
3. **`cf-domain-reconcile`** → dns.
4. **Reconcile `stream`** vs existing `CF_STREAM_TOKEN`; wire `render-video` or retire the redundant token.
5. Batch the remaining worker + pages deploys (3–5 per PR), curl-verifying each app's `/health` (or Pages `/`).
6. Wire provisioning steps to `cf-token-infra`.

## Per-step checklist

- [ ] Add the scoped-token fetch step (above) before the operation.
- [ ] Confirm the token's scope covers the operation — a too-narrow token **fails loudly** (by design). If a deploy needs a scope the token lacks, add the group to `token-suite.json` and run `node scripts/cloudflare/manage-tokens.mjs --sync`.
- [ ] Deploy and **curl-verify** with your own eyes (HTTP 200 on `/health`, or the relevant probe). CI green ≠ working.
- [ ] Only then move to the next workflow.

## Managing scope changes

Edit [`scripts/cloudflare/token-suite.json`](../../scripts/cloudflare/token-suite.json), then:
```
node scripts/cloudflare/manage-tokens.mjs --plan    # validate group names (read-only)
node scripts/cloudflare/manage-tokens.mjs --sync    # create missing + reconcile existing policies (keeps values)
```
`--sync` uses `PUT /user/tokens/{id}` (policy only), so token **values are preserved** — consumers and GCP SM are unaffected. Rotation (value roll) is `--rotate`, run monthly by `.github/workflows/cloudflare-token-rotation.yml`.

## Rollback

Each migration is a one-line revert: remove the fetch step / point the env var back at `secrets.CF_API_TOKEN`. The broad tokens remain valid throughout (we are **not** revoking them until every consumer is migrated and verified — see cleanup register in policy §4).

## After migration completes

Once every consumer is on a scoped token and curl-verified, revisit the broad-token cleanup: revoke the duplicate `Edit Cloudflare Workers`, the misnamed `Read all resources`, and strip `API Tokens Write` from all but the one bootstrap (`CF_TOKEN_ADMIN`). Trace each token's `last_used_on` consumer before revoking.
