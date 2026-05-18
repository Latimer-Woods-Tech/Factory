# `factory:internal` — ICP

**Product:** Factory (the platform layer) · **Audience archetype:** Practitioner-of-1 (operator + engineer running a Latimer-Woods-Tech-stack product) · **Readiness state:** 🟡 `discovery` · **Priority:** #3 — *internal customer; serves the other 4 products*

> Parent: this is the platform; portfolio "customers" are [`selfprime-practitioner`](./selfprime-practitioner.md), [`selfprime-consumer`](./selfprime-consumer.md), `cypher-seeker` (ICP file pending), `xicocity-creator` (ICP file pending), and [`capricast-creator`](./capricast-creator.md) · Matrix cell: row "Factory" × col "Practitioner-of-1" · Voice: `factory_internal`

> Internal product. Not sold externally in 2026 per [`ICP_MATRIX.md`](../ICP_MATRIX.md). "Adoption" replaces MRR; "engineering hours saved" replaces ARPU. Read this file as the contract between Factory-the-platform and the app teams that consume it.

---

## 1. Positioning

**One sentence:**
> Factory is the substrate the portfolio apps stand on — shared bindings, contracts, and gates that mean each app team ships their next feature, not their next Stripe wrapper.

**3 differentiators (vs the alternatives an app team has):**
1. **Constraint-encoded packages, not opinions.** [`@latimer-woods-tech/*`](../../../packages/) packages bake the [`PLATFORM_STANDARDS.md`](../../PLATFORM_STANDARDS.md) hard constraints into runtime APIs. An app importing [`@lwt/errors`](../../../packages/errors/) cannot accidentally throw a raw `Error`; an app importing [`@lwt/auth`](../../../packages/auth/) cannot hand-roll JWT verification. DIY versions re-introduce every constraint as a code-review burden.
2. **Conformance-scored, not docs-only.** The same standards are machine-checked by [`platform-conformance.yml`](../../../.github/workflows/platform-conformance.yml) and surfaced in [`docs/conformance/summary.md`](../../conformance/summary.md). App teams know exactly where they stand and what blocks them from Stage 4 enforcement.
3. **One operator pays the integration tax once.** With 5 products on the same stack, the cost of `@lwt/stripe` adapter work is amortized 5×. An app team forking is a 5× regression for the portfolio.

**"Competitors" we're displacing (per the customer-gate framing):**
- **The app team just builds it themselves.** Cheap on day 1, expensive at month 6 when [`@lwt/llm`](../../../packages/llm/) gains tier routing and the fork doesn't. The default failure mode.
- **Third-party SaaS** (Auth0, LaunchDarkly, Sentry-direct, raw Stripe SDK). Solves the surface, leaves the [`PLATFORM_STANDARDS`](../../PLATFORM_STANDARDS.md) gap (no `request_id`, no structured logs, no idempotent webhook helper, no Cloudflare-Worker-safe imports).
- **Doing without.** The app ships, conformance score stays at 24, Stage 4 enforcement eventually blocks deploys. Visible today: capricast at 24, cypher-healing at 25 — see [`docs/conformance/summary.md`](../../conformance/summary.md).

---

## 2. Customer (M1)

### ICP profile

**One-sentence ICP:**
> The single operator (`@adrper79-dot`) plus any future engineer or agent shipping inside a Latimer-Woods-Tech app repo who has a feature to deliver this week, a conformance score that's eventually going to be enforced, and one CF Workers runtime to honor.

### Sub-segments (by app team posture)

The "customer" is the same human across all rows; the *posture* differs by app and dictates the adoption pitch.

| Sub | App | Posture | Current cohesion | Adoption signal | Pitch |
|---|---|---|---:|---|---|
| **A. Eager adopter** | xico-city | "I'll take whatever ships." Already on `@lwt/logger`, `@lwt/errors`, `@lwt/monitoring`. | **52** | Adopts new packages within a milestone of publish | Keep shipping; close the observability gap so they hit 70+ first |
| **B. Pragmatic** | HumanDesign (Selfprime) | "Show me the gate, I'll wire it." Has Sentry + monitoring; missing logger/errors/monitoring in deps. | **41** | Adopts when a gate (auto-merge, conformance, deploy) forces or rewards it | Wire `@lwt/errors` + `@lwt/logger` next — biggest cohesion delta per hour |
| **C. Hold-out** | capricast, cypher-healing, factory-admin-studio | "I'll build it inline." Either pre-product or fork-prone. | **24, 25, 29** | Adopts only when blocked by Stage 4 or when a sub-agent migration PR lands ready-to-merge | Sub-agent migration PRs; package READMEs as the *entire* sell |

