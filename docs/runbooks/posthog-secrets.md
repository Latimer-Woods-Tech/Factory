# PostHog secrets provisioning (Stage 2 revenue digest)

The revenue digest workflow (`.github/workflows/revenue-digest.yml`, shipped in PR #727) needs three new secrets in GCP Secret Manager so the funnel-conversion line resolves. Until they exist the workflow runs but the PostHog provider is skipped with `skip_reason: missing POSTHOG_API_KEY/PROJECT_ID/FUNNEL_ID`.

## Prerequisites

- PostHog account access (org-level; current owner of `latwoodtech.posthog.com` or whichever cloud project is canonical)
- `gcloud` authenticated against `factory-495015` with `roles/secretmanager.admin`
- The funnel definition itself must exist in PostHog first (issue #657 G34 is in flight — supervisor is creating canonical funnels for HumanDesign + xico-city)

## Step 1 — Create a PostHog personal API key

1. PostHog UI → Settings → Personal API Keys → "Create personal API key"
2. Scope: `insight:read` + `funnel:read` (minimum needed by `revenue_digest.collect_posthog_funnel`)
3. Copy the `phx_…` value

## Step 2 — Get the project ID

PostHog UI → Settings → Project Details → "Project ID" (numeric, e.g. `12345`)

## Step 3 — Get the funnel ID

After #657 lands its canonical funnels:
1. Open the primary monetization funnel
2. Copy the numeric ID from the URL (`…/insights/{ID}` or `…/funnels/{ID}`)

## Step 4 — Write the three secrets

Run from a shell authenticated to `factory-495015`. Use here-strings (no trailing newline / BOM — Stage 1 lesson, see `scripts/fetch_gcp_secrets.sh`).

```bash
# API key (treat as bearer credential)
printf 'phx_REDACTED' | gcloud secrets create posthog-api-key \
  --project=factory-495015 \
  --replication-policy=automatic \
  --data-file=-

# Project ID (numeric)
printf '12345' | gcloud secrets create posthog-project-id \
  --project=factory-495015 \
  --replication-policy=automatic \
  --data-file=-

# Funnel ID (numeric)
printf '67890' | gcloud secrets create posthog-funnel-id \
  --project=factory-495015 \
  --replication-policy=automatic \
  --data-file=-

# Grant the supervisor SA read access
for s in posthog-api-key posthog-project-id posthog-funnel-id; do
  gcloud secrets add-iam-policy-binding "$s" \
    --project=factory-495015 \
    --member="serviceAccount:supervisor-sa@factory-495015.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

## Step 5 — Verify

Trigger the workflow manually:

```bash
gh workflow run revenue-digest.yml
```

Then check the `posthog_funnel` provider line in the resulting `docs/revenue/<DATE>.json`. If `skipped: true` with `skip_reason: missing POSTHOG_*`, the GCP fetch didn't pick the secret up — verify naming against `fetch_to_env` candidates in `.github/workflows/revenue-digest.yml`.

## Rotation

PostHog personal API keys don't expire. Rotate annually or on personnel change:

```bash
printf 'phx_NEW' | gcloud secrets versions add posthog-api-key \
  --project=factory-495015 \
  --data-file=-
# After verifying the workflow with the new version:
gcloud secrets versions destroy <OLD_VERSION> --secret=posthog-api-key --project=factory-495015
```

## Related

- PR #727 — revenue digest implementation (`scripts/revenue_digest.py`)
- Issue #657 — PostHog funnel definitions (G34, in flight)
- `scripts/fetch_gcp_secrets.sh` — first-match-wins helper used by the workflow
