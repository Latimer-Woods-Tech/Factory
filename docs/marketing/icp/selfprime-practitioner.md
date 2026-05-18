# `selfprime:practitioner` — ICP

**Product:** Selfprime · **Audience archetype:** Practitioner-of-1 (astrologer / HD reader / multi-modal chart practitioner) · **Readiness state:** 🟡 `discovery` · **Priority:** #1 — *first domino*

> Parent: [`selfprime.md`](./selfprime.md) · Matrix cell: row "Selfprime" × col "Practitioner-of-1" · Voice: `prime_self:practitioner`

---

## 1. Positioning

**One sentence:**
> Selfprime is the practitioner's co-pilot — chart prep that takes 20 minutes instead of 90, in your voice, ready to send to the client.

**3 differentiators:**
1. **Your voice, not the app's.** The brand-voice gate ([`@lwt/validation`](../../../packages/validation/)) means Selfprime drafts in *your* tone, not in generic-astrology-app voice. Practitioners fear AI flattening their distinct practice; this is the answer.
2. **Practitioner-branded outputs.** Every client report is your brand, your logo, your byline — Selfprime is a discreet footer. Selfprime is your tool, not your competition.
3. **Built for the business, not just the reading.** Scheduling, intake, follow-up, newsletter substrate — the things you don't have a system for. Chart-engine apps stop at the chart.

**Incumbents we're displacing:**
- TimePassages, Solar Fire, Astro.com, Janus, Sirius — chart-engine apps. We're not better at math; we're better at the *workflow around the math.*
- Notion templates + Calendly + Mailchimp + Stripe duct-tape stacks. We're a coherent surface.
- "I do everything manually." Selfprime is the first time saying "an AI helps me prep" feels professional, not lazy.

---

## 2. Customer (M1)

### ICP profile

**One-sentence ICP:**
> Working astrology / Human Design / multi-modal practitioner, 30–55 y/o, runs solo or with 1–2 collaborators, charges $80–$300 per reading, has 20–200 active clients, struggles to scale because every reading takes 60–120 minutes of prep.

**Sub-segments (system tests in parallel; data picks the winner):**

| Sub | Description | Where to find them |
|---|---|---|
| **A. Pure astrologers** | Trained at Demetra George / Steven Forrest / Astrology Hub / NCGR / ISAR. Often Hellenistic, traditional, or evolutionary lineage. | The Astrology Podcast (Chris Brennan) audience, TMA subscribers, UAC/ISAR/NCGR conference rosters |
| **B. Human Design readers** | Trained at Jovian Archive, IHDS, Genetic Matrix communities. Often crossover into astrology. | Jovian Archive forums, HD podcast guests, Genetic Matrix course alumni |
| **C. Multi-modal practitioners** | "I read charts + tarot + energy work + coaching." Often coaches who added astrology as a service. | Substack astrology newsletters, Instagram practitioner accounts, Astrology Hub course alumni |

System runs sub-segment A/B/C tests in parallel with separate UTM tags; cohort retention picks the priority order. No operator decision required.

### Pain solved today (from the practitioner's perspective)

| Pain | Cost today | Selfprime resolution |
|---|---|---|
| Chart prep takes 60–120 min per client | 4-6 client cap per day → MRR cap | Voice-aligned draft in <5 min → 12+ clients/day possible |
| Recap notes after the call get pushed to "later" → never written | Lost rebook opportunities, no longitudinal client thread | Auto-drafted recap; practitioner edits and sends |
| Newsletter to past clients → never sent because "I have nothing to say" | Inactive list → low rebook rate | Transit-aware newsletter drafted weekly in your voice; one click to send |
| Marketing themselves → "I'm a practitioner, not a marketer" | Plateau at the friend-of-friend ceiling | Practitioner directory, branded shareables, embed widgets |
| Pricing — undercharging because they don't have business framing | $80 readings instead of $200 | Built-in pricing benchmarks + tier templates |
| Software sprawl: Calendly + Stripe + Notion + Mailchimp + Astro.com + manual chart wheels | Subscription bloat + cognitive load | One surface |

### Why they switch from incumbents

| Incumbent reason for stickiness | Selfprime answer |
|---|---|
| "Astro.com's chart math is the standard" | We use industry-standard math (Swiss Ephemeris). We don't compete on math; we compete on workflow. |
| "My current stack works" | Show that prep-time savings = 1 extra client/day = $200+/day = pays for the highest tier in a single session. |
| "I don't want AI in my practice" | Voice gate. You see every draft before it's sent. AI prepares, you decide. |
| "My clients won't like AI involvement" | Client never sees AI — they see your branded report in your voice. The AI is invisible. |
| "What if I become dependent?" | Export everything anytime. No lock-in. (This is true and built-in.) |

