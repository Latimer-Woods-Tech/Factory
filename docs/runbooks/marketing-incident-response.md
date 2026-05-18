---
title: Marketing Incident Response Playbook
description: Step-by-step procedures for detecting, triaging, and recovering from marketing-specific incidents — brand crisis, list-health, reputational damage, mention surges, account suspensions, and legal threats.
---

# Marketing Incident Response Playbook

**Last Updated:** 2026-05-18
**Owner:** Operator (@adrper79-dot) + Marketing Supervisor loop
**Peer doc:** [`incident-response-playbook.md`](./incident-response-playbook.md) for engineering incidents
**Governs:** [`CONSTITUTION.md`](../marketing/CONSTITUTION.md) §7, [`ESCALATION_TIERS.md`](../marketing/ESCALATION_TIERS.md), [`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §8

---

## 1. Purpose

This playbook covers **marketing-specific** incidents — events that threaten the brand, the contact list's deliverability, the org's reputation, or the autonomous loop's ability to publish without supervision. Operationally, it sits between the engineering IR playbook (which handles broken services) and the constitution (which sets rules). It is the document you reach for when:

- The autonomous loop tripped a brand-safety wire and paused a cell.
- A negative mention is gaining velocity on a public surface.
- An external platform (Resend, Stripe, LinkedIn, Meta, TikTok, YouTube, SES) suspended an account or threatens to.
- A list-health metric (bounce, complaint, unsubscribe) crossed a threshold.
- Counsel or a third party has issued a legal threat tied to a published artefact.
- An ICP cell's conversion crashed, looks attributable to messaging, and the loop won't restart safely without operator review.

It does **not** cover backend outages, infrastructure error-budget burns, cost-cap breaches (the engineering G8 LLM cap is a separate channel), or data-subject requests — see §10.

---

## 2. Incident severity (M-SEV)

Marketing incidents are graded **M-SEV-1** through **M-SEV-4**. The grade is set by the operator at first triage and may be raised (never lowered without an explicit `/downgrade` comment on the issue).

### M-SEV-1 — Active brand crisis

**Definition:** Reputational damage is occurring *right now* and compounding. Action delay measured in minutes.

**Examples:**
- A negative mention is going viral (>3σ above baseline AND velocity still climbing at the 5-min mark).
- A platform has suspended an account that the loop is still trying to post to.
- A published artefact contains a factually false or legally actionable claim that has reached >1,000 impressions.
- A coordinated pile-on is in progress on a monitored handle.

**Targets:**
- **Detect:** ≤5 min (tripwire fire or operator notice)
- **Pause loop scope:** ≤5 min (`pause-marketing cell {cell_key}` or `pause-marketing all`)
- **First public response (if any):** ≤30 min, drafted by operator, not the loop
- **Stabilise:** ≤4 h
- **Postmortem:** ≤24 h

### M-SEV-2 — Single-axis brand-safety failure

**Definition:** One tripwire fired; cell is auto-paused; no public-facing damage yet but unsafe to resume without review.

**Examples:**
- Unsubscribe spike >2× rolling-14d median on a single sequence.
- Spam-complaint rate >0.1% on a single send.
- Voice gate block rate >5% in 24 h on a single voice key.
- Conversion crash >50% on a live campaign in 24 h.

**Targets:**
- **Detect:** ≤30 min (tripwire fire)
- **Triage start:** ≤2 h
- **Restart decision:** ≤24 h
- **Postmortem:** ≤7 d

### M-SEV-3 — Reactive, contained

**Definition:** Single negative mention or complaint that doesn't meet M-SEV-1 velocity criteria; or a Tier-3 escalation backlog that's growing.

**Examples:**
- One persistent critic posting factually false complaints; not gaining velocity (see §5 decision tree).
- Tier-3 backlog >10 unresolved issues (loop throttles TopicScout per [`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §8).
- Sender reputation slipping but still within provider tolerance.

**Targets:**
- **Detect:** ≤24 h
- **Decision:** ≤7 d (often "ignore, document why")
- **Postmortem:** Only if action taken