System runs cohesion-delta tests in parallel per app; the daily digest picks which package each app should adopt next based on weighted score uplift. No operator decision required.

### Pain solved today (from the app team's perspective)

The "cost of NOT using Factory packages" per app, per pain. Numbers are estimates the operator can replace with measurements once [`scripts/cost_digest.py`](../../../scripts/cost_digest.py) gains an engineering-hours line.

| Pain | Cost per app per month if DIY | Factory resolution |
|---|---|---|
| Re-implementing JWT verify with Web Crypto every time | ~4–8 engineer-hours, plus every CVE re-investigated | [`@lwt/auth`](../../../packages/auth/) — middleware + helpers, one constraint surface |
| Wiring Sentry + sourcemaps + structured logs per Worker | ~3–6 hours + recurring drift | [`@lwt/monitoring`](../../../packages/monitoring/) + [`@lwt/logger`](../../../packages/logger/) — middleware drop-in |
| Stripe idempotency, retries, price-ID handling | ~6–12 hours + one production double-charge per quarter (see [G32](../../GAP_REGISTER.md#p1--stage-1-2-must-fix)) | [`@lwt/stripe`](../../../packages/stripe/) — `withIdempotency()` + helpers |
| LLM tier routing + cap enforcement + cost telemetry | ~8–16 hours + uncapped Anthropic spend until something burns | [`@lwt/llm`](../../../packages/llm/) + [`@lwt/llm-meter`](../../../packages/llm-meter/) — tier routing, $50/day cap visible in digest |
| Building per-app Buttons, Inputs, Modals, dark/light, a11y | ~20–40 hours per app, perpetual drift | Stage 6: [`@lwt/design-system`](../../../packages/design-system/) + [`@lwt/ui`](../../../packages/ui/) + [`@lwt/design-tokens`](../../../packages/design-tokens/) |
| Conformance debt accumulating silently until Stage 4 blocks deploys | 0 today, ∞ when enforcement turns on (per [`docs/ROADMAP.md`](../../ROADMAP.md#stage-4) Stage 4) | Package adoption *is* the conformance fix; one PR closes many `❌` checks |
| Newsletter / drip / transactional email plumbing per app | ~5–10 hours per app | [`@lwt/email`](../../../packages/email/) (incl. PR 3a drip sequencer) |

### Why an app team skips a Factory package (the honest list)

| Skip reason | Factory's answer |
|---|---|
| "The package doesn't exist yet for what I need." | Open a gap row in [`GAP_REGISTER.md`](../../GAP_REGISTER.md); supervisor schedules it. Don't fork. |
| "The README doesn't tell me how to wire it in 5 minutes." | README failure — Factory P1. Every package gets a "Quickstart in 5 lines" section. |
| "It pulls in things I don't need (Workers-specific runtime)." | Factory only targets Cloudflare Workers per [`CLAUDE.md`](../../../CLAUDE.md#stack). If you're not on Workers, you're not the ICP — see Build-stop §6. |
| "I'll add it next sprint." | Conformance shadow score makes the delay visible. Stage 4 enforcement (per [`docs/ROADMAP.md`](../../ROADMAP.md)) makes "next sprint" a deploy block. |

### Last "ICP conversation"

⏳ **The operator IS the customer.** "Conversations" are weekly: the Monday review reads [`docs/STATE.md`](../../STATE.md) + [`docs/conformance/summary.md`](../../conformance/summary.md) and asks "which package would have closed the most cohesion this week?" Gap captured in [`G15`](../../GAP_REGISTER.md#p2--stage-2-5-fix) (Monday review template still missing).

---

## 3. Channel hypothesis

**Internal product. Owned channels only.** No earned, no paid. Per [`ICP_MATRIX.md`](../ICP_MATRIX.md): "Factory (internal) · channel partner / aggregator: 🚫 (not selling Factory externally 2026)."

### 3.1 Owned

| Channel | Engine | Plan |
|---|---|---|
| **[`docs/STATE.md`](../../STATE.md) daily digest** | [`scripts/generate_state.py`](../../../scripts/generate_state.py) | First thing the operator + every agent reads. Surface adoption deltas + which app's cohesion moved + which package shipped. |
| **[`docs/conformance/summary.md`](../../conformance/summary.md)** | [`platform-conformance.yml`](../../../.github/workflows/platform-conformance.yml) | Per-repo scorecard with line-item `✅` / `❌`. The most direct "here's what to fix" surface. |
| **Package READMEs** | Per-package `README.md` in [`packages/*/README.md`](../../../packages/) | Every package's README is the entire sales page for that package. Quickstart in 5 lines or fewer; the constraint it encodes; the gate it satisfies. |
| **Daily Pushover supervisor digest** | [`scripts/cost_digest.py`](../../../scripts/cost_digest.py) + aggregator | Answers the 5 questions (shipping / shipping-right / buying / staying / affordable per [`docs/ROADMAP.md`](../../ROADMAP.md) Stage 2). Cohesion deltas surface in the same digest. |
| **[`docs/customer-gate/`](../../customer-gate/) catalog** | Quarterly worksheet (paired 1:1 with this ICP) | The operator's own forcing function. If Factory isn't saving hours per app, the catalog surfaces it within 90 days. |
| **[`GAP_REGISTER.md`](../../GAP_REGISTER.md)** | Weekly Monday triage | Adoption blockers land here as P1/P2 rows; sub-agents close them in milestone order. |
| **Sub-agent migration PRs** | `factory-cross-repo[bot]` cross-repo workflow | When a package is mature, supervisor dispatches a migration PR into each consuming app — adoption with zero app-team effort. |

### 3.2 Earned

🚫 Not applicable. Factory is not externally sold in 2026.

### 3.3 Paid

🚫 Not applicable. See above.

---

## 4. Pricing + economics

Factory is "free at the margin" — the portfolio operator pays the build cost once and every app inherits it. The real economic question is **engineering hours saved per month per app team vs Factory's build cost**.

| Field | Internal-equivalent | v0 hypothesis |
|---|---|---|
| Pricing model | Adoption count + cohesion score uplift | 0 ¢ to app team; cost paid by Factory build budget |
| Target "ARPU" | **Engineering hours saved per month per consuming app** | 20–40 hours/mo per app at steady state (across all packages an app adopts) |
| Target "gross margin" | Hours saved across portfolio − hours spent building Factory packages | Net positive at ≥3 apps consuming any given package |
| LLM cost (real $) | Anthropic spend serving sub-agents that maintain Factory | $377/mo trailing 30d per [`docs/STATE.md`](../../STATE.md); $1500/mo cap |
| "LTV" | Hours saved × app lifetime × portfolio-size multiplier | Each package: hours × (months remaining until Factory replaced or app sunset) × 5 apps |
| "CAC" | Hours spent shipping the package + its README + sub-agent migration PR | Per package: 8–40 engineer-hours; "CAC" recovered at 1–2 apps adopting |
| "MRR equivalent" — first milestone | First 3 apps importing the same package | xico-city already imports `@lwt/logger`, `@lwt/errors`, `@lwt/monitoring` — that's the proof |
| "MRR equivalent" — second milestone | Every portfolio app at cohesion ≥70 | Per [`docs/ROADMAP.md`](../../ROADMAP.md) Stage 4 graduate-to-enforcement threshold |
| "MRR equivalent" — third milestone | Every portfolio app at cohesion ≥80 | Stage 4 enforcement enabled; conformance becomes a required check |

**Net-net (what we don't know yet, captured in §8):** is the hours-saved-across-portfolio number larger than Factory's own build hours? The instrumentation to answer this is `G37`/`G38` (cost digest scope) + a future hours-tracking line. Today this is *believed* but not *measured*.

---

## 5. Built-in growth hooks (Factory-specific)

How Factory drives its own internal adoption. Mechanisms substitute for B2B referral / virality hooks; they're all *internal* signals.

| Hook | Mechanism | Adoption leverage |
|---|---|---|
| **Per-package conformance score line** | [`docs/conformance/summary.md`](../../conformance/summary.md) shows `❌ @latimer-woods-tech/logger in deps` per repo — visible, scored, weighted | An app team sees the exact `npm install` that moves cohesion by N points. The README is one click away. |
| **Daily Pushover digest with adoption delta** | [`scripts/cost_digest.py`](../../../scripts/cost_digest.py) + aggregator includes "which packages each app adopted this week" | The operator notices a regression (e.g. an app fork) the day it happens, not next quarter. |
| **5-question digest answer rate** | Stage 2 deliverable: shipping / shipping-right / buying / staying / affordable per [`docs/ROADMAP.md`](../../ROADMAP.md) | If the digest can answer all 5 only because Factory provides the bindings, that's an irreversible adoption hook. |
| **M1/M2 customer-gate catalog** | [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md) Product 2 worksheet | The operator's own quarterly self-audit; surfaces Factory drift before app teams complain. |
| **Killer-feature matrix per package** | Package READMEs declare the one thing the DIY alternative cannot do (e.g. `@lwt/errors.withRetry` jittered backoff + idempotency key handshake) | Each package's "you'd be sad if this went away" moment is documented up-front, not discovered in incident postmortem. |
| **Sub-agent migration PRs** | `factory-cross-repo[bot]` opens ready-to-merge migration PRs into consuming app repos | Adoption requires only a CODEOWNERS approval, not engineering hours. |
| **Stage 4 enforcement as the forcing function** | Per [`docs/ROADMAP.md`](../../ROADMAP.md) Stage 4: conformance graduates from shadow to required | "Adopt or stop deploying" is a real, dated deadline. Pacing comes from the roadmap, not from social pressure. |
| **Cross-repo CHANGELOG visibility** | Each `@lwt/*` package's CHANGELOG.md surfaces in Renovate PRs into consuming apps | The "what's new" is delivered into the consuming app's PR queue automatically. |

Pattern: **each new package adopted by N apps = N future packages get the same path for free.** The infrastructure for adoption (cross-repo workflows, conformance scoring, migration PRs) compounds.

---

## 6. Build-stop threshold

**When does Factory stop adding packages and just operate?**

Per [`docs/ROADMAP.md`](../../ROADMAP.md) **Stage 3 — Adoption tools** (milestones M4/M5: `@lwt/eslint-config` + `@lwt/tsconfig-base` + `@lwt/biome-config`; Renovate at org level) is the last *additive* stage. After Stage 3, Factory work shifts from "publish new packages" to "drive adoption + enforcement of existing packages."

**Non-negotiables before Factory enters "operate, don't extend" mode:**

| # | Capability | Status | Source |
|---|---|---|---|
| 1 | All 24 packages in [`CLAUDE.md`](../../../CLAUDE.md#package-dependency-order) Package Dependency Order have shipped 0.x | Partial — most exist; not all at meaningful surface area | [`packages/`](../../../packages/) |
| 2 | Every portfolio app's cohesion ≥70 in [`docs/conformance/summary.md`](../../conformance/summary.md) | ❌ today: HumanDesign 41, capricast 24, factory-admin-studio 29, cypher-healing 25, xico-city 52 | [`docs/conformance/summary.md`](../../conformance/summary.md) |
| 3 | LLM cost cap **enforced** (not just visible) per [`G8`](../../GAP_REGISTER.md#p1--stage-1-2-must-fix) | Partial — visibility shipped; enforcement deferred | [`packages/llm-meter/`](../../../packages/llm-meter/) |
| 4 | Stage 4 enforcement workflow live (`platform-conformance.yml` blocks deploys at <70) | ❌ pending Stage 4 ship | [`docs/ROADMAP.md`](../../ROADMAP.md#stage-4) |
| 5 | Stage 6 UI/UX packages (`@lwt/ui-tokens`, `@lwt/design-system`, `@lwt/a11y`, `@lwt/forms`, `@lwt/icons`) adopted by ≥3 UI-less apps | ❌ pending Stage 6 ship | [`packages/ui/`](../../../packages/ui/), [`packages/design-system/`](../../../packages/design-system/), [`packages/design-tokens/`](../../../packages/design-tokens/) |

**% shipping today:** ~30% (most packages exist, adoption is the gap).

**"Operate, don't extend" entry date:** **2026-09-30** target (end of Stage 3, immediately before Stage 4 enforcement). After this date, new package work requires an ADR; default mode is "increase adoption + close conformance gaps on existing packages."

---

## 7. Quarterly gate

Internal-product equivalent of the external graduate / sunset KPIs.

- **Next review:** 2026-08-17
- **Graduate-to-`earned_active`** (internal-equivalent: "required-conformance ready"):
  - Median cohesion across portfolio ≥ 60
  - At least 3 apps importing ≥6 `@lwt/*` packages each
  - `platform-conformance.yml` run on every PR org-wide
  - Per [`docs/ROADMAP.md`](../../ROADMAP.md) Stage 4: conformance graduates shadow → required only after most repos ≥80
- **Graduate-to-`paid_ready`** (internal-equivalent: "Stage 4 enforcement enabled"):
  - Median cohesion across portfolio ≥ 75
  - Zero P0 gaps open in [`GAP_REGISTER.md`](../../GAP_REGISTER.md)
  - All 5 questions answered by daily digest reliably (per Stage 2 exit criteria)
- **Sunset / kill threshold:**
  - Factory build hours/month > hours saved across portfolio for two consecutive quarters
  - OR portfolio shrinks to ≤2 apps (Factory's amortization math breaks down)
  - OR app teams unilaterally fork ≥3 packages in a quarter (signal: Factory is a tax, not a service)
- **Owner:** `@adrper79-dot`

---

## 8. What we don't know yet

Each is a job the supervisor loop (or the operator at the quarterly customer-gate) needs to answer. Captured here so the loop has explicit commitments, not vibes.

| # | Question | Mechanism |
|---|---|---|
| 1 | Which app should adopt the most Factory packages next? | Weekly cohesion-delta-per-engineer-hour ranking in [`docs/STATE.md`](../../STATE.md); the loop picks the app with the largest leverage. Current best guess: HumanDesign (highest weighted completion at 74.9%, lowest code-patterns score at 0). |
| 2 | What makes an app team skip a Factory package? | Quarterly customer-gate Section 1.5 (Product 2 — Factory) records skip reasons; rows promote to [`GAP_REGISTER.md`](../../GAP_REGISTER.md) P1 if the same reason appears across ≥2 apps. |
| 3 | Net-net: hours saved across portfolio vs hours spent building Factory? | Instrumentation TODO — extend [`scripts/cost_digest.py`](../../../scripts/cost_digest.py) with engineering-hours line per repo (commits × estimated hours, or self-reported). Until shipped, this is *believed*, not *measured*. |
| 4 | Which package's README is the bottleneck (high install count, low actual usage)? | Add a `@lwt/llm-meter`-style telemetry hook per package's entry function; flag packages where install ≥1 but call count = 0 for >14 days. |
| 5 | Does Stage 4 enforcement actually move cohesion, or do app teams find workarounds? | First 30 days post-Stage 4 ship: compare median cohesion vs trailing 30 days pre-ship; if delta < 10 points, enforcement is theater. |
| 6 | Is the package dependency order in [`CLAUDE.md`](../../../CLAUDE.md#package-dependency-order) still right after real adoption data lands? | Quarterly review: count actual cross-package imports vs declared order; reorder if reality diverges. |

⏳ Operator commits dates only if these mechanisms underperform — otherwise the loop runs them on its own.

---

## 9. Cross-references

- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — matrix cell `Factory × Practitioner-of-1`
- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — global plan
- [`CONSTITUTION.md`](../CONSTITUTION.md) — non-negotiable rules
- [`VOICES.md`](../VOICES.md) — `factory_internal` profile spec
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../../customer-gate/M1_M2_CATALOG_2026-05-17.md#product-2--factory-the-platform) — paired operator worksheet for this product
- [`docs/PLATFORM_STANDARDS.md`](../../PLATFORM_STANDARDS.md) — the 10 conformance dimensions Factory packages encode
- [`docs/conformance/summary.md`](../../conformance/summary.md) — current adoption per app (HumanDesign 41, capricast 24, factory-admin-studio 29, cypher-healing 25, xico-city 52)
- [`docs/STATE.md`](../../STATE.md) — live state, cost, completion
- [`docs/ROADMAP.md`](../../ROADMAP.md) — Stage 3 (build-stop), Stage 4 (enforcement gate)
- [`docs/GAP_REGISTER.md`](../../GAP_REGISTER.md) — outstanding gaps, including adoption blockers
- [`CLAUDE.md`](../../../CLAUDE.md) — package dependency order + hard constraints encoded by the packages
- [`packages/`](../../../packages/) — the 24 `@latimer-woods-tech/*` packages this ICP is about

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | Initial — internal-platform ICP; adoption replaces MRR; engineering hours saved replaces ARPU; owned channels only |
