# Factory Ecosystem — Status

> **Last updated:** 2026-05-02 · **Maintained by:** Factory Supervisor + @adrper79-dot
> **Supersedes:** the auto-generated CI table that previously lived here.
> This file is the single human-readable source of truth for project state.
> Root-level `PHASE_*.md`, `STAGE_*.md`, `DELIVERY_*.md` etc. are stale delivery artifacts; see factory#61 for archival tracking.

---

## Active Projects

### 🔴 HumanDesign / selfprime · [selfprime.net](https://selfprime.net)

**Repo:** `Latimer-Woods-Tech/HumanDesign`

| Item | State |
|---|---|
| Mobile rebuild | ✅ Merged to `main` |
| Stripe funnel | 🔴 Broken — 12 portal sessions, 0 checkouts in 24h |
| Sentry migration gaps | 🟡 2 open (`psn.shared_at`, param-count prepared-statement) |
| Canary | 🟢 Green |

**Finishing gate:** Walk funnel with real test card; confirm one live conversion. **Human-led this weekend.**

---

### 🟡 VideoKing / capricast · [capricast.com](https://capricast.com)

**Repo:** `Latimer-Woods-Tech/capricast`

| Item | State |
|---|---|
| VK-1 through VK-6 | ✅ Done |
| VK-7 (replace deploy.yml + add ci.yml) | 🟡 Pending — Red-tier, human PR required |
| VK-11 | 🟡 Pending |

**Finishing gate:** Ship VK-7 → call factory `_app-deploy.yml`. VK-8/9/10/11 via supervisor (week 5+).

---

### 🟢 xico-city / DJMEXXICO · [xicocity.com](https://xicocity.com)

**Repo:** `Latimer-Woods-Tech/xico-city`

| Item | State |
|---|---|
| CI | 🟢 Green |
| Cloud Run audio processor | 🟢 Live |
| Canonical docs | 🟢 v1 + v3 |
| Real artist onboarding | 🟡 Not yet validated end-to-end |

**Finishing gate:** Real artist onboarding loop. Human-led; supervisor monitors.

---

### ⏸ focusbro · [focusbro.com](https://focusbro.com)

**Repo:** *(separate account)*

| Item | State |
|---|---|
| App | Mainly complete |
| Google AdWords acceptance | 🟡 Pending external review |

**Status:** Not a factory migration candidate until AdWords clears. Standby.

---

### ⛔ wordis-bond · [wordis-bond.com](https://wordis-bond.com)

**Repo:** `Latimer-Woods-Tech/wordis-bond` · **MECHANICALLY LOCKED FROM SUPERVISOR**

| Item | State |
|---|---|
| Engine | Ready |
| FDCPA/TCPA compliance review | 🔴 Blocking — decision required |

**Next step:** Compliance decision: de-risk, license, or shelve. Human-led.

---

### 🟡 factory / apunlimited · [apunlimited.com](https://apunlimited.com)

**Repo:** `Latimer-Woods-Tech/factory`

| Item | State |
|---|---|
| Phase 5 | ✅ Done |
| Supervisor substrate | ~70% built |
| Open reds on `main` | 3 |
| Phase-1 supervisor (live) | 🟡 Running — templates unblessed, plan-approval required per run |

**Finishing gate:** Close MA-0 + SYN-0, ship supervisor scaffold, wire AI Gateway.

---

## Out of scope

`neighbor-aid`, `ijustus`, `cypher-healing`, `the-calling`, `xpelevator` — not active factory migration candidates.

---

## Supervisor & Template Status

| Item | State |
|---|---|
| Phase-1 supervisor | 🟡 Live-run mode. Templates unblessed. Plan-approval required. |
| Template library | 6 templates in `docs/supervisor/plans/`. **0 blessed.** |
| Reusable workflows | `_app-ci.yml`, `_app-deploy.yml`, `_post-deploy-verify.yml` shipped. |
| LockDO | Not yet deployed (Week 3 target). |
| AI Gateway | Not yet wired. |

---

## Infrastructure snapshot

| Resource | Count |
|---|---|
| Cloudflare Workers | 19 (post Apr-30 cleanup) |
| R2 buckets | 6 |
| Hyperdrive configs | 10 |
| Neon databases | 10 |

---

*To update this file, open a PR or file an issue labeled `documentation`. Auto-generated CI table deprecated — see factory#61.*
