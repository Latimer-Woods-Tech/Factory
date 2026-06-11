# HumanDesign Testing Orchestration

**Created:** 2026-06-11

**Goal:** Systematically test every functional pathway in selfprime to identify logic routing errors, then have Opus review results to determine if actual behavior matches expected behavior.

---

## What's Been Created

### 1. **Comprehensive Test Plan** (`HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md`)
- **129 test cases** organized by 10 functional areas
- Input, expected result, and verification steps for each test
- Known issues flagged (5 critical pre-test findings)
- Tables for recording results

**Coverage:**
- User Signup & Auth (14 tests)
- Chart Calculation (11 tests)
- Profile Generation (12 tests)
- Tier & Subscription (16 tests)
- Practitioner Features (11 tests)
- Feature Flags (23 tests)
- Daily Engagement (9 tests)
- Data & Content (16 tests)
- Referral & Promotions (8 tests)
- Error Handling (9 tests)

### 2. **Results Tracking Documents**

#### `HUMANDESIGN_TEST_RESULTS.md`
- Human-readable results with embedded JSON templates
- Summary table (total tests, pass/fail counts)
- Per-test result sections
- Critical findings summary table (5 known issues highlighted)
- Next steps & references

#### `HUMANDESIGN_TEST_RESULTS.json`
- Structured JSON schema for programmatic tracking
- Test metadata (name, category, description)
- Result template (for easy copying during execution)
- Known issues array (pre-populated with 5 critical findings)
- Findings arrays (logic_errors, routing_errors, analytics_gaps, etc.)
- Opus review section (placeholder for review date, findings, recommendations)

### 3. **Execution Guide** (`HUMANDESIGN_TEST_EXECUTION_GUIDE.md`)
- Step-by-step instructions for running each phase
- DevTools setup (console commands to monitor trackEvent calls)
- Database verification queries (psql recipes)
- JSON recording templates
- Markdown result formatting
- Timeline: 5 days × 16.5 hours for full execution
- Testing tips & tricks

---

## Known Pre-Test Issues (Will Be Verified)

| Issue | Test ID | Impact | Status |
|-------|---------|--------|--------|
| **Checkout disabled in production** | T4.2.2 | Users cannot purchase; ACS dead code | PENDING VERIFICATION |
| **LLM latency unknown, may exceed 5s target** | T3.1.2 | Poor UX, timeouts | PENDING VERIFICATION |
| **Achievements cron timing unknown** | T6.1.2 | Stale achievements | PENDING VERIFICATION |
| **Missing trackEvent on 50+ features** | T8.*, T9.*, etc. | ~40% of app unmonitored | PENDING VERIFICATION |
| **5 of 7 feature flags OFF** | T6.2–T6.6 | Revenue & engagement upside hidden | PENDING VERIFICATION |

---

## How to Execute

### Quick Start (Manual Testing)
```bash
# 1. Open Chrome
# 2. Go to: https://selfprime.net/?start=1
# 3. Open DevTools (F12)
# 4. Follow execution guide Phase by Phase
# 5. Record results in JSON + Markdown as you go
```

### Automated/Scripted Approach (Future)
```bash
# A Playwright test harness could be built to:
# - Automate auth tests (T1.*)
# - Automate chart calc tests (T2.*)
# - Monitor network tab programmatically
# - Record results to JSON automatically
# (See execution guide → DevTools section for fetch monitoring setup)
```

### Validation Checklist
For each test, verify:
- [ ] Input: exact parameters documented
- [ ] Expected: from test plan
- [ ] Actual: what really happened
- [ ] HTTP status: recorded
- [ ] Side effects: DB changes, events, notifications
- [ ] Latency: measured
- [ ] Match: true/false
- [ ] Screenshot (if error): saved

---

## Opus Review Process

Once results are collected (estimated: 2026-06-15):

### 1. **Analysis (2 hours)**
Opus will read `HUMANDESIGN_TEST_RESULTS.json` and:
- Identify all mismatches (actual ≠ expected)
- Classify by type:
  - Logic errors (wrong flow, wrong state)
  - Routing errors (wrong handler called, 404 instead of 200)
  - Missing validations (input accepted that should be rejected)
  - Analytics gaps (trackEvent not called when it should be)
  - Performance issues (latency exceeds SLA)
  - Security issues (auth bypass, unvalidated input)

### 2. **Findings Report**
Opus will produce:
- **Issue list** (sorted by severity)
- **Root cause** for each issue
- **User impact** (blocking, degradation, silent failure?)
- **Fix recommendation** (code change, config change, feature toggle)
- **Reproducible steps** (curl/UI workflow that triggers the issue)
- **Test case** to verify fix

### 3. **Issue Tickets**
For each finding:
- Create GitHub issue in HumanDesign repo
- Title: "Logic error: [description]"
- Body: Opus findings + reproducible steps + expected fix
- Label: `bug`, `logic-error`, `routing-error`, etc.
- Priority: CRITICAL | HIGH | MEDIUM | LOW

---

