# Webhook Fanout Go-Live: GitHub → Factory Gate Ingest (P1.6)

This runbook takes the **P1.6** feature from code-complete to live. Two PRs are
merged to `main` but the path is **inert until an operator wires up the secrets
and registers a GitHub webhook**:

- **#1038** `feat(factory-core-api): accept dedicated service key on POST /v1/gates`
  — adds an *optional* service-key auth path on factory-core-api's
  `POST /v1/gates`. The key binding is `WEBHOOK_FANOUT_INGEST_KEY`; it is honoured
  **only** on that route, compared in constant time, and **disabled when unset**.
- **#1039** `feat(webhook-fanout): translate GitHub check_run + reviews to gate ingest`
  — adds `POST /github` to the `webhook-fanout` Worker. It verifies the GitHub
  `X-Hub-Signature-256` HMAC, then POSTs derived gates to factory-core-api
  `/v1/gates` using the service credential.

> Related: Admin Build Plan **P1.6** (this), **P1.3** (#1036 gate ingest endpoint),
> **#1038**, **#1039**. See also [deployment.md](./deployment.md) and
> [github-secrets-and-tokens.md](./github-secrets-and-tokens.md).

## What P1.6 does end-to-end

```
GitHub event (check_run.completed | pull_request_review.submitted)
  → POST https://webhooks.latwoodtech.work/github        (webhook-fanout Worker)
  → verify X-Hub-Signature-256 HMAC against GH_WEBHOOK_SECRET   (reject 401 on mismatch)
  → translate to a gate write:
        check_run            → gate_type "ci",              source_system "github-actions"
        pull_request_review  → gate_type "codeowner-review", source_system "github-review"
  → POST {FACTORY_CORE_API_URL}/v1/gates                  (factory-core-api Worker)
        Authorization: Bearer <FACTORY_CORE_API_INGEST_KEY>
  → factory-core-api compares the bearer against WEBHOOK_FANOUT_INGEST_KEY
        (constant-time; only on /v1/gates) → two-step ingest → factory_gates row
```

Notes on behaviour confirmed in the merged code:

- **Conclusion/state mapping** (events that do *not* map are silently ignored
  with `{ ok: true, ignored: true }`):
  - `check_run`: `success→passed`, `failure|timed_out|action_required→failed`,
    `cancelled|neutral|skipped→skipped`, `stale→expired`. Only fires on
    `action: completed` and only when the run is associated with a PR.
  - `pull_request_review`: `approved→passed`, `changes_requested→failed`,
    `dismissed→skipped`. Only fires on `action: submitted`; `commented` is not a
    gate decision and is ignored.
- **Idempotency** is server-side: factory-core-api dedupes on `source_event_id`
  (the GitHub `X-GitHub-Delivery` ID), so redelivering a webhook is safe.
- The Worker responds to GitHub immediately and POSTs the gate in the
  background (`waitUntil`), so a `200 { ok: true }` from `/github` means the
  signature was valid and a gate was *derived* — it does **not** prove the
  downstream ingest succeeded. Verify by checking for the `factory_gates` row
  (see Verification).

## Prerequisites / blockers

> **⚠️ BLOCKER — `FACTORY_CORE_API_URL` is a placeholder.** Both
> `apps/webhook-fanout/wrangler.jsonc` (`vars`) and the merged code expect
> `FACTORY_CORE_API_URL` to be factory-core-api's **branded custom domain**. The
> config currently carries the placeholder `https://core.latwoodtech.work`,
> but as of this writing factory-core-api **is not deployed to a custom domain**:
> it has no `routes`/`custom_domain` block in its own `wrangler.jsonc`, no entry
> in [`docs/service-registry.yml`](../service-registry.yml), and no deploy
> workflow. `curl https://core.latwoodtech.work/health` returns `000`
> (does not resolve). **Resolve this before go-live:** deploy factory-core-api,
> attach a branded custom domain, add its service-registry entry, then set
> `FACTORY_CORE_API_URL` to that domain (per CLAUDE.md, **never** a `*.workers.dev`
> URL in this user-facing config — use the registry `url` field, never
> `workers_dev_url`).

Other prerequisites:

- `webhook-fanout` is deployed and healthy at `https://webhooks.latwoodtech.work`
  (production env in `apps/webhook-fanout/wrangler.jsonc` routes the worker to
  this custom domain). Verified: `/health` returns `200`.
- factory-core-api's `JWT_SIGNING_KEY` secret is set. The `/v1/gates` handler
  throws if `JWT_SIGNING_KEY` is unset **even when using the service-key path**,
  so it must be present regardless.
- `wrangler` is authenticated for the Factory Cloudflare account (`adrper79`)
  with `CF_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — see
  [github-secrets-and-tokens.md](./github-secrets-and-tokens.md).

## Secret matrix

Set each secret with `wrangler secret put`, run from the relevant app directory
(`apps/webhook-fanout` or `apps/factory-core-api`). Per CLAUDE.md: **never** put
secrets in source or in `wrangler.jsonc` `vars`, and pipe values with
`printf '%s'` (**not** `echo`) to avoid the trailing-newline trap.

| Secret / binding | Worker | Purpose | How to set |
|---|---|---|---|
| `GH_WEBHOOK_SECRET` | `webhook-fanout` | HMAC secret used to verify the GitHub `X-Hub-Signature-256` header on `POST /github`. Must equal the secret entered in the GitHub webhook config. | `printf '%s' "$GH_HMAC" \| npx wrangler secret put GH_WEBHOOK_SECRET --env production` |
| `FACTORY_CORE_API_INGEST_KEY` | `webhook-fanout` | The bearer token webhook-fanout sends to factory-core-api `/v1/gates`. **Must equal** factory-core-api's `WEBHOOK_FANOUT_INGEST_KEY`. | `printf '%s' "$INGEST_KEY" \| npx wrangler secret put FACTORY_CORE_API_INGEST_KEY --env production` |
| `WEBHOOK_FANOUT_INGEST_KEY` | `factory-core-api` | Service credential accepted **only** on `POST /v1/gates`, compared constant-time. Disabled (service-key path off) when unset. **Must equal** webhook-fanout's `FACTORY_CORE_API_INGEST_KEY`. | `printf '%s' "$INGEST_KEY" \| npx wrangler secret put WEBHOOK_FANOUT_INGEST_KEY --env production` |
| `FACTORY_CORE_API_URL` | `webhook-fanout` | **Var (not secret)** — factory-core-api base URL. See the blocker above; set in `wrangler.jsonc` `vars` to the branded custom domain once factory-core-api is deployed. | edit `wrangler.jsonc` `vars`, then redeploy |
| `JWT_SIGNING_KEY` | `factory-core-api` | Pre-existing root HS256 key. Required even on the service-key path (handler throws if unset). Not part of P1.6 wiring but must be present. | already provisioned; see [secret-rotation.md](./secret-rotation.md) |

> The `webhook-fanout` deploy workflow (`.github/workflows/deploy-webhook-fanout.yml`)
> currently sets `STRIPE_WEBHOOK_SECRET`, `POSTHOG_KEY`, and `RESEND_API_KEY` from
> GCP Secret Manager at deploy time. It does **not** yet manage `GH_WEBHOOK_SECRET`
> or `FACTORY_CORE_API_INGEST_KEY` — set those manually with the commands above
> until the workflow is extended (out of scope for this runbook).

### Generate the shared ingest key (set once, on BOTH workers)

`WEBHOOK_FANOUT_INGEST_KEY` (factory-core-api) and `FACTORY_CORE_API_INGEST_KEY`
(webhook-fanout) **MUST hold the same value** — they are the two ends of one
shared credential. Generate it once and set it on both, using `printf '%s'` so no
trailing newline leaks into the comparison (a stray newline would make the
constant-time compare fail and produce a permanent `401`):

```bash
# 1. Generate one value, hold it in a shell var (no trailing newline)
INGEST_KEY="$(openssl rand -hex 32)"

# 2. Set it on factory-core-api (the verifier)
cd apps/factory-core-api
printf '%s' "$INGEST_KEY" | npx wrangler secret put WEBHOOK_FANOUT_INGEST_KEY --env production

# 3. Set the SAME value on webhook-fanout (the caller)
cd ../webhook-fanout
printf '%s' "$INGEST_KEY" | npx wrangler secret put FACTORY_CORE_API_INGEST_KEY --env production

# 4. Clear it from the shell
unset INGEST_KEY
```

### Generate the GitHub HMAC secret

```bash
GH_HMAC="$(openssl rand -hex 32)"

cd apps/webhook-fanout
printf '%s' "$GH_HMAC" | npx wrangler secret put GH_WEBHOOK_SECRET --env production
# Keep $GH_HMAC — you paste the SAME value into the GitHub webhook "Secret" field below.
```

## `FACTORY_CORE_API_URL` config

- It is a **var**, set in `apps/webhook-fanout/wrangler.jsonc` under both the
  top-level `vars` and `env.production.vars` (not a `wrangler secret`).
- It must be factory-core-api's **branded custom domain**, sourced from the
  `url` field in [`docs/service-registry.yml`](../service-registry.yml) once
  factory-core-api has a registry entry. Per CLAUDE.md, **never** a `*.workers.dev`
  URL here (the user-facing config must not expose the CF infrastructure
  fallback).
- Until factory-core-api is deployed with a custom domain and added to the
  registry, treat this as the go-live blocker described above. **Do not invent a
  domain** — confirm the real one from the registry, then update `wrangler.jsonc`
  and redeploy `webhook-fanout`.

## GitHub webhook setup

Register the webhook at the **repository** (or **org**) level:
Settings → Webhooks → **Add webhook**.

| Field | Value |
|---|---|
| **Payload URL** | `https://webhooks.latwoodtech.work/github` |
| **Content type** | `application/json` |
| **Secret** | the exact value of `GH_WEBHOOK_SECRET` (`$GH_HMAC` above) |
| **SSL verification** | Enabled |
| **Which events** | "Let me select individual events" → tick **only** `Check runs` and `Pull request reviews`. Untick everything else (including the default `Pushes`). |
| **Active** | Checked |

Save. GitHub immediately sends a `ping` event; the worker ignores it
(`{ ok: true, ignored: true }`) but the delivery should show a `200` response.

## Verification (curl with your own eyes — per CLAUDE.md)

A fix/feature is "done" only when you have observed the expected HTTP status
yourself. CI green ≠ working.

### 1. webhook-fanout health → 200

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://webhooks.latwoodtech.work/health
# expect: 200
```

(`https://webhook-fanout.adrper79.workers.dev/health` is the CF fallback only —
do not surface it in user-facing config.)

