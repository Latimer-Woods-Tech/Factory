# Secret Manager Migration Checklist

**Status:** Workload Identity Federation + Secret Manager infrastructure complete.  
**Next:** Populate secret values, update workflows, delete JSON key.

## 51 Secrets Created in GCP Secret Manager

### Infrastructure Secrets (KNOWN VALUES)
- ✅ `SERVICE_ACCOUNT_EMAIL`: `supervisor-sa@factory-495015.iam.gserviceaccount.com`
- ✅ `WORKLOAD_IDENTITY_PROVIDER`: `projects/891842778224/locations/global/workloadIdentityPools/github-factory/providers/github`

### Credential Secrets (NEED VALUES FROM GITHUB)
User must retrieve each value from GitHub Secrets and populate:

**Database / Connection:**
- [ ] `DATABASE_URL` — Neon connection string
- [ ] `FACTORY_CORE_DATABASE_URL` — Factory core DB
- [ ] `SELFPRIME_CONNECTION_STRING`
- [ ] `THECALLING_CONNECTION_STRING`
- [ ] `WORDISBOND_CONNECTION_STRING`
- [ ] `CYPHEROFHEALING_CONNECTION_STRING`
- [ ] `KAIROSCOUNCIL_CONNECTION_STRING`
- [ ] `MEXXICO_CITY_CONNECTION_STRING`
- [ ] `NICHESTREAM_CONNECTION_STRING`
- [ ] `XPELEVATOR_CONNECTION_STRING`

**Cloudflare:**
- [ ] `CF_ACCOUNT_ID` — Cloudflare account ID
- [ ] `CF_API_TOKEN` — Cloudflare API token
- [ ] `HYPERDRIVE_CYPHER_HEALING`
- [ ] `HYPERDRIVE_FACTORY_CORE`
- [ ] `HYPERDRIVE_IJUSTUS`
- [ ] `HYPERDRIVE_NEIGHBOR_AID`
- [ ] `HYPERDRIVE_PRIME_SELF`
- [ ] `HYPERDRIVE_THE_CALLING`
- [ ] `HYPERDRIVE_WORDIS_BOND`
- [ ] `HYPERDRIVE_XICO_CITY`
- [ ] `RATE_LIMITER_CYPHER_HEALING`
- [ ] `RATE_LIMITER_IJUSTUS`
- [ ] `RATE_LIMITER_NEIGHBOR_AID`
- [ ] `RATE_LIMITER_PRIME_SELF`
- [ ] `RATE_LIMITER_THE_CALLING`
- [ ] `RATE_LIMITER_WORDIS_BOND`

> **Note — Cloudflare Analytics Engine dataset:** Investigated May 13 2026. No repo binding or API resource found.
> Concluded: this item is stale and was likely confused with the `flag-meter` D1 database. No secret needed.

**APIs & Keys:**
- [ ] `ANTHROPIC_API_KEY` (if used)
- [ ] `GROQ_API_KEY`
- [ ] `VERTEX_ACCESS_TOKEN`
- [ ] `VERTEX_SA_KEY`
- [ ] `FACTORY_SENTRY_API`
- [ ] `KAIROSCOUNCIL_SENTRY_API`
- [ ] `KAIROSCOUNCIL_SENTRY_DSN`
- [ ] `NPM_TOKEN`
- [ ] `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`

**GitHub App:**
- [ ] `FACTORY_APP_CLIENT_ID`
- [ ] `FACTORY_APP_ID`
- [ ] `FACTORY_APP_INSTALLATION_ID`
- [ ] `FACTORY_APP_PRIVATE_KEY`
- [ ] `SUPERVISOR_JWT_SECRET`
- [ ] `JWT_SECRET`

**URLs & IDs:**
- [x] `ADMIN_STUDIO_PROD_URL` — `https://admin.latwoodtech.work` (also routes `https://api.apunlimited.com/*` → admin-studio-production)
- [x] `ADMIN_STUDIO_STAGING_URL` — `https://admin-staging.latwoodtech.work` (also routes `https://api-staging.apunlimited.com/*` → admin-studio-staging)
- [x] `FLAG_METER_DATABASE_ID` — `f03af37d-11d9-4428-b0db-b3cdca8fe7c4` (Cloudflare D1 DB: flag-meter)
- [x] `PRIME_SELF_LOGO_URL` — `https://selfprime.net/icons/icon-72.png` (canonical; also live: /icons/icon.svg, /og-image-v2.png)
- [x] `SCHEDULE_WORKER_URL` — `https://schedule.latwoodtech.work`
- [ ] `WORKER_API_TOKEN`

