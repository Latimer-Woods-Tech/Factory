# factory-core-api

Read-layer ingestion + auth API for the Factory control plane. This is the
Phase A walking skeleton from the [Admin Build Plan](../../docs/architecture/ADMIN_BUILD_PLAN.md)
(PR **P1.1**).

## Routes (this PR)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Liveness probe — returns `200` with the service name. |
| `GET` | `/version` | none | Reports the deployed commit SHA (`BUILD_SHA`). |
| `POST` | `/v1/auth/token` | GitHub OIDC (Bearer) | Exchanges a workflow's OIDC token for a short-lived scoped JWT. |

Ingestion endpoints (`/v1/gates`, `/v1/artifacts`, `/v1/audit`,
`/v1/runs/mirror`) and their Neon schemas arrive in P1.2+.

## Auth model

Per [tech guide §1.5](../../docs/architecture/ADMIN_TECHNICAL_GUIDE.md): trusted
workflow runs authenticate to GitHub OIDC, then exchange that token here for a
JWT scoped to a single ingestion topic via its `aud` claim. The exchange:

1. Caller sends its GitHub OIDC token as `Authorization: Bearer <oidc>`.
2. Body declares the requested scope: `{ "audience": "gates-ci" }`.
3. The endpoint verifies the OIDC token against the issuer's JWKS and checks
   `iss`, `aud`, `exp`/`nbf`, and `repository_owner`.
4. On success it returns a 10-minute HS256 JWT signed with `JWT_SIGNING_KEY`,
   carrying the requested `aud` and the source repository claims.

Allowed scopes match `gates-*`, `artifacts-*`, `audit-*`, `runs-*`.

```bash
curl -sS -X POST https://<host>/v1/auth/token \
  -H "Authorization: Bearer $ACTIONS_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"audience":"gates-ci"}'
```

## Configuration

**Vars** (`wrangler.jsonc`): `ENVIRONMENT`, `OIDC_ISSUER`, `OIDC_AUDIENCE`,
`GITHUB_OWNER`. `BUILD_SHA` is injected by the deploy workflow.

**Secrets** (`wrangler secret put`):

- `JWT_SIGNING_KEY` — root HS256 signing key for minted scoped JWTs (rotated
  quarterly per tech guide §1.5.2).
- `WEBHOOK_FANOUT_INGEST_KEY` *(optional)* — dedicated service credential for
  the webhook-fanout worker. Accepted only on `POST /v1/gates` (so it is
  implicitly scoped to gate ingestion and cannot reach any other topic). Sent
  as `Authorization: Bearer <key>`; compared in constant time. Unset disables
  the service-key path, leaving scoped-JWT auth as the only accepted method.
- `SENTRY_DSN` *(optional)* — error reporting via `@latimer-woods-tech/monitoring`.

## Develop

```bash
npm install
npm run typecheck
npm test          # vitest + coverage
npm run dev       # wrangler dev
```
