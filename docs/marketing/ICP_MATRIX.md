# ICP Matrix

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Canonical · **Owner:** @adrper79-dot

> The product × audience grid. Every filled cell is a real go-to-market with its own ICP file, voice profile, channel mix, budget envelope, and KPIs. Every empty cell is a **deliberate non-play** — explicit decisions, not gaps.

> Reviewed quarterly alongside the [customer-gate catalog](../customer-gate/). New cells require an ICP file before they go live.

---

## The grid

**Columns are audience archetypes.** Rows are products. **Cell value = readiness state.**

Readiness state legend (per [`CONSTITUTION.md §5`](./CONSTITUTION.md)):

- 🚫 — deliberate non-play (explicit decision, not a gap)
- ⏳ — queued (planned but not staffed)
- 🟡 `discovery` — ICP file + voice profile exist
- 🟢 `earned_active` — ≥1 owned channel producing
- 💎 `paid_ready` — ≥3 months cohort data, LTV:CAC met
- 💰 `paid_active` — paid spend running with operator approval

| | **Chart-curious consumer** | **Power user / enthusiast** | **Practitioner-of-1** | **Practitioner team / studio** | **Channel partner / aggregator** |
|---|---|---|---|---|---|
| **Selfprime** (selfprime.net) | 🟡 [`selfprime-consumer`](./icp/selfprime-consumer.md) | ⏳ [`selfprime-power`](./icp/selfprime-power.md) | 🟡 [`selfprime-practitioner`](./icp/selfprime-practitioner.md) ← *first domino* | ⏳ [`selfprime-studio`](./icp/selfprime-studio.md) | ⏳ [`selfprime-partner`](./icp/selfprime-partner.md) |
| **Capricast** (capricast.com) | ⏳ | ⏳ | 🟡 [`capricast-creator`](./icp/capricast-creator.md) | ⏳ collective | ⏳ |
| **Cypher of Healing** (cipherofhealing.com) | 🟡 [`cypher-seeker`](./icp/cypher-seeker.md) | 🚫 (not differentiated from seeker tier 12mo) | ⏳ [`cypher-practitioner`](./icp/cypher-practitioner.md) | ⏳ [`cypher-clinic`](./icp/cypher-clinic.md) | 🚫 (regulated vertical, not 2026) |
| **Xico City** (xicocity.com) | ⏳ creator-curious | ⏳ DJMEXXICO super-fan | 🟡 [`xicocity-creator`](./icp/xicocity-creator.md) | ⏳ [`xicocity-collective`](./icp/xicocity-collective.md) | ⏳ cultural institution / festival |
| **Factory** (internal) | 🚫 N/A — not a consumer product | 🚫 N/A | 🟡 [`factory-internal`](./icp/factory-internal.md) (operators using LWT packages) | ⏳ portfolio teams | 🚫 (not selling Factory externally 2026) |

---

## How to read this

**One row at a time:** "Which audiences does this product currently *play* to?"
- Selfprime plays to 2 cells today (consumer + practitioner); 3 are queued.
- Cypher of Healing plays to 1; clinic/team is queued, channel-partner is forbidden until regulatory work is done.
- Capricast plays to 1 cell as of 2026-05-18 (creator-of-1; positioning landed in [`icp/capricast.md`](./icp/capricast.md)); 4 other cells queued.

**One column at a time:** "Which products compete for the same audience?"
- The "practitioner-of-1" column has 3 active or queued plays (Selfprime, Cypher, Xico City) — same operating motion (B2B-of-1), reuse the playbook.
- The "channel partner" column is mostly forbidden / queued — that's intentional; partnerships come after product-market fit per cell.

**Cross-product motion** (one human in multiple cells): a practitioner client of Selfprime might also be in `cypher-practitioner` and `xicocity-creator`. The CRM stitches identities across products via `crm_leads.user_id`; the matrix doesn't need a separate "multi-product" axis.

---

## Cell file template

Every filled cell has an `icp/{slug}.md` file matching this template (cross-linked from the [customer-gate catalog](../customer-gate/M1_M2_CATALOG_2026-05-17.md)):

```markdown
# {Slug} — ICP

**Product:** ...
**Audience archetype:** ...
**Readiness state:** 🟡 / 🟢 / 💎 / 💰

## 1. Positioning (one sentence + 3 differentiators)
## 2. Customer (M1 — who, pain, incumbent, switch trigger, last conversation)
## 3. Channel hypothesis (owned / earned / paid per CONSTITUTION §5)
## 4. Pricing + economics
## 5. Acquisition motion (primary + backup hypothesis, CAC budget)
## 6. Built-in growth hooks (per cell — which of the 8 portfolio hooks apply)
## 7. Build-stop threshold (non-negotiables, % shipping, switch date)
## 8. Quarterly gate (graduate / sunset KPIs, next review date, owner)
## 9. What we don't know yet (commitments to learn)
## 10. Cross-references
```

