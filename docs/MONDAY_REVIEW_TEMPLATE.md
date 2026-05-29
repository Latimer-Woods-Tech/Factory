# Monday Review — Agenda Template (G15)

**Duration:** 30 minutes total  
**Cadence:** Weekly, Monday morning (recurring calendar event)  
**Owner:** @adrper79-dot  
**Input docs:** `docs/STATE.md`, `docs/GAP_REGISTER.md`, `docs/ROADMAP.md`

---

## 1. Digest review (5 min)

Check the latest Pushover digest (generated daily at 06:30 ET):

- [ ] Completion %: moving toward exit criteria?
- [ ] Cohesion scores: any repo below 70?
- [ ] Cost: any line exceeding 2× target two weeks in a row?
- [ ] Smoke status: all green?
- [ ] P0/P1 gaps open: zero?

**Stop here** if P0 > 0. Fix before continuing.

---

## 2. Milestone exit check (10 min)

Reference: `docs/ROADMAP.md` current milestone section.

- [ ] What are the exit criteria for the current milestone?
- [ ] What percentage of criteria are met?
- [ ] Are any criteria blocked on a specific PR, secret, or human action?
- [ ] If this milestone is done → formally declare shipped, update ROADMAP.md status.

---

## 3. Drift triage (5 min)

Open `docs/GAP_REGISTER.md`:

- [ ] Any new P0 or P1 gaps since last Monday?
- [ ] Are any gaps with `@adrper79-dot` owner overdue?
- [ ] Close gaps that were fixed this week (update status + fix summary).
- [ ] Promote any P2 gap to P1 if circumstances changed.

---

## 4. Customer signal review (5 min)

- [ ] Any new Stripe events (new customers, churns, failed renewals)?
- [ ] PostHog funnel: where are users dropping? Top drop-off step?
- [ ] Sentry: any P1/P2 errors in production since last Monday?
- [ ] Any inbound emails or Slack/DM feedback to act on?

---

## 5. Next-week kickoff (5 min)

- [ ] Pick top 3 tasks for the week. Write them in `docs/STATE.md` open follow-up section if substantial.
- [ ] Any blocker that needs human action (Cloudflare, Neon, Stripe dashboard, GCP console)?
- [ ] Any PR that needs CODEOWNER review?
- [ ] Check oldest APPROVED PRs (from `docs/STATE.md`) — merge or close any stale ones.

---

## Review history

| Date | Milestone status | P0/P1 open | Notes |
|---|---|---|---|
| (first entry) | — | — | Initial template created |