### Last ICP conversation

⏳ **Bootstrap goal:** complete 5 Zoom calls with design partners within 30 days of PR 1 merge. Operator's only manual marketing touch in the bootstrap loop.

---

## 3. Channel hypothesis

Per [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates).

### 3.1 Owned

| Channel | Engine | Plan |
|---|---|---|
| **Product** | Selfprime app | Onboarding flow audit — does first session of using it on a real client save ≥30 min vs current workflow? |
| **Email lifecycle** | [`@lwt/email`](../../../packages/email/) + drip sequencer (PR 3a) | 6-step practitioner nurture: welcome → workflow audit prompt → first chart-prep tutorial → branded-shareable demo → pricing benchmarks → trial-to-paid |
| **Practitioner directory at `selfprime.net/find`** | (deferred to post-PR 3) | Inbound client discovery for paid practitioners; SEO surface |
| **SEO long-tail** | [`@lwt/seo`](../../../packages/seo/) + content publisher | "How to prep [chart-type] in [duration]," "Astrology client intake template," "Pricing chart readings 2026" |

### 3.2 Earned

| Channel | Engine | Plan |
|---|---|---|
| **The Astrology Podcast (Chris Brennan)** | Manual outreach via `@lwt/crm` warm path | Sponsorship + guest pitch (operator on episode if invited; otherwise system-driven sponsorship). Highest concentration of practitioner audience. |
| **Astrology Hub partnerships** | Manual outreach | Recommended-tools listing; summit sponsorship; course-platform integration |
| **The Mountain Astrologer (TMA)** | Manual outreach | Advertorial + practitioner case studies |
| **Long-form YouTube** | [`packages/video/`](../../../packages/video/) + topic queue from PR 3g | 1 video/week. Framing: "What I'd tell my pre-Selfprime self about [topic]." Hook practitioners by demonstrating *workflow*, not features. |
| **LinkedIn posts** | [`@lwt/social`](../../../packages/social/) post-PR 3f | 3 posts/week in `prime_self:practitioner` voice. ICP overlap with LinkedIn is real (many practitioners came from corporate). |
| **Substack syndication** | Via [`@lwt/email`](../../../packages/email/) | Weekly transit-aware essay; cross-posted to Substack for SEO + standalone subscribers |
| **Podcast tour** | Manual outreach via `@lwt/crm` | Target: Astrology Bytes, Astrology Hub Podcast, Ghost of a Podcast (Jessica Lanyadoo), Pleiadian / lineage-specific shows |
| **Reddit r/AskAstrologers** | [`@lwt/social`](../../../packages/social/) reply-only mode | Reply to genuine practitioner-business questions; never post promotional |

### 3.3 Paid

**Paid readiness gate: NOT MET.** No paid spend until ≥3 months of cohort retention from the 5 design partners + their downstream signups.

