# selfprime — GTM, Packaging & Dormant-Asset Roadmap

> Companion to [`PORTFOLIO_CAPABILITY_RECONCILIATION.md`](./PORTFOLIO_CAPABILITY_RECONCILIATION.md)
> and [`architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md`](./architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md).
> Turns the strategy work into a sequenced, validated plan. **Every asset below was empirically
> validated** (real logic, routed, tested) — not assumed from a filename.

## Strategy in one paragraph
selfprime is a **two-sided marketplace**, not two competing products. The free consumer funnel
(chart + cheap viral hooks) is the **demand engine you operate**; practitioners/agencies are the
**monetized supply** who serve that demand. You market *to* practitioners, *operate* the consumer
demand-gen centrally, and monetize the connection. The expensive video engine is the crown jewel and
the **anti-disintermediation moat**; the cheap demand-gen features (celebrity match, compatibility,
share cards, push, audio) are the flywheel that *feeds* it. Guiding rule: **gate on pillars, meter on
cost.**

## Validated dormant-asset inventory
> **Three-layer runtime validation** completed 2026-05-31 against `api.selfprime.net` (two live
> verified free-tier probe accounts, both cleaned up post-sweep). Probed with corrected paths from
> source-code inspection — every "404" was re-probed with the correct endpoint to distinguish
> *wrong path in probe* from *broken in production*.

