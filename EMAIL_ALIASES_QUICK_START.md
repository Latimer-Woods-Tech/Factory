# Email Aliases — Quick Setup Guide

**Last Updated:** 2026-05-13  
**Google Workspace Domain:** latwoodtech.com  
**Admin Console:** https://admin.google.com

## Immediate Actions Required

### Step 1: Configure Google Workspace Aliases (5 minutes)

Go to admin.google.com → Directory → Users → aperry@latwoodtech.com → Email aliases

**Add these 6 aliases:**
1. `noreply` → noreply@latwoodtech.com
2. `support` → support@latwoodtech.com
3. `digest` → digest@latwoodtech.com
4. `billing` → billing@latwoodtech.com
5. `admin` → admin@latwoodtech.com
6. `security` (on latimer-woods-tech.com domain if available)

All aliases route to: **aperry@latwoodtech.com**

### Step 2: Verify Alias Configuration

Send test emails:
```bash
echo "Test 1" | mail -s "Alias Check: noreply" noreply@latwoodtech.com
echo "Test 2" | mail -s "Alias Check: support" support@latwoodtech.com
echo "Test 3" | mail -s "Alias Check: digest" digest@latwoodtech.com
echo "Test 4" | mail -s "Alias Check: billing" billing@latwoodtech.com
echo "Test 5" | mail -s "Alias Check: admin" admin@latwoodtech.com
```

Check that all 5 arrive at aperry@latwoodtech.com inbox.

### Step 3: Code Migration (Already Complete ✅)

The following code changes have been applied:

**Files Updated:**
- ✅ `apps/admin-studio/src/digest/send.ts`
  - Changed: `digest@thefactory.dev` → `digest@latwoodtech.com`
  
- ✅ `packages/email/src/index.ts`
  - Updated documentation examples to use `@latwoodtech.com`

**Next: Commit and deploy these changes**

### Step 4: Deploy Updates

```bash
# Review changes
git diff

# Commit
git add -A
git commit -m "fix(email): migrate from @thefactory.dev to @latwoodtech.com"

# Push
git push origin fix/admin-studio-staging-tests-dispatch-clean

# Deploy admin-studio to staging
cd apps/admin-studio
npm run deploy:staging

# Verify digest email sends correctly
curl https://admin-studio-staging.adrper79.workers.dev/digest
```

## Email Address Registry

| Alias | Routes To | Purpose | Status |
|-------|-----------|---------|--------|
| aperry@latwoodtech.com | Primary | Operations, main inbox | ✅ Active |
| noreply@latwoodtech.com | aperry@ | Auth flows, system notifications | ⏳ Setup pending |
| support@latwoodtech.com | aperry@ | Customer support | ⏳ Setup pending |
| digest@latwoodtech.com | aperry@ | Daily Brief, periodic digests | ⏳ Setup pending |
| billing@latwoodtech.com | aperry@ | Stripe, payment notifications | ⏳ Setup pending |
| admin@latwoodtech.com | aperry@ | Internal operations | ⏳ Setup pending |
| security@latimer-woods-tech.com | aperry@ | Vulnerability disclosure | ⏳ Verify status |

## Configuration Details

**Current Usage:**
- `aperry@latwoodtech.com` in:
  - Daily Brief recipient (apps/daily-brief/wrangler.jsonc)
  - Weather API User-Agent (apps/daily-brief/src/sections/weather.ts)
  - Incident response contact (docs/runbooks/INCIDENT.md)

**Code Migration:**
- `digest@thefactory.dev` → `digest@latwoodtech.com` (admin-studio)
- `noreply@thefactory.dev` → `noreply@latwoodtech.com` (packages/email docs)

**No Changes Needed:**
- `security@latimer-woods-tech.com` already correct (SECURITY.md)

## Sending Email From Aliases

After setup, in Gmail:
1. Compose new email
2. Click "From" dropdown
3. Select any of your aliases
4. Send email (will use selected alias as sender)

## Monitoring

After deployment:
1. Check Resend dashboard: https://resend.com/emails
2. Monitor aperry@latwoodtech.com for bounces
3. Verify next digest email sends from `digest@latwoodtech.com`

## Rollback (If Needed)

```bash
git revert HEAD
git push origin fix/admin-studio-staging-tests-dispatch-clean
npm run deploy:staging
```

Google Workspace aliases remain active (no cost, no harm).

## Support

- Google Workspace Admin: https://admin.google.com
- Resend Dashboard: https://resend.com
- Full Documentation: docs/runbooks/email-aliases-setup.md
