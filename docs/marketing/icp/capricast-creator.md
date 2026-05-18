# `capricast:creator` — ICP

**Product:** Capricast · **Audience archetype:** Practitioner-of-1 (niche video creator) · **Readiness state:** 🟡 `discovery` · **Priority:** #1 within the Capricast row (portfolio priority #3 overall)

> Parent: [`capricast.md`](./capricast.md) · Matrix cell: row "Capricast" × col "Practitioner-of-1" · Voice: `capricast:creator`

> **Hypothesis-level.** This file moves the Capricast row's practitioner cell from ⏳ to 🟡 by stating a falsifiable wedge. Operator-confirm signals are marked ⏳ inline. The autonomous loop's first job is to falsify or harden each ⏳.

---

## 1. Positioning

**One sentence:**
> Capricast is the niche video creator's revenue layer — ship more video, get paid per-subscription or per-unlock, keep your work and audience portable.

**3 differentiators:**
1. **Workmanlike, not parasocial.** Patreon's whole register is "support the artist" — a feelings transaction. Capricast's register is "buy the workshop / unlock the deep-dive / subscribe to the channel" — a *work* transaction. The creator's leverage is craft, not personality.
2. **Niche-economic math, not YouTube-AdSense math.** YouTube needs 100k views to pay rent; Capricast needs 200 paying fans. The whole platform is built for the long tail of expertise that AdSense ignores.
3. **The work + audience are portable.** Export every video, every subscriber email, every revenue record — anytime, no lock-in. We compete on operating leverage, not on data hostage-taking.

**Incumbents we're displacing** *(hypothesis — operator confirms which is the dominant pain):*
- **Patreon** — too parasocial; tone is "support me" not "buy the workshop." Creators who sell *craft* feel miscast there.
- **YouTube + AdSense** — 99% of niche creators sub-scale to AdSense math. Memberships are an afterthought; revenue per view is laughable for narrow niches.
- **Vimeo OTT / Uscreen / Mighty Networks** — too expensive, too B2B-flavored, OTT-first when most niche creators want a-la-carte unlocks plus subs.
- **Gumroad / Podia / Teachable** — built for finished courses, not the rolling-publish video cadence niche creators actually run.
- **Substack with paid video** — fine if your wedge is the newsletter; doesn't carry if the artefact is the video itself.
- **"I do everything manually with Stripe Checkout + a private YouTube channel."** Common; the most direct competitor for the early ICP.

---

## 2. Customer (M1)

### ICP profile

**One-sentence ICP** *(hypothesis):*
> Working niche video creator, 28–50 y/o, runs solo or with one editor, publishes 2–8 videos/month in a *single deep niche* (trade skill, narrow craft, vertical analysis, professional tutorial, fitness/movement specialism), has 500–10,000 followers across platforms, currently earns $200–$5,000/mo from a Patreon + Gumroad + private-channel duct-tape stack.

**Sub-segments (system tests in parallel; data picks the winner):**

| Sub | Description | Where to find them |
|---|---|---|
| **A. Trade-skill educators** | Welders, machinists, woodworkers, electricians, mechanics, masons publishing technical instruction. Pre-monetized on Patreon, frustrated by parasocial tone. | YouTube niches under 50k subs with strong paid-tier signals; trade forums (Practical Machinist, AvE-style comment crowds); subreddits like r/woodworking, r/welding, r/metalworking |
| **B. Narrow-niche analysts** | Vertical-specific market analysts, single-domain explainers (chess endgame coaches, options-flow analysts, niche-game theorycrafters, lineage-specific historians) | YouTube channels under 30k subs; Substack video embedders; channel-specific Discords |
| **C. Movement / craft / fitness specialists** | Practitioners of a *named* movement system (Olympic lifting coaches, climbing-specific trainers, mobility specialists, niche dance forms) where the artefact is *video instruction* | Coach-finder directories; specialty-fitness Instagram accounts; small-platform federations |
| **D. Selfprime / XicoCity overflow** | A practitioner already in another LWT product who has a video-based revenue surface that doesn't fit Selfprime's chart-prep model or XicoCity's culture-scene model | Direct via CRM cross-product linkage (`crm_leads.user_id`); highest intent, lowest CAC |