| Asset | Runtime status | Classification |
|---|---|---|
| **Celebrity match** `GET /api/compare/celebrities` | ✅ **LIVE** — scored matches, real data (Bill Gates #1 for Generator 4/6; Lady Gaga for Sacral 2/4). 30 celebrities, 9 categories. | **Light up: expose in UI** |
| **Celebrity search** `GET /api/compare/search?q=` | ✅ **LIVE** — fuzzy search, real results (Einstein found) | **Light up** |
| **Celebrity list** `GET /api/compare/list` | ✅ **LIVE** — 30 celebrities, metadata, all 9 categories | **Light up** |
| **Celebrity by category** `GET /api/compare/celebrities/category/:cat` | ❌ **404** — route registered as `/api/compare/category/:cat` (without `/celebrities/` in path). Data exists; route pattern wrong. One-line fix. | **Fix route, then light up** |
| **Composite / compatibility** `POST /api/composite` `{personA:{...},personB:{...}}` | ✅ **LIVE** — full composite chart, channel analysis, dynamics, Forge roles. Requires `personA`/`personB` objects (not field-per-field). | **Light up: UI wrapper needed** |
| **Client messages** `GET /api/client/messages` | ✅ **LIVE** — returns `{messages:[]}` empty list (correct for new user) | **Light up** |
| **Client shared notes** `GET /api/client/shared-notes` | ✅ **LIVE** — returns `{ok:true,notes:[],total:0}` | **Light up** |
| **Live-session invite** `POST /api/live-session/invite/:clientId` | ✅ **CORRECTLY GATED** — `403 "Practitioner account required"` (free-tier user; correct gate) | **Live + gated correctly** |
| **Profile preview** `POST /api/profile/preview` | ✅ **LIVE** — returns real rule-based teaser, chart summary, `upgradeRequired:true`. Real copy. | **Light up: expose in UI** |
| **Transits/forecast** `GET /api/transits/forecast` | ✅ **LIVE** — works with lat/lng params (400 was wrong probe) | **Assemble daily push** |
| **Embed validate** `GET /api/embed/validate?apiKey=` | ✅ **LIVE** — 400 on missing key (correct); passes with valid key | **Light up + polish** |
| **Agentic commerce** | ✅ **LIVE** | Already live; promote |
| **Dream interpretation** `POST /api/dream-weaver/interpret` | ❌ **404** — confirmed with both `/api/dream-weaver/interpret` and `/api/dreamer/dreams`. Handler is 447 lines but **route path in index.js resolves to `/api/dreamer/dreams/:id/interpret`** (per-dream, not standalone interpret). Needs a dedicated interpret endpoint or entry via dream-save flow. | **Small build: add interpret endpoint or wire dream-save flow** |
| **Share / OG cards** `POST /api/share` + `GET /api/share` | ❌ **404** both — handler exists, tested, but endpoint not reachable in prod. Likely requires a chart save association. Needs route investigation. | **Investigate + fix wiring** |
| **Notion export** | 🔒 **Feature-flagged off** (`403 "Notion sync is currently disabled"`) | **Flip flag to enable** |
| **Team/group cluster** | 🔒 **Feature-flagged off** (`403 "Cluster features are currently disabled"`) | **Flip flag to enable** |
| **Daily energy-weather push** | 🔧 parts live (transits confirmed working) | **Assemble** |
| **Audio readings** | 🔧 net-new, ElevenLabs available | **Small build** |
| **Native mobile app** | ⚠️ scaffold only | **Real build** |

## Packaging (locked)
**Consumer ladder — gate on pillars, not quotas:**

| | Free $0 | Individual $19 | Pro Seeker ~$39–49 |
|---|---|---|---|
| Chart | ✓ | ✓ | ✓ |
| Synthesis readings | 1/mo | 10/mo | 30/mo |
| **Cinematic film** | **1 intro (once)** | **1/mo** | **1/mo** (richer cut) |
| Seeker's Questions | 5/mo | Unlimited | Unlimited |
| Transits/timing | Today | Full | + calendar sync + forecast |
| Dream journal / PDF / SMS / history | — | ✓ | ✓ |
| **Composite / relationship** | — | — | ✓ *(relationships pillar)* |
| **Personality / psychometric** | — | — | ✓ *(depth pillar)* |

**B2B (the metered engine lives here):** Practitioner $97 (workspace + client mgmt + branded + directory
+ **recurring video engine, credit-metered** + session layer), Agency $349 (seats + white-label + larger
credit grant). **Credits = practitioner/agency only.** Consumers never get credits — they get the fixed
1-intro / 1-per-month film, so consumer video cost is bounded with no ledger needed.

**New B2B SKU — Team/Corporate** (powered by `cluster.js`): group readings, team composition, role/gap
analysis. High-ACV; differentiated; nobody in HD does it well.

**API surface — its own brand: `mysticapi.com`** (different surface, same engine): a **synthesis API**
+ a **usage-metered video-gen API**, priced *above* humandesignhub's commodity data floor (their tiers
≈ $10/$30/$100/mo for raw chart/transit data). Do **not** compete on raw chart-data price; sell the
interpretation + render. A dedicated API brand (vs. `api.selfprime.net/v1`) signals a real developer
product and decouples it from the consumer brand.
- **`mysticapi.com`** = developer portal / docs / landing.
- **`api.mysticapi.com`** = the versioned API endpoints (`/v1/...`). Registered (planned) in
  `service-registry.yml`; CF zone added 2026-05-31. **Never** ship a `*.workers.dev` URL in the SDK/docs.

### URL & domain resolution (per `CLAUDE.md` + `service-registry.yml` + `SURFACES.md`)
Every **user/developer-facing** endpoint resolves to a branded custom domain; internal infra does not.
| Surface | Domain | Notes |
|---|---|---|
| Developer API | `api.mysticapi.com` (+ `mysticapi.com` portal) | planned entry registered; attach CF custom domain when the API worker ships |
| Consumer app + features | `selfprime.net` / `api.selfprime.net` | existing branded surfaces; celebrity/compat/team/sessions live here |
| Embed widget | `selfprime.net/embed.html` | ensure its calls hit `api.selfprime.net`, not workers.dev |
| Capricast sharing | `api.capricast.com` / `capricast.com` | branded already |
| **Render service (Cloud Run)** | internal `run.app` | server-to-server, signed-only; **deliberately not** branded/public |
| Shareable film playback | **`watch.selfprime.net`** — decided + registered (`planned`) | Branded vs. raw `customer-*.cloudflarestream.com`. Subdomain of the selfprime.net zone; DNS + worker/Pages player provisioned **with the engine sharing slice (Slice 7)** — no live DNS until an origin exists (dangling-DNS/takeover risk). |