## Example: What Will Happen

### Test: T4.2.2 (Checkout disabled)
**Expected:** User clicks "Upgrade", sees Stripe checkout modal, can enter card

**Execution:**
```javascript
// 1. User logs in
// 2. Clicks "Upgrade"
// 3. DevTools shows:
//    POST https://api.selfprime.net/api/checkout
//    Response: 200 OK
//    Body: { error: "checkout_disabled", message: "This feature is temporarily unavailable" }
// 4. No modal appears, user sees error message
```

**Result:**
```json
{
  "test_id": "T4.2.2",
  "status": "FAIL",
  "match": false,
  "expected_result": "Checkout modal opens, user can enter card details",
  "actual_result": "API returns 200 but disables checkout; user sees error",
  "finding": "CHECKOUT_DISABLED_IN_PRODUCTION_ACS_FEED"
}
```

**Opus Finding:**
```
ISSUE: Agentic Commerce checkout disabled in production
SEVERITY: CRITICAL
ROOT CAUSE: ACS product feed has disable_checkout=true (line 158 of agent-commerce.js)
IMPACT: Users cannot upgrade; ACS revenue = $0; feature is dead code
FIX: Change disable_checkout=false in product feed, or add config var to gate it
VERIFICATION: T4.2.2 should return 200 with checkout modal, not error
```

---

## Timeline

| Date | Phase | Output |
|------|-------|--------|
| **2026-06-11** | Setup & documentation | 4 docs created (plan, results, guide, this orchestration) |
| **2026-06-12–6-14** | Test execution | 129 tests run; JSON results filled in |
| **2026-06-15** | Opus review | Findings report + issue tickets created |
| **2026-06-16–6-20** | Fix & verify | Fixes landed, critical tests re-run |

---

## Files Created

| File | Purpose | Status |
|------|---------|--------|
| `docs/HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md` | 129 test cases with input/expected/steps | ✅ Created |
| `docs/HUMANDESIGN_TEST_RESULTS.md` | Human-readable results tracking | ✅ Created (template) |
| `docs/HUMANDESIGN_TEST_RESULTS.json` | Structured results for Opus review | ✅ Created (template) |
| `docs/HUMANDESIGN_TEST_EXECUTION_GUIDE.md` | Step-by-step execution instructions | ✅ Created |
| `docs/HUMANDESIGN_TESTING_ORCHESTRATION.md` | This file (overview & process) | ✅ Created |

---

## What's Next

### Option 1: Manual Execution (Most Thorough)
1. Read `HUMANDESIGN_TEST_EXECUTION_GUIDE.md`
2. Open selfprime.net in Chrome
3. Run through each phase, recording results
4. Fill in JSON + Markdown as you go
5. When done, export JSON to Opus for review

### Option 2: Automated Execution (Playwright/Puppeteer)
1. Build test harness (optional, not required)
2. Run all tests programmatically
3. Auto-record HTTP responses, latencies, side effects
4. Export JSON

### Option 3: Hybrid (Recommended)
1. Automate: Auth, chart calc, profile generation, checkout flow (tests 1–4)
2. Manual: Feature flags, edge cases, error handling (tests 6–10)
3. Combine results and send to Opus

---

## Success Criteria

✅ **Testing Complete When:**
- [ ] All 129 tests executed (or marked BLOCKED with reason)
- [ ] Results recorded in JSON (status, actual_result, match, latency)
- [ ] Mismatches identified and documented
- [ ] Known issues (5) verified or refuted
- [ ] Opus has reviewed results
- [ ] Critical findings have GitHub issues with reproducible steps

---

## Key Questions for Opus to Answer

Once results are collected, Opus will determine:

1. **Do actual results match expected?** (Overall pass/fail rate)
2. **What are the logic routing errors?** (Specific flows that route wrong)
3. **What's the root cause?** (Code path, config, feature flag state?)
4. **What's the user impact?** (Blocking? Silent failure? UX degradation?)
5. **What's the fix?** (Code change, config change, or both?)
6. **What's the priority?** (Critical fixes first; nice-to-haves last)

---

## References

- **HumanDesign repo:** https://github.com/Latimer-Woods-Tech/HumanDesign
- **Live app:** https://selfprime.net/?start=1
- **KPI doc:** `docs/kpis/humandesign.md` (88 features, known blind spots)
- **CLAUDE.md:** Factory Standing Orders (constraints, quality gates, validation requirement)

---

## Notes for Executor

- **Test accounts:** Create 3 test users (free, paid, practitioner) before starting
- **Database access:** You have neonctl operator-level access (see CLAUDE.md §You HAVE operator-level Neon access)
- **Timing:** Some tests are time-dependent (cron, notifications). Plan accordingly.
- **Feature flags:** Some tests require toggling flags ON/OFF. You'll need DB access for that.
- **Screenshots:** Capture error screens for Opus analysis.
- **Latency:** Profile generation (T3.1.2) is critical. Run it 5+ times, calculate p95.

---

**Let me know when you're ready to start execution!**
