# Consistency Audit — Stress-Test Findings

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative synthesis · **Owner:** @adrper79-dot

> The 3 end-to-end scenario walkthroughs in [`scenarios/`](./scenarios/) collectively surfaced **32 distinct integration gaps** that no individual doc shows. This audit aggregates them, classifies by severity, maps each to its closing action, and identifies cross-cutting patterns.

> Source scenarios:
>
> - [`scenarios/01-happy-path-practitioner.md`](./scenarios/01-happy-path-practitioner.md) — Sarah: LinkedIn → trial → $99/mo → referral → retention (15 gaps, 4 Tier-1 blockers)
> - [`scenarios/02-tripwire-fires-recovery.md`](./scenarios/02-tripwire-fires-recovery.md) — Tuesday 11:30 PM: 3 tripwires concurrent (9 gaps, 2 ADR recommendations)
> - [`scenarios/03-cross-product-flywheel.md`](./scenarios/03-cross-product-flywheel.md) — Sarah → Maria → Tomás → Lucia attribution chain (8 gaps, 2 CONSTITUTION violations dramatized)

---

## 1. Severity classification

| Severity | Definition | Count |
|---|---|---|
| **🟥 Tier-1 Blocker** | The autonomous loop physically cannot run as specified. Code path errors or missing tables. | 5 |
| **🟧 Tier-2 Specification gap** | Spec contradicts itself, is silent on a load-bearing case, or two specs disagree | 13 |
| **🟨 Tier-3 Operational** | Real but recoverable — operator workflow / response time / batch cadence questions | 9 |
| **🟦 Tier-4 Polish** | Documentation hygiene, cross-doc style consistency | 5 |
| **Total** | | **32** |

The Tier-1 blockers are why PR 3 was correctly closed — they would have shipped broken plumbing. They're now identified and routable to the right fix.

---

## 2. Tier-1 Blockers — must fix before any plumbing PR

| # | Gap | Source | Affected doc / code | Closing action |
|---|---|---|---|---|
| **T1-1** | `outreach_contacts.phone NOT NULL` — web signups have no phone; the INSERT errors today; Sarah literally cannot be recorded | [scenario 01 — Gap B2](./scenarios/01-happy-path-practitioner.md) | [`packages/crm/src/index.ts:233`](../../packages/crm/src/index.ts) DDL | Migration in PR 3b: `ALTER TABLE outreach_contacts ALTER COLUMN phone DROP NOT NULL` + matching test |
| **T1-2** | Attribution columns don't exist on `crm_leads`. [`ATTRIBUTION.md §4`](./ATTRIBUTION.md) declares `first_touch_*`, `last_touch_*`, `touch_history`. None in current DDL | scenario 01 — Gap A2 | [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) DDL + ATTRIBUTION.md | Already specified in [closed PR 3b](https://github.com/Latimer-Woods-Tech/Factory/pull/810). Resurrect that migration as the leading commit of the PR 3 redesign |
| **T1-3** | `email_drip_state` table not implemented. Referenced by [`DSR_HANDLING.md`](./DSR_HANDLING.md) + [`LIFECYCLE.md §4`](./LIFECYCLE.md). Drip sequencer can't run | scenario 01 — Gap C1 | [`packages/email/`](../../packages/email/) DDL | Already specified in [closed PR 3a](https://github.com/Latimer-Woods-Tech/Factory/pull/810). Resurrect |
| **T1-4** | Referral attribution can't fit the 5-tuple. Either violates the no-PII rule in [`CAMPAIGN_TAGGING.md §2`](./CAMPAIGN_TAGGING.md) or loses the flywheel link. "Preserve both Sarah's and Tomás's first-touch" is structurally unexpressible | scenario 01 — Gap K1, scenario 03 — Gap 3 | [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) + future `@lwt/referrals` package design | Co-design `@lwt/referrals` and `@lwt/attribution` together. Add a separate `referral_chain` column on `crm_leads` distinct from `first_touch_*`. ADR-required spec change |
| **T1-5** | Lifecycle stage 4→6 transition not allowed by [`LIFECYCLE.md §2`](./LIFECYCLE.md) but is the realistic flywheel path (Sarah goes Paid→Advocate without ever being in Retained at day 45) | scenario 01 — Gap I1 | [`LIFECYCLE.md §2`](./LIFECYCLE.md) | Revise state machine: allow 4→6 transition; document that Retained is a *concurrent* stage marker, not sequential after Paid |

All 5 are **fixable in docs + small migrations**. None require operator validation first; they're internal-consistency issues.

---

## 3. Tier-2 Specification gaps