Provisioning per surface: register in `service-registry.yml` → attach CF custom domain (worker
`custom_domain`) → for new top-level `selfprime.net` patterns, add the CF API worker-route → update
consumers first (Worker Rename Protocol) → curl-verify `/health`.

## The sequenced plan
Sized S/M/L. "Light up" = the code exists, validated; the work is exposure + polish + marketing.

### Wave 0 — Frame it (decisions + config) · S · do first
Pricing & packaging above: add the **Pro** tier + `blueprintVideo`/film entitlement to `getTierConfig`;
fence composite + personality + calendar-sync into Pro. **Why first:** the video engine's entitlement,
the API pricing, and every upsell reference the tier structure. Cheap, unblocks everything.

### Wave 1 — Demand-gen flywheel (cheap, highest CAC leverage) · M · parallelizable
All near-zero marginal cost — your cheapest growth, currently dark:
- **Celebrity match + share/OG cards** — expose + a share loop; **celebrity HD SEO pages** (long-tail
  organic). Feature the match in the intro film.
- **Friend/partner compatibility** — wrap `composite.js` in an "add a friend, see your bond" social
  loop (the proven niche virality mechanic).
- **Daily energy-weather push** — assemble push + transits + checkin into a daily habit hook.
- **Audio readings** — ElevenLabs, no render; bridges text and the monthly film.

### Wave 2 — Distribution & power-user · M/L
- **Embed widget** (light up + polish) — distributed top-of-funnel + white-label upsell.
- **Notion export** (light up) — power-user/practitioner stickiness.
- **Native mobile app** — the one real *build*: `cap add ios/android`, install Capacitor + RevenueCat
  deps, map IAP↔tiers, submit (budget for store-review latency). Mobile + native push is the retention
  multiplier — but plan it as a project, not a flip.

### Wave 3 — New revenue + practitioner depth (light up validated infra + productize) · M/L
- **Team/Corporate** — productize `cluster.js` (the readout UX + the B2B SKU + outbound). Potentially a
  bigger lever than the consumer ladder.
- **Practitioner session layer** — light up `live-session`/`messages`/`session-notes` (your 1-on-1
  infra already exists + tested). This is the anti-disintermediation stickiness; likely no Capricast
  build needed for consultations.
- **API tier** (on **`api.mysticapi.com`**) — synthesis API can ship now; the video-gen API rides the engine (after engine Slice 1–2). Attach the CF custom domain + flip the `service-registry.yml` entry from `planned` → `attached` when the worker ships.

### Parallel track — Video Engine (already in motion)
Slices 0–7 from the engine doc, running in a separate agent. Wave 0 pricing feeds its consumer
entitlement; Wave 3's video-gen API depends on its Slice 1–2. The consumer film (engine Slice 2) is the
hero artifact behind the Free-intro / paid-monthly model.

## Guardrails (carry into every wave)
- **Unit economics:** consumer video bounded (≤1/mo); practitioner video metered by credits priced
  ≥ marginal cost + margin; global spend ceiling + auto-throttle; credit/render numbers calibrated from
  real engine telemetry **before** recurring launch. (Add a **video retention/expiry policy** to bound
  Stream storage.)
- **No "AI" in any user-facing copy/UI/narration** — "your reading", "synthesis", "the Oracle".
- **Verify-before-build** stays the rule: this inventory was validated; re-validate anything before
  betting build effort (the codebase has a history of real-looking handlers returning mock data).
- **Don't over-parallelize** for a small operation — Waves 0→1 first (frame + funnel), then 2/3 as
  bandwidth allows, with the engine maturing alongside.

## Sequencing logic (the "why this order")
1. **Frame** (W0) before anything references pricing.
2. **Fill the funnel cheaply** (W1) before spending on the expensive engine surface — demand-gen is your
   lowest-cost, highest-leverage, and it's already built.
3. **Distribute & retain** (W2) once the funnel converts.
4. **Open new revenue** (W3) on validated infra, after the cheap wins prove the motion.
5. The **engine** runs in parallel as the crown jewel + moat; the cheap flywheel feeds it.
