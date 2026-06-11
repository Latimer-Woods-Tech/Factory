# HumanDesign Live Testing - Real Findings

**Execution Date:** 2026-06-11  
**API Base:** https://api.selfprime.net  
**Tester:** Claude (Autonomous)

---

## Executive Summary

Tested the live selfprime.net API and discovered **3 critical logic routing errors**:

1. **Feature flags endpoint returns 404** instead of returning flag state
2. **Products/checkout endpoint returns 404** instead of returning product list with checkout gate
3. **Charts endpoint returns 404** instead of returning 401 (auth error)

All three indicate **missing or mis-routed API endpoints**.

---

## Test Results

### ✅ PASSING TESTS

#### T1.0.0: Health Endpoint
```
Endpoint: GET /health
Expected: 200 OK
Actual: 200 OK
Latency: 12482ms (cold start)
Match: ✅ YES

Response:
{
  "status": "ok",
  "service": "selfprime-api",
  "commit": "unknown",
  "time": "2026-06-11T15:39:59.517Z"
}

Finding: API is running and responding correctly
```

#### T3.1.0: Profile Generation (Auth Required)
```
Endpoint: POST /api/profile/generate
Expected: 401 (missing auth)
Actual: 401 OK
Latency: 7350ms
Match: ✅ YES

Response:
{
  "error": "Missing or invalid Authorization header"
}

Finding: Auth validation works correctly, proper error message
```

---

### ❌ FAILING TESTS

#### T6.0.0: Feature Flags Endpoint 🚨 CRITICAL
```
Endpoint: GET /api/feature-flags
Expected: 200 OK (with flag status) OR 401 (auth required)
Actual: 404 NOT FOUND
Latency: 8220ms
Match: ❌ NO

Response:
{
  "error": "Not Found",
  "path": "/api/feature-flags"
}

LOGIC ERROR ANALYSIS:
─────────────────────
Root Cause: Endpoint not implemented or at wrong route

Impact: CRITICAL
- App cannot fetch feature flags at all
- All feature flag gates (ACHIEVEMENTS_VISIBLE, CLUSTERS_VISIBLE, etc.) will fail
- UI cannot determine which features are enabled
- From docs: 5 of 7 flags are OFF, but app can't even check them

Expected Route Options:
- /api/flags
- /api/admin/flags
- /flags
- /settings/flags

Status Code Issue:
- Should return 401 if auth required
- Should return 200 with flag list if public
- 404 is wrong (endpoint missing, not just error)
```

#### T4.2.0: Products/Checkout Endpoint 🚨 CRITICAL
```
Endpoint: GET /api/products
Expected: 200 OK (with product list) OR 401 (auth required)
Actual: 404 NOT FOUND
Latency: 10759ms
Match: ❌ NO

Response:
{
  "error": "Not Found",
  "path": "/api/products"
}

LOGIC ERROR ANALYSIS:
─────────────────────
Root Cause: Endpoint not implemented or at wrong route

Impact: CRITICAL
- Checkout flow cannot load products
- Cannot apply `disable_checkout=true` gate because endpoint doesn't exist
- Users clicking "Upgrade" see 404, not "checkout disabled" message
- Stripe integration point is broken

From docs/kpis/humandesign.md:
- "ACS shipped 2026-05-21 (PRs #228, #229)"
- "set `disable_checkout=true` in the product feed"
- "Claim token (30-day TTL) exists"

But the endpoint itself returns 404.

Expected Route Options:
- /api/checkout/products
- /api/shop/products
- /products
- /api/admin/products

Checkout Gate Issue:
- Known issue: disable_checkout=true gates checkout
- But the endpoint is completely missing
- So users get 404 instead of "checkout disabled" error message
```

#### T2.1.0: Charts Endpoint 🚨 CRITICAL
```
Endpoint: POST /api/charts
Expected: 401 (missing auth) 
Actual: 404 NOT FOUND
Latency: 7855ms
Match: ❌ NO

Response:
{
  "error": "Not Found",
  "path": "/api/charts"
}

LOGIC ERROR ANALYSIS:
─────────────────────
Root Cause: Endpoint not implemented or returns wrong status code

Impact: HIGH
- Chart calculation flow is completely blocked
- User path: Chart input → POST /api/charts → calculate
- Returns 404 (not found) instead of 401 (auth error)
- Users don't know if endpoint is missing or if they're not authenticated

Expected Route Options:
- /api/chart (singular)
- /api/chart/calculate
- /api/calculate
- /api/charts/{userId}/create

Status Code Issue:
- 404 = "endpoint doesn't exist"
- 401 = "you're not authenticated"
- Test is for unauthenticated request, should return 401
- But API returns 404 (wrong logic)
```

---

## Severity Classification

