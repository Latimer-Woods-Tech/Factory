# Full Portfolio App Scope Registry

**Purpose:** Comprehensive inventory of all Factory apps and external platforms, including status, ownership, delivery gates, W360 disposition, and verification requirements.

**Last Updated:** 2026-05-06 (local validation refresh)

**Validation note:** Factory-internal rows below reflect the latest local validation sweep in this repo. Live `/health` and deployed smoke verification remain pending unless explicitly marked verified.

---

## Factory Apps (apps/ directory)

### Worker-Based Apps

| App Name | Type | Owner | Repo | Status | Health | CI | Docs | Gates | W360 Phase |
|---|---|---|---|---|---|---|---|---|---|
| **admin-studio** | Hono Worker | Revenue/Admin team | factory (apps/) | ⚡ IN PROGRESS | /health ❓ | 🟡 Local typecheck passing | ✅ Full | RBAC, audit, deploy, smoke | P0 |
| **schedule-worker** | Hono Worker (Cron) | Video/Ops team | factory (apps/) | ⚠️ BETA | /health ❓ | 🟡 Local typecheck passing | ✅ Full | cron schedule, video dispatch queue | P0 |
| **video-cron** | Hono Worker (Cron) | Video team | factory (apps/) | ⚠️ BETA | /health ❓ | 🟡 Local typecheck passing | ✅ Partial | cron schedule, video rendering | P0 |
| **synthetic-monitor** | Hono Worker (Scheduled) | Observability/SRE | factory (apps/) | ⚠️ BETA | /health ✅ | ✅ Passing | ✅ Full | journey probes, SLO enforcement | P0 |

### UI Apps (React/Vite/Pages)

| App Name | Type | Owner | Repo | Status | Build | CI | Docs | Gates | W360 Phase |
|---|---|---|---|---|---|---|---|---|---|
| **admin-studio-ui** | React app | Revenue/Admin team | factory (apps/) | ⚡ IN PROGRESS | Vite | 🟡 Local typecheck passing | ✅ Full | a11y ≥95, component test harness | P1 |
| **video-studio** | React app | Video team | factory (apps/) | ⚠️ BETA | TBD | ❓ Unknown | ✅ Partial | video form validation, preview, status | P1 |
| **prime-self-smoke** | React smoke tests | Product/Design team | factory (apps/) | ⚠️ BETA | Vitest | 🟡 Typecheck added; smoke disabled | ✅ Partial | e2e landing page, auth flow | P1 |

### Reference/Template Apps

| App Name | Type | Owner | Purpose | Maturity | W360 Phase |
|---|---|---|---|---|---|
| **prime-self-reference** | Reference | D01/D09 | Standalone Hono + React template (W360-035) | 📚 Template | P0 |
| **videoking** | Case study | D13 | End-to-end video production platform (docs only) | 📚 Planning | P1 |

---

## External App Repos (adrper79-dot organization)

### Live/Active Apps

| App Name | Type | Owner | Current Status | CI | Docs | W360 Disposition | Graduation Gate |
|---|---|---|---|---|---|---|---|
| **prime-self** | Hono + React | D01 | ✅ Production | ✅ Passing | ✅ Full | LAUNCHED | W360-035 ✅ |
| **prime-self-ui** | React frontend | D01 | ✅ Production | ✅ Passing | ✅ Full | LAUNCHED | W360-035 ✅ |
| **xico-city** | Hono + React | D04 | ⚠️ Staging | 🟡 Partial | ✅ Full | STAGING → LAUNCH | W360-035 🟡 |

### Pending/Template Apps

| App Name | Type | Owner | Current Status | Setup | CI | Docs | W360 Disposition | Graduation Gate |
|---|---|---|---|---|---|---|---|---|
| **wordis-bond** | Marketplace | D07 | 📚 Planning | ❌ Not started | ❌ No | ❌ No | DESIGN | W360-032 → 035 |
| **cypher-healing** | Community | D08 | 📚 Planning | ❌ Not started | ❌ No | ❌ No | DESIGN | W360-032 → 035 |
| **ijustus** | Booking | D11 | 📚 Planning | ❌ Not started | ❌ No | ❌ No | DESIGN | W360-032 → 035 |
| **the-calling** | Creator platform | D14 | 📚 Planning | ❌ Not started | ❌ No | ❌ No | DESIGN | W360-032 → 035 |
| **neighbor-aid** | Local services | D12 | 📚 Planning | ❌ Not started | ❌ No | ❌ No | DESIGN | W360-032 → 035 |

---

## Platform/Shared Packages

### Core Infrastructure Packages (packages/)

| Package | Version | Status | Owner | Tests | Docs | Used By |
|---|---|---|---|---|---|---|
| `@latimer-woods-tech/errors` | 0.2.0 | ✅ Stable | D09 | ✅ 42 tests | ✅ Yes | All packages |
| `@latimer-woods-tech/monitoring` | 0.2.1 | ✅ Stable | D10 | ✅ 32 tests | ✅ Yes | All packages |
| `@latimer-woods-tech/logger` | 0.2.0 | ✅ Stable | D10 | ✅ 31 tests | ✅ Yes | All packages |
| `@latimer-woods-tech/auth` | 0.2.0 | ✅ Stable | D01 | ✅ 27 tests | ✅ Yes | Workers + apps |
| `@latimer-woods-tech/neon` | 0.2.3 | ⚡ IN PROGRESS | D09 | 🟡 W360-005 pending | ✅ Yes | admin-studio, schedule-worker |
| `@latimer-woods-tech/ui` | 0.2.0 | ⚡ IN PROGRESS | D03 | ✅ 41 tests | ✅ Yes | admin-studio-ui, video-studio |
| `@latimer-woods-tech/design-tokens` | 0.2.0 | ✅ Stable | D03 | ✅ 26 tests | ✅ Yes | `@latimer-woods-tech/ui` + apps |
| `@latimer-woods-tech/analytics` | (TBD) | ⚡ IN PROGRESS | D10 | ✅ 50+ tests | ✅ Yes | W360-021 (event schemas) |

