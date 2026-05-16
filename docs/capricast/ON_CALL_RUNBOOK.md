# VideoKing On-Call Incident Response Runbook

**Scope:** P1/P2 alert response for VideoKing  
**Audience:** On-call engineers  
**Last Updated:** April 28, 2026

---

## Alert Escalation Matrix

### P1 Alerts (Page On-Call Immediately)

| Alert | Condition | Response SLA | Escalation |
|-------|-----------|--------|-------------|
| **Tier 1 Availability Critical** | Availability < 99.5% (5-min window) | 5 min to triage | Page backup on-call after 10 min |
| **Tier 1 Error Rate Spike** | Error rate > 1.0% (5-min window) | 5 min to triage | Page backup on-call after 10 min |
| **Tier 1 Latency Spike** | p95 > 1000ms (5 min consecutive) | 5 min to triage | Page backup on-call after 10 min |
| **Payout API Down** | 3 consecutive request failures | 5 min to respond | Page ops lead immediately |
| **Database Connection Pool Exhausted** | Pool util > 95% (10 min) | 5 min to triage | Page DBA/backend lead immediately |

### P2 Alerts (Slack #ops)

| Alert | Condition | Response SLA | Action |
|-------|-----------|--------|--------|
| **Tier 1 Availability Warning** | Availability < 99.8% (15-min window) | 30 min to acknowledge | Post to #ops; determine if P1 escalation needed |
| **Tier 2 Availability Warning** | Availability < 99.3% (15-min window) | 30 min to acknowledge | Post to #ops; monitor |
| **Stripe Webhook Failures** | Success rate < 99.5% | 30 min to acknowledge | Post to #ops; check DLQ backlog |

---

## Incident Response Workflow

### Phase 1: Alert & Notification (0–2 min)

**Trigger:** PagerDuty/Sentry fires P1 alert

**On-Call Actions:**
1. Acknowledge alert in PagerDuty (or it escalates)
2. Open Sentry/Cloudflare dashboard in second window
3. Check #ops Slack channel for context
4. Time-box: **5 minutes to determine if real incident or false positive**

**False Positive Examples:**
- Single request timeout (retry succeeds)
- Error spike caused by known client issue (not our problem)
- Expected downtime (already scheduled in calendar)

**Real Incident Examples:**
- Multiple requests failing for same endpoint
- Error spike correlates with recent deployment
- Latency consistently >500ms across endpoints

---

### Phase 2: Triage & Root Cause (2–10 min)

**Decision Tree:**

```
Is it a real incident?
├─ YES → Go to "Determine Scope"
└─ NO → Close alert; document in incident log; move on

Determine Scope:
├─ Public API affected? → P1 (viewers impacted)
├─ Creator API affected? → P1 (revenue-impacting)
├─ Admin API affected? → P2 (operator friction; has workarounds)
└─ Analytics affected? → P3 (no user-facing impact)

Determine Root Cause (check in order):
1. Recent deployment? (check git log -1)
   → YES: Pin recent changes; prepare rollback
   
2. External service down? (Stripe, Cloudflare, Neon)
   → YES: Wait for external service recovery; monitor our error handling
   
3. Database issue? (connection pool, locks, slow query)
   → YES: Run diagnostic query; check active connections
   
4. Worker code issue? (unhandled exception, infinite loop)
   → YES: Check Sentry error details; identify pattern
   
5. Infrastructure saturation? (CPU, memory, bandwidth)
   → YES: Check Cloudflare metrics; scaling needed
   
6. Unknown
   → YES: Gather metrics; escalate to backup on-call after 10 min
```

**On-Call Actions During Triage:**

1. **Open Sentry dashboard** → look for error pattern
   - Filter by recent timestamp
   - Group by error type / endpoint
   - Check stack trace for root cause
   - Note: First 10 seconds of error spike tells you the story

