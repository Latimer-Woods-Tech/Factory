# Incident Runbook

_Owner: adrper79-dot. Last updated 2026-05-08. Solo-friendly._

## When to declare
Any of:
- Production down or degraded for > 5min
- Customer reports data loss / corruption
- Security event (key leak, unauthorized access)
- Billing event (charge mismatch, refund stuck, sub state wrong)

## Phases

### 1. Declare (1 min)
- Open issue: `[INCIDENT] <one-line-summary>` with `priority:P0` + `status:incident`.
- Set Pushover acknowledgment so the page stops re-firing.

### 2. Triage (5 min)
- What's broken? (one sentence)
- Who's affected? (count if known)
- Is it getting worse?
- Stop the bleeding before fixing the wound (rollback > root-cause).

### 3. Comms (5 min, if customers affected)
- Post on status page (when built).
- Email known affected customers from `aperry@latwoodtech.com` with: what's wrong, what we're doing, when next update.
- Update at least every 30min until resolved.

### 4. Fix
- Apply rollback if available (see DEPLOY_ROLLBACK.md).
- If no rollback, hotfix on a branch, get LLM judges to greenlight, ship.
- Verify smoke passes before declaring resolved.

### 5. Resolve
- Update incident issue with `status:resolved`.
- Final customer comm: what happened, what we did, what's next.

### 6. Postmortem (within 48h)
Use the postmortem template at `documents/runbooks/POSTMORTEM_TEMPLATE.md`.

Required sections:
- Timeline (UTC, minute-precision)
- Impact (customers, revenue, data)
- Root cause (5-whys)
- What we got right
- What we got wrong
- Action items (issue link + owner + due date)

## Solo-engineer reality check
You will be tired and panicked. The runbook is for you-30min-from-now. Read it before you start fixing anything.
