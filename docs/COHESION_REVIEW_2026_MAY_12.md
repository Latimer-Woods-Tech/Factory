# Holistic Cohesion Review — May 12, 2026

**Grade: C+ (Functioning but fragmented)**

---

## Executive Summary

The Factory platform architecture is **sound and intentional**, but execution is **uneven across the app portfolio**. Core infrastructure (Factory monorepo packages, CI/CD, supervisor) is stable and advancing. Consumer apps (Prime Self, VideoKing, Cypher of Healing) show **critical deployment and operational debt** that undermines the platform's value proposition of "every app benefits from every platform improvement."

**The coherence gap:** The platform layer works; the app layer doesn't trust or use it.

---

## Portfolio Health Score

### ✅ Green: Core Infrastructure (Factory)
- **Admin-Studio (staging):** 200 ✓ Healthy, tests unblocked (PR #620 merged May 11)
- **Schedule-Worker:** 200 ✓ Healthy, integrated with video-cron
- **Synthetic Monitor:** 200 ✓ Running, checks all health endpoints
- **Factory Supervisor:** 200 ✓ Active loop, matching templates, metering LLM calls
- **CI/CD Automation:** 100% success rate on automation workflows (label-sync, board-sync, copilot-approve)
- **Packages:** All 19 Foundation/Active packages pinned, published via Trusted Publishers (OIDC)

**Confidence:** Mature. Ready to scale.

---

### 🟡 Yellow: Prime Self (selfprime.net)
| Component | Status | Issue |
|-----------|--------|-------|
| Frontend (Pages) | 200 ✓ | Loads, CSP violations (fouc-init.js MIME type) |
| API (prime-self Worker) | 401 auth ✓ | No /health endpoint (should exist) |
| POST /api/profile/generate | 500 ✗ | Backend crash, generic error ("Something unexpected happened.") |
| Database (Neon) | Unknown | Not health-checked |
| JWT auth | 200 ✓ | Functional, tokens issued correctly |

**Root cause:** Backend endpoint unimplemented or broken. Not a frontend SRI/CSP issue (as sprint plan suggested).

**Risk:** Product feature (profile generation) is broken. 10/10 smoke test failure rate (issue #526).

**Mitigation needed:**
- Debug Cloudflare Worker logs for prime-self (HumanDesign repo)
- Add /health endpoint (Worker missing this critical integration point)
- Implement error detail logging instead of generic "Something unexpected happened"

---

### 🟡 Yellow: VideoKing (api.itsjusus.com)
| Component | Status | Issue |
|-----------|--------|-------|
| API Worker (nichestream-api) | 200 ✓ | Healthy |
| Custom domain (api.itsjusus.com) | ❌ Outage | DNS/CF routing failed (reported May 2, not resolved) |
| Database (Neon) | Unknown | Hyperdrive ID known, health unknown |
| Frontend (Pages/itsjusus.com) | Unknown | Not tested |
| R2 Assets (assets.itsjusus.com) | Unknown | Custom domain status unknown |

**Risk:** API is healthy but unreachable via branded domain. Customers routing to `.workers.dev` fallback (violates CLAUDE.md rule: "every user-facing worker endpoint must have a branded custom domain").

**Mitigation needed:**
- Run `fix-videoking-domains.yml` to re-attach api.itsjusus.com + assets.itsjusus.com
- Verify Pages + Workers + R2 domain consistency before resolving outage ticket

---

### 🔴 Red: Cypher of Healing (api.cipherofhealing.com)
| Component | Status | Issue |
|-----------|--------|-------|
| API Worker (cypher-healing) | Unknown | Connection refused/timeout |
| Custom domain (api.cipherofhealing.com) | ⚠️ Unknown | Attached per registry, not responding |
| Database (Hyperdrive) | Unknown | Not health-checked |

**Risk:** App appears offline or misconfigured. No health check, no observability, no error tracking in scope.

**Mitigation needed:**
- Check Cloudflare dashboard for Worker deploy status + logs
- Verify custom domain attachment is actually live
- Add health endpoint + Sentry integration
- Confirm Neon database is provisioned

---

## Cohesion Analysis — Design vs. Reality

### What the Architecture Intends
```
Platform Layer (Factory monorepo)
├─ 19 shared packages (@latimer-woods-tech/*)
├─ CI/CD workflows (reusable, app-agnostic)
├─ Supervisor (template-driven, token-metered)
├─ Secret rotation + deployment orchestration
└─ Observability (Sentry, PostHog, factory_events)

Consumer Apps (independent repos)
├─ Prime Self (HumanDesign)
├─ VideoKing (standalone)
├─ Cypher of Healing (standalone)
└─ Xico-City (pending registry audit)
```

**Principle:** "Every platform improvement simplifies 4–7 downstream apps in one PR."

### What's Actually Happening
- **Factory** is advancing rapidly (PR #620, supervisor maturation, CI/CD hardening)
- **Prime Self** is 1–2 stages behind (no health endpoint, broken profile generation, auth crisis on May 11)
- **VideoKing** is decoupled (domain outage unreported to Factory ops, no sync with service registry)
- **Cypher of Healing** is unmaintained (no health signal, unknown deploy status)

**Actual coupling:** Inverse—apps are *blocking* platform progress.

---

## Critical Gaps (Blocking Cohesion)

### 1. **Health Endpoint Standard Not Enforced**
- Prime Self: No `/health` or `/api/health`
- Cypher of Healing: No health signal
- **Impact:** Synthetic Monitor can't verify they're alive. Human operators must guess.
- **CLAUDE.md rule 5 (Verification Requirement):** "Never declare a fix 'done' based on CI green alone. `curl /health` must return 200."
- **Fix:** Add mandatory health endpoint to all app scaffolds (Phase 7).

### 2. **Service Registry ↔ App Repos Are Out of Sync**
- VideoKing: Outage reported May 2, registry not updated, no escalation
- Xico-City: Issue #586 "Add xico-city to Factory service registry" still P0 Todo (not started)
- Prime Self: Health endpoint missing, not flagged in registry
- **Impact:** Ops doesn't know what's alive, what's broken, or how to fix it.
- **Fix:** Automate registry validation in CI/CD (check every deploy against service-registry.yml).

### 3. **Error Detail is Obscured**
- Prime Self: POST /api/profile/generate returns generic "Something unexpected happened."
- **Impact:** Developers can't debug. No context in logs or error response.
- **CLAUDE.md rule 3 (Hard Constraints):** Error handling, Sentry integration non-negotiable.
- **Fix:** All Workers must wire Sentry + return structured errors with request IDs.

### 4. **Supervisor Loop Can't Reach Consumer Apps**
- No supervisor templates for Prime Self, VideoKing, Cypher of Healing deployed issues
- Issue #526 (Prime Self smoke tests) claimed by supervisor but unresolved since May 10
- **Impact:** Supervisor can't help fix apps it doesn't understand.
- **Fix:** Onboard consumer app repos into supervisor ecosystem (FRIDGE rule 1 exceptions + templates).

### 5. **Custom Domain Attachment is Manual + Fragile**
- VideoKing domain outage (May 2, still open May 12)
- Cypher of Healing: Unknown if domain is actually live
- Prime Self: Custom domain working, but API has no health check
- **Impact:** Single point of failure for every app's public surface.
- **Fix:** Automate domain attachment validation in CI/CD (test custom domain in smoke tests).

---

## What's Working Well ✅

### Supervisor Architecture
- Template matching is sound (if uneven coverage)
- Token metering prevents runaway LLM costs
- Denylist (FRIDGE rule 1) properly isolates wordis-bond frontend
- Issue triage (labels, priorities, approval flow) is robust

### CI/CD Foundation
- Reusable workflows reduce duplication
- Copilot auto-approve + auto-merge loop is working (label-sync 100% success)
- Branch protection is incrementally hardening (apply-sec-hardening workflow live)
- Trusted Publishers (OIDC) removes static credentials from npm publish

### Factory Core Packages
- All 19 packages follow dependency order (errors → monitoring → logger → auth → …)
- Version pinning (no `^` / `~`) enforced, Renovate handles updates
- Type coverage: TypeScript strict mode, JSDoc on public APIs
- Build quality: tsup ESM-only, Vitest with CloudFlare pool

---

## Architectural Debt (Not Blocking, But Growing)

### Phase Misalignment
- **Phase 1 (Scaffolding):** Done for Factory + apps
- **Phase 2 (Package implementations):** Active (16/23 packages in scope)
- **Phase 3–6 (Capabilities expansion):** Planned but unstarted for consumer apps
- **Consumer apps:** Prime Self at Phase 2.5, VideoKing at Phase 2, Cypher at Phase 1.5
- **Impact:** Apps can't leverage full platform because platforms features don't exist yet (e.g., @latimer-woods-tech/video still Phase 2, blocking video production pipeline)

### Observability Gaps
- **Sentry:** Factory projects exist, consumer app projects unknown or missing
- **PostHog:** Board is integrated, app-level funnels not wired
- **factory_events (Neon):** Table exists in Factory, no consumer app events schema
- **Impact:** Can't measure product health (conversion, engagement) across the portfolio

### Migration Debt (Not Documented)
- **Xico-City:** Moved to Factory orbit (issue #611, rate-limiter IDs 1009–1011), but deployment status unknown
- **Prime Self:** Lives in HumanDesign repo, not Factory, but depends on Factory packages (incomplete decoupling)
- **VideoKing:** Deployed separately, custom domain outage shows ops isolation
- **Impact:** No single command to "deploy the platform" — each app is a separate runbook

---

## Path Forward: 3-Tier Remediation

### 🔴 Tier 1: Unblock Product (Next 48 Hours)

**Immediate:**
- [ ] **Prime Self issue #526:** Debug profile generation endpoint (Cloudflare Worker logs in HumanDesign repo)
  - Add Sentry integration to prime-self Worker
  - Return structured error with request ID in 500 response
  - Add `/health` endpoint (must return 200 by May 13 standup)

- [ ] **VideoKing domain outage:** Run `fix-videoking-domains.yml` to re-attach api.itsjusus.com
  - Verify custom domain live with `curl https://api.itsjusus.com/health`
  - Close outage ticket (May 2 incident now 10 days old)

- [ ] **Cypher of Healing health check:** Verify Worker is deployed
  - Check Cloudflare dashboard for cypher-healing Worker status
  - If healthy: add /health endpoint
  - If down: redeploy via standard CI/CD

**Owner:** @adrper79-dot (CODEOWNER) — these are hard blockers on "every app benefits" value prop

**Validation:**
```bash
curl -s https://api.selfprime.net/health && echo "✓ Prime Self"
curl -s https://api.itsjusus.com/health && echo "✓ VideoKing"
curl -s https://api.cipherofhealing.com/health && echo "✓ Cypher"
```

---

### 🟡 Tier 2: Systematic Integrity (Next 2 Weeks)

**Service Registry Audit (Issue #586 + New)**
- [ ] Inventory ALL apps in orbit: Prime Self, VideoKing, Cypher, Xico-City, + others
- [ ] For each app:
  - [ ] Verify custom domain is live (curl + 200)
  - [ ] Verify /health endpoint exists and returns JSON
  - [ ] Register in service-registry.yml with health_endpoint, consumers, bindings
  - [ ] Update GitHub issue references

**Health Endpoint Enforcement**
- [ ] Add to Phase 7 scaffold: mandatory `/health` endpoint
- [ ] Add to CI/CD `_app-deploy` workflow: smoke test custom domain
  - Example: `curl -f https://{custom_domain}/health || exit 1`

**Error Observability**
- [ ] All Workers must wire Sentry (non-negotiable, CLAUDE.md hard constraint)
- [ ] All error responses must include `requestId` + `timestamp`
- [ ] Profile generation (Prime Self) must return structured error, not generic message

---

### 🟢 Tier 3: Systemic Strength (Ongoing, by June 1)

**Supervisor Onboarding for Consumer Apps**
- [ ] Create templates for Prime Self (issue triage, deploy flow)
- [ ] Create templates for VideoKing (domain checks, deploy verification)
- [ ] Onboard Xico-City (pending registry completion)
- [ ] Map supervisor-claimed issues to runbooks (not just templates)

**Observability Wiring**
- [ ] Confirm Sentry projects exist for all apps (one per app, Factory org)
- [ ] Wire PostHog to Prime Self + VideoKing (funnels, engagement tracking)
- [ ] Migrate Prime Self `factory_events` to Neon (if it has analytics needs)
- [ ] Dashboard: "Portfolio Health" showing all 4+ apps' /health status

**Phase Alignment Document**
- [ ] Audit which packages are actually used by which apps
- [ ] Document which Phase each app is in (1=scaffolding, 7=mature ops)
- [ ] Create upgrade path from Phase 2 → Phase 3–6 for VideoKing + Cypher

---

## Grading Rationale: C+

| Dimension | Grade | Evidence |
|-----------|-------|----------|
| **Architecture clarity** | A | FACTORY_V1.md, FRIDGE.md, service-registry.yml are thorough |
| **Infrastructure stability** | A | Factory CI/CD, supervisor, packages all advancing reliably |
| **App operational readiness** | C | Prime Self 500 errors, VideoKing domain down 10 days, Cypher unreachable |
| **Cross-app cohesion** | C− | Apps are decoupled to the point of isolation; registry out of sync |
| **Observability maturity** | C | Health endpoints missing, error detail obscured, Sentry gaps |
| **Runbook clarity** | B+ | CLAUDE.md is canonical, but consumer app runbooks missing |
| **Onboarding for new agents** | B | Platform is documented, but supervisor templates for apps are incomplete |

**Why not higher?**
- Code is good, but deployments are fragile (domain outages, health checks missing)
- Platform advances don't automatically benefit apps (decoupling is too extreme)
- Operational debt is growing (xico-city still not registered 40+ days later)

**Why not lower?**
- Architecture is sound and intentional (not accidentally cohesive)
- Core platform is stable and advancing
- Problems are solvable without redesign (they're execution gaps, not design flaws)

---

## One-Sentence Summary

**The Factory platform works well; the apps don't trust or integrate with it well enough to benefit from improvements — fix health endpoints and service registry sync, and the grade moves to A−.**