2. **Check Cloudflare Workers dashboard**
   - View request rate graph
   - Compare error rate spike timing to deployment
   - Check CPU/memory usage (if visible)

3. **Check Neon database health**
   ```bash
   # Query: Check connection pool
   SELECT count(*) FROM pg_stat_activity;
   # If > 45, connection pool is saturated (critical)
   
   # Query: Check slow queries
   SELECT query, mean_time FROM pg_stat_statements
   ORDER BY mean_time DESC LIMIT 5;
   ```

4. **Check recent git history**
   ```bash
   git log --oneline -10
   # If deployment happened in last 10 min, high likelihood new code caused issue
   ```

5. **Post initial status to #ops**
   ```
   ⚠️ **P1 Incident: Tier 1 API Availability**
   - Detected: 2026-04-28 14:32 UTC
   - Scope: GET /api/videos (discovery)
   - Root Cause: Investigating...
   - Status: In triage
   - Backup on-call: Paging in 8 min if unresolved
   ```

---

### Phase 3A: Execution — Rollback (If Recent Deployment)

**Trigger:** Root cause traced to code change in last 10 minutes

**Command:**
```bash
# Go to worker directory
cd apps/admin-studio  # or relevant app

# Rollback to previous version (blue-green, instant)
wrangler rollback

# Verify rollback successful
curl -I https://videoking.adrper79.workers.dev/health
# Expected: 200 OK

# Post resolution
```

**On-Call Actions:**
1. Run rollback command
2. Wait 30 seconds
3. Verify `/health` returns 200
4. Post to #ops: `✅ Rollback complete; availability recovering`
5. Monitor for 5 minutes to confirm recovery
6. If recovered: Close incident; schedule post-mortem
7. If not recovered: Proceed to Phase 3B

---

### Phase 3B: Execution — Scale/Recover (If External or Infrastructure Issue)

**Trigger:** Root cause is database saturation, external service down, or unknown

**Actions by Root Cause:**

**If DB Connection Pool Saturated (> 45/50):**
1. Check for long-running queries:
   ```bash
   SELECT pid, query, query_start FROM pg_stat_activity
   WHERE state = 'active' ORDER BY query_start;
   ```
2. If found: Terminate long query (use DBA tool, not manual kill)
3. Monitor connection count recovery
4. Post to #ops: Investigating slow query; if not resolved in 5 min, will scale pool

**If Stripe API Down:**
1. This is external; we cannot fix
2. Navigate to https://status.stripe.com/ and confirm
3. Post to #ops: `⚠️ Stripe API is experiencing issues; we are waiting for recovery`
4. Implement fallback: If Stripe not responding, queue payment events to DLQ for retry
5. Monitor Stripe status; incident ends when Stripe recovers

**If Cloudflare Down:**
1. Check https://www.cloudflarestatus.com/
2. Post to #ops: `⚠️ Cloudflare outage affecting all workers`
3. No mitigation; wait for Cloudflare recovery

**If Unknown:**
1. Gather full diagnostics:
   - Last 100 Sentry errors (export full stack trace)
   - Cloudflare request rate graph (screenshot)
   - Current git log
   - DB connection count / query statistics
2. Post to #ops with all diagnostics
3. Page backup-on-call (if not already paged)
4. Share context; work together on diagnosis

---

### Phase 4: Verification & Recovery (10–20 min)

**On-Call Actions:**

1. **Verify Availability Recovered:**
   ```bash
   # Option 1: Check live dashboard
   curl -s https://videoking.adrper79.workers.dev/api/videos?limit=1 | jq .
   # Should return 200 with video data
   
   # Option 2: Check Sentry (wait 2 min for new events)
   # Go to Sentry dashboard; error rate should drop below 0.1%
   ```

2. **Post Recovery Status:**
   ```
   ✅ **Incident Resolved**
   - Duration: 12 minutes
   - Root Cause: [brief one-liner]
   - Impact: 250 failed requests; 0.04% error rate
   - Resolution: [rollback / scale / patched]
   - Follow-up: Post-mortem scheduled for [1 hour later]
   ```

