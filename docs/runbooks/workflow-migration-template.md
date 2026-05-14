# Workflow Migration Template: GitHub Secrets → Secret Manager + WIF

## Pattern: Authentication + Secret Retrieval

### Before (GitHub Secrets)
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
      - name: Deploy
        env:
          API_TOKEN: ${{ secrets.MY_API_TOKEN }}
          ANOTHER_SECRET: ${{ secrets.ANOTHER_SECRET }}
        run: npm run deploy
```

### After (WIF + Secret Manager)
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      # Step 1: Authenticate to GCP via OIDC (no JSON key needed)
      - name: Authenticate to Google Cloud (OIDC)
        id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
          service_account_email: ${{ secrets.SERVICE_ACCOUNT_EMAIL }}
      
      # Step 2: Fetch secrets from Secret Manager
      - name: Get secrets from Secret Manager
        id: secrets
        uses: google-github-actions/get-secretmanager-secrets@v2
        with:
          secrets:
            - name: MY_API_TOKEN          # Must match Secret Manager secret name
              id: my_api_token            # Local ID for step output
            - name: ANOTHER_SECRET
              id: another_secret
      
      - uses: actions/setup-node@v6
      
      # Step 3: Use secret outputs from step 2
      - name: Deploy
        env:
          API_TOKEN: ${{ steps.secrets.outputs.my_api_token }}
          ANOTHER_SECRET: ${{ steps.secrets.outputs.another_secret }}
        run: npm run deploy
```

## Migration Checklist per Workflow

For each of the 24 workflows using credentials:

1. **Add WIF Authentication:**
   ```yaml
   - name: Authenticate to Google Cloud (OIDC)
     id: auth
     uses: google-github-actions/auth@v2
     with:
       workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
       service_account_email: ${{ secrets.SERVICE_ACCOUNT_EMAIL }}
   ```

2. **Add Secret Manager Retrieval:**
   ```yaml
   - name: Get secrets from Secret Manager
     id: secrets
     uses: google-github-actions/get-secretmanager-secrets@v2
     with:
       secrets:
         - name: SECRET_NAME_FROM_GCP    # Exact name in GCP
           id: output_id                 # What you reference in env
   ```

3. **Replace all `${{ secrets.X }}` with `${{ steps.secrets.outputs.y }}`**
   - Example: `API_TOKEN: ${{ secrets.GROQ_API_KEY }}` → `API_TOKEN: ${{ steps.secrets.outputs.groq_key }}`

4. **Test the workflow:**
   - Push to a test branch or use `workflow_dispatch` to trigger manually
   - Check job logs for authentication and secret retrieval success
   - Verify the task completed without "secret not found" errors

## Workflows Updated (DONE ✅)

- [x] `supervisor-loop.yml` — Supervisor core orchestration
- [x] `deploy-supervisor.yml` — Supervisor Worker deployment

## Workflows Pending Migration

- [ ] `deploy-schedule-worker.yml` — Schedule Worker deployment
- [ ] `deploy-synthetic-monitor.yml` — Synthetic monitor
- [ ] `deploy-admin-studio.yml` — Admin Studio backend
- [ ] `deploy-admin-studio-ui.yml` — Admin Studio UI
- [ ] `set-jwt-secrets.yml` — JWT secret configuration
- [ ] `setup-app-secrets.yml` — App-level secrets setup
- [ ] `refresh-vertex-token.yml` — Vertex AI token refresh
- [ ] `run-migrations.yml` — Database migrations
- [ ] `run-app-migrations.yml` — App-specific migrations
- [ ] `_app-deploy.yml` — Reusable app deploy template
- [ ] `_app-deploy-pnpm.yml` — Reusable pnpm app deploy
- [ ] `_app-prod-canary.yml` — Production canary deploy
- [ ] `_migration-drift-guard.yml` — Migration drift guard
- [ ] `_app-reliability-gate.yml` — Reliability gate
- [ ] `auto-triage.yml` — Auto-triage workflow
- [ ] `capricast-rename.yml` — Capricast rename workflow
- [ ] `copilot-auto-approve.yml` — Copilot auto-approve
- [ ] `deploy-video-cron.yml` — Video cron deployment
- [ ] `push-google-oauth.yml` — Google OAuth push
- [ ] `mirror-org-secrets-to-dependabot.yml` — Dependabot mirror
- [ ] `pr-review.yml` — PR review workflow
- [ ] And others using `${{ secrets.* }}`

## Batch Migration Script

To migrate multiple workflows at once (requires manual secret value population first):

```bash
#!/bin/bash
WORKFLOWS=(
  "deploy-schedule-worker.yml"
  "deploy-synthetic-monitor.yml"
  "set-jwt-secrets.yml"
  "refresh-vertex-token.yml"
)

for WF in "${WORKFLOWS[@]}"; do
  echo "Reviewing workflow: .github/workflows/$WF"
  grep -n 'secrets\.' ".github/workflows/$WF" | head -5
done
```

## Rollback Plan

If a migrated workflow fails:

1. **Check job logs for error:**
   ```
   Error: secret not found
   Error: authentication failed
   ```

2. **Verify Secret Manager has the secret:**
   ```bash
   gcloud secrets describe SECRET_NAME --project=factory-495015
   ```

3. **Check supervisor-sa has access:**
   ```bash
   gcloud secrets get-iam-policy SECRET_NAME \
     --project=factory-495015 \
     --format="value(bindings[0].members[])"
   ```

4. **Temporarily revert to GitHub Secrets:**
   - Change `${{ steps.secrets.outputs.key }}` back to `${{ secrets.KEY }}`
   - Commit and test
   - Fix root cause (missing secret, IAM issue, etc.)

## Verification

After updating a workflow:

1. **Syntax check:**
   ```bash
   yamllint .github/workflows/workflow-name.yml
   ```

2. **Run workflow manually:**
   - Use `workflow_dispatch` trigger if available
   - Check logs for "Authenticate to Google Cloud" success
   - Check logs for "Get secrets from Secret Manager" success
   - Verify task completed

3. **Monitor for errors:**
   - Watch for "secret not found" errors
   - Watch for "permission denied" errors on Secret Manager
   - Check Sentry for related errors
