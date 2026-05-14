# Email Aliases Setup — latwoodtech.com

**Status:** In Progress  
**Owner:** aperry@latwoodtech.com  
**Created:** 2026-05-13  
**Purpose:** Configure Google Workspace email aliases for Factory operations

## Prerequisites
- Admin access to admin.google.com for latwoodtech.com domain
- Access to aperry@latwoodtech.com inbox (primary routing destination)

## Email Aliases to Configure

### Tier 1: Critical (Setup Immediately)

#### 1. noreply@latwoodtech.com
**Route to:** aperry@latwoodtech.com  
**Purpose:** Transactional emails (auth, notifications, system messages)  
**Usage:**
- Auth flows: welcome, password reset, email verification
- System notifications
- Factory Core packages/email templates

**Setup Steps:**
1. Go to admin.google.com
2. Navigate to **Directory** → **Users**
3. Click on **aperry@latwoodtech.com**
4. Click **User information** → **Email aliases**
5. Click **Add alternate email**
6. Enter: `noreply`
7. Verify: noreply@latwoodtech.com appears in alias list

#### 2. support@latwoodtech.com
**Route to:** aperry@latwoodtech.com  
**Purpose:** Customer support and incident response  
**Usage:**
- Customer inquiries
- Incident communications (INCIDENT.md)
- General support channel

**Setup Steps:**
1. Go to admin.google.com
2. Navigate to **Directory** → **Users**
3. Click on **aperry@latwoodtech.com**
4. Click **User information** → **Email aliases**
5. Click **Add alternate email**
6. Enter: `support`
7. Verify: support@latwoodtech.com appears in alias list

#### 3. security@latimer-woods-tech.com
**Route to:** aperry@latwoodtech.com  
**Purpose:** Security vulnerability disclosure program  
**Usage:**
- Security researcher contact (SECURITY.md)
- Vulnerability reports
- Security incident notifications

**Note:** This is on latimer-woods-tech.com domain, not latwoodtech.com. Verify domain access first.

**Setup Steps:**
1. Go to admin.google.com
2. Switch to latimer-woods-tech.com domain
3. Navigate to **Directory** → **Users**
4. Click on appropriate user
5. Add alias: `security`
6. Verify: security@latimer-woods-tech.com appears

### Tier 2: Operational (Setup Within 30 Days)

#### 4. digest@latwoodtech.com
**Route to:** aperry@latwoodtech.com  
**Purpose:** Daily Brief and periodic digest emails  
**Usage:**
- Admin Studio digest feature
- Daily Brief app sending address
- Replaces digest@thefactory.dev

**Setup Steps:**
1. Follow standard alias setup (steps 1-7 from above)
2. Enter: `digest`

#### 5. billing@latwoodtech.com
**Route to:** aperry@latwoodtech.com  
**Purpose:** Billing and payment notifications  
**Usage:**
- Stripe subscription emails
- Payment confirmations
- Billing communications

**Setup Steps:**
1. Follow standard alias setup
2. Enter: `billing`

#### 6. admin@latwoodtech.com
**Route to:** aperry@latwoodtech.com  
**Purpose:** Internal operations and system alerts  
**Usage:**
- System administration
- Internal notifications
- Operational alerts

**Setup Steps:**
1. Follow standard alias setup
2. Enter: `admin`

## Verification Checklist

After setup, verify each alias:

```bash
# Test 1: Send test email to each alias
echo "Test" | mail -s "Alias Test" noreply@latwoodtech.com
echo "Test" | mail -s "Alias Test" support@latwoodtech.com
echo "Test" | mail -s "Alias Test" digest@latwoodtech.com
echo "Test" | mail -s "Alias Test" billing@latwoodtech.com
echo "Test" | mail -s "Alias Test" admin@latwoodtech.com

# Test 2: Check aperry@latwoodtech.com inbox
# All 5 test emails should arrive

# Test 3: Reply from each alias
# In Gmail, click "From" dropdown and verify all aliases appear
```

## Post-Setup: Code Migration

After aliases are configured, update codebase references:

### Files to Update:
1. `apps/admin-studio/src/digest/send.ts` — Change `digest@thefactory.dev` to `digest@latwoodtech.com`
2. `packages/email/src/index.ts` — Change default `noreply@thefactory.dev` to `noreply@latwoodtech.com`
3. Documentation files referencing @thefactory.dev

### Migration Script:
Run: `node scripts/migrate-email-domain.mjs` (see below)

## Monitoring

After migration:
1. Monitor aperry@latwoodtech.com for bounces
2. Check Resend dashboard for delivery rates
3. Verify no emails still using @thefactory.dev

## Rollback Procedure

If issues occur:
1. Keep aliases active (no cost to maintain)
2. Revert code changes: `git revert <commit-hash>`
3. Redeploy affected apps
4. Monitor for 24 hours
5. Re-attempt migration after root cause analysis

## Notes

- All aliases route to aperry@latwoodtech.com (single destination)
- No additional cost (included in Google Workspace subscription)
- Limit: 30 aliases per user (currently using 6/30)
- Aliases can be used for sending (will appear in Gmail "From" dropdown)

## Status Tracking

- [ ] Tier 1: noreply@latwoodtech.com configured
- [ ] Tier 1: support@latwoodtech.com configured
- [ ] Tier 1: security@latimer-woods-tech.com configured
- [ ] Tier 2: digest@latwoodtech.com configured
- [ ] Tier 2: billing@latwoodtech.com configured
- [ ] Tier 2: admin@latwoodtech.com configured
- [ ] Code migration completed
- [ ] Verification tests passed
- [ ] Old @thefactory.dev addresses deprecated