### M-SEV-4 — Retro-able

**Definition:** Pattern detected in weekly/monthly retro; no live impact. Goes to retro doc, not incident channel.

**Examples:**
- Bottom-decile voice corpus entries dragging engagement.
- Pattern of minor voice flags clustering on one ICP.
- Tier-2 auto-proceeded action that, in hindsight, should have escalated.

**Targets:** Captured in next weekly retro; no SLA.

---

## 3. The 7 brand-safety tripwires

These map 1:1 to [`CONSTITUTION.md`](../marketing/CONSTITUTION.md) §7. Each row is the operational contract: how it's detected, what auto-pauses, what the operator does first, how to investigate, what counts as resolved, and how to restart.

| # | Tripwire | Auto-detect | Auto-pause | Operator first action (≤30 min) | Investigation steps | Resolution criteria | Restart procedure |
|---|---|---|---|---|---|---|---|
| 1 | Unsubscribe spike | >2× rolling 14-d median on any sequence, computed hourly by TripwireMonitor | Pause the implicated sequence; OutreachSender refuses further sends on that sequence_id | Open the GitHub Issue (`tripwire/list-health`); read the last 3 sends' content; check inbox-placement scores | (a) Diff content vs prior 5 sends; (b) check segment definition for drift; (c) sample 10 unsubscribed contacts — were they mis-targeted; (d) check rendering on top 3 clients | Cause identified AND content fixed OR segment narrowed AND no further drift expected | `/approve` on issue; supervisor resumes sequence with the next-send-only flag for 24 h observation |
| 2 | Spam complaint rate | >0.1% in any single send, reported by Resend webhook | Pause sequence; add complaining contacts to suppression; freeze new sends on the implicated voice key | Open `tripwire/list-health`; pull complaint sample from Resend dashboard | (a) Provider reputation check (Postmaster Tools, Resend reputation); (b) authentication audit (SPF/DKIM/DMARC); (c) content audit for spam-trigger phrases; (d) confirm consent records for complainers | Provider reputation back to "good"; content remediated; complaint rate <0.05% on a controlled 1% re-send | Tier-3 approval required; first restart is a 1% canary; full resume only after 7 d clean |
| 3 | Reply-sentiment crash | NPS-equivalent on inbound replies drops >20pts WoW | Pause OutreachSender on the affected voice key; ContentDrafter continues drafting but holds | Open `tripwire/brand-voice`; sample 20 negative replies | (a) Voice gate re-run on last 20 sent artefacts; (b) check for ICP drift in the sequence; (c) topic-queue review — did a sensitive topic land; (d) check [`VOICES.md §5`](../marketing/VOICES.md) drift score | Voice profile updated via draft PR against [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) `BRAND_PROFILES`, OR cause confirmed unrelated to voice | `/approve` after PR merged; supervisor reloads voice corpus and resumes at 50% volume for 48 h |
| 4 | Negative mention surge | >3σ negative-sentiment mentions in 24 h on monitored handles | Pause all proactive social posting for the cell; replies remain allowed (humans can still respond) | Open `tripwire/mentions`; pull the mention cluster; classify per §5 decision tree | (a) Source diversity check — one bad actor or a wave; (b) factual review — is the complaint true; (c) velocity check — accelerating or already plateaued; (d) reach check — top mention's follower count | Cluster triaged AND response strategy chosen (engage / correct / ignore) AND velocity flat or declining for 12 h | `/approve`; resume cell posting at normal cadence; if engage/correct was chosen, that artefact is itself Tier-3 |
| 5 | LLM cost spike | >2× marketing sub-allocation (reuses `anthropic_over_cap` from [G8](../GAP_REGISTER.md)) | Pause generation org-wide for the marketing sub-allocation; transactional + Tier-1 cache-only continue | Open `tripwire/llm-cost`; pull last 100 generations' cost rows | (a) Per-agent cost decomposition (TopicScout/ContentDrafter/CopyEditor); (b) check for retry loops; (c) prompt-size audit; (d) provider chain — did fall-through to expensive tier occur | Loop in cache-hit-friendly state; cost digest baseline restored for 24 h | `/approve`; resume at normal cap |
| 6 | Conversion crash | conversion rate on a live campaign drops >50% in 24 h, computed from PostHog funnel + `factory_events` cohort | Pause new acquisition pushes for the campaign; in-flight sequences continue | Open `tripwire/conversion`; check engineering for funnel breakage first (cross-check `area:eng-needed`) | (a) Funnel-step instrumentation health per [`MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md); (b) landing-page A/B status; (c) checkout health; (d) attribution lag check | Funnel confirmed healthy AND messaging fix shipped OR declared "not a regression" with evidence | `/approve` after fix verified or after declared no-regression; resume campaign |
| 7 | Brand-voice failure rate | >5% of generated artefacts blocked at gate in 24 h | Pause publication for the affected voice key; topic queue keeps generating but holds | Open `tripwire/brand-voice`; pull the 3 worst-blocked artefacts | (a) Compare blocked artefacts to corpus; (b) check for prompt drift in [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts); (c) ICP-file mismatch check; (d) provider-chain — did a degraded tier produce them | Generator drift root-caused; voice rules updated OR prompt patched; gate pass rate back >95% on 50-artefact sample | `/approve` after sample passes; resume publication |

**Threshold revisions:** If a tripwire fires repeatedly with no real-world damage, the threshold may be wrong. Revise via ADR in [`docs/decisions/`](../decisions/), then update [`CONSTITUTION.md`](../marketing/CONSTITUTION.md) §7. Never hand-edit thresholds in code without the ADR.

---

## 4. Account suspension

Platform-specific procedure when an external service threatens or executes a suspension. Treat any suspension as **M-SEV-1** if posting / sending is in progress on that surface; **M-SEV-2** otherwise.

| Platform | Detection signal | Loop auto-action | Operator first action (≤30 min) | Recovery contact | Restart gate |
|---|---|---|---|---|---|
| **Resend** | 4xx/5xx on send AND status mail from Resend; bounce-rate or complaint-rate webhook over threshold | Pause OutreachSender + ChannelPublisher email surface org-wide; transactional path checked, may remain open if separate sender | Read Resend dashboard reputation page; preserve last 24 h sends; do not re-send the same content | support@resend.com; reseller channel if applicable | Operator approval + 7 d clean canary at 1% list |
| **Stripe** | Email from `risk@stripe.com` OR dashboard banner | No marketing-side auto-action — engineering owns Stripe (cross-link to [`incident-response-playbook.md`](./incident-response-playbook.md)). Marketing pauses any campaign promoting Stripe-gated purchase | Preserve all comms; do not respond before counsel review for restricted-business cases | risk@stripe.com via dashboard; account manager for enterprise | Engineering clears + operator approval |
| **LinkedIn** | Channel adapter 401/403; account-restricted email | Pause LinkedIn surface for affected handle; other handles continue | Log into the handle directly; check restriction reason; collect screenshots | LinkedIn appeal form; sales rep for paid accounts | 48 h cool-down + approval; resume at half cadence for 7 d |
| **Meta (FB/IG)** | Ad-account or page restriction notice; adapter rejection | Pause Meta surface for the affected page/account; pause all paid spend on that surface | Open Business Manager; read the policy citation cited; archive the offending artefact | Business Help Center; concierge for spenders | Appeal resolved OR new account warmed; Tier-3 approval to resume |
| **TikTok** | Account warning or shadowban detection (engagement drop >70% for 48 h) | Pause TikTok surface; preserve recent posts | Check community-guidelines email; archive offending artefact | Creator Support | 7 d cool-down + approval |
| **YouTube** | Strike email; community-guidelines warning | Pause YouTube surface; pause `render-video.yml` publication step | Read strike rationale; preserve unlisted backup of the video | YouTube appeal flow | Strike resolved or expired; approval |
| **SES (Amazon)** | Bounce rate >5% OR complaint rate >0.1% in CloudWatch | Pause SES surface; reroute Tier-1 transactional through Resend if dual-configured | Open SES reputation dashboard; do not send a "test" — that's how dashboards lock | AWS support case (severity: production-impairing) | Reputation back to "healthy" for 7 d; approval |

**SES bounce-rate doctrine:** SES locks accounts above 5% bounce or 0.1% complaint. If we're approaching either, pause first, ask later. There is no "send one to check." A locked SES account takes days to unlock; a paused one takes minutes to resume.

**Universal rule on suspension comms:** the operator is the sole responder. The loop does not draft suspension-appeal language. Drafts may be operator-requested via ContentDrafter but are Tier-3 by default.

---

## 5. Brand crisis — viral negative mention

When tripwire 4 (negative mention surge) fires or a human spots one, follow this decision tree. The most important branch is the explicit permission to **do nothing**.

```
A negative mention has been flagged.

Q1: Is the underlying complaint factually true?
├─ YES → Go to Q2 (truth path)
└─ NO  → Go to Q3 (falsehood path)

=== TRUTH PATH ===
Q2: Has the harm already occurred (e.g. shipped a bad artefact, made a wrong claim)?
├─ YES → M-SEV-1 if reach >1k impressions, else M-SEV-2
│        Action: public correction within 30 min; offending artefact unpublished
│                via supervisor `revoke`; postmortem within 24 h.
└─ NO  → The complaint is true but harm is hypothetical. Engage privately;
         do not amplify by responding publicly. M-SEV-3.

=== FALSEHOOD PATH ===
Q3: Is the mention gaining velocity?
   (Velocity = mention rate at T+15 min ≥ rate at T+5 min, OR top mention has
    >1k impressions and is still climbing)
├─ YES → Go to Q4 (gaining velocity)
└─ NO  → DO NOTHING. Document the call: open an M-SEV-3 issue with
         `tripwire/mentions` and label `decision/ignored`. Note the rationale
         (factually false, not gaining velocity). Close after 7 d if still flat.
         This is a documented, permitted decision. The constitution does not
         require us to engage every critic. Responding amplifies. Silence is
         the correct default for low-velocity false complaints.

Q4: Is the originating account credible to our ICP?
   (Followers >5k AND industry-adjacent, OR a customer with public history)
├─ YES → M-SEV-1. Public, factual correction within 30 min, drafted by operator
│        (NOT the loop), reviewed by counsel if defamation suspected.
│        Pause cell auto-posting until cluster declines for 12 h.
└─ NO  → M-SEV-2. Reply with a single factual correction from the brand handle
         (no thread, no quote-tweet of the original). Do not chase replies.
         Resume cell after velocity flat for 6 h.
```

**Operator-only rules:**
- The autonomous loop **never** publishes a response to a negative mention. All responses are Tier-3 artefacts drafted at operator request.
- Counsel review is required for any response that names an external party or makes a counter-claim.
- "Do nothing" is a first-class option and must be recorded with rationale. Silence without a recorded decision is a process failure even if the outcome is right.

---

## 6. Legal threat

A legal threat is any communication — DMCA notice, cease-and-desist letter, defamation claim, regulatory inquiry — that names the org, an artefact, or an employee, and asserts or implies legal consequence.

**Immediate actions (≤30 min):**

1. **Stop the campaign.** Run `pause-marketing cell {cell_key}` for any cell that touches the named artefact or topic. If unclear which cells, `pause-marketing all`.
2. **Engage counsel.** Email the org's legal contact with the full threat text, the artefact in question (or link), the surfaces it was published to, and the date/time of first publication.
3. **Preserve evidence.** Do **not** delete the artefact. Preserve:
   - The artefact's `marketing_artefacts` row (do not transition to `archived`).
   - All LLM call logs that produced it (per [`ESCALATION_TIERS.md`](../marketing/ESCALATION_TIERS.md) §5 audit trail).
   - The voice gate result.
   - All `factory_events` rows tagged with the artefact's campaign_id.
   - Screenshots of the artefact as published on each surface.
4. **Notify operator** via Pushover priority=2 (emergency) and open a private GitHub Issue with label `legal-hold`.

**Escalation flow:**

```
Legal threat received
  → Operator pauses + opens `legal-hold` issue (PRIVATE — not in public Project)
  → Counsel engaged
  → Decision tree:
      - Withdraw artefact: operator runs supervisor `revoke`; all surfaces
        unpublished; replacement notice if required by counsel.
      - Modify artefact: new artefact drafted by operator (NOT the loop);
        replaces original; Tier-3 publication.
      - Defend in place: artefact stays; counsel-drafted response is itself
        Tier-3; loop does not touch the cell until cleared.
  → Postmortem: legal-hold issues require an ADR in docs/decisions/ before
    any rule change. Constitution amendments triggered by legal threats are
    fast-tracked (same-day) per CONSTITUTION.md §11 "tightening" path.
```

**What the loop must not do under a legal hold:**
- Re-publish the named artefact under any pretext.
- Generate "similar" artefacts on the cell until the hold is released.
- Reference the matter in any public surface (including retro docs published externally).

Retro docs about legal incidents are written but kept in `docs/marketing/playbooks/retros/legal/` with restricted visibility per counsel.

---

## 7. Operator's daily 5-minute checklist

Performed once per business day, ideally on receipt of the 06:00 Pushover digest. Goal: catch slow-moving incidents before they become fast-moving ones.

1. **Read the digest north-star line.** If the WoW delta is negative AND no campaign is in retro to explain it, open a draft `tripwire/conversion` issue at M-SEV-3.
2. **Scan the top 3 escalations.** For each: approve, pause, or escalate. Do not skip — unresolved Tier-3 issues compound.
3. **Check Tier-3 backlog count** (in digest "loop health" line). If >10, run `pause-marketing surface {lowest-priority-surface}` to throttle inflow until backlog drains.
4. **Skim mention monitor.** Even without a tripwire, eyeball the last 24 h of mentions for the top-priority cell. Anything that *feels* off → open an M-SEV-3 issue for triage.
5. **Verify pause flags.** Check that no cell is paused that you don't remember pausing. A stale pause is a silent outage of campaigns; a forgotten resume is worse than a known pause.

Total time target: **5 minutes.** If it takes longer, the digest is doing too much; raise that in the next weekly retro.

---

## 8. Communication channels

Marketing incidents reuse the engineering channel infrastructure where possible — no new tooling per [`ESCALATION_TIERS.md`](../marketing/ESCALATION_TIERS.md) §2.

| Channel | Use | Notes |
|---|---|---|
| **Pushover** (priority 0/1/2) | Real-time operator alerts; tripwire fires, suspension notices, legal threats | Same channel as `scripts/cost_digest.py` and engineering supervisor digest; reuse |
| **GitHub Issues** (`area:marketing`, `tier:3`, `tripwire/*`, `legal-hold`) | Persistent incident records, approval workflow | Canonical kanban per [`feedback_kanban_canonical.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/feedback_kanban_canonical.md); no ClickUp |
| **Slack** (incident-mirror channel, optional per cell) | Visible parity with engineering IR | Mirror only; source of truth is the GitHub Issue |
| **Operator email** | Legal threats, suspension notices from platforms | Operator-only; not loop-readable |

**Pushover priority guide:**
- `priority=0`: Tier-2 FYI; daily digest.
- `priority=1`: Tier-3 escalation; tripwire fire.
- `priority=2`: M-SEV-1 brand crisis; legal threat; account suspension in progress. Acknowledgement required; pages every 5 min until acked per Pushover defaults.

---

## 9. Post-incident artefacts

Every M-SEV-1 and M-SEV-2 incident produces a retro doc. M-SEV-3 produces one only if action was taken. M-SEV-4 is captured in the weekly retro and does not get its own doc.

**Retro doc location:** `docs/marketing/playbooks/retros/{YYYY-MM-DD}-{slug}.md`
**Legal-hold retros:** `docs/marketing/playbooks/retros/legal/` (restricted)

**Required sections:**
1. **Summary** — one paragraph, what happened, blast radius, M-SEV.
2. **Timeline** — UTC timestamps, detect → pause → triage → restart.
3. **Root cause** — concrete; never "human error" without naming the system gap that allowed it.
4. **Auto-recovery performance** — did the loop pause correctly; did tripwires fire on time; any false positives.
5. **Action items** — owner + date; cross-link any opened issues or ADRs.
6. **Rule changes** — if a constitution rule should change, link the ADR draft; if a tripwire threshold should change, link the threshold-revision ADR.

**When to write an ADR:**
- A new failure mode not covered by any of the 10 failure modes in [`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §8.
- A tripwire threshold needs revision (up or down).
- A new tripwire is required.
- A constitution rule (§1–§10) needs amendment per [`CONSTITUTION.md §11`](../marketing/CONSTITUTION.md).
- A platform-suspension procedure (§4 of this doc) needs to change.

Tripwire threshold revisions tighten same-day, loosen with ≥1 week operator review, per [`CONSTITUTION.md §11`](../marketing/CONSTITUTION.md).

---

## 10. What this playbook deliberately doesn't cover

This is a marketing-specific document. The following live elsewhere:

| Concern | Lives in |
|---|---|
| Backend outages (Workers, DB, auth) | [`incident-response-playbook.md`](./incident-response-playbook.md) |
| Worker rollback procedure | [`rollback-runbook.md`](./rollback-runbook.md) |
| SLO error-budget burn | [`slo.md`](./slo.md), [`error-budget-policy.md`](./error-budget-policy.md), [`../SLO.md`](../SLO.md) |
| LLM cost cap breaches (org-wide G8) | Engineering channel — `anthropic_over_cap` warning; marketing sub-allocation tripwire is §3#5 above |
| Data subject requests (DSR) — GDPR/CCPA access, deletion | Stage-5 process (ADR-pending); not an incident, a fulfilled workflow |
| Stripe disputes & chargebacks | Engineering + finance; marketing only sees the conversion-crash downstream |
| Sentry error-spike alerts on Worker code | Engineering IR; marketing pauses any campaign driving traffic to the affected surface (cross-link via `escalation:sentry-traffic-block` per [`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §6) |
| Generic secret rotation | [`secret-rotation.md`](./secret-rotation.md) |

If an incident spans both — e.g. a Resend suspension that also breaks transactional email — both playbooks apply. Engineering owns the service; marketing owns the campaign decisions.

---

## 11. Cross-references

| Doc | Why |
|---|---|
| [`incident-response-playbook.md`](./incident-response-playbook.md) | Engineering peer; structural template |
| [`../marketing/CONSTITUTION.md`](../marketing/CONSTITUTION.md) §7 | Tripwire definitions (this doc operationalises) |
| [`../marketing/ESCALATION_TIERS.md`](../marketing/ESCALATION_TIERS.md) | Tier mechanics; Pushover and GitHub Issue queue reuse |
| [`../marketing/MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §8 | The 10 failure modes the loop self-recovers from |
| [`../SLO.md`](../SLO.md), [`slo.md`](./slo.md) | Error-budget framing |
| [`error-budget-policy.md`](./error-budget-policy.md) | Engineering budget freeze policy |
| [`rollback-runbook.md`](./rollback-runbook.md) | If an incident requires Worker rollback |
| [`postmortem-sync-agenda.md`](./postmortem-sync-agenda.md) | Sync structure for retros |
| [`POSTMORTEM_TEMPLATE.md`](./POSTMORTEM_TEMPLATE.md) | Retro doc shape |
| [`../decisions/`](../decisions/) | ADR home for constitution amendments and threshold revisions |
| [`../marketing/playbooks/retros/`](../marketing/playbooks/retros/) | Retro doc destination |
| [`../../packages/validation/`](../../packages/validation/) | Voice gate + tripwire implementation |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — initial marketing IR playbook; 4 severity grades, 7 tripwires, account-suspension matrix, brand-crisis decision tree with documented "do nothing" branch, legal-threat protocol, daily 5-min checklist |
