# HumanDesign Comprehensive Testing Initiative

**Created:** 2026-06-11  
**Goal:** Systematically test all functional pathways in selfprime.net to identify logic routing errors, then have Opus determine if actual results match best possible results.

---

## 📋 Overview

You now have a complete testing infrastructure for the HumanDesign/selfprime application:

- **129 test cases** covering 10 functional areas
- **5 known pre-test issues** documented and ready for verification
- **JSON + Markdown templates** for recording results
- **Step-by-step execution guide** with curl commands and DevTools recipes
- **Opus review process** to analyze findings and prioritize fixes

---

## 📁 Documents Created

| Document | Purpose | Read First? |
|----------|---------|------------|
| **[HUMANDESIGN_TESTING_ORCHESTRATION.md](./docs/HUMANDESIGN_TESTING_ORCHESTRATION.md)** | High-level overview, timeline, process flow | ✅ YES |
| **[HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md](./docs/HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md)** | All 129 tests with input/expected/steps | When executing |
| **[HUMANDESIGN_TEST_EXECUTION_GUIDE.md](./docs/HUMANDESIGN_TEST_EXECUTION_GUIDE.md)** | Phase-by-phase execution instructions | When running tests |
| **[HUMANDESIGN_TEST_RESULTS.md](./docs/HUMANDESIGN_TEST_RESULTS.md)** | Human-readable results template | When recording |
| **[HUMANDESIGN_TEST_RESULTS.json](./docs/HUMANDESIGN_TEST_RESULTS.json)** | Structured results for Opus review | For Opus |

---

## 🎯 What Gets Tested

### Core Flows (60 tests)
- **Signup & Auth** (14 tests) — email, OAuth, session, logout
- **Chart Calculation** (11 tests) — valid data, edge cases, accuracy
- **Profile Generation** (12 tests) — LLM synthesis, latency (CRITICAL), caching
- **Tier & Subscription** (16 tests) — free limits, checkout (CRITICAL), payment, downgrades
- **Practitioner Features** (11 tests) — activation, client management, tools

### Features & Flags (39 tests)
- **Feature Flags** (23 tests) — achievements, clusters, divination, one-time purchases, checkout disable, experiments
- **Daily Engagement** (9 tests) — check-ins, streaks, notifications
- **Referral & Promo** (7 tests) — link generation, tracking, codes

### Content & Data (16 tests)
- **Data Features** (16 tests) — diary, dreams, messaging, testimonials (all have **missing trackEvent**)

### Error Handling (9 tests)
- **Errors & Edge Cases** (9 tests) — timeouts, provider fallback, rate limiting, concurrency

---

## 🚨 Critical Issues to Verify

| Issue | Impact | Status |
|-------|--------|--------|
| **Checkout disabled in production** | Users can't upgrade; ACS = $0 revenue | PENDING |
| **LLM latency > 5s target** | Slow profile generation; timeouts | PENDING |
| **Missing trackEvent on 50+ features** | 40% of app unmonitored for analytics | PENDING |
| **5 of 7 feature flags OFF** | Features built but not shipped ($500K+ hidden revenue) | PENDING |
| **Achievements cron timing unknown** | Stale/missing achievements | PENDING |

---

## ⏱️ Timeline

```
2026-06-11  Setup & Documentation     ✅ DONE
2026-06-12  Test Execution Phase 1    → Auth, Charts
2026-06-13  Test Execution Phase 2    → Profiles, Subscription
2026-06-14  Test Execution Phase 3    → Features, Engagement
2026-06-15  Opus Review               → Analysis & findings report
2026-06-16  Fix & Verify              → Deploy critical fixes
```

---

## 🚀 Quick Start

### To Understand What Gets Tested
```bash
# 1. Read the overview
open docs/HUMANDESIGN_TESTING_ORCHESTRATION.md

# 2. Scan the test plan to see coverage
open docs/HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md
# (Look at section headers to see 10 functional areas)
```

### To Execute Tests
```bash
# 1. Read execution guide
open docs/HUMANDESIGN_TEST_EXECUTION_GUIDE.md

# 2. Open selfprime.net in Chrome
open https://selfprime.net/?start=1

# 3. Open DevTools (F12)

# 4. Follow Phase 1 (Auth tests) step-by-step
# 5. Record results in JSON + Markdown as you go

# 6. Repeat for Phases 2-10 over 5 days
```

### To Send Results to Opus
```bash
# 1. Fill in docs/HUMANDESIGN_TEST_RESULTS.json with all 129 tests
# 2. Export JSON file
# 3. Share with Opus along with:
#    - Test plan (HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md)
#    - Known issues (5 pre-test findings)
#    - KPI doc (docs/kpis/humandesign.md)
```