### 2. Signature mismatch is rejected → 401

Send an unsigned (or wrongly-signed) request; it must be refused:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://webhooks.latwoodtech.work/github \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: check_run' \
  -d '{"action":"completed"}'
# expect: 401  (Invalid signature — no valid X-Hub-Signature-256)
```

### 3. End-to-end: redeliver a real webhook → factory_gates row

1. In GitHub → Settings → Webhooks → your webhook → **Recent Deliveries**, pick a
   `check_run` (completed) or `pull_request_review` (submitted) delivery and click
   **Redeliver** (or trigger a fresh CI run / PR review). For the gate to be
   derived, a `check_run` must be `completed` with a mapped conclusion and tied to
   a PR; a review must be `submitted` with `approved` / `changes_requested` /
   `dismissed`.
2. The delivery's **Response** tab should show `200` with body `{ "ok": true }`.
   (`{ "ok": true, "ignored": true }` means the event was valid but didn't map to
   a gate — e.g. a `commented` review or an in-progress check run.)
3. Confirm a row landed in `factory_gates` in the THE_FACTORY Neon database. Match
   on the derived fields, e.g. for a check run:

```sql
SELECT id, gate_type, source_system, source_ref, subject_type,
       subject_repo, subject_ref, state, observed_at
FROM factory_gates
WHERE source_system = 'github-actions'      -- 'github-review' for reviews
ORDER BY observed_at DESC
LIMIT 5;
```

Expect `gate_type = 'ci'` (`'codeowner-review'` for reviews), `subject_type = 'pr'`,
`subject_ref` = the PR number, and `state` mapped from the conclusion/review state.
Because ingest dedupes on `source_event_id` (the GitHub delivery ID), redelivering
the same event does not create a duplicate row.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/github` returns `401 Invalid signature` for a legitimate GitHub delivery | `GH_WEBHOOK_SECRET` on the worker ≠ the **Secret** in the GitHub webhook config, or one was set with a trailing newline (`echo`). | Re-set both to the same value using `printf '%s'`; re-enter the secret in GitHub. |
| Delivery is `200 { ok: true }` but no `factory_gates` row appears | Downstream `/v1/gates` POST failed (it runs in the background). Most often a `401` from factory-core-api. | Check webhook-fanout logs (`wrangler tail` / Logpush). See next rows. |
| factory-core-api `/v1/gates` returns `401` | `FACTORY_CORE_API_INGEST_KEY` (webhook-fanout) ≠ `WEBHOOK_FANOUT_INGEST_KEY` (factory-core-api), one is unset, or one has a trailing newline. Note: when `WEBHOOK_FANOUT_INGEST_KEY` is unset the service-key path is disabled and the bearer is treated as a JWT, which fails. | Regenerate one value and set it on **both** workers with `printf '%s'`. |
| Gate POST fails with a connection / DNS error | `FACTORY_CORE_API_URL` points at an unresolved placeholder (`factory-core-api.latwoodtech.work` returns `000`). | Resolve the go-live blocker: deploy factory-core-api on a real branded domain, add the registry entry, set `FACTORY_CORE_API_URL`, redeploy webhook-fanout. |
| `/v1/gates` returns `500` "JWT_SIGNING_KEY is not configured" | `JWT_SIGNING_KEY` unset on factory-core-api (required even on the service-key path). | Set it — see [secret-rotation.md](./secret-rotation.md). |
| Event delivered but `{ ok: true, ignored: true }` | Event didn't map to a gate: `check_run` not `completed` / not PR-associated / unmapped conclusion, or review was `commented`. | Expected behaviour, not an error. |

## Related runbooks

- [deployment.md](./deployment.md) — staging/prod deploy + smoke-test flow
- [github-secrets-and-tokens.md](./github-secrets-and-tokens.md) — CF token naming + full secret inventory
- [secret-rotation.md](./secret-rotation.md) — rotating `JWT_SIGNING_KEY` and the shared ingest key
