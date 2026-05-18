# Channel Doctrine

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot

> Per-ICP channel choices with reasoning. Operationalizes the channel allowlist + readiness gates in [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates). Each filled matrix cell picks from the doctrine; deviations require an ADR.

---

## 1. Channel taxonomy

Channels are classified by **leverage** (compounding vs decaying), **economics** (free / paid), and **control** (owned / earned / paid).

| Class | Compounding | Examples | Why |
|---|---|---|---|
| **Owned compounding** | ✅ | Product itself, email list, SEO content, embed widgets, practitioner directory, reading library | Survive platform changes; ROI improves over time |
| **Owned decaying** | ❌ | Push notifications, in-app announcements | Decay with attention; useful but not assets |
| **Earned compounding** | ✅ | Long-form YouTube, evergreen Substack essays, podcast guest appearances, recommended-tool listings | Outlive their publication date |
| **Earned decaying** | ❌ | Daily social posts (X, IG, TikTok), Reddit replies, monthly emails | High velocity, low half-life |
| **Paid compounding** | ⚠️ partial | SEO ads with strong landing pages, partnership sponsorships | Build asset alongside spend |
| **Paid decaying** | ❌ | PPC, paid social, retargeting | ROI dies the moment you stop paying |

**Doctrine bias:** spend agent-effort on compounding channels by default; use decaying channels for time-sensitive triggers (transit events, launches, etc.). When in doubt, the autonomous loop picks compounding.

---

## 2. Per-cell channel mix

For each filled matrix cell — required (must work) and optional (nice-to-have) channels.

### `selfprime:practitioner`

**Required (must produce signal):**

| Channel | Class | Why for this ICP |
|---|---|---|
| Product (in-app NPS, retention loops) | Owned compounding | Practitioner lifetime is long; product is the channel |
| Email lifecycle (PR 3a) | Owned compounding | Practitioners live in inbox; nurturing works |
| Practitioner directory at `selfprime.net/find` | Owned compounding | Inbound client routing — high-LTV switching cost |
| Long-form YouTube | Earned compounding | Practitioners use YT for authority-building; same hook works for our outreach |
| The Astrology Podcast sponsorship / guest pitch | Earned compounding | Highest concentration of practitioner audience in English astrology |
| LinkedIn posts (3 per week) | Earned decaying | ICP overlap (many practitioners came from corporate); LinkedIn is where they keep their pro identity |

**Optional (test, drop if no signal):**

| Channel | Class | Why optional |
|---|---|---|
| Substack syndication | Earned compounding | Cross-promotion swaps with practitioner Substack authors |
| TMA advertorial | Paid compounding | High signal/cost but slow; gated on budget |
| Conference (UAC/ISAR/NCGR) sponsorship | Paid compounding | Defer until ≥30 paying practitioners; ROI then proves |

**Denied (per CONSTITUTION §5):**