3. **Measure Impact:**
   - Total failed requests (from Sentry)
   - Error rate % during incident window
   - Estimated failed transactions (revenue)
   - Creators impacted (if applicable)

4. **Schedule Post-Mortem:**
   - Invite: Tech lead, whoever helped resolve, on-call lead
   - Timing: Within 2 hours (while fresh)
   - Duration: 30 minutes
   - Template: See "Post-Mortem Template" below

---

### Phase 5: Post-Mortem (20–50 min, same day)

**Attendees:** On-call engineer, tech lead, backup on-call (if called)

**Agenda (30 min):**

1. **Timeline (5 min):**
   - When detected?
   - When diagnosed?
   - When resolved?
   - Any escalations?

2. **Root Cause (5 min):**
   - What went wrong?
   - Why did it happen?
   - Could we have detected sooner?

3. **Impact (3 min):**
   - How many requests failed?
   - Revenue impact?
   - Creator impact?

4. **Resolution (3 min):**
   - What fixed it?
   - Was there a workaround?
   - Could it have been faster?

5. **Action Items (5 min):**
   - What should we change to prevent this?
   - Who owns each action item?
   - When is it due?

6. **Documentation (4 min):**
   - Update runbook if needed
   - Add this to "known issues" if expected to recur
   - Do we need a new alert rule?

**Outcome:** 2–3 action items max; each assigned to someone; due within 1 week

---

## Common Incidents & Quick Resolutions

### Incident: "Tier 1 API returning 500 errors"

**Diagnosis (< 2 min):**
```bash
# Check Sentry error details
curl https://sentry.io/api/0/organizations/factory/issues/ \
  -H "Authorization: Bearer ${SENTRY_TOKEN}" | jq '.[] | select(.lastSeen > env.ALERT_TIME)'

# Look for stack trace pattern; if it's a database error, DB issue
# If it's timeout, check Cloudflare analytics CPU usage
```

**Quick Fixes (in order):**
1. New deployment within last 10 min? → Rollback
2. Database connection pool > 45? → Scale pool size
3. External service (Stripe/Neon) down? → Check status pages; wait
4. Unhandled exception in code? → Check Sentry group; if known issue, advance investigation window; if new, ping tech lead

---

### Incident: "Payout batch failed"

**Diagnosis (< 5 min):**
```bash
# Check payout_batches table
neon psql -c "SELECT id, status, failure_count, created_at FROM payout_batches ORDER BY created_at DESC LIMIT 1;"

# Check DLQ for payout-related events
curl -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  https://videoking.adrper79.workers.dev/api/admin/dead-letter-queue \
  | jq 'select(.event_type == "payout_transfer_failed")'
```

**Resolution (< 15 min):**
1. Check DLQ items: Did any creator payouts fail?
2. If all succeeded: Batch status should be "completed" — investigate why alert fired
3. If some failed:
   - Check individual error messages in DLQ
   - If Stripe issue (e.g., account not verified): Contact creator, ask to verify account
   - If our issue (e.g., malformed transfer): Escalate to tech lead; manual retry after fix
4. Manual retry:
   ```bash
   # If batch can be retried (idempotent):
   curl -X POST https://videoking.adrper79.workers.dev/api/admin/payouts/batch/:id/execute \
     -H "Authorization: Bearer ${ADMIN_TOKEN}"
   ```

---

### Incident: "High latency spike (p95 > 500ms)"

**Diagnosis (< 3 min):**
1. Check Cloudflare Analytics → request duration graph
2. Compare against 24h and 7day average (is this normal?)
3. Check if spike correlates with high traffic (spike might be okay)
4. Check if spike correlates with error spike (indicates problem)

**Quick Fixes (in order):**
1. If no error spike, consider monitoring for now (load is okay)
2. If error spike + latency spike, check for cascading failures
3. If recent deployment + latency spike, consider rollback for P1 impact