System runs sub-segment A/B/C/D tests in parallel with separate UTM tags; cohort retention picks the priority order. No operator decision required.

### Pain solved today (from the creator's perspective)

| Pain | Cost today | Capricast resolution |
|---|---|---|
| Patreon's parasocial register feels wrong for craft work | Subs cap at hardcore-fan ceiling; pricing power capped at $5–10/mo | Workmanlike register; tier as *workshop access*, not "support" |
| YouTube AdSense doesn't scale for narrow niches | $1–4 RPM × 50k views/mo = $50–200/mo; below livelihood threshold | Per-unlock + subscription stack; 200 fans × $5/mo = $1k MRR floor |
| Per-video paywall lives on Gumroad while channel lives on YouTube | Audience can't move between funnels; checkout breaks brand | Single creator surface: catalog + paywall + subs + library, in your brand |
| Stripe Connect onboarding is opaque | Creators churn during sign-up due to KYC friction | Onboarding ops runbook (`creator-onboarding-ops.md`) already shipped; verified 80%+ target |
| No data on which video drives which subscription | Can't optimize cadence or pricing | 12-event monetization funnel ([`monetization-funnel-spec.md`](../../capricast/monetization-funnel-spec.md)) instrumented out-of-box |
| Locked into platform; can't take audience with them | Platform risk paralyzes investment | Full data export — videos, sub list, revenue history — anytime |

### Why they switch from incumbents

| Incumbent reason for stickiness | Capricast answer |
|---|---|
| "Patreon has the existing audience" | We import via OAuth + bulk migration tool *(⏳ confirm shipping)*; the creator's existing sub list moves over in one step |
| "YouTube is where my audience is" | We don't compete with YouTube for *discovery* — we compete for *monetization*. Keep YouTube as the funnel; Capricast as the cash register. |
| "Gumroad / Podia / Teachable already work for me" | Those tools assume a finished course. Capricast assumes a rolling video cadence — subscription + per-video unlock both, native. |
| "I don't want to fragment my checkout" | Single Stripe Connect account; one payout, one tax form, one dashboard. |
| "What if Capricast disappears?" | Export everything anytime. No lock-in. Built-in commitment per [`CONSTITUTION.md`](../CONSTITUTION.md). |
| "Platform take rates kill me" | Hypothesis: 5–8% platform fee + Stripe processing. Below Patreon's 8–12% + processing. ⏳ confirm operator's intended take rate. |

### Last ICP conversation

⏳ **Bootstrap goal:** complete 5 calls with target creators within 30 days of the Capricast positioning pass merging. Operator's only manual marketing touch in the Capricast bootstrap loop. Per [`M1_M2_CATALOG`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-3--capricast-capricast-repo) §1.1, this field is blank today — Capricast has not had a validated customer conversation cycle.

---

## 3. Channel hypothesis

Per [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates).

### 3.1 Owned

