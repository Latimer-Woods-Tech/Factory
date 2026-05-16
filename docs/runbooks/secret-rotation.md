# Secret Rotation Runbook

This runbook covers rotating secrets for a Factory app Worker without downtime.

## Principles

- Rotate one secret at a time.
- Deploy the new secret **before** revoking the old one (allows overlap).
- Wrangler secrets are encrypted at rest; rotation is atomic per-secret.

## Wrangler secret commands

```bash
# Add or update a secret
wrangler secret put SECRET_NAME --name {app}

# Delete a secret
wrangler secret delete SECRET_NAME --name {app}

# List current secrets (names only — values are never shown)
wrangler secret list --name {app}
```

## Rotation procedures by secret

### `JWT_SECRET`

JWTs already issued will be invalidated immediately. Schedule during low-traffic.

```bash
# 1. Generate a new secret (min 32 bytes, base64url)
NEW=$(openssl rand -base64 32)

# 2. Set the new secret on the Worker
echo $NEW | wrangler secret put JWT_SECRET --name {app}

# 3. Deploy (Worker picks up the new secret on next request)
wrangler deploy --env production

# 4. Inform users of forced re-login if required
```

### `DATABASE_URL` / `HYPERDRIVE_*`

Neon connection string rotation involves the Neon console.

```bash
# 1. Log in to Neon dashboard → Project → Connection string → Reset password
# 2. Copy new connection string

# 3. Update Hyperdrive binding
wrangler hyperdrive update <HYPERDRIVE_ID> --origin-url "$NEW_CONN_STR"

# 4. Update secret
echo "$NEW_CONN_STR" | wrangler secret put DATABASE_URL --name {app}

# 5. Verify Worker still connects
curl https://{app}.thefactory.dev/health
```

### `STRIPE_SECRET_KEY`

```bash
# 1. Create a new Restricted Key in Stripe Dashboard
# 2. Set on Worker
echo "sk_live_..." | wrangler secret put STRIPE_SECRET_KEY --name {app}

# 3. Deploy
wrangler deploy --env production

# 4. Verify webhook endpoint works, then revoke old key in Stripe
```

### `STRIPE_WEBHOOK_SECRET`

```bash
# 1. In Stripe Dashboard → Webhooks → endpoint → Reveal signing secret (rotate)
# 2. Stripe generates a new whsec_ value

# 3. Set on Worker
echo "whsec_..." | wrangler secret put STRIPE_WEBHOOK_SECRET --name {app}

# 4. Deploy (old signature checks will fail during the ~1s deploy window — acceptable)
wrangler deploy --env production
```

### `ANTHROPIC_API_KEY` / `GROK_API_KEY` / `GROQ_API_KEY`

```bash
# 1. Create new API key in provider dashboard
# 2. Set on Worker
echo "sk-ant-..." | wrangler secret put ANTHROPIC_API_KEY --name {app}
wrangler deploy --env production

# 3. Verify LLM calls succeed, then revoke old key in provider dashboard
```

### `SENTRY_DSN`

Sentry DSNs are not sensitive (they're public endpoints). Rotation is only needed if the Sentry project is being deprecated.

```bash
# Create new Sentry project → copy DSN
echo "https://...@sentry.io/..." | wrangler secret put SENTRY_DSN --name {app}
wrangler deploy --env production
```

## GitHub Actions secrets

GitHub Actions secrets (used during CI/CD) are separate from Worker runtime secrets.

```bash
# Update via GitHub CLI
gh secret set CLOUDFLARE_API_TOKEN --repo Latimer-Woods-Tech/{app} --body "..."
gh secret set GH_PAT --repo Latimer-Woods-Tech/{app} --body "..."
```

Or via GitHub web: **Repo → Settings → Secrets and variables → Actions**.

### `NPM_TOKEN` (deprecated after Trusted Publishers migration)

Factory package publishing uses npm Trusted Publishers (GitHub Actions OIDC), so `NPM_TOKEN` is no longer required for publish workflows.

Before revoking the legacy npm token, validate OIDC publish works:

- Trigger publish workflow once and confirm logs show npm publishing via GitHub Actions OIDC trusted publisher.
- Confirm the published package version has GitHub provenance in npmjs.com package details.

After OIDC validation, revoke the legacy npm token:

1. npmjs.com → **Access Tokens** → revoke the old automation token.
2. Remove `NPM_TOKEN` from GitHub Actions secrets in this repo (and app repos using OIDC publish).

## Post-rotation verification checklist

- [ ] Worker `/health` returns 200
- [ ] Auth endpoints issue and verify tokens correctly
- [ ] DB-backed endpoints return data
- [ ] Stripe webhook test event returns 200
- [ ] No new Sentry errors in the 15 minutes following rotation
