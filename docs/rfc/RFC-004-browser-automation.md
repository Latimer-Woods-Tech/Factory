# RFC-004: Native Browser Automation Service

## Metadata

```
RFC Number:     RFC-004
Title:          Native Browser Automation Service (GCP Cloud Run + @latimer-woods-tech/browser)
Author:         adrper79-dot
Date Filed:     2026-05-14
Status:         draft
Target Ship:    Q3 2026
Updated:        2026-05-14 — initial draft from #680
```

Tracks: [#680](https://github.com/Latimer-Woods-Tech/Factory/issues/680)

---

## 1. Problem Statement

Factory needs a callable runtime for headless-browser work to support:

1. **Lead generation & social scraping** — automated scraping of public profile/post data on social platforms, piped into `@latimer-woods-tech/llm` for qualification, then into Loops for outreach sequencing.
2. **Self-healing & QA** — on-demand visual regression, broken-link crawling, and dynamic smoke checks that GitHub-Actions-scheduled jobs can't trigger reactively.

Today, Chromium runs in three places, none of which is reactively callable:

| Surface | Where | Why we can't reuse it |
|---|---|---|
| `apps/synthetic-monitor/` | Cloudflare Worker | No browser runtime in Workers; just probes HTTP. |
| `apps/prime-self-smoke/` | GitHub Actions (Playwright) | Cron-only; cannot be invoked on-demand from a Worker. |
| `render-video.yml` | GitHub Actions (Remotion + ffmpeg) | Video-specific pipeline; can't be coerced into scraping/QA. |

**Business value:** lead-gen is revenue-adjacent (top of funnel). Self-healing reduces incident MTTR. Both are gated today by the inability to run a real browser on demand.

---

## 2. Proposed Solution

### 2.1 Core Approach

Run Playwright + Chromium inside a Dockerized **GCP Cloud Run** service (`apps/browser-agent`), mirroring the ratified `xico-city-processor` pattern. The Cloud Run service exposes a small typed API (`POST /scrape`, `POST /screenshot`, `POST /probe`). The `@latimer-woods-tech/browser` package is a **client** for that API — it runs inside Workers, mints an OIDC ID-token via the existing JWT-bearer flow, and calls Cloud Run with `Authorization: Bearer <id-token>`.

The package itself contains **no Playwright, no Chromium, no Node built-ins** — it's Workers-compatible by construction. The "browser" in the name is the *thing it talks to*, not what it embeds.

### 2.2 Implementation Strategy

**Phases (numbered to match the issue checklist):**

- **Phase 0 — RFC & governance** (this doc). Exit: this RFC `accepted`.
- **Phase 1 — Infrastructure (GCP)**.
  - Mint `browser-agent-sa@factory-495015.iam.gserviceaccount.com`. **Not** `factory-sa@`. Roles: `roles/run.invoker` (consumers), `roles/secretmanager.secretAccessor` (target secrets only).
  - Build `apps/browser-agent` — Dockerfile, Express+Playwright app, Cloud Run deploy.
  - Concurrency knobs: `--max-instances=10`, `--concurrency=4`, `--timeout=300s` (5 min, NOT the 60-min issue default — see §4.5 risk).
  - Endpoint behind IAM (`--no-allow-unauthenticated`).
- **Phase 2 — Factory client package** (`@latimer-woods-tech/browser`).
  - **Package #24** in [CLAUDE.md](../../CLAUDE.md) dependency order. Deps: `errors`, `logger`. No other deps.
  - OIDC token minting reuses the supervisor-sa pattern from commit `67e7b9ab` / `3b2bfa55` (Stage 1 GCP Secret Manager).
  - Typed surface: `scrape(url, selectors): Promise<ScrapedRecord>`, `screenshot(url, viewport?): Promise<R2Url>`, `probe(url): Promise<Probe>`.
- **Phase 3 — Consolidate existing Chromium surfaces** (NEW vs the issue; see §2.4).
  - `apps/prime-self-smoke/`: migrate Playwright tests off GH Actions onto `browser-agent`. Smoke worker calls `browser.probe(...)` on cron; CI still runs the same test bodies but against the service.
  - `apps/synthetic-monitor/`: extend the existing HTTP probe to optionally call `browser.probe(...)` for routes that need JS execution.
- **Phase 4 — First lead-gen consumer** (`apps/lead-scraper`).
  - Cron Worker; reads target list from Neon; calls `browser.scrape(...)`; pipes results through `@latimer-woods-tech/llm` (Tier-1 Anthropic for ranking); writes scored rows back to Neon; emits PostHog `lead_scored` events; pushes top-N into Loops.
  - **Compliance gate**: Phase 4 ships only after §3.3 (Compliance & Legal) closes.

### 2.3 Alternatives Considered

- **A. Browserless.io / ScrapingBee / Bright Data SaaS**
  - Pros: zero infra, fast to launch, mature anti-bot evasion.
  - Cons: vendor lock-in, per-page cost compounds at scale, PII flows through a third party, no integration with our IAM.
  - **Rejected because:** our scraping volume estimate (~50k pages/mo Q3, growing) crosses the cost-crossover line at ~30k pages/mo on every vendor we priced. We already pay for GCP.

- **B. Cloudflare Browser Rendering API**
  - Pros: Workers-native, no extra account, one billing system.
  - Cons: ~6-page-per-second account cap, no long-running session support, no Playwright (just a subset API), beta-tier reliability.
  - **Rejected because:** lead scraping needs >6 pps bursts, plus full Playwright (cookies, multi-step nav, file downloads).

- **C. Browser inside a Durable Object**
  - Pros: keeps everything in Cloudflare.
  - **Rejected because:** Chromium doesn't run in V8 isolates. Not technically feasible.

- **D. Self-host on Cloudflare Workers + R2 with `puppeteer-core` over WebSocket to a hosted Chrome**
  - Pros: novel; cheap.
  - **Rejected because:** the "hosted Chrome" half is still Cloud Run (or equivalent) — we're just hand-rolling the protocol. Use Playwright's actual API.

- **E. Bring up dedicated VMs (GCE / Fly.io)**
  - Pros: full control, persistent disk for cookies, easy session reuse.
  - **Rejected because:** ops burden (patching, scaling, monitoring) outweighs Cloud Run's drawbacks for our volume. Revisit if Cloud Run cold-start latency exceeds 4s p95.

### 2.4 Out of Scope

- **Anti-bot evasion / residential-proxy rotation.** First version uses datacenter IPs; if blocked we revisit.
- **Headed / interactive sessions.** Headless only.
- **Persistent cookies across runs.** Stateless per request; cookies passed in by caller if needed.
- **Browser Rendering API fallback.** If GCP outage takes down browser-agent, callers fail closed — no automatic fallback to CF Browser Rendering.
- **Sandboxing of arbitrary user scripts.** This service runs *our* Playwright code, not user-supplied JS.

---

## 3. Impact Analysis

### 3.1 User Impact

- **Customers / app users:** none directly. Indirect: better outreach quality → fewer mis-targeted emails → fewer unsubscribes.
- **Creators:** none.
- **Internal admins:** new dashboard tile for lead-scraper throughput + cost. Ops dashboard adds Cloud Run latency/error panels.

### 3.2 Team Impact

- **Engineering:** ~1 engineer × 4 weeks (Phases 1+2). Phase 3 consolidation: +1 week. Phase 4 lead-scraper: +1 week.
- **Product:** Phase 4 needs target-criteria definition (which platforms, which signals).
- **Design:** none — operator-only consumer.
- **Ops:** new runbook (`docs/runbooks/browser-agent.md`); add Cloud Run latency/error budgets to SLO doc.
- **Support:** none.
- **Legal:** **see §3.3** — must sign off before Phase 4.

### 3.3 Business Impact

- **Revenue:** Phase 4 unlocks programmatic lead-gen; baseline assumption is 200 qualified leads/mo at 2% close → 4 deals/mo at our ACV. Refine post-launch.
- **Cost to operate:** estimated $80–$150/mo Cloud Run for first six months at scrape volume above. Sentry/PostHog overhead negligible.
- **Legal / compliance:** scraping public social data hits a thicket — platform ToS, GDPR Art. 14, CCPA opt-outs, anti-circumvention statutes. **Hard blocker for Phase 4:** compliance review covering (a) target-platform ToS audit; (b) PII handling (storage, retention, deletion-on-request); (c) honoring `robots.txt` and rate-limiting per host; (d) opt-out mechanism for scraped subjects. Until that review closes, Phase 4 cannot start. Same risk family as the wordis-bond TCPA precedent that motivated [FRIDGE rule 1](../supervisor/FRIDGE.md).
- **Market positioning:** outreach-quality lift is meaningful but not differentiating; this is table-stakes infrastructure.

---

## 4. Timeline & Resources

### 4.1 Estimated Effort

- Engineering: 1 × 6 weeks = 6 person-weeks (Phases 1–4 sequential).
- Compliance review (Phase 4 gate): ~1 person-week + legal review.
- Risk: **Medium** — Cloud Run + Playwright is well-trodden but the compliance gate is a non-trivial unknown.

### 4.2 Milestones

| Milestone | Owner | Target Date | Notes |
|-----------|-------|-------------|-------|
| RFC accepted | adrper79-dot | 2026-05-28 | This doc → `accepted` |
| Phase 1 GCP infra live | TBD | 2026-06-12 | Cloud Run service responding to IAM-auth'd POSTs |
| Phase 2 client package published | TBD | 2026-06-19 | `@latimer-woods-tech/browser@0.1.0` |
| Phase 3 consolidation | TBD | 2026-06-26 | prime-self-smoke + synthetic-monitor migrated |
| Compliance review complete | TBD + Legal | 2026-07-03 | Phase 4 gate |
| Phase 4 lead-scraper alpha | TBD | 2026-07-17 | Internal-only |
| Phase 4 GA | TBD | 2026-07-31 | Feature flag flipped via Flagship |

### 4.3 Hard Dependencies

- **Stage 1 GCP Secret Manager** (commits `67e7b9ab`, `3b2bfa55`) — already shipped; reuses supervisor-sa OIDC pattern.
- **Flagship feature-flags** (#436, #437) — for Phase 4 GA gating.
- **Compliance review** — Phase 4 only.

### 4.4 Soft Dependencies

- `@latimer-woods-tech/llm` Tier-1 routing (already done) — Phase 4 ranking.
- PostHog event schema for `lead_scored` — can be added in Phase 4.

### 4.5 Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Cloud Run cost runaway from looping scrape job | Medium | High | `--max-instances=10` cap; GCP billing alert at $200/mo; per-request 5-min timeout |
| Compliance review fails / blocks Phase 4 indefinitely | Medium | High | Start review in parallel with Phase 1; Phases 1–3 deliver value even if Phase 4 dies |
| Target platforms add aggressive bot detection mid-build | Medium | Medium | Out-of-scope §2.4 today; revisit with residential-proxy budget if blocked |
| Chromium / Playwright version drift between Cloud Run image and prime-self-smoke CI | Low | Medium | Pin both to the same Playwright tag; integration test on every bump |
| OIDC token-minting bug leaks creds | Low | High | Reuse already-audited supervisor-sa flow; never log tokens; rotate `BROWSER_AGENT_SA_KEY` quarterly |
| Service-account scope creep (becomes a god-SA) | Medium | Medium | Roles bound *only* to `roles/run.invoker` on this service + `roles/secretmanager.secretAccessor` on named secrets; no project-level roles |

---

## 5. Success Criteria

### 5.1 Technical Success

- p95 cold-start latency for `browser.probe(url)`: <4s
- p95 warm-start `browser.scrape(url, selectors)`: <8s
- `browser-agent` uptime: ≥99.5% (relaxed vs the 99.9% Worker SLO because of GCP region dependency)
- `@latimer-woods-tech/browser` test coverage: ≥90% lines, ≥85% branches (matches package quality gate)

### 5.2 Business / User Success

- Phases 1–3 ship on time (≥80% of milestones met within 1 week of target).
- Phase 4 (gated on compliance): ≥500 leads scored/month sustained for 8 weeks post-GA.
- prime-self-smoke flake rate drops ≥30% post-consolidation (callable retries vs cron-only).

### 5.3 Measurement Plan

- Cloud Run metrics → Sentry + GCP Monitoring (cost, errors, latency).
- `factory_events` rows for every `scrape`/`screenshot`/`probe` call (PostHog mirror).
- Weekly digest auto-posted to ops Slack via existing `cost_digest.py`.

---

## 6. Open Questions

- **Q:** Does the client package live in Factory monorepo or `Latimer-Woods-Tech/browser` standalone repo?
  - **A:** TBD. Recommend monorepo (matches the other 23 packages); standalone only if licensing diverges.
- **Q:** Do we expose `browser.scrape` directly to operator-studio for ad-hoc one-offs, or always through the lead-scraper Worker?
  - **A:** TBD. Lean: no direct operator exposure in v1; everything goes through a Worker that owns the SA-key.
- **Q:** Should Cloud Run live in `us-central1` (current GCP region for Stage 1) or split for residency?
  - **A:** TBD. Default to `us-central1` unless a customer requires EU residency.
- **Q:** Naming — `@latimer-woods-tech/browser` vs `@latimer-woods-tech/browser-client`?
  - **A:** TBD. `-client` is more honest (the package is a client, not a browser); won't die on this hill.
- **Q:** Single Cloud Run service for both scraping and QA, or two?
  - **A:** TBD. Lean: one service, different endpoints. Avoid over-decomposition.

---

## 7. Related RFCs & ADRs

- **Depends on:** Stage 1 GCP Secret Manager pattern (commits `67e7b9ab`, `3b2bfa55`).
- **Related:** [FRIDGE rule 1](../supervisor/FRIDGE.md) — same risk family as wordis-bond TCPA; informs §3.3 compliance gate.
- **Informs:** future `@latimer-woods-tech/scrape-policy` package if compliance review surfaces per-platform rules complex enough to warrant their own module.

---

## 8. Design Review Checklist

Not applicable — no customer-facing UX. Operator-studio surface is optional and out of scope for v1.

---

## 9. Appendix

### A. Mockups

n/a (no UI).

### B. Detailed Technical Design

```
┌────────────────────────┐
│ Cloudflare Worker      │
│ (lead-scraper / smoke) │
└────────────┬───────────┘
             │ @latimer-woods-tech/browser
             │   mints OIDC id-token from SA key
             │   POST /scrape  Authorization: Bearer <id-token>
             ▼
┌────────────────────────┐         ┌──────────────────────┐
│ GCP Cloud Run          │  ───►   │ GCP Secret Manager   │
│ apps/browser-agent     │         │ scoped secrets       │
│   Express + Playwright │         └──────────────────────┘
│   --max-instances=10   │
│   --concurrency=4      │
│   --timeout=300s       │
│   IAM: invoker only    │
└────────────┬───────────┘
             │
             ▼
   Public target sites
```

### C. Similar Systems

- `apps/xico-city-processor/` (already deployed) — same Cloud Run sidecar pattern.
- Browserless.io architecture — informed §2.3 alt-A.
- Cloudflare Browser Rendering — informed §2.3 alt-B.