| Channel | Engine | Plan |
|---|---|---|
| **Product** | Capricast app | Onboarding flow audit — can a Patreon-importing creator publish their first paywalled video in <30 min? Time-to-first-dollar target: <72h from signup. |
| **Email lifecycle** | [`@lwt/email`](../../../packages/email/) + drip sequencer (PR 3a) | 6-step creator nurture: welcome → Patreon import walkthrough → first paywall publish prompt → revenue dashboard tour → pricing-tier playbook → trial-to-paid take-rate confirmation |
| **Creator directory at `capricast.com/discover`** | (deferred to post-design-partner data) | Viewer-side discoverability; SEO surface |
| **SEO long-tail** | [`@lwt/seo`](../../../packages/seo/) + content publisher | "How to monetize a niche YouTube channel," "Patreon alternative for [niche]," "Stripe Connect for video creators 2026" |
| **Dogfood content engine** | [`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/) | Publish *about Capricast on Capricast* — the platform's own marketing videos live on the platform as a referenceable demo |

### 3.2 Earned

| Channel | Engine | Plan |
|---|---|---|
| **YouTube long-form** | [`packages/video/`](../../../packages/video/) | 1 video/week. Framing: builder-coded breakdowns — "We rebuilt video monetization; here's the math." Hook niche creators by showing the *math*, not the features. |
| **Niche-creator subreddits** | [`@lwt/social`](../../../packages/social/) reply-only mode | r/youtubers, r/SmallYTChannel, r/PatreonCreators, r/MakingAFilm, r/WeAreTheMusicMakers — reply to genuine monetization questions; never post promotional |
| **Hacker News + Indie Hackers** | Manual + scheduled posts | One-off "launch our take rate is X" post; "Indie Hackers" weekly milestone updates as the platform's revenue compounds |
| **Niche-creator podcasts** | Manual outreach via `@lwt/crm` warm path | Pitch the founder onto creator-economy and craft-specific podcasts; target shows under 100k downloads (where pitches actually land) |
| **Patreon-refugee inbound** | SEO + content | Publish data-rich "Patreon alternatives" posts. Patreon's frequent fee/rule changes drive periodic refugee waves; we want to be the destination during the next one. |
| **X (formerly Twitter)** | [`@lwt/social`](../../../packages/social/) | Builder-coded thread cadence (3/week). Audience is creator-economy + indie-builder overlap. Voice: workmanlike. |
| **Substack syndication** | Via [`@lwt/email`](../../../packages/email/) | Weekly "how a niche creator made $X this month" deep-dive; cross-posted to Substack for SEO + standalone subscribers |

### 3.3 Paid

**Paid readiness gate: NOT MET.** No paid spend until ≥3 months of cohort retention from the design partners + their downstream signups. Per [`CONSTITUTION §5`](../CONSTITUTION.md), Capricast paid is gated *after* Selfprime paid runs (resource concentration).

When gate met:
- Likely first: YouTube pre-roll on competitor creator-economy channels
- Likely second: niche-creator-podcast sponsorships (paid placement on shows we couldn't earn into)
- ⏳ Unlikely: paid search — niche-creator search intent is small + low LTV/CAC math

---

## 4. Pricing + economics

| Field | v0 hypothesis | Notes |
|---|---|---|
| Pricing model | Platform take rate (% of creator GMV) | No SaaS subscription on the creator; alignment of incentives is the wedge |
| Hypothesis take rate | 5–8% + Stripe processing | Below Patreon's 8–12%; above Stripe's bare cost. ⏳ operator confirms. |
| Creator GMV target (median paying creator) | $1,000–$3,000/mo | 200–600 fans × $5/mo average ARPU |
| Capricast take per creator | $50–$240/mo | At 5–8% of median creator GMV |
| Target gross margin at scale | 70–80% | Higher Stream + R2 storage costs than Selfprime's all-text product |
| LTV target (per creator) | $2,400 (24-month median lifespan) | Net of churn; creators are stickier than consumers once revenue flows |
| CAC budget (when paid gate met) | ≤$400 (LTV/CAC ≥ 6:1) | Conservative; B2B-of-1 standard is 3:1 |
| Path to first $1k MRR (Capricast take) | 10–20 paying creators at median GMV | Achievable via design partners + their direct peer referrals |
| Path to first $10k MRR | 100–200 paying creators | One earned channel × 12 months × measurable conversion |
| Path to first $100k MRR | 1,000–2,000 paying creators | Earned + paid both running, partnership-listed |

⏳ Operator confirms take rate at design-partner calls. The economics flip from "feasible" to "great" if creators are willing to pay a small fixed fee *plus* take rate (Patreon's model) — that's the test.

---

## 5. Built-in growth hooks (creator-specific)

How this cell makes Capricast self-market:

| Hook | Mechanism | Distribution leverage |
|---|---|---|
| **Creator-branded paywall** | Every checkout → creator's brand, creator's logo, creator's URL — Capricast is a discreet footer | Fan sees "powered by Capricast" → fan who is also a creator clicks through |
| **Embed player** | Creator drops `<script>` on their existing site → every play surface = Capricast brand impression + lead capture for fans | Each creator's site = ongoing distribution surface |
| **Per-creator subdomain or branded route** | `{handle}.capricast.com` or `capricast.com/{handle}` — creator's surface lives in our SEO graph | Creator catalog pages compound the platform's domain authority |
| **Referral compounding** | Creator invites peer → both get reduced platform take rate for N months; commission on referred paid GMV | Niche creators trust peer recs more than ads |
| **Public catalog / discover** | Searchable creator directory by niche; viewer-side surface | Inbound viewers route to the creator; high switching cost once dependent |
| **Revenue transparency widget** | Creator can opt to publish anonymized revenue numbers ("$X MRR on Capricast") → social proof for next creator cohort | Builder-coded audience consumes "indie revenue numbers"; each opted-in creator = recruitment surface |
| **Dogfood-on-Capricast** | Capricast's own marketing videos live on Capricast as paid-for "platform deep-dive" content | Demonstrates the model; creator candidates see it working before signing up |
| **Co-marketing video engine** | Each new feature shipped auto-produces a "what changed this week" video for creators' dashboard inbox | Creators become Capricast's voice on their channels when they share platform updates with their fans |

Pattern: **each paying creator = one new distribution node** (same flywheel logic as Selfprime practitioner; different audience, different artefacts).

---

## 6. Build-stop threshold

**"Ready-to-sell" non-negotiables for the creator cell:**

| # | Capability | Status |
|---|---|---|
| 1 | Creator onboarding (Stripe Connect + first video paywall published in <30 min) | ⏳ verify shipping — Phase 4 monetization claims this works |
| 2 | Per-creator brand (logo, name, footer-only Capricast presence) | ⏳ confirm |
| 3 | Patreon importer (OAuth + bulk-sub migration) | ❌ likely not shipped; verify |
| 4 | Email lifecycle / drip running (PR 3a-equivalent for Capricast) | ❌ not shipped |
| 5 | Funnel dashboard live + per-creator cohort retention visible | ⏳ — monetization-funnel-spec exists; dashboard surface ⏳ |
| 6 | Embed player + per-creator subdomain | ❌ likely not shipped; verify |
| 7 | One weekly outbound rhythm on ≥1 earned channel (YouTube or X) | ❌ pending |
| 8 | At least 3 design partners using product daily and getting paid through it | ❌ first domino, target 2026-08-30 (after Selfprime first domino lands) |

**% shipping today:** ~30% (engine-rich, customer-empty — most "ready-to-sell" gaps are *go-to-market*, not engineering).

**Sell-mode start (for this cell):** **2026-09-15** — explicitly after Selfprime practitioner cell ships and shows traction. Per portfolio priority, Capricast does not consume operator attention until Selfprime is shipping.

---

## 7. Quarterly gate

- **Next review:** 2026-08-17 (same gate cycle as the rest of the matrix)
- **Graduate-to-`earned_active`:** ≥3 design partners with live revenue through Capricast + ≥10 published artefacts on ≥1 earned channel
- **Graduate-to-`paid_ready`:** ≥30 paying creators, D90 retention ≥80%, median creator GMV ≥$500/mo
- **Sunset / kill threshold:** <3 paying creators at 2026-11-17 review **and** zero net new creator GMV in trailing 30 days **OR** operator's belief check ([`M1_M2_CATALOG`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md) §2.3) lands as "I don't believe in Capricast anymore"
- **Owner:** @adrper79-dot

Per portfolio priority, Capricast gets sunsetted before Cipherofhealing or XicoCity if the cohort doesn't form. The engine remains as a Selfprime monetization reference (the contract is already adopted — [`SELFPRIME_MONETIZATION_CONTRACT.md`](../../capricast/SELFPRIME_MONETIZATION_CONTRACT.md)).

---

## 8. What we don't know yet (autonomous-system commitments to learn)

Each is a job the supervisor loop runs without operator intervention:

| # | Question | Mechanism |
|---|---|---|
| 1 | Which sub-segment (A trade-skill / B narrow-niche analyst / C movement-craft / D cross-product overflow) converts best? | Sub-segment-tagged outreach campaigns × 30 days; cohort retention picks winner |
| 2 | Is the wedge "Patreon refugee" or "YouTube sub-scale" or "platform-fragmented stack consolidation"? | A/B headline test on landing page; the loop declares winner |
| 3 | 5% or 8% take rate? | Sequential price-point A/B post first 20 paying creators (per [`CONSTITUTION §8`](../CONSTITUTION.md#8-experimentation-discipline) discipline) |
| 4 | Is YouTube or X the better earned bet for reaching niche creators? | 4-week parallel test, same script, different format; reply-to-CTA conversion picks winner |
| 5 | Does the "workmanlike, not parasocial" register actually land, or do creators flinch from being told they're not artists? | Voice gate A/B — `capricast:creator` variant vs softer fallback; reply-engagement signal picks winner |
| 6 | Is Capricast a standalone GTM, or should it pivot to "powered-by" infrastructure for Selfprime + XicoCity? | If 6-month cohort fails graduation gate, pivot decision goes to operator (Tier 3 escalation per [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md)) |
| 7 | Does Patreon's next pricing/policy change drive a refugee wave we can capture? | Continuous monitoring of Patreon news + signal-mining via [`packages/social/`](../../../packages/social/); the loop pre-stages comparison content for the next event |

⏳ Operator commits dates only if these mechanisms underperform — otherwise the loop runs them on its own.

---

## 9. Cross-references

- [`capricast.md`](./capricast.md) — product parent
- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — global plan
- [`CONSTITUTION.md`](../CONSTITUTION.md) — non-negotiable rules
- [`VOICES.md`](../VOICES.md) — `capricast:creator` profile spec
- `xicocity-creator` — sister-product creator cell (ICP file pending; positioning lives in [`VOICES.md`](../VOICES.md) `xicocity_creator`); differentiation note in [`capricast.md`](./capricast.md)
- [`selfprime-practitioner.md`](./selfprime-practitioner.md) — same structural template; the practitioner-of-1 column shares this play pattern across products
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-3--capricast-capricast-repo) — paired operator worksheet (blank — that's the unknown)
- [`docs/capricast/SELFPRIME_MONETIZATION_CONTRACT.md`](../../capricast/SELFPRIME_MONETIZATION_CONTRACT.md) — monetization event contract (creator_id ↔ practitioner_id mapping)
- [`docs/capricast/monetization-funnel-spec.md`](../../capricast/monetization-funnel-spec.md) — 12-event funnel
- [`docs/capricast/creator-onboarding-ops.md`](../../capricast/creator-onboarding-ops.md) — Stripe Connect onboarding runbook
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — voice registration target
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — outreach engine (warm path required; cold mass outbound denied per CONSTITUTION §5)
- [`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/) — automated video factory; Capricast eats its own dogfood
- [`packages/analytics/`](../../../packages/analytics/) — `MonetizationEvent` schema
- [`.claude/.../memory/project_capricast_rename.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_capricast_rename.md) — videoking → capricast lineage

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | Initial — creator cell, 4 sub-segments incl. cross-product overflow (D); hypothesis-level; falsifiable wedges; explicit kill criteria; gated *after* Selfprime first domino per portfolio priority. |
