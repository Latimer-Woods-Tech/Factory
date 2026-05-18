# Selfprime — Product Page

**Product:** Selfprime · **Repo:** [`Latimer-Woods-Tech/HumanDesign`](https://github.com/Latimer-Woods-Tech/HumanDesign) · **Live URL:** [`selfprime.net`](https://selfprime.net) · **API:** `api.selfprime.net`

> **This file is the product-level overview.** Per [`ICP_MATRIX.md`](../ICP_MATRIX.md), Selfprime has multiple ICPs across the audience archetypes column. Each filled cell has its own ICP file below. This page is the canonical entry point for any agent or human asking "what is Selfprime selling, and to whom?"

---

## Product identity

- **What it is:** Chart-engine-based personal-operating-system app. Originally Human Design–first; expanding to a broader chart-system ecosystem (Human Design + astrology + numerology + tarot framing — final scope TBD).
- **Engine moats:** chart math (HD + Western astrology), brand-voice generation via `@lwt/copy`, automated video factory ([`packages/video/`](../../../packages/video/) + [`packages/schedule/`](../../../packages/schedule/))
- **Distribution surfaces:** public landing + chart calc, practitioner dashboard, client reports, embed widget (PR 3i), shareables (PR 3h)
- **Cohesion / completion:** 41 / 100 cohesion, 74.9% completion (per [`docs/STATE.md`](../../STATE.md))
- **Stage:** 2 — Revenue + Customer

---

## ICP cells on this product

Per the matrix:

| Cell | Readiness | File | Priority |
|---|---|---|---|
| `selfprime:consumer` — chart-curious individual | 🟡 discovery | [`selfprime-consumer.md`](./selfprime-consumer.md) | #2 |
| `selfprime:power` — daily-using HD/astrology enthusiast | ⏳ queued | (file pending) | later |
| `selfprime:practitioner` — solo astrologer / HD reader | 🟡 discovery | [`selfprime-practitioner.md`](./selfprime-practitioner.md) | #1 — first domino |
| `selfprime:studio` — multi-practitioner team / studio | ⏳ queued | (file pending) | later |
| `selfprime:partner` — Astrology Hub / TMA / aggregator partnership | ⏳ queued | (file pending) | later |

---

## Why two simultaneous cells?

The engine that serves a consumer's chart is the *same engine* that powers a practitioner's client report. Same product, different surfaces, different voices, different price points.

**Distribution flywheel:**
- Consumer signups → some convert to practitioner-track (career pivot is a real audience pattern)
- Practitioner clients → consumer-tier signups for their friends/family (referral path)
- Both feed the LLM-SEO surface (chart content indexed by LLMs answering practitioner-growth questions)

This is the classic **prosumer flywheel** — neither cell would work alone at our scale; together they compound. Tradeoff: brand voice + landing pages + onboarding must successfully bifurcate based on signal (channel of arrival, first-action signal, declared intent on signup).

---

## Cross-product overlaps

A working astrology practitioner is also potentially:
- **`cypher-practitioner`** — they offer energy work / healing alongside chart reading. Multi-modal practice is the norm.
- **`xicocity-creator`** — they run a creative-economy operation (newsletter, course, podcast).

The CRM stitches identities via `crm_leads.user_id`. The matrix doesn't represent overlap; the data does.

---

## Voice profile

Today: `prime_self` (single key). After [PR 3c](../pr3-briefs/3c-voice-matrix.md):
- `prime_self:consumer` — curious, encouraging, modern
- `prime_self:practitioner` — direct, respectful, peer-to-peer
- `prime_self:power` — technically rich, generous, opinionated

Full spec: [`VOICES.md`](../VOICES.md).

---

## Built-in growth hooks (Selfprime-specific application)

Cross-portfolio hook set lives in [`MARKETING_PLAN.md §5`](../MARKETING_PLAN.md). For Selfprime specifically:

| # | Hook | Cell most served | Status |
|---|---|---|---|
| 3h | Practitioner-branded shareables | `practitioner` (primary), `consumer` (recipient) | builder brief drafted |
| 3i | Embed chart calc widgets | `practitioner` (deploys), `consumer` (uses) | builder brief drafted |
| 3j | Referral compounding | All cells | builder brief drafted |
| 3g | Topic queue from transit ephemeris | `consumer` (entertainment), `practitioner` (their content) | builder brief drafted |
| Newsletter substrate | `practitioner` (their list) | (deferred to post-PR 3) |
| Public reading library | `practitioner` (portfolio + SEO) | (deferred to post-PR 3) |
| Practitioner directory | `consumer` (find a practitioner) | (deferred to post-PR 3) |
| Booking + intake | `practitioner` (monetizes), `consumer` (transacts) | (deferred to post-PR 3) |

---

## First-domino sequence

Per [`selfprime-practitioner.md`](./selfprime-practitioner.md):

1. **Identify ~200 candidate practitioners** from public sources (podcast guest lists, Astrology Hub speaker rosters, Substack astrology newsletter authors)
2. **Autonomous warm outreach** through `@lwt/crm` with voice-gated `prime_self:practitioner` copy
3. **Land 5 design partners** via ≤5 operator Zoom calls (the only human-touch in the bootstrap)
4. **Their usage data** seeds the autonomous system's understanding of which features matter, which copy lands, which pricing tier works

After step 4, the loop runs hands-off. Each design partner is the first node of the referral graph; their clients are the first nodes of the consumer funnel.

---

## Cross-references

- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — grid
- [`VOICES.md`](../VOICES.md) — voice profiles for Selfprime cells
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-1--selfprime-humandesign-repo-selfprimenet) — operator worksheet
- [`docs/service-registry.yml`](../../service-registry.yml) — `prime-self` worker + `prime-self-ui` Pages + DNS
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — `prime_self` voice (single-key today; matrix in PR 3c)
- [`CLAUDE.md` Video Production Pipeline](../../../CLAUDE.md#video-production-pipeline) — `ELEVENLABS_VOICE_PRIME_SELF` voice ID + render workflow
- [`.claude/.../memory/project_humandesign_repo.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_humandesign_repo.md) — repo lives outside Factory monorepo

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 (v0) | @adrper79-dot (drafted by Claude) | Initial single-ICP hypothesis (operator-OS framing) |
| 2026-05-18 (v1) | @adrper79-dot (drafted by Claude) | Restructured as product parent index; per-ICP files become children |
