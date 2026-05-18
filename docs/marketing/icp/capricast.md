# Capricast — Product Page

**Product:** Capricast (formerly VideoKing / NicheStream) · **Repo:** [`Latimer-Woods-Tech/capricast`](https://github.com/Latimer-Woods-Tech/capricast) · **Live URL:** [`capricast.com`](https://capricast.com) · **API:** `api.capricast.com`

> **This file is the product-level overview.** Per [`ICP_MATRIX.md`](../ICP_MATRIX.md), the Capricast row currently shows ⏳ in every cell — this page (plus the child ICP file) starts the positioning pass. This is the canonical entry point for any agent or human asking "what is Capricast selling, and to whom?"

> Portfolio priority **#3** — per [`project_priority_order.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_priority_order.md). Work concentrates on Selfprime first; Capricast work happens to the extent it unblocks Selfprime or is parallelizable by the autonomous loop.

---

## Product identity

- **What it is** *(hypothesis):* the niche video creator's revenue layer — ship more video, get paid per-subscription or per-unlock, keep work and audience portable. Patreon-meets-Vimeo-OTT for creators whose niche is too narrow for YouTube-AdSense math and too workmanlike for Patreon's parasocial register.
- **Engine moats** *(observed in code):*
  - Cloudflare Stream + R2 video pipeline ([`packages/video/`](../../../packages/video/) + render-video GHA workflow)
  - Stripe Connect creator payouts (Phase 4 shipped per [`docs/capricast/PHASE_B_INDEX.md`](../../capricast/PHASE_B_INDEX.md))
  - Per-video unlocks + per-creator subscription tiers (`MonetizationEvent` schema in [`@lwt/analytics`](../../../packages/analytics/))
  - 12-event monetization funnel instrumented end-to-end (see [`monetization-funnel-spec.md`](../../capricast/monetization-funnel-spec.md))
- **Distribution surfaces** *(hypothesis — confirm with operator):* creator-controlled public channel page, embeddable video player, per-creator subdomain or branded route, paywall checkout flow
- **Cohesion / completion:** 24 / 100 cohesion, 0.0% completion (per [`docs/STATE.md`](../../STATE.md))
- **Stage:** ⏳ — the engine is largely built (Phase 4 monetization live) but customer-gate is empty; no validated demand cycle has run

---

## ⏳ What is unknown (operator confirms)

This page is **hypothesis-level**. The following must be confirmed before Capricast moves any cell from ⏳ to 🟡:

| # | Unknown | Why it matters |
|---|---|---|
| 1 | Is "niche video creator" the right archetype, or is the wedge "course creator," "OnlyFans-of-craft," or "internal-team OTT"? | Determines voice, channel mix, and pricing |
| 2 | Does any paying creator exist on capricast.com today? | If yes, their workflow defines the ICP; if no, the page is pure hypothesis |
| 3 | Is the brand "Capricast" or is "NicheStream" still being used in some surface? | Several docs still reference NicheStream as the brand name |
| 4 | Has the operator had ≥10 customer conversations with target creators? | Required by [`M1_M2_CATALOG`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-3--capricast-capricast-repo) §1.2 |
| 5 | What is the actual revenue split today (platform take rate)? | Drives unit economics; hypothesis is 5–10% (Stripe Connect application fee) |
| 6 | Is Capricast a standalone GTM or a back-end "powered by" service for Selfprime / XicoCity? | Changes everything about the marketing motion |

Per [`feedback_engineering_style.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/feedback_engineering_style.md), this document does not pretend to know more than it does. The autonomous loop's first job for Capricast is filling these in.

---

## Lineage

| Event | Date | Note |
|---|---|---|
| Scaffold as VideoKing / NicheStream | 2026-04-13 | "feat: scaffold NicheStream — full-stack interactive video platform" ([`TEMPLATE_BOOTSTRAP_CANDIDATES.md`](../../supervisor/TEMPLATE_BOOTSTRAP_CANDIDATES.md)) |
| Phase 4 monetization shipped (Stripe Connect + unlocks + subscriptions) | ~2026-04-28 | Per [`docs/capricast/PHASE_B_INDEX.md`](../../capricast/PHASE_B_INDEX.md) and `T3-*-IMPLEMENTATION-SUMMARY.md` |
| Selfprime adopts VideoKing monetization contract as reference | 2026-05-01 | [`SELFPRIME_MONETIZATION_CONTRACT.md`](../../capricast/SELFPRIME_MONETIZATION_CONTRACT.md) — "creator_id in VideoKing = practitioner_id in SelfPrime" |
| Rename videoking → capricast | 2026-05-15 | Per [`project_capricast_rename.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_capricast_rename.md). Some files still emit `VK` keys; `scripts/launch_readiness.py` aliases `CC → VK` during transition. |
| Positioning pass (this file) | 2026-05-18 | First ICP doc post-rename; matrix moves ⏳ → 🟡 on at least one cell |

The product is engine-rich and customer-poor — opposite of the usual problem. The marketing job is to *find the audience that already wants what we built*, not to spec what to build for an unknown audience.

---

## ICP cells on this product

Per the matrix. All ⏳ today; one moves to 🟡 with this PR.

| Cell | Readiness (today → target with this PR) | File | Priority |
|---|---|---|---|
| `capricast:consumer` — viewer / fan paying per unlock or subscription | ⏳ → ⏳ | (not drafted; downstream of creator cell) | later |
| `capricast:power` — video-bingeing super-fan / completist | ⏳ → ⏳ | (not drafted; same logic as consumer) | later |
| `capricast:creator` — niche pro/craft video creator | ⏳ → 🟡 `discovery` | [`capricast-creator.md`](./capricast-creator.md) | **#1 — this is the leveraged side of the marketplace** |
| `capricast:studio` — multi-creator team / production house | ⏳ → ⏳ | (file pending) | later |
| `capricast:partner` — course platform / community OS aggregator | ⏳ → ⏳ | (file pending) | later |

**Why creator-first:** every marketplace bootstraps from the supply side that has the audience problem. A creator with 500 fans willing to pay $5/mo is a $30k/yr operation; a single one of those is a useful design partner. Viewers without a creator are nothing.

---

## Differentiation from XicoCity creator

Both products target "creator" in the practitioner-of-1 column. They are *not* the same play. Hypothesis (operator confirms):

| Axis | `capricast:creator` | `xicocity_creator` |
|---|---|---|
| **What the creator sells** | Their *work* (skill, craft, niche expertise — recorded as video) | Their *scene* (cultural identity, kinetic presence, music/movement) |
| **Voice register** | Workmanlike, pragmatic, builder-coded, irreverent | Bold, kinetic, culturally rooted, irreverent |
| **Tone analogy** | Tradesman with a camera | Promoter in a club |
| **What "win" looks like** | Predictable monthly revenue from a small, loyal niche audience | Cultural relevance + a livelihood that compounds on attention spikes |
| **Incumbent they leave** | Patreon (too parasocial), YouTube AdSense (too sub-scale), Vimeo OTT (too expensive + cold) | Bandcamp (too static), SoundCloud (no business layer), DJ-mix platforms (no monetization) |
| **Origin user** | Trade-skill educator, niche craft instructor, narrow-vertical analyst | DJMEXXICO and creator-economy peers in their orbit |

Both ICPs are "the niche creator" — Capricast is **the work**, XicoCity is **the scene**. The CRM stitches identities; a single creator can fit both.

---

## Voice profile

Today: **no registered voices** for Capricast (see [`VOICES.md` §2](../VOICES.md#capricast-capricast)). This PR registers:

- `capricast:default` — pragmatic, builder-coded, irreverent — the product's own voice for product surfaces, error states, marketing pages
- `capricast:creator` — same register, peer-to-peer toward working niche video makers

Full spec: [`VOICES.md` §2](../VOICES.md#capricast-capricast) — updated as part of this drop.

---

## Built-in growth hooks (Capricast-specific application)

Cross-portfolio hook set lives in [`MARKETING_PLAN.md §5`](../MARKETING_PLAN.md). Capricast has a creator-supply marketplace shape, so the relevant hook subset is different from Selfprime's prosumer flywheel:

| # | Hook | Cell most served | Status |
|---|---|---|---|
| Embed player | Creator drops `<script>` on their existing site → every play = lead capture + Capricast brand impression | `creator` (deploys), `consumer` (uses) | ⏳ hypothesis; confirm shipping |
| Creator-branded paywall | Checkout page is creator's brand, not Capricast's — Capricast is a discreet footer | `creator` | ⏳ — same pattern as Selfprime PR 3h shareables |
| Per-creator subdomain or branded route | Creator owns `{handle}.capricast.com` or `capricast.com/{handle}` | `creator` | ⏳ confirm |
| Referral compounding (3j-equivalent) | Creator invites peer → both get reduced platform take rate for N months | `creator` | ⏳ hook reused from Selfprime |
| Public catalog at `capricast.com/discover` | Discoverable, SEO-indexed; viewer-side surface | `consumer` | ⏳ — depends on viewer-side cell becoming a play |
| Video factory cross-pollination | Use [`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/) to *publish about Capricast on Capricast* — dogfood content engine | `creator` (acquisition) | ⏳ — leverages Factory infrastructure |

Pattern: **each paying creator = one new distribution node** (same flywheel logic as the Selfprime practitioner cell, different audience).

---

## First-domino sequence (hypothesis)

Per [`capricast-creator.md`](./capricast-creator.md):

1. **Operator validates the wedge** — 3–5 phone calls with target creators (trade-skill educator, niche craft instructor, narrow-vertical analyst) to confirm pain points and willingness to pay
2. **Identify ~100 candidate creators** from public sources (Patreon refugees, YouTube channels under 10k subs with engaged paid-tier signals, niche Substack video embedders)
3. **Autonomous warm outreach** through `@lwt/crm` with voice-gated `capricast:creator` copy
4. **Land 3–5 design partners** via ≤5 operator calls
5. **Their usage data + revenue data** seeds the autonomous loop's understanding of pricing tiers, take rate sensitivity, churn drivers

Steps 1 and 4 are the only human-touch in the bootstrap. Per the priority order, this happens *after* Selfprime's practitioner cell is shipping — Capricast is parallelized by the loop while operator attention stays on Selfprime.

---

## Cross-references

- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — grid (Capricast row moves ⏳ → 🟡 on the creator cell with this PR)
- [`VOICES.md`](../VOICES.md) — `capricast:default` and `capricast:creator` profiles registered
- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — global plan
- [`CONSTITUTION.md`](../CONSTITUTION.md) — non-negotiable rules every cell honors
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-3--capricast-capricast-repo) — paired operator worksheet (all fields blank — that's the unknown)
- [`docs/capricast/`](../../capricast/) — engine docs (API.md, monetization-funnel-spec.md, creator-onboarding-ops.md, PHASE_B_INDEX.md)
- [`docs/service-registry.yml`](../../service-registry.yml) — `capricast` worker + Pages + DNS
- [`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/) — automated video factory (eats own dogfood)
- [`packages/analytics/`](../../../packages/analytics/) — `MonetizationEvent` schema
- [`.claude/.../memory/project_capricast_rename.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_capricast_rename.md) — videoking → capricast lineage
- [`.claude/.../memory/project_priority_order.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_priority_order.md) — portfolio priority #3
- [`docs/STATE.md`](../../STATE.md) — cohesion 24/100, completion 0.0%

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | Initial — first ICP doc post-rename. Hypothesis-level. Creator cell moves to 🟡; other cells stay ⏳ pending operator confirmation of the wedge. |