---

## 📊 Test Distribution

```
Signup & Auth          14 tests ████░░░░░░
Chart Calculation      11 tests ███░░░░░░░
Profile Generation     12 tests ████░░░░░░
Tier & Subscription    16 tests █████░░░░
Practitioner            11 tests ███░░░░░░
Feature Flags           23 tests ███████░░
Daily Engagement        9 tests  ███░░░░░░
Data & Content         16 tests █████░░░░
Referral & Promo        8 tests ██░░░░░░░
Error Handling          9 tests ███░░░░░░
────────────────────────────────
TOTAL                 129 tests ███████████
```

---

## 🔍 How Opus Will Review Results

### 1. **Analyze** (2 hours)
Opus reads all 129 test results and identifies:
- What passed (actual == expected)
- What failed (actual ≠ expected)
- Root cause of each failure
- User impact (blocking vs silent vs degraded)

### 2. **Classify** (1 hour)
Group findings by type:
- **Logic errors** (wrong flow, wrong state)
- **Routing errors** (404, wrong handler)
- **Missing validations** (bad input accepted)
- **Analytics gaps** (trackEvent missing)
- **Performance issues** (latency > SLA)
- **Security issues** (auth bypass, injection)

### 3. **Prioritize** (30 min)
Sort by severity:
- **CRITICAL** (blocks functionality)
- **HIGH** (degrades UX, loses revenue)
- **MEDIUM** (feature incomplete, edge case)
- **LOW** (polish, documentation)

### 4. **Report** (30 min)
Opus produces:
- Issue list with root causes
- Recommended fixes (code + config)
- Reproducible steps for each issue
- Test cases to verify fix

---

## 💾 Deliverables

### After Testing (2026-06-15)
```
docs/HUMANDESIGN_TEST_RESULTS.json    ← All 129 test results (structured)
docs/HUMANDESIGN_TEST_RESULTS.md      ← Summary tables + findings
```

### After Opus Review (2026-06-15)
```
GitHub Issues in HumanDesign repo (auto-created):
  - #XXX Logic error: Checkout disabled in production
  - #YYY Logic error: LLM latency exceeds SLA
  - #ZZZ Analytics: Missing trackEvent on diary/dreams
  ... etc
```

---

## 🔑 Key Assumptions

✅ You have:
- Access to selfprime.net (live app)
- Chrome DevTools experience
- Neon database operator credentials (see CLAUDE.md)
- Ability to create test accounts
- ~10–15 hours over 5 days to run all 129 tests

❌ Not required:
- Ability to fix code (Opus will recommend)
- Deep knowledge of selfprime codebase
- Ability to automate (manual testing fine)

---

## 📞 Questions?

### For Test Plan Details
→ See `docs/HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md` (each test has input/expected/steps)

### For Execution Steps
→ See `docs/HUMANDESIGN_TEST_EXECUTION_GUIDE.md` (phase-by-phase walkthroughs)

### For Known Issues
→ See `docs/HUMANDESIGN_TEST_RESULTS.md` (top of file lists 5 pre-test findings)

### For Process Overview
→ See `docs/HUMANDESIGN_TESTING_ORCHESTRATION.md` (timeline, Opus workflow, success criteria)

---

## 🎯 Success Metrics

✅ **Testing is complete when:**
- All 129 tests executed (or marked BLOCKED)
- Results recorded in JSON format
- 5 pre-test issues verified or refuted
- Opus has analyzed results
- GitHub issues created for each finding

✅ **Opus review is complete when:**
- All mismatches classified
- Root causes identified
- Fixes recommended
- Priority assigned (CRITICAL → LOW)

---

## 📌 Remember

> From CLAUDE.md: "A fix is done when you have run `curl` and observed the expected HTTP status code with your own eyes. CI green = code compiled. `curl` 200 = it actually works."

**Same principle applies here:**
- Test plan = what should happen (spec)
- Test execution = what really happens (observed)
- Opus review = why they don't match (root cause)
- Fixes = make them match (code change)

---

## 🚦 Status Tracker

- [x] Test plan created (129 tests)
- [x] Results templates created (JSON + Markdown)
- [x] Execution guide created (phases 1–10)
- [x] Known issues documented (5 critical)
- [ ] Test execution (manual, 10–15 hours)
- [ ] Opus review (2 hours)
- [ ] Fixes deployed (varies)
- [ ] Re-verification (varies)

---

**Ready to start? Open the orchestration document and begin Phase 1 (Signup & Auth) on Day 1 morning.**