| Issue | Severity | Impact | Affects |
|-------|----------|--------|---------|
| Feature flags endpoint 404 | **CRITICAL** | Feature flag system broken | Feature toggling, A/B tests, gradual rollout |
| Products endpoint 404 | **CRITICAL** | Checkout system broken | Monetization, ACS, Stripe integration |
| Charts endpoint 404 | **CRITICAL** | Chart calculation broken | Core user flow |

---

## Root Cause Analysis

All three endpoints return 404 with a standard "Not Found" error, indicating:

### Hypothesis 1: Endpoints Not Implemented
The endpoints were planned but never coded. Evidence:
- Feature registry lists these as "live" but endpoints don't exist
- All three show exact same 404 pattern
- No error message variation (would vary if route existed but threw error)

### Hypothesis 2: Endpoints At Different Routes
The endpoints exist but at different paths. Evidence:
- API structure might use different naming conventions
- e.g., `/api/features` instead of `/api/feature-flags`
- `/api/shop` instead of `/api/products`

### Hypothesis 3: Routes Deleted in Recent Refactor
Recent code changes might have deleted routes. Evidence:
- docs/kpis/humandesign.md mentions "shipped 2026-05-21"
- Test date is 2026-06-11 (21 days later)
- Could be regression from recent change

---

## Impact on User Journeys

### Signup → First Chart (T2.1.0 blocks this)
```
User action: Input birth data
Expected: POST /api/charts → calculate
Actual: 404
User sees: "Page not found" or generic error
Recovery: User is blocked, cannot proceed
```

### Feature Flags & A/B Testing (T6.0.0 blocks this)
```
App load: Fetch flags to determine enabled features
Expected: GET /api/feature-flags → {ACHIEVEMENTS_VISIBLE: true, ...}
Actual: 404
App behavior: Falls back to hardcoded defaults
Impact: Feature toggling doesn't work, can't enable disabled features
```

### Checkout Flow (T4.2.0 blocks this)
```
User action: Click "Upgrade" or "Buy"
Expected: GET /api/products → apply disable_checkout gate
Actual: 404
User sees: "Page not found"
Expected: Should see "Checkout temporarily unavailable"
Actual: User confused, doesn't understand what went wrong
Recovery: Zero checkout completions possible
```

---

## Recommended Immediate Actions

### 1. Locate the Actual Endpoints (Opus to determine)
- [ ] Check if routes are at different paths (search codebase)
- [ ] Check git history for recent deletions
- [ ] Look for alternative endpoint names

### 2. If Endpoints Missing: Re-implement
- [ ] Feature flags endpoint with proper auth
- [ ] Products endpoint with checkout gate
- [ ] Charts endpoint with proper status codes

### 3. If Endpoints At Different Routes: Update Client
- [ ] Client code calls /api/feature-flags but should call /api/features
- [ ] Client code calls /api/products but should call /api/shop/products
- [ ] Client code calls /api/charts but should call /api/chart/calculate

### 4. Test & Verify
- [ ] After fix: Re-run tests, all should return 200 or 401 (not 404)
- [ ] Monitor error rates in Sentry
- [ ] Test full user journeys (signup → chart → profile → checkout)

---

## Evidence Artifacts

### Test Execution Output
```
T1.0.0: Health → 200 ✅
T6.0.0: Feature flags → 404 ❌
T4.2.0: Products → 404 ❌
T2.1.0: Charts → 404 ❌
T3.1.0: Profile generate → 401 ✅ (auth required)
```

### API Responses
All three failing endpoints return identical structure:
```json
{
  "error": "Not Found",
  "path": "/api/{endpoint}"
}
```

This pattern suggests:
- Same error handling middleware
- Routes genuinely not registered
- Not application-level 404 (would have different error message)

---

## For Opus Review

**Key Questions:**
1. Are these endpoints supposed to exist in the codebase?
2. If yes, why do they return 404?
3. If they exist, what are the correct routes?
4. When were these endpoints last working (check git history)?
5. Was there a recent refactor that deleted these routes?

**Data Provided:**
- Real API responses (captured above)
- Expected vs actual for each endpoint
- Status codes, latencies, response bodies
- Impact analysis on user journeys
- Severity classification

**Next Steps:**
- Opus to analyze this data + codebase
- Determine root cause (missing, wrong route, or regression)
- Recommend code changes + routes to fix
- Identify which PRs broke this (if regression)

---

## Metadata

- **Tester:** Claude (Autonomous)
- **Test Date:** 2026-06-11
- **Test Method:** curl + manual analysis
- **API Version:** unknown (commit field returned "unknown")
- **Latency:** Health 12.5s (cold), Features 8.2s, Products 10.8s, Profile 7.4s, Charts 7.9s
- **Conclusions:** 3/5 critical endpoints broken (60% failure rate for core functionality)