---

## On-Call Escalation Protocol

### If Unresolved After 10 Minutes

**On-Call Actions:**
1. Page backup on-call immediately (no further waiting)
2. Post to #ops with full context:
   ```
   ⚠️ **Escalation: Incident unresolved**
   - Duration: 10 minutes
   - Root Cause: Unknown
   - Paging backup on-call: [name]
   - Current diagnostics: [link to Sentry, Cloudflare screenshot]
   ```
3. Sync with backup on-call: "Here's what I found; here's what we've tried"

### If Unresolved After 20 Minutes

**Trigger:** Backup on-call has not resolved it

**Actions:**
1. Page tech lead (not just on-call)
2. Prepare to scale resources (Hyperdrive pool, Worker compute)
3. Consider partial mitigation:
   - Disable non-critical endpoints if they're causing load
   - Enable Read-Only mode if needed (serve cached responses)
4. Post to #ops: `🔴 **P1 Ongoing**; escalated to tech lead + architecture discussion`

### If Unresolved After 30 Minutes (Full Outage)

**Trigger:** Issue persists despite tech lead involvement

**Actions:**
1. Page CEO / on-call escalation contact (depends on company policy)
2. Post status on status page: "Investigating"
3. Begin client communication: creator dashboard + email updates
4. Focus on mitigation over root cause (get services back online first)

---

## On-Call Checklist

**Before Your Shift Starts:**
- [ ] PagerDuty mobile app on phone + notification enabled
- [ ] Cloudflare dashboard bookmarked
- [ ] Sentry dashboard open in browser (pre-authenticated)
- [ ] SSH access to Neon / admin box tested
- [ ] Slack #ops notifications enabled
- [ ] Local copy of this runbook reviewed

**During Your Shift:**
- [ ] Alert fires → Acknowledge in PagerDuty within 30 seconds
- [ ] Triage → Sentry + Cloudflare → Decision within 5 minutes
- [ ] Take action → Rollback / scale / investigate
- [ ] Communicate → Post to #ops every 5–10 minutes if ongoing
- [ ] Verify recovery → Check /health endpoint + Sentry
- [ ] Schedule post-mortem (if P1)

**End of Shift:**
- [ ] Handoff to next on-call if active incident
- [ ] Document any findings in #ops
- [ ] Update this runbook if you found gaps

---

## Post-Mortem Template

**Incident:** [Title]  
**Date:** [Date]  
**Duration:** [Start time] – [End time] (X minutes)  
**On-Call:** [Name]  

**Timeline:**
- **HH:MM** — Alert fired; on-call acknowledged
- **HH:MM** — Root cause identified: [one sentence]
- **HH:MM** — Resolution applied: [rollback / scale / patch]
- **HH:MM** — Verified recovered; error rate < 0.1%

**Impact:**
- Requests failed: [number]
- Error rate peak: [%]
- Estimated revenue impact: [if applicable]
- Creators impacted: [if applicable]

**Root Cause:**
[Narrative of what happened and why]

**Resolution:**
[What fixed it]

**Action Items:**
1. [ ] [Action] — Owner: [name] — Due: [date]
2. [ ] [Action] — Owner: [name] — Due: [date]

---

## Resources

- **Sentry Dashboard:** https://sentry.io/organizations/factory/
- **Cloudflare Dashboard:** https://dash.cloudflare.com/
- **Neon Console:** https://console.neon.tech/
- **VideoKing SLO Framework:** [SLO_FRAMEWORK.md](./SLO_FRAMEWORK.md)
- **Engineering Baseline:** [videoking-engineering-baseline.mdx](./videoking-engineering-baseline.mdx)
- **Slack:** #ops (post incidents here)
- **PagerDuty:** (managed separately; check your phone)

---

**Last Updated:** April 28, 2026  
**Next Review:** June 30, 2026 (quarterly)
