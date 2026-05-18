# `cypher:practitioner` — ICP

**Product:** Cypher of Healing (`cipherofhealing.com`) · **Audience archetype:** Practitioner-of-1 (healer / coach / therapist / body-worker / energy practitioner) · **Readiness state:** ⏳ queued → 🟡 `discovery` (on ICP-file merge) · **Priority:** #6 (per [`ICP_MATRIX.md`](../ICP_MATRIX.md#priority-order-rolling))

> Sibling cell: `cypher-seeker` (consumer audience — ICP file pending; positioning in [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) `cypher_healing` voice profile) · Matrix cell: row "Cypher of Healing" × col "Practitioner-of-1" · Voice: `cypher_practitioner` (sibling of `cypher_seeker`, formerly `cypher_healing`) · Regulated-vertical cell — see §3.4

---

## 1. Positioning

**One sentence:**
> Cypher is the practitioner's quiet companion — client journals, session prep, and longitudinal pattern notes that hold your container without replacing it.

**3 differentiators:**
1. **Container-honoring, not therapist-replacing.** The product is positioned as a *between-session* tool for the client and a *prep + recall* tool for the practitioner. It does not generate therapeutic interpretations, dosing protocols, or modality-specific interventions. The brand-voice gate ([`@lwt/validation`](../../../packages/validation/)) blocks any output that breaks therapeutic frame ("guru," "expert," "diagnosis"). Practitioners fear AI flattening their modality; this is the answer.
2. **Healing-journey vocabulary, not optimization vocabulary.** Cypher's `cypher_practitioner` voice avoids "hustle," "grind," "quick fix," "biohack," and anything that frames clients as projects. Many incumbents (productivity-stack-for-coaches tools) carry corporate residue that healers and therapists actively recoil from.
3. **Compliance-first by construction.** No efficacy claims, no medical advice, no insurance-billing fields, no HIPAA-regulated data flows unless the practitioner explicitly opts into the BAA-gated tier (queued, not 2026). Practitioners can hand the tool to clients without legal review.

**Incumbents we're displacing:**
- SimplePractice, Practice Better, TheraNest — clinical-practice-management tools. We're not better at SOAP notes; we're better at the *between-session continuity* their tools don't touch.
- Notion templates + Google Docs + voice-memo apps — duct-tape stacks practitioners assemble themselves.
- "I do everything in a paper journal." Cypher is the first time saying "a tool helps me remember our last six sessions" feels respectful of the work, not clinical.
- General coaching apps (CoachAccountable, Paperbell) — they don't speak healing-language and they assume billable-hour framing.

---

## 2. Customer (M1)

### ICP profile

**One-sentence ICP:**
> Working healer / coach / therapist / body-worker, 32–60 y/o, runs solo or in a 2–4 practitioner collective, charges $90–$280 per session, has 15–80 active clients, struggles with longitudinal recall and between-session client engagement, and is allergic to anything that feels like SaaS-for-CEOs.

**Sub-segments (system tests in parallel; cohort retention picks the winner):**

| Sub | Description | Where to find them |
|---|---|---|
| **A. Licensed therapists adding modalities** | LMFT / LCSW / LPC who trained in IFS, Somatic Experiencing, EMDR, or psychedelic-assisted therapy. Often in private practice. Hold an active license; need compliance-aware tools. | IFS Institute community, Somatic Experiencing International (SEI), MAPS practitioner cohort, Psychotherapy Networker conferences, Therapy Chat podcast audience |
| **B. Unlicensed coaches + healers** | Trained in coaching schools (CTI, iPEC), energy work (Reiki I/II/Master), Human Design coaching, breathwork facilitation, plant-medicine integration coaches. No clinical license; explicitly non-clinical positioning. | Insight Timer instructors, Aubrey Marcus / Tim Ferriss healer-guest audiences, Pixie Lighthorse & Sophie Strand Substack readers, healer Discords, Instagram healing-practitioner accounts |
| **C. Body-workers + somatic practitioners** | Massage therapists (LMT), structural integration practitioners, somatic experiencing facilitators, craniosacral, Feldenkrais. Touch-based modalities with session-by-session continuity needs. | USABP, EABP, Rolf Institute alumni, Feldenkrais Guild, modality-specific conferences, AMTA membership |