---

## W360 Disposition Summary

### Ready for Deployment (W360-035 candidates)

- ✅ **prime-self** — Production ready, graduation gates passing
- ✅ **prime-self-ui** — Production ready, graduation gates passing

### Staging → Production Path (W360-034/035 track)

- 🟡 **xico-city** — Config normalized via W360-034, smoke tests passing, ready for W360-035 gates
- 🟡 **admin-studio** — W360-005 (webhooks) live Stripe test pending; W360-006 safety gates pending

### Template/Scaffolding Phase (W360-032 dependency)

- 📚 **wordis-bond**, **cypher-healing**, **ijustus**, **the-calling**, **neighbor-aid** — Awaiting W360-032 template buildout + W360-033 standards before scaffolding

### Video Production Pipeline (W360-022/023 track)

- ⚡ **schedule-worker** — W360-022 (journey probes) pending W360-005/007/008/014 route readiness
- ⚡ **video-cron** — Video rendering automation, pipeline orchestration
- ✅ **synthetic-monitor** — Live probes running; W360-022 7/9 active (4 journey proxies + 3 manifest probes)

### Local Validation Refresh (2026-05-06)

- ✅ `admin-studio`, `admin-studio-ui`, `schedule-worker`, and `video-cron` now pass local `tsc --noEmit`
- ✅ `prime-self-smoke` now has a repo-native `typecheck` script and local TS config
- ✅ `factory-supervisor` planner test regression is fixed and local tests pass
- 🟡 Live `/health`, deployed smoke, and environment-specific runtime verification still require direct HTTP checks after deploy

---

## Graduation Gates Matrix (W360-035)

Each app must pass BEFORE being marked "ready for launch":

| Gate | Criteria | Admin Studio | Xico City | Prime Self | Template Apps |
|---|---|---|---|---|---|
| **Clean Checkout** | Fresh clone, no build artifacts, no .env | ✅ | ✅ | ✅ | 🟡 Pending scaffold |
| **Environment Config** | .dev.vars.example matches production | ✅ | ✅ | ✅ | ❌ Not started |
| **TypeCheck** | `tsc --noEmit` zero errors | ✅ | ✅ | ✅ | N/A |
| **Lint** | `eslint --max-warnings 0` passing | 🟡 W360-005 fix in progress | ✅ | ✅ | N/A |
| **Unit Test** | `npm test` coverage ≥90% lines/functions | 🟡 In progress | ✅ | ✅ | N/A |
| **Build** | `npm run build` succeeds | ✅ | ✅ | ✅ | N/A |
| **CI** | GitHub Actions passing | 🟡 In progress | ✅ | ✅ | N/A |
| **Deploy** | `wrangler deploy` successful | ✅ Staging | ✅ Staging | ✅ Production | N/A |
| **Health/Smoke** | `/health` returns 200 + critical endpoints ✅ | 🟡 Pending W360-005 | ✅ | ✅ | N/A |
| **Docs** | README.md + runbooks complete | ✅ Complete | ✅ Complete | ✅ Complete | ❌ Not started |
| **Owner Review** | D-team lead sign-off | ⏳ D06 review | ✅ D04 sign-off | ✅ D01 sign-off | 🟡 Pending governance |

---

## W360 Dependencies and Sequencing

```
W360-031 (This) ← W360-035 (gates)
               ← W360-034 (config normalization)
               ← W360-032 (templates for new apps)
               ← W360-033 (standards enforcement)

W360-001 (DONE) → W360-031 (Portfolio Registry) → W360-034 (Config pass)
                                                 → W360-035 (Graduation gates)
                                                 → W360-032 (Templates)
```

---

## Verification Checklist (Pre-Graduation)

For each app in W360-035, verify:

- [ ] Repository exists and is public
- [ ] GitHub Actions workflow succeeds (or documented why not)
- [ ] `/health` endpoint returns 200 with correct schema
- [ ] README.md exists with setup instructions
- [ ] `.dev.vars.example` template exists
- [ ] Owner (D-discipline lead) acknowledged as responsible party
- [ ] No pending critical bugs (_external_reviews/ folder empty)
- [ ] Deployment history shows ≥2 successful deploys in last 30 days
- [ ] Security audit completed (no high vulnerabilities in deps)
- [ ] Rate limiting configured if exposed to internet

---

## Recent Changes

**W360-031 — 2026-04-29:**
- Created initial full portfolio app scope registry
- Classified apps by type and W360 phase
- Documented graduation gate matrix (W360-035 prerequisite)
- Linked package dependency chain to W360 roadmap
- Established verification checklist for launch readiness

**Validation refresh — 2026-05-06:**
- Updated Factory-internal app rows to distinguish local validation from live verification
- Recorded the restored local typecheck status for admin-studio, admin-studio-ui, schedule-worker, and video-cron
- Recorded the new `prime-self-smoke` typecheck support and supervisor test fix

**Next Steps:**
1. W360-034: Audit configs across all apps + normalize
2. W360-035: Apply graduation gates to each app (prime-self passes, xico-city/admin-studio pending W360-005/006)
3. W360-032: Build template pack for pending apps (wordis-bond, cypher-healing, etc.)