This is the *contract*. New cells without this structure can't progress past `discovery`.

### Cell capabilities (T2-12)

In addition to the file structure, every cell declares **capability flags** that drive system enforcement. Capabilities live in a per-cell YAML stub at `docs/marketing/cells/{cell-key}.yaml` (created in the same PR that fills the cell) and are read by the marketing supervisor at every action.

| Capability | Default | When to enable |
|---|---|---|
| `publishes_user_content` | `false` | Cell surfaces accept content from users/practitioners that gets public exposure (e.g. `selfprime.net/r/*`). Forces synchronous vision-gate at publish time; enables `ugc_brand_safety` tripwire |
| `accepts_paid_spend` | `false` | Cell has reached `paid_active` readiness state. Required for any paid-channel campaign |
| `regulated_vertical` | `false` | Cell touches regulated content (health, finance). Activates universal regulated-terms denylist + FDA-aware language gate; forbids efficacy claims; requires consent audit on every send |
| `b2b_outreach_active` | `false` | Cell runs outbound to practitioners with consent on file. Enforces warm-only outreach; cold-mass-outbound denied |
| `cross_product_flywheel_source` | `false` | Cell publishes content that drives signups in OTHER cells (e.g. `selfprime:practitioner` shareables → `selfprime:consumer` signups). Enables `referral_chain` tracking on downstream cells |
| `localized` | `false` | Cell has registered voices for non-English locales. Determines whether i18n routing applies |

Capabilities map per current matrix:

| Cell | Capabilities |
|---|---|
| `selfprime:practitioner` | `b2b_outreach_active=true`, `publishes_user_content=true` (via shareables), `cross_product_flywheel_source=true` |
| `selfprime:consumer` | (none enabled until validation completes) |
| `cypher:seeker` | `regulated_vertical=true` |
| `cypher:practitioner` | `regulated_vertical=true`, `b2b_outreach_active=true` (when promoted) |
| `xicocity:creator` | `publishes_user_content=true` |
| `capricast:creator` | `publishes_user_content=true` |
| `factory:internal` | (none) |

The autonomous supervisor reads these flags at every action gate. A cell without `accepts_paid_spend=true` cannot run paid campaigns even if the operator authorizes — the supervisor refuses. This is the **code-enforced layer** that the consistency audit identified as missing.

---

## Priority order (rolling)

Set 2026-05-18; revised quarterly. Honor the [portfolio priority memory](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_priority_order.md): Selfprime → Factory → Capricast → Cypher of Healing → Xico City.

| Rank | Cell | Why now |
|---|---|---|
| 1 | `selfprime-practitioner` | First domino. 5 design partners unlock the autonomous loop's bootstrap data. |
| 2 | `selfprime-consumer` | Larger TAM, same engine, complementary distribution surface. |
| 3 | `factory-internal` | Internal "customer"; serves the other 4 products. |
| 4 | `cypher-seeker` | Cypher voice + audience already differentiated; second-easiest start. |
| 5 | `xicocity-creator` | Creator-economy audience has clear positioning per [`project_xicocity_canonical.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_xicocity_canonical.md). |
| 6+ | Remaining cells | After data from #1-5 informs priority |

---

## Cross-product flywheel

The matrix isn't 5 independent products — there are deliberate cross-promotion paths.

```
selfprime-consumer ──> (some convert to practitioner-track) ──> selfprime-practitioner
                                                                       │
                                                                       v
selfprime-practitioner ──> (refers peers) ──> selfprime-practitioner (recursive)
                       ──> (uses for client decoration of healing modalities) ──> cypher-practitioner
                                                                                  │
                                                                                  v
cypher-seeker ──> (some become practitioners) ──> cypher-practitioner

xicocity-creator ──> (some pitch festivals/institutions) ──> xicocity-collective

factory-internal ──> (powers all other cells)
```

This means: **a click on selfprime.net is not equally valuable to all matrix cells**. Cell-specific landing pages route based on the inferred ICP. See [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) for routing rules.

---

## Cross-references

- [`CONSTITUTION.md`](./CONSTITUTION.md) — rules every cell honors
- [`VOICES.md`](./VOICES.md) — voice profile per cell
- [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) — canonical index
- [`ROADMAP.md`](./ROADMAP.md) — sequencing of fills + capability builds
- [`docs/customer-gate/`](../customer-gate/) — operator's quarterly worksheets (paired 1:1 with this matrix)