- Cold mass outbound (any kind)
- TikTok (paid or free — ICP doesn't live there in volume; bad tone fit per `prime_self:practitioner` voice)
- Facebook (deprecated audience for this ICP)
- Reddit *posting* — replies in r/AskAstrologers OK

### `selfprime:consumer`

**Required:**

| Channel | Class | Why |
|---|---|---|
| Product (chart calc free tier, push notifs) | Owned compounding | Free chart calc is the SEO + virality wedge |
| TikTok + Instagram Reels (1-2/day) | Earned decaying | Consumer astrology is dominantly here |
| YouTube Shorts | Earned decaying | Same content, higher LTV; YT pays better |
| Email lifecycle (PR 3a) | Owned compounding | Convert free → paid via nurture |
| SEO long-tail | Owned compounding | "Best free chart calculator," "[type] in love" — long tail is huge |

**Optional:**

| Channel | Class | Why |
|---|---|---|
| Substack cross-promo with productivity/self-improvement newsletters | Earned compounding | Sub-segment B + C alignment |
| Comparison-content surface | Owned compounding | "Selfprime vs Co-Star" — wins competitive search |
| Reddit replies on r/astrology, r/humandesign, r/coast(arrival) | Earned decaying | Reply mode only; never post |

**Denied:**

- LinkedIn (wrong audience for consumer)
- Daily horoscope spam push (anti-pattern; CONSTITUTION §9 honesty)
- Paid Twitter/X (low return for this ICP)

### `cypher:practitioner`

**Required:**

| Channel | Class | Why |
|---|---|---|
| Product | Owned compounding | Same logic as Selfprime |
| Email lifecycle | Owned compounding | Same |
| Modality-specific community partnerships (IFS Institute, SE International, Reiki conventions) | Earned compounding | Healers find tools through trusted lineage |
| Podcast guest appearances (Therapy Chat, Aubrey Marcus, somatic-niche shows) | Earned compounding | Same as Selfprime + Astrology Podcast equivalent |
| Insight Timer instructor pages | Owned/earned hybrid | High concentration of healer-instructors |

**Compliance-mandatory** (per [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance) and `icp/cypher-practitioner.md`):

- Every channel artifact passes a *health-claim* gate in addition to brand-voice gate
- No efficacy claims allowed in any earned content
- No targeting of regulated medical conditions (cancer, mental illness diagnoses, etc.) — opt-in topic allowlist only

**Optional:**

- Substack cross-promo with healer newsletters
- LinkedIn (subset of healers came from corporate; smaller than Selfprime overlap)

**Denied:**

- TikTok (younger consumer audience; weak fit for licensed practitioners)
- Reddit healing subs (high regulation risk; defer to ADR)
- Anything claiming medical efficacy

### `factory:internal`

**Required (internal channels only):**

| Channel | Class | Why |
|---|---|---|
| `docs/STATE.md` daily digest | Owned | Single canonical "what's true" surface |
| Conformance summary | Owned | Adoption tracker |
| Package READMEs | Owned compounding | Discoverability for the operator/agents themselves |
| Supervisor digest | Owned | The agent loop |
| ADRs in `docs/decisions/` | Owned compounding | Adoption decisions documented |

**Denied:**

- All external channels (this cell is internal-only per ICP_MATRIX)
- Marketing language, generic dev-rel tone (per VOICES.md `factory_internal`)

---

## 3. Channel-to-voice mapping

Each channel publishes through specific voice keys per [`VOICES.md`](./VOICES.md). The supervisor loop enforces this mapping.

| Channel | Cell context | Voice key |
|---|---|---|
| selfprime.net practitioner landing pages | `selfprime:practitioner` | `prime_self:practitioner` |
| selfprime.net consumer landing pages | `selfprime:consumer` | `prime_self:consumer` |
| Practitioner LinkedIn posts | `selfprime:practitioner` | `prime_self:practitioner` |
| Consumer TikTok / IG Reels | `selfprime:consumer` | `prime_self:consumer` |
| Cypher healer outreach email | `cypher:practitioner` | `cypher_practitioner` |
| Cypher seeker landing pages | `cypher:seeker` | `cypher_seeker` |
| Factory package docs / READMEs | `factory:internal` | `factory_internal` |

When a channel needs a voice key that doesn't exist, the loop blocks publication and routes to the operator for voice registration (per [`VOICES.md §3`](./VOICES.md#3-registration-rules)).

---

## 4. Channel surface conventions

Every public-facing URL belongs to one cell. The surface registry (PR 3d) enforces this.

| URL pattern | Cell | Voice |
|---|---|---|
| `selfprime.net/practitioners/*` | `selfprime:practitioner` | `prime_self:practitioner` |
| `selfprime.net/find` (directory) | `selfprime:practitioner` (publisher) → `selfprime:consumer` (visitor) | Bi-modal landing — fork based on intent signal |
| `selfprime.net/r/{practitioner}/{reading}` | `selfprime:practitioner` (owner) + `selfprime:consumer` (recipient) | `prime_self:consumer` rendering |
| `selfprime.net/*` (default) | `selfprime:consumer` | `prime_self:consumer` |
| `selfprime.net/embed/*` (chart calc widget) | Cross-cell — fork by referrer | Cross-cell |
| `cipherofhealing.com/practitioners/*` | `cypher:practitioner` | `cypher_practitioner` |
| `cipherofhealing.com/*` (default) | `cypher:seeker` | `cypher_seeker` |

The default route on each domain serves the highest-volume cell for that domain.

### 4.1 Bi-modal fork policy (T2-3)

For URL patterns marked "bi-modal" or "fork based on intent signal" above, the routing decision uses this ordered policy. The first signal that resolves wins.

| Priority | Signal | Decision |
|---|---|---|
| 1 | **Explicit `utm_content`** | Trust the UTM-declared cell |
| 2 | **Referer host class** (per [`ATTRIBUTION.md §3`](./ATTRIBUTION.md#3-source-dedup-registry) registry) | LinkedIn/podcast/TMA refs → practitioner cell; TikTok/IG/Reddit → consumer cell |
| 3 | **Declared intent on the page** (clicked CTA: "I'm a practitioner" vs "I'm a chart-curious individual") | Trust the user's declaration |
| 4 | **IP geo** (loose signal — used only for content adaptation, not cell routing — see §6 i18n note) | — |
| 5 | **Surface default** | Per the §4 table — `selfprime.net/find` defaults to practitioner; `selfprime.net/` defaults to consumer |

UTM-declared cell may be **rewritten at capture** per [`ATTRIBUTION.md §2.1`](./ATTRIBUTION.md#21-bi-cell-surface-utm-rewrite-t2-2) when the visitor's signals strongly disagree with the declared cell (e.g. UTM says practitioner but visitor lands from a TikTok consumer ad). The rewrite is logged in `touch_history.original_utm_content` for audit.

### 4.2 Surface-level cell capabilities (T2-12)

Some surfaces have capability flags that drive system behavior beyond routing. Capabilities are declared per cell in [`ICP_MATRIX.md`](./ICP_MATRIX.md).

| Capability | Meaning | System behavior |
|---|---|---|
| `publishes_user_content` | Cell surfaces accept content from practitioners or users that gets public exposure (e.g. `selfprime.net/r/*` published readings) | Vision-gate runs **synchronously at publish time**, not in 4h batches; tripwire `ugc_brand_safety` watches for post-publish violations |
| `accepts_paid_spend` | Cell has met readiness gate for paid ads | Required for any paid-channel campaign; absence = supervisor refuses paid spend |
| `regulated_vertical` | Cell touches regulated content (health, finance) | Universal regulated-terms denylist applies in addition to per-cell rules; FDA-aware language gate; no efficacy claims |
| `b2b_outreach_active` | Cell has consent-on-file practitioners receiving outreach | Cold-mass-outbound check applies; warm-only enforcement |

These capabilities are read by the marketing supervisor at every action and gate the system's behavior — they are the "code-enforced rules" pattern the audit identified as missing.

---

## 5. Readiness gate progression (CONSTITUTION §5 operationalized)

For each channel × cell combination, the readiness state progresses through:

| State | Activity allowed | Gate to advance |
|---|---|---|
| Not started | None | ICP file exists; voice profile registered |
| `discovery` | Drafting only; no publish | ≥10 brand-voice-passing drafts produced + operator review |
| `earned_active` | Publish on the channel | ≥10 published artefacts + measurable engagement above baseline |
| `paid_ready` | Paid spend allowed | ≥3 months cohort data + LTV/CAC target met |
| `paid_active` | Paid spend running | Operator approval recorded |

The supervisor loop tracks state per channel × cell in [`docs/marketing/channel-state.yaml`](./channel-state.yaml) (created in PR 3e).

---

## 6. Adding a new channel

Any agent or operator can *propose* a new channel by:

1. Drafting an ADR in [`docs/decisions/`](../decisions/) explaining the channel, its expected leverage, and which cells benefit
2. Adding the channel to this doc with a row in the per-cell mix tables
3. Registering the channel in the supervisor loop's adapter registry

Adding to the allowlist requires operator approval (Tier-3 per [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers)). Once allowlisted, the channel can be used by any cell whose ICP file lists it.

---

## 7. Cross-references

- [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates) — allowlist + readiness gates (this doc operationalizes that)
- [`MARKETING_PLAN.md §3`](./MARKETING_PLAN.md) — channel doctrine summary
- [`ICP_MATRIX.md`](./ICP_MATRIX.md) — cells whose channels are specified here
- [`VOICES.md`](./VOICES.md) — voice keys per channel
- [`packages/social/src/index.ts`](../../packages/social/src/index.ts) — channel adapters (X + Pinterest today; LinkedIn + YT in PR 3f)
- [`packages/email/src/index.ts`](../../packages/email/src/index.ts) — email channel (sequencer in PR 3a)
- [`packages/video/`](../../packages/video/) + [`packages/schedule/`](../../packages/schedule/) — video channel (already operational)
- PR 3d brief — surface registry that enforces URL → cell routing

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — channel taxonomy (compounding vs decaying); per-cell required/optional/denied lists for 4 filled cells; voice mapping; surface conventions; readiness progression |