| # | Gap | Source | Closing action |
|---|---|---|---|
| **T2-1** | Three contradictory retention definitions co-exist: north star says "≥30d retained", LIFECYCLE says "N=2 renewals", drip-sequencer says "≥1 product event in 45d" | scenario 01 — Gap I2 | Pick one ([`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) north-star def is canonical); update LIFECYCLE.md + drip spec to match |
| **T2-2** | `utm_content=practitioner` on shareable URL pollutes practitioner-cell math when a consumer clicks. UTM is immutable per spec but bi-cell `/r/*` surface requires rewrite-at-capture | scenario 03 — Gap 1 | Add UTM-rewrite policy to [`ATTRIBUTION.md §2`](./ATTRIBUTION.md): on bi-cell surfaces, `utm_content` rewrites to the *visitor's* cell, not the surface owner's |
| **T2-3** | `selfprime.net/` bi-modal landing fork mechanism named in [`CHANNEL_DOCTRINE.md §4`](./CHANNEL_DOCTRINE.md) but the fork policy is undefined (what signal forks the route?) | scenario 03 — Gap 2 | Spec the fork rule. Recommend: fork on `utm_content` first; fall back to `referer` host class; fall back to consumer (highest-volume default) |
| **T2-4** | Referral graph and touch-attribution are siblings but not co-designed. Lucia's `first_touch` (her actual first click) and `referral_chain` (Tomás referred her) need separate columns + dual rollup queries | scenario 03 — Gap 3 | Add `referral_chain JSONB` column on `crm_leads`; update queries in [`KPI_DECOMPOSITION.md §8`](./KPI_DECOMPOSITION.md) to compute both |
| **T2-5** | WhatsApp / messenger forwarding strips Referer; [`ATTRIBUTION.md §6`](./ATTRIBUTION.md) edge cases doesn't address it | scenario 03 — Gap 4 | Add edge case to ATTRIBUTION §6 — "messenger forwarding" — explicitly use UTM-only when referrer missing |
| **T2-6** | Last-non-direct attribution records consent-violating sends as successful. Bad behavior looks good in §7 rollups | scenario 03 — Gap 5 | Add `valid_touch` flag to touch records; rollups filter to `valid_touch=true` only; consent-violating sends get `valid_touch=false` audit-only |
| **T2-7** | Reading-published is arguably advocacy but [`LIFECYCLE.md §2`](./LIFECYCLE.md) keys stage→Advocate only on `referral_invited` | scenario 03 — Gap 6 | Add `reading_published` as alternative trigger for stage 5→6 |
| **T2-8** | [`LIFECYCLE.md §2`](./LIFECYCLE.md) silent on what stage anonymous `distinct_id`s occupy after `chart_calculated` | scenario 03 — Gap 7 | Spec a "stage 0.5 Anonymous-MQL" or document that anonymous events stay in stage 0 until `user_id` resolves |
| **T2-9** | Practitioner referral commission cited as "20%/12mo per [icp/selfprime-practitioner.md §5](./icp/selfprime-practitioner.md)" but that text isn't actually in the file. Flywheel credit vs referral commission need explicit separation | scenario 03 — Gap 8 | Add the 20%/12mo spec to icp/selfprime-practitioner.md §5 OR move to a dedicated commercial-terms doc; clarify Sarah is owed flywheel credit (vanity attribution) but NOT Stripe Connect commission for Tomás since he came via shareable not referral code |
| **T2-10** | Per-cell denylist let regulated phrase leak — caught by accident via CLIP. Voice gate's `BRAND_PROFILES` denylist is per-cell, but health-claim language is cross-cell forbidden | scenario 02 — Gap 1 | Add universal `regulated_terms_denylist` constant in [`packages/validation/`](../../packages/validation/) applied to all voices |
| **T2-11** | Self-referential voice-gate risk: tripwire-response email is itself LLM-generated; needs static fallback template if gate fails | scenario 02 — Gap 8 | Spec a `system_notifications.yaml` of fallback static templates in [`packages/email/`](../../packages/email/); tripwire response uses static template, not LLM |
| **T2-12** | No `cell_capabilities` flag (e.g. `publishes_user_content`); `selfprime:practitioner` blind spot for UGC moderation is structural | scenario 02 — Gap 9 | Add capability flags to ICP cell schema in [`ICP_MATRIX.md`](./ICP_MATRIX.md); cells with `publishes_user_content` trigger publish-time vision gate |
| **T2-13** | Two CONSTITUTION violations are doc-stated, not code-enforced: (a) `paid_readiness_gate: NOT MET` doesn't actually block paid spend; (b) free chart calc handler likely auto-flips `consent_status` so emails get sent without explicit opt-in | scenario 03 — CONSTITUTION violations | New tripwires: `paid_spend_without_readiness` and `email_send_without_consent_audit`. Both Tier-3 escalations. Also: spec the consent-on-signup flow explicitly — chart calc alone is NOT consent |

---

## 4. Tier-3 Operational issues

| # | Gap | Source | Closing action |
|---|---|---|---|
| **T3-1** | Image-voice batch cadence (4h) creates 14h exposure window for user-generated content. Need publish-time synchronous gate | scenario 02 — Gap 2 | ADR: vision-gate is synchronous (block-on-publish) for any cell with `publishes_user_content=true`; batched for system-generated only |
| **T3-2** | Retroactive removal vs DSR distinction not documented; 247-viewer notification obligation unclear | scenario 02 — Gap 3 | Extend [`DSR_HANDLING.md §6`](./DSR_HANDLING.md) with "retroactive removal" sub-case; spec viewer-notification threshold (e.g. >100 views = notify; <100 = silent) |
| **T3-3** | No false-positive learning loop. Unsub-spike tripwire fired correctly but root cause was list targeting; no mechanism to learn | scenario 02 — Gap 4 | Add false-positive disposition field on each tripwire fire; the supervisor's RetroWriter learns from disposition over time, widens threshold automatically after N=3 confirmed false-positives |
| **T3-4** | Multi-tripwire clustering: 3 separate issues, no "incident night" umbrella | scenario 02 — Gap 5 | Add `marketing_incident_clusters` table; supervisor auto-clusters tripwire fires within 1h window; operator sees one umbrella issue with N tripwires linked |
| **T3-5** | Pushover P1 + iOS DND = no operator page at night; tier-3 brand-safety should be P2 to bypass DND | scenario 02 — Gap 6 | Revise [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md): tier-3 = Pushover P2 (bypasses DND) with cap of 1 P2 per 6h to prevent abuse |
| **T3-6** | Downstream platform caches (X, Reddit, IG OG previews) hold the offending image after CDN purge | scenario 02 — Gap 7 | Add platform-cache invalidation step to brand-safety incident response: send explicit cache-refresh request to each platform that crawled the URL |
| **T3-7** | 2 race conditions in scenario 01 (event ordering on signup → drip enrollment; concurrent voice-gate evaluations) | scenario 01 — Gap E1+E2 | Document the race resolution policy: drip-enrollment is fire-and-forget queue task; voice-gate uses optimistic locking |
| **T3-8** | Budget check timing — happens after LLM call, not before | scenario 01 — Gap F1 | Move budget pre-check to before LLM dispatch; current implementation only catches after-the-fact |
| **T3-9** | Operator total time for triple-tripwire night = ~2h 5min vs 5-min daily-checklist target. Real operator load when things go wrong | scenario 02 — meta | Set realistic expectations: 5min/day is steady state; expect 1-3 "incident nights" per quarter at 2-3h |

---

## 5. Tier-4 Polish

| # | Gap | Source | Closing action |
|---|---|---|---|
| **T4-1** | Several docs reference paths that don't yet exist (`docs/marketing/funnels/`, `dashboards/`, `baselines/`, `queries/`, `alerts/`, `surfaces/`, `llm-rank-prompts/`) | Cross-scenario | Add a `docs/marketing/INDEX_OF_FUTURE_PATHS.md` OR populate stubs |
| **T4-2** | Cross-doc style drift: some briefs over 300-line cap; ADR-0005 referenced inconsistently | Cross-scenario | Mostly accepted; flag in ROADMAP.md status note |
| **T4-3** | `prime_self:practitioner` (colon) vs `prime_self-practitioner` (dash) for code vs GH-labels — documented but adds cognitive load | Cross-scenario | Acceptable; clarify in [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) |
| **T4-4** | Customer-gate companion link reverted; bidirectional discoverability broken on one side | Original grand review D5 | Operator's call; left as-is per their decision |
| **T4-5** | Cross-product flywheel claim is repeated in 5+ docs without a single canonical statement | Cross-scenario | Add a "Flywheel mechanics" section to [`ICP_MATRIX.md`](./ICP_MATRIX.md) and link from elsewhere |

---

## 6. Cross-cutting patterns

Beyond individual gaps, three patterns emerge from the 32 findings:

### 6.1 Pattern: docs describe state that code doesn't have

5 of the Tier-1/Tier-2 gaps trace to docs declaring columns / tables / functions that don't exist yet. The closed PR 3 specified these; their reopening will close most of these gaps.

**Implication:** Docs are running ahead of code. That's fine for strategy work, but the marketing supervisor cannot ship until the underlying tables exist. Resurrect [PR 3b](https://github.com/Latimer-Woods-Tech/Factory/pull/810) (ICP dimension + attribution columns + drip state) as the highest-priority code work post-validation.

### 6.2 Pattern: cross-PR co-design gaps

3 distinct gaps trace to PRs that were specified as siblings but never co-designed: referral graph (PR 3j) + attribution (PR 3k) + shareables (PR 3h) share data shapes that don't compose cleanly.

**Implication:** When PR 3 redesign happens, sequence these three together with a shared schema review, not as parallel sub-PRs.

### 6.3 Pattern: doc rules without code enforcement

CONSTITUTION specifies behaviors (paid-spend gate, consent-on-signup, voice-gate failure rate) that no tripwire watches. The system can violate its own rules silently.

**Implication:** Every CONSTITUTION rule needs a corresponding tripwire OR an explicit "doc-only rule, enforce in review" annotation. Currently the line is fuzzy.

---

## 7. Priority order — recommended fix sequence

If I were sequencing the fix work:

| Phase | Items | Effort | Rationale |
|---|---|---|---|
| **Phase 1 — Doc-only fixes** | T1-5, T2-1, T2-2, T2-3, T2-5, T2-7, T2-8, T2-9, T2-12, T3-7, T3-8 | 1 session | Closes 11 gaps without code; raises spec coherence sharply |
| **Phase 2 — Tripwire / enforcement additions** | T2-10, T2-11, T2-13 (3 new tripwires), T3-1, T3-3, T3-4, T3-5, T3-6 | 1 PR after PR 3m | Closes the "rules without enforcement" pattern (6.3) |
| **Phase 3 — Schema fixes (resurrect closed PR 3)** | T1-1, T1-2, T1-3, T1-4, T2-4, T2-6 | PR 3b + PR 3k + PR 3j co-design | Closes the "docs ahead of code" pattern (6.1); preconditions for autonomous loop ship |
| **Phase 4 — Operational polish** | T3-2, T3-9, T4-1, T4-5 | Bottom of backlog | Quality of life |

**Total addressed:** 32 of 32 (T4-4 left as operator decision).

---

## 8. What this audit means for the operator

Concretely:

1. **The autonomous loop CANNOT ship today** — Tier-1 blockers prevent it physically. (We already knew this; PR 3 was correctly closed.)
2. **Phase 1 doc fixes can happen any time** — 1 session, additive to main, no validation gate needed.
3. **Phase 3 schema work has a clear dependency map** — PR 3b → PR 3k → PR 3j co-design → everything else.
4. **The strategy validation sprint** ([`playbooks/operator-validation-sprint.md`](./playbooks/operator-validation-sprint.md)) remains the highest-leverage 5 hours. Phase 3 schema work should NOT start until that validation lands.
5. **The CONSTITUTION needs code enforcement** for ≥3 rules that are currently doc-only (T2-13). That's a real architectural finding, not polish.

---

## 9. What the scenarios deliberately didn't test

For the record, things not stress-tested:

- **Internationalization** — Sarah/Maria/Tomás all assumed English-only
- **Mobile UX** — Tomás was on mobile but the actual mobile rendering wasn't traced
- **High concurrency** — what if 200 design-partner outreach emails fire in the same hour against rate-limited APIs?
- **Cold-start / first-day** — the scenarios assumed a healthy steady-state loop; bootstrap day-1 has different failure modes
- **Operator vacation** — all scenarios assumed the operator is reachable; the loop's behavior during 2-week operator absence isn't specified
- **Cross-product Selfprime → Cypher** — only Selfprime + cross-cell flywheel was tested; Cypher of Healing scenarios were skipped (regulated vertical adds complexity)
- **Capricast scenarios** — entirely untested; pre-validation

These should each get their own scenario file in a future audit pass.

---

## 10. Cross-references

- [`scenarios/`](./scenarios/) — source walkthroughs
- [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) — index
- [`CONSTITUTION.md`](./CONSTITUTION.md) — rules whose enforcement gaps are flagged in §6.3
- [`playbooks/operator-validation-sprint.md`](./playbooks/operator-validation-sprint.md) — the highest-priority next move
- [Closed PR 3 (Latimer-Woods-Tech/Factory#810)](https://github.com/Latimer-Woods-Tech/Factory/pull/810) — schema work to resurrect
- [`COST_PROJECTION.md`](./COST_PROJECTION.md) — separate cost gap analysis

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — synthesis of 3 scenario walkthroughs; 32 gaps classified by severity; cross-cutting patterns; 4-phase fix priority |