System runs sub-segment A/B/C tests in parallel with separate UTM tags + landing-page variants; cohort retention picks priority order. Note: sub-segment A has the highest compliance overhead (HIPAA-aware) and the highest willingness-to-pay; sub-segment B has the lowest overhead and the widest TAM; sub-segment C is the warmest cultural fit for the cypher voice. No operator decision required at this stage.

### Pain solved today (from the practitioner's perspective)

| Pain | Cost today | Cypher resolution |
|---|---|---|
| "I can't remember what we explored 4 sessions ago." | Repeated ground, client loses faith in continuity | Longitudinal client thread with practitioner-tagged themes; surfaced at session-prep time |
| Pre-session prep is a 15-min scramble through paper notes + memory | 10–20 min/session lost; reduced presence in the session | 5-min structured prep card in your voice; flagged patterns + open threads |
| Between-session client drift — "what did we agree on?" | Clients lose momentum; no-shows climb | Optional client-facing journal prompts (practitioner-curated); never auto-sent without consent |
| Recap notes for the client → never written | No artefact of the work; rebook rate suffers | Auto-drafted recap; practitioner edits and chooses whether to send |
| Marketing themselves — "I'm a healer, not a marketer" | Plateau at the friend-of-friend ceiling | Practitioner directory (post-PR equivalent of selfprime's `/find`); voice-aligned newsletter substrate |
| Pricing — undercharging because healing work has a martyrdom default | $80 sessions instead of $180 | Built-in pricing benchmarks by modality + region; tier templates |
| Software sprawl: Acuity + Square + Notion + paper journal + Voxer + voice memos | Subscription bloat + cognitive load + boundary leakage | One surface; explicit boundaries around client-data access |

### Why they switch from incumbents

| Incumbent reason for stickiness | Cypher answer |
|---|---|
| "SimplePractice is HIPAA-compliant" | Cypher is **not** a HIPAA replacement for clinical use. We're explicit about scope. For sub-segment A practitioners, Cypher supplements clinical EHR; doesn't replace it. The BAA tier is queued for 2027 — not promised, not sold. |
| "I don't trust AI in healing work" | Voice gate. Every output passes container-respecting rules before the practitioner sees it. Practitioner reviews every recap before sending. AI prepares; the practitioner holds. |
| "My clients won't like AI involvement" | Disclosure-first. Practitioners decide what (if anything) clients see is AI-assisted. The default mode is **AI-invisible to the client** — the practitioner uses Cypher; the client experiences continuity. |
| "What if it generates something harmful?" | Therapeutic-frame rules block diagnosis, medical advice, efficacy claims, and modality-specific intervention generation at the voice gate. The block list is published in [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) `BRAND_PROFILES['cypher_practitioner']`. |
| "I've already paid for [incumbent] this year" | Import path from CSV + standard EHR exports. No annual lock-in on our side. |

### Last ICP conversation

⏳ **Bootstrap goal:** complete 5 60-min calls with practitioner design partners within 60 days of cell promotion to `discovery`. Cypher's regulated-vertical posture means a slower bootstrap than `selfprime:practitioner` is correct, not concerning. Recruit via sub-segment B and C first; sub-segment A waits until BAA tier scope is decided.

---

## 3. Channel hypothesis

Per [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates) and §6 (compliance). Regulated-vertical extra rules in §3.4 below.

### 3.1 Owned

| Channel | Engine | Plan |
|---|---|---|
| **Product** | Cypher app at `cipherofhealing.com` | Onboarding flow audit — does first prep card save ≥10 min vs current workflow? Does a recap draft feel like *the practitioner wrote it*? |
| **Email lifecycle** | [`@lwt/email`](../../../packages/email/) + drip sequencer (PR 3a) | 6-step practitioner nurture: welcome → container-honoring framing → first prep-card walkthrough → client-journal opt-in mechanics → pricing benchmarks → trial-to-paid. Every step passes the `cypher_practitioner` voice gate. |
| **Practitioner directory** | (deferred to post-`earned_active`) | Inbound client discovery for paid practitioners; SEO surface. Requires modality taxonomy + licensing-claim moderation (compliance work). |
| **SEO long-tail** | [`@lwt/seo`](../../../packages/seo/) + content publisher | "Client recall for body-workers," "Between-session journaling prompts," "Ethics of AI in healing practice." Every published artefact passes voice gate + a regulated-vertical lint (no efficacy claims). |

### 3.2 Earned

| Channel | Engine | Plan |
|---|---|---|
| **Therapy Chat podcast (Laura Reagan)** | Manual outreach via [`@lwt/crm`](../../../packages/crm/) warm path | Guest pitch on "AI in trauma-informed practice without breaking the container." Highest-credibility entry to sub-segment A. |
| **IFS Institute community** | Manual outreach; **no posting in private spaces without admin consent** | Newsletter sponsorship; conference exhibitor; never astroturf inside the community per [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates) denylist. |
| **Somatic Experiencing International** | Manual outreach | Practitioner-directory partnership; conference exhibitor at SE intensives. |
| **Substack syndication** | Via [`@lwt/email`](../../../packages/email/) | Cross-post to Pixie Lighthorse / Sophie Strand / Liz Tran-adjacent audiences. Essay format: "What I tell my pre-Cypher self about session continuity." |
| **Insight Timer (for instructors)** | Manual partnership | Recommended-tools listing for the meditation-teacher cohort that overlaps with sub-segment B. |
| **Modality conferences** | Manual outreach via [`@lwt/crm`](../../../packages/crm/) | USABP, EABP, Reiki conventions, IFS Annual Conference, SE Intensive gatherings. Exhibitor + sponsored workshop on "tools that hold your container." |
| **Long-form YouTube** | [`packages/video/`](../../../packages/video/) + topic queue from PR 3g | 1 video / 2 weeks (slower cadence than selfprime — healing audience rewards depth over frequency). Framing: practitioner-to-practitioner, never "how to scale your healing business." |
| **Podcast tour** | Manual outreach via [`@lwt/crm`](../../../packages/crm/) | Therapy Chat, Aubrey Marcus Podcast (selectively), The Trauma Therapist Podcast, Embodied (NPR), Many Minds. Skip pure-hustle shows. |
| **Reddit r/AskTherapists, r/somaticexperiencing** | [`@lwt/social`](../../../packages/social/) reply-only mode | Reply to genuine practitioner questions; never post promotional. Same rule as `selfprime:practitioner`. |

### 3.3 Paid

**Paid readiness gate: NOT MET.** Per [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates): no paid spend on a cell until ≥3 months cohort retention data exists. Additionally for this cell: no paid spend in healing-adjacent verticals until §3.4 compliance gates are passed.

When gate met (earliest realistic: 2027-Q1):
- Likely first: podcast sponsorships on shows we couldn't earn into (Therapy Chat, On Being-adjacent, Tara Brach).
- Likely second: Substack boosts on aligned newsletters (Pixie Lighthorse, Sophie Strand, Liz Tran).
- **Forbidden in this cell:** Meta + Google paid search until a healthcare-advertising legal review is on file. ([`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance) and ad-platform policies for wellness verticals both flag this.)

### 3.4 Regulated-vertical compliance (cell-specific)

This subsection is unique to `cypher:practitioner` and `cypher:clinic`. It supplements [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance), it does not replace it.

| Rule | Mechanism | Enforcement |
|---|---|---|
| **No efficacy claims** in any practitioner-facing copy. No "reduces anxiety," "treats trauma," "improves outcomes by X%." | `cypher_practitioner` voice profile `blockedTerms`: `treat`, `cure`, `diagnose`, `outcomes`, `efficacy`, `clinically proven`, `evidence-based`, `medical-grade` | Voice gate at [`packages/validation/`](../../../packages/validation/); critical issue blocks publication |
| **No medical advice** generated for clients or practitioners. The LLM does not synthesize symptom checklists, dosing schedules, or treatment plans. | System-prompt instruction baked into `cypher_practitioner` generation path; output reviewed at gate | Critical issue blocks publication; logged for retro |
| **No insurance-billing fields** in product UI. No CPT codes, no superbill auto-generation. | Product scope decision — explicit non-feature | Documented in `cypher-healing` repo PR template |
| **No HIPAA-regulated data flows in 2026.** Client journals tagged as **non-clinical reflective notes**; ToS makes the boundary explicit; product blocks practitioners from inputting diagnoses or medication info via lint at save time. | DB-level constraint on `client_notes.content` (regex deny-list); ToS gate at signup | Save fails; user sees explanation linking to clinical-EHR alternatives |
| **FDA-aware language for any wellness claim.** Supplements, plant-medicines, breathwork — no claims about treating any disease. | Voice gate; legal review queue for net-new claim copy | Tier-3 escalation per [`CONSTITUTION.md §4`](../CONSTITUTION.md#4-approval-tiers) |
| **Practitioner self-attestation** at signup: "I am not using Cypher to store PHI as defined under HIPAA." | Signup gate | Hard gate; non-attestation = no account |
| **No ad-targeting** on health conditions, mental-health status, or substance use, ever. | Ad-platform exclusion lists; audit at campaign launch | Tier-3 block + escalation |
| **Disclosure of AI involvement** on any practitioner-facing artefact where the platform requires it. | Per [`CONSTITUTION.md §9`](../CONSTITUTION.md#9-honesty--truth) honesty rules + Substack AI tag | Auto-applied by publishing pipeline |

If any rule above can't be enforced by code at the time the cell graduates to `earned_active`, the cell stays in `discovery`. No exceptions.

---

## 4. Pricing + economics

Numbers are **conservative** vs `selfprime:practitioner`: regulated vertical → slower bootstrap → smaller addressable cohort at any given time → longer payback. Operator validates at design-partner calls.

| Field | v0 hypothesis | Notes |
|---|---|---|
| Pricing model | Tiered subscription | Free reflective journal / **$79/mo practitioner** / **$249/mo clinic** (2–4 seats) / BAA tier TBD |
| Target ARPU (practitioner tier) | $79/mo | Annual $790 with 2-month-equivalent discount; healing audience often pays annually |
| Target gross margin at scale | 80–85% | Slightly below `selfprime:practitioner` due to (a) higher moderation cost, (b) lower LLM-throughput per practitioner |
| LTV target | $1,200 (15-month median lifespan) | Conservative; healing audience either commits long or churns at month 2 — bimodal |
| CAC budget (when paid gate met) | ≤$200 (LTV/CAC ≥ 6:1) | Tighter than `selfprime:practitioner` because compliance overhead is a fixed tax |
| Path to first $1k MRR | 13 paying practitioners | Achievable via 5 design partners + their peer referrals within ~120 days of cell promotion |
| Path to first $10k MRR | 127 paying practitioners | One earned channel (podcast or modality-conference) × 12 months × measurable conversion |
| Path to first $100k MRR | 1,265 paying practitioners | Earned + paid both running; partnership-listed; BAA tier may exist by then for sub-segment A |

⏳ Operator confirms pricing at design-partner Zoom calls. Pricing A/B (e.g. $79 vs $89) deferred until first 30 paying practitioners per [`CONSTITUTION.md §8`](../CONSTITUTION.md#8-experimentation-discipline).

---

## 5. Built-in growth hooks (Cypher-specific application of the portfolio hook set)

How this cell makes Cypher self-market, while honoring the container:

| Hook | Mechanism | Distribution leverage |
|---|---|---|
| **Practitioner-branded recap (Cypher-flavored 3h)** | Every session recap → quiet, well-typeset PDF or web page branded to the practitioner; discreet Cypher footer | Client may share with their own therapist / coach / spouse — never auto-shared; share is the *client's* choice |
| **Voice-aligned newsletter substrate** | Practitioner writes 2 sentences; Cypher renders a healing-journey-themed weekly note in their voice | Each practitioner-list email = brand impression in the footer; opt-out one-click |
| **Referral compounding (3j)** | Practitioner invites peer → both get 3 months free; commission on referred paid signups capped per FTC disclosure rules | Sole practitioners in healing trust peer recs more than ads — even more than in astrology |
| **Modality-tagged practitioner directory** | Listed at `cipherofhealing.com/find` searchable by modality, region, language, modality-lineage | Inbound clients route to the practitioner; high switching cost once dependent |
| **Public reflection library** | Practitioner can publish (with explicit client consent) example reflective threads at `cipherofhealing.com/r/{slug}/{thread-id}` | Becomes their portfolio + Cypher SEO surface; consent is a hard gate, not a checkbox-default |
| **Co-marketing content engine** | Each seasonal turn / moon phase / cultural-healing-moment auto-produces a draft Reel + post + email; practitioner one-clicks to publish | Practitioner becomes Cypher's voice on their channels — *only on opt-in* |
| **Embed reflective-journal prompt (Cypher-flavored 3i)** | Practitioner drops `<script>` on their site → every prompt = lead capture + Cypher brand impression | Each practitioner site = ongoing distribution surface |
| **Container-honoring booking + intake** | Stripe Connect; we keep 5%; practitioner gets scheduling + intake + intention-setting integrated | Once payments flow through Cypher, churn cost compounds — but never billing for insurance |

Pattern: **each paying practitioner = one new distribution node**, with consent and container-honoring as the structural gates.

---

## 6. Build-stop threshold

**"Ready-to-sell" non-negotiables for the practitioner cell:**

| # | Capability | Status |
|---|---|---|
| 1 | Reflective journal + AI-drafted prep card in `cypher_practitioner` voice | ❌ pending |
| 2 | Voice gate registers `cypher_practitioner` profile in [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) + [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) `BRAND_PROFILES` | ❌ pending — sibling to existing `cypher_healing` registration |
| 3 | Regulated-vertical lint live (blocks efficacy claims, diagnosis, medical advice at gate) | ❌ pending — extends [`packages/validation/`](../../../packages/validation/) |
| 4 | Practitioner-branded recap (Cypher 3h-equivalent) | ❌ pending |
| 5 | Email lifecycle / drip running (PR 3a) | ❌ pending — shared with selfprime cell |
| 6 | Funnel dashboard live + cohort retention visible per-cell | ❌ pending T3.3 |
| 7 | One weekly outbound rhythm on ≥1 earned channel (podcast or modality-newsletter) | ❌ pending |
| 8 | ≥5 design partners using product weekly | ❌ target ~2027-Q1 |
| 9 | Practitioner self-attestation gate at signup (PHI exclusion) | ❌ pending — regulated-vertical hard requirement |

**% shipping today:** ~5% (the Cypher app exists at `cipherofhealing.com` with 0% completion per [`M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-4--cipherofhealing-cypher-healing-repo)).

**Sell-mode start (for this cell):** **2027-Q1** — after `selfprime:practitioner` reaches `earned_active` and proves the playbook, and after regulated-vertical lint ships. Per portfolio priority: do not pull Cypher forward at the expense of Selfprime.

---

## 7. Quarterly gate

- **Next review:** 2026-08-17 (matrix-wide quarterly)
- **Graduate-to-`discovery`:** this ICP file merges + voice registration lands in [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) + [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) `BRAND_PROFILES`
- **Graduate-to-`earned_active`:** ≥5 design partners + ≥10 published artefacts on ≥1 earned channel + regulated-vertical lint live
- **Graduate-to-`paid_ready`:** ≥30 paying practitioners with D90 retention ≥70% + healthcare-advertising legal review on file
- **Sunset / kill threshold:** <5 paying practitioners at 2027-05-17 review **and** zero net new in trailing 60 days **or** any uncorrected efficacy-claim incident
- **Owner:** @adrper79-dot

---

## 8. What we don't know yet (autonomous-system commitments to learn)

Each is a job the supervisor loop runs without operator intervention once the cell is at `discovery`:

| # | Question | Mechanism |
|---|---|---|
| 1 | Which sub-segment (A licensed therapists / B unlicensed coaches / C body-workers) converts best, *net of compliance overhead*? | Sub-segment-tagged outreach campaigns × 60 days; cohort retention picks winner; compliance-cost tracked per cohort |
| 2 | Does "container-honoring" land as a differentiator or read as soft-positioning? | A/B landing-page hero test: "Quiet companion for your practice" vs "Client recall + session prep in your voice" |
| 3 | $79/mo or $89/mo for the practitioner tier? | Sequential price-point A/B post first 30 paying practitioners per [`CONSTITUTION.md §8`](../CONSTITUTION.md#8-experimentation-discipline) |
| 4 | Is podcast guesting or modality-conference exhibiting the better earned bet? | 6-month parallel test (longer than `selfprime:practitioner` because healing-audience cycles are longer); reply-to-CTA conversion picks winner |
| 5 | What does "AI in healing practice" actually look like in current LLM outputs? Where is the brand-narrative gap we can fill? | LLM-rank tracker (PR 3l) queries weekly with healing-adjacent prompts; gap-fill content prioritized by topic queue, all gated for compliance |
| 6 | Do sub-segment A practitioners actually want a BAA-tier, or do they keep clinical work in their EHR and use Cypher non-clinically? | Design-partner Zoom calls — explicit question; revisit BAA scope quarterly |
| 7 | What's the practitioner-to-client referral path? Do clients ever become design-partner recruits? | Track `cypher_seeker` → `cypher_practitioner` upgrade rate via [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) `crm_leads.user_id` join |

⏳ Operator commits dates only if these mechanisms underperform — otherwise the loop runs them on its own.

---

## 9. Cross-references

- `cypher-seeker` — sibling cell (consumer audience; ICP file pending)
- [`selfprime-practitioner.md`](./selfprime-practitioner.md) — structural template + cross-product flywheel partner
- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — the grid
- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — global plan
- [`CONSTITUTION.md`](../CONSTITUTION.md) — non-negotiable rules, especially §5 (channel allowlist) + §6 (compliance) + §9 (honesty)
- [`VOICES.md`](../VOICES.md) — `cypher_practitioner` profile spec
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-4--cipherofhealing-cypher-healing-repo) — paired operator worksheet (Product 4)
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — `cypher_healing` voice profile (parent of `cypher_practitioner`)
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `BRAND_PROFILES['cypher_healing']` (sibling for `cypher_practitioner`); warm-path outreach engine (cold mass outbound denied per CONSTITUTION §5)
- [`packages/validation/`](../../../packages/validation/) — voice gate + regulated-vertical lint extension point
- [`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/) — automated video for the earned-channel rhythm

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | Initial — practitioner cell for Cypher of Healing; 3 sub-segments (licensed therapists / unlicensed coaches / body-workers); regulated-vertical compliance subsection; conservative pricing ($79/$249); 2027-Q1 sell-mode start gated on Selfprime playbook proof + compliance lint |