**Slack Webhooks:**
- [ ] `SLACK_WEBHOOK_DELIVERY_KPIS`
- [ ] `SLACK_WEBHOOK_OPS`
- [ ] `SLACK_WEBHOOK_REVENUE`

## Migration Steps

### 1. Populate Secret Values

For each credential secret, get value from GitHub and add to Secret Manager:

```bash
# Get value from GitHub (interactive prompt for secret value)
read -p "Enter value for SECRET_NAME: " SECRET_VALUE

# Add to Secret Manager
echo -n "$SECRET_VALUE" | gcloud secrets versions add SECRET_NAME \
  --project="factory-495015" \
  --data-file=-
```

**Automated batch (if you can export secrets from GitHub):**

```bash
# Create a file secrets.env with all values:
# SECRET_NAME=value
# SECRET_NAME2=value2

while IFS='=' read -r key value; do
  echo -n "$value" | gcloud secrets versions add "$key" \
    --project="factory-495015" \
    --data-file=- \
    --quiet 2>/dev/null || echo "✗ $key"
done < secrets.env
```

### 2. Update Workflows to Use Secret Manager

Replace GitHub Secrets with Secret Manager in workflows:

**Old (GitHub Secrets):**
```yaml
- uses: google-github-actions/auth@v2
  with:
    credentials_json: ${{ secrets.VERTEX_SA_KEY }}
```

**New (Secret Manager via WIF):**
```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
    service_account_email: ${{ secrets.SERVICE_ACCOUNT_EMAIL }}

- name: Get secrets from Secret Manager
  id: secrets
  uses: google-github-actions/get-secretmanager-secrets@v2
  with:
    secrets:
      - name: VERTEX_SA_KEY
        id: vertex_key
      - name: CF_API_TOKEN
        id: cf_token

- run: |
    export VERTEX_SA_KEY="${{ steps.secrets.outputs.vertex_key }}"
    export CF_API_TOKEN="${{ steps.secrets.outputs.cf_token }}"
    # ... rest of workflow
```

### 3. Delete the JSON Key

Once all workflows are updated and verified working:

```bash
# List keys for supervisor-sa
gcloud iam service-accounts keys list \
  --iam-account="supervisor-sa@factory-495015.iam.gserviceaccount.com" \
  --project="factory-495015"

# Delete the USER_MANAGED key (d6aaba897fc1c7ab69b762dce5ca4040ae22b3cc)
gcloud iam service-accounts keys delete d6aaba897fc1c7ab69b762dce5ca4040ae22b3cc \
  --iam-account="supervisor-sa@factory-495015.iam.gserviceaccount.com" \
  --project="factory-495015"
```

## Verification

After migration completes:

```bash
# Verify all 51 secrets are in Secret Manager
gcloud secrets list --project="factory-495015" --format="table(name,created)"

# Verify supervisor-sa has access
gcloud secrets get-iam-policy VERTEX_SA_KEY \
  --project="factory-495015" \
  --format="value(bindings[0].members[])"
  # Should show: serviceAccount:supervisor-sa@factory-495015.iam.gserviceaccount.com

# Verify JSON key is deleted
gcloud iam service-accounts keys list \
  --iam-account="supervisor-sa@factory-495015.iam.gserviceaccount.com" \
  --project="factory-495015"
  # Should show only SYSTEM_MANAGED key
```

## Rollback

If workflows fail after migration:

1. Temporarily re-add the JSON key: `gcloud iam service-accounts keys create ~/supervisor-sa-key.json --iam-account="supervisor-sa@factory-495015.iam.gserviceaccount.com" --project="factory-495015"`
2. Upload to GitHub Secrets as `SUPERVISOR_SA_KEY`
3. Update workflows to use the JSON key: `credentials_json: ${{ secrets.SUPERVISOR_SA_KEY }}`
4. Fix Secret Manager integration issues
5. Re-delete the JSON key once stable