When gate met:
- Likely first: LinkedIn ads to "Coach + Astrologer" job titles in major US/CA metros
- Likely second: podcast sponsorships (paid placement on shows we couldn't earn into)

---

## 4. Pricing + economics

| Field | v0 hypothesis | Notes |
|---|---|---|
| Pricing model | Tiered subscription | Free chart calc / $9 consumer / **$99/mo practitioner** / $299/mo studio |
| Target ARPU (practitioner tier) | $99/mo | Or annual $990 with 2-month-equivalent discount |
| Target gross margin at scale | 85–90% | Mostly LLM cost; per-practitioner Anthropic spend at scale ~$5–15/mo |
| LTV target | $1,800 (18-month median lifespan) | Net of churn |
| CAC budget (when paid gate met) | ≤$300 (LTV/CAC ≥ 6:1) | Conservative; SaaS standard is 3:1 |
| Path to first $1k MRR | 10 paying practitioners | Achievable via design partners + their direct peer referrals |
| Path to first $10k MRR | 100 paying practitioners | One earned channel × 12 months × measurable conversion |
| Path to first $100k MRR | 1,000 paying practitioners | Earned + paid both running, partnership-listed |

⏳ Operator confirms pricing at design-partner Zoom calls.

---

## 5. Built-in growth hooks (practitioner-specific)

How this cell makes Selfprime self-market:

| Hook | Mechanism | Distribution leverage |
|---|---|---|
| **Practitioner-branded shareables (3h)** | Every client reading → beautiful PDF/web page branded to the practitioner with discreet Selfprime footer | Client forwards to friends → friend lands on Selfprime → finds a practitioner via directory |
| **Embed chart calc (3i)** | Practitioner drops `<script>` on their site → every chart calc on their site = lead capture + Selfprime brand impression | Each practitioner site = ongoing distribution surface |
| **Referral compounding (3j)** | Practitioner invites peer → both get 3 months free; commission on referred paid signups | Sole practitioners trust peer recs more than ads |
| **Newsletter substrate** | Practitioner writes 2 sentences; Selfprime renders transit-aware weekly newsletter | Each practitioner-list email = brand impression in the footer |
| **Public reading library** | Practitioner can publish (with client consent) example reads at `selfprime.net/r/{slug}/{reading-id}` | Becomes their portfolio + Selfprime SEO surface |
| **Practitioner directory** | Listed at `selfprime.net/find` searchable by specialty, language, modality | Inbound clients route to the practitioner; high switching cost once dependent |
| **Booking + intake** | Stripe Connect; we keep 5%; they get scheduling + intake + reading-aid integrated | Once payments flow through Selfprime, churn cost compounds |
| **Co-marketing content engine** | Each transit event auto-produces a Reel + post + email; practitioner one-clicks to publish from their dashboard | Practitioner becomes Selfprime's voice on their channels |

Pattern: **each paying practitioner = one new distribution node**.

---

## 6. Build-stop threshold

**"Ready-to-sell" non-negotiables for the practitioner cell:**

| # | Capability | Status |
|---|---|---|
| 1 | Chart calc + AI-drafted reading in practitioner voice | ⏳ verify shipping today |
| 2 | Practitioner-branded shareables (PR 3h) | ❌ not shipped |
| 3 | Email lifecycle / drip running (PR 3a) | ❌ not shipped |
| 4 | Funnel dashboard live + cohort retention visible | ❌ pending T3.3 ship 2026-05-22 |
| 5 | One weekly outbound rhythm on ≥1 earned channel (LinkedIn or YouTube) | ❌ pending PR 3f |
| 6 | At least 5 design partners using product daily | ❌ first domino, target 2026-06-30 |

**% shipping today:** ~20%.

**Sell-mode start (for this cell):** **2026-07-15** — after PR 3a/3b/3c bottleneck cluster ships + design partners onboard + dashboard live.

---

## 7. Quarterly gate

- **Next review:** 2026-08-17
- **Graduate-to-`earned_active`:** ≥5 design partners + ≥10 published artefacts on ≥1 earned channel
- **Graduate-to-`paid_ready`:** ≥30 paying practitioners with D90 retention ≥75%
- **Sunset / kill threshold:** <5 paying practitioners at 2026-11-17 review **and** zero net new in trailing 30 days
- **Owner:** @adrper79-dot

---

## 8. What we don't know yet (autonomous-system commitments to learn)

Each is a job the supervisor loop runs without operator intervention:

| # | Question | Mechanism |
|---|---|---|
| 1 | Which sub-segment (A pure astro / B HD / C multi-modal) converts best? | Sub-segment-tagged outreach campaigns × 30 days; cohort retention picks winner |
| 2 | Does "AI-prep saves you 60 min/client" land or scare them? | A/B headline test on landing page; the loop declares winner |
| 3 | $99/mo or $79/mo for practitioner tier? | Sequential price-point A/B post first 30 paying practitioners (per [`CONSTITUTION.md §8`](../CONSTITUTION.md#8-experimentation-discipline) discipline) |
| 4 | Is LinkedIn or YouTube the better earned bet? | 4-week parallel test, same script, different format; reply-to-CTA conversion picks winner |
| 5 | What does "AI tells practitioners to grow their business" actually look like in current LLM outputs? | LLM-rank tracker (PR 3l) queries weekly; gap-fill content prioritized by topic queue |

⏳ Operator commits dates only if these mechanisms underperform — otherwise the loop runs them on its own.

---

## 9. Cross-references

- [`selfprime.md`](./selfprime.md) — product parent
- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — global plan
- [`CONSTITUTION.md`](../CONSTITUTION.md) — non-negotiable rules
- [`VOICES.md`](../VOICES.md) — `prime_self:practitioner` profile spec
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-1--selfprime-humandesign-repo-selfprimenet) — paired operator worksheet
- [PR 3h brief](../pr3-briefs/3h-shareables.md) · [PR 3i brief](../pr3-briefs/3i-embed-worker.md) · [PR 3j brief](../pr3-briefs/3j-referrals.md) — the growth hooks
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — current voice
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — outreach engine (warm path required; cold mass outbound denied per CONSTITUTION §5)
- [`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/) — automated video for the earned-channel rhythm

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | Initial — practitioner cell, 3 sub-segments, autonomous-loop commitments to learn |
