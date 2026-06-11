# HumanDesign Test Execution Guide

**Purpose:** Step-by-step instructions to execute all 129 tests and record results.

**Time Estimate:** 10–15 hours for full execution

---

## Setup

### Prerequisites
```bash
# 1. Access selfprime.net
curl -I https://selfprime.net/?start=1
# Should return: 200 OK

# 2. Have Chrome DevTools open
# - F12 or Cmd+Option+I
# - Network tab (record all requests)
# - Console (monitor for errors)

# 3. Create test accounts
# - test-user-1@example.com (for free tier tests)
# - test-user-2@example.com (for paid tier tests)
# - test-practitioner@example.com (for practitioner tests)

# 4. Set up test data collection
# - JSON file: docs/HUMANDESIGN_TEST_RESULTS.json (already created)
# - Markdown: docs/HUMANDESIGN_TEST_RESULTS.md (already created)
```

---

## Test Execution Workflow

### Phase 1: Authentication (2 hours)
These tests are prerequisites for all downstream tests.

#### T1.1.1: New user signup (email)
```bash
# 1. Open https://selfprime.net/?start=1
# 2. Click "Sign Up"
# 3. Fill in:
#    - Email: test-user-1@example.com
#    - Password: TestPassword123!@#
# 4. Monitor in DevTools → Network tab

RECORD:
- Request: POST /api/auth/signup (or /auth/register)
- Response status: (expected: 201)
- Response body: user_id, email, created_at
- Side effects: user row created? email sent?
- Latency: X ms
- Success: true/false
```

**Recording in JSON:**
```json
{
  "test_id": "T1.1.1",
  "status": "PASS",
  "timestamp": "2026-06-11T10:15:00Z",
  "http_status": 201,
  "response_body": {
    "user_id": "user_123",
    "email": "test-user-1@example.com",
    "created_at": "2026-06-11T10:15:00Z"
  },
  "side_effects": {
    "db_changes": ["users table: 1 row inserted"],
    "events_fired": ["SIGNUP"],
    "notifications_sent": ["email_verification sent"]
  },
  "latency_ms": 234,
  "match": true,
  "notes": "Signup works as expected"
}
```

---

#### T1.1.2: Signup with OAuth (Google)
```bash
# 1. Click "Sign up with Google"
# 2. Complete Google OAuth flow
# 3. Monitor redirect and account linking
```

#### T1.1.3–T1.1.7: [Continue with remaining signup tests]

---

#### T1.2.1: Login with email/password
```bash
# 1. Click "Log In"
# 2. Enter: test-user-1@example.com / TestPassword123!@#
# 3. Verify redirect to dashboard
# 4. Check session cookie in DevTools

RECORD:
- HTTP status: 200
- Set-Cookie header present?
- Redirected to: /dashboard or /?start=1
- User profile loaded?
- Latency: X ms
```

#### T1.2.2–T1.2.7: [Continue with remaining login tests]

---

### Phase 2: Chart Calculation (2 hours)

#### T2.1.1: Valid birth data
```bash
# 1. Click "Calculate My Chart"
# 2. Fill in:
#    - Date: June 15, 1990
#    - Time: 14:32 (2:32 PM)
#    - Location: New York, NY
# 3. Submit form

RECORD:
- Request: POST /api/charts (or /api/calculate)
- Response: chart_id, chart_data (full calculated chart)
- Validation: check if chart matches known data
#   (use celeb birth data: Angelina Jolie 1975-06-04 14:00 LA)
# 4. Verify in database:
#    psql $DATABASE_URL -c "SELECT * FROM charts WHERE user_id='...' LIMIT 1"
```

#### T2.1.2: Missing time of birth
```bash
# 1. Fill in date + location, leave time empty
# 2. Try to submit
# 3. Check: does app require time, warn, or calculate anyway?
```

#### T2.1.3–T2.2.4: [Continue with remaining chart tests]

---

### Phase 3: Profile Generation (2 hours)

#### T3.1.1: Generate profile (free user)
```bash
# 1. Click on chart → "Generate Reading" or "Generate Profile"
# 2. Monitor in Network tab:
#    - Request: POST /api/profile/generate (or /api/readings/create)
#    - Response: profile_id, initial_data
#    - Subsequent SSE stream or polling?
# 3. Time the entire flow (should be <5s target)

RECORD:
- Start time: T0
- End time: T (when profile complete)
- Total latency: (T - T0) ms
- Provider used: Anthropic? DeepSeek? Groq?
- Token count: input tokens + output tokens?
- Cost: $X computed?
```

#### T3.1.2: Profile generation latency (CRITICAL)
```bash
# Repeat T3.1.1 but focus on timing:
# 1. Generate 5 profiles (same user, different charts)
# 2. Record latency each time
# 3. Calculate p95:
#    - Sort latencies: [234ms, 456ms, 1200ms, 2100ms, 4800ms, ...]
#    - p95 = 95th percentile value
#    - Expected: < 5000 ms (5s)
#    - Actual: ? ms

RECORD:
- Sample size: 5
- Min: ? ms
- Max: ? ms
- p50 (median): ? ms
- p95: ? ms
- Cold vs warm: note if first call slower
- LLM provider: Anthropic/DeepSeek/Groq
```

#### T3.1.3–T3.2.5: [Continue with profile tests]

---

### Phase 4: Tier & Subscription (3 hours)

#### T4.1.1: Free tier limits
```bash
# 1. Create second chart (if allowed) → should succeed
# 2. Try to create third chart
# 3. Check: does app show error, upgrade CTA, or allow anyway?

RECORD:
- Charts created: 1, 2, 3, ...
- At which count does app block?
- Error message: "Upgrade to add more charts"?
```

#### T4.2.2: Checkout disabled gate (CRITICAL KNOWN ISSUE)
```bash
# 1. Log in as free user
# 2. Click "Upgrade" or "Pro Plan"
# 3. Monitor:
#    a. Does checkout modal open?
#    b. Can you enter card details?
#    c. Try to submit payment

RECORD:
- Checkout opened: yes/no
- Form accessible: yes/no
- Submit button clickable: yes/no
# 4. If blocked, check:
#    - Error message shown?
#    - User understands they can't pay?
#    - Backend response: {"error": "checkout_disabled"}?

# 5. Check backend:
#    curl -s https://api.selfprime.net/api/products | jq '.products[] | select(.name=="Pro") | .checkout_enabled'
#    Expected: false (because disable_checkout=true in ACS feed)
```

#### T4.3.1–T4.3.5: [Subscription management tests]

---

### Phase 5: Practitioner Features (1.5 hours)

#### T5.1.1: Request practitioner access
```bash
# 1. Log in as paid user (upgrade via credit in test account if needed)
# 2. Click "Become a Practitioner" or settings
# 3. Fill in application form
# 4. Submit

RECORD:
- Request: POST /api/practitioners/apply
- Response: application_id, status=pending?
- Check database: INSERT INTO practitioner_applications?
```

#### T5.1.2: Approve practitioner access
```bash
# 1. Log in as admin (use backend):
#    psql $DATABASE_URL -c "UPDATE users SET role='admin' WHERE email='..."
# 2. Go to admin panel → /admin/practitioners
# 3. Find pending application, click "Approve"
# 4. Verify applicant now has practitioner role
```

#### T5.2.1–T5.2.5: [Practitioner tools tests]

---

### Phase 6: Feature Flags (2 hours)

#### T6.1.1: Achievements visible (ON)
```bash
# 1. Complete actions that trigger achievements:
#    - Create chart (unlock "First Chart")
#    - Generate profile (unlock "First Reading")
#    - 7-day streak (unlock "Committed")
# 2. Check: do achievements appear in UI?
# 3. Monitor cron: does CCR trigger trig_01Bwsi2Ksn8yQ9MgVvgRSSwR daily?

RECORD:
- Achievements visible: yes/no
- Count visible: 0, 1, 2, ...
- Cron trigger timing: ? (check logs if available)
```

#### T6.2–T6.6: Flags OFF (CLUSTERS, DIVINATION, ONE_TIME_PURCHASES, EXPERIMENTS)
```bash
# For each flag:
# 1. Try to access the feature via UI (if UI shows button)
# 2. Try API endpoint directly:
#    curl https://api.selfprime.net/api/clusters
#    Expected: 403 Forbidden or 404 Not Found (because flag OFF)
# 3. Toggle flag ON (backend):
#    psql $DATABASE_URL -c "UPDATE feature_flags SET enabled=true WHERE flag_name='CLUSTERS_VISIBLE'"
# 4. Retry API:
#    curl https://api.selfprime.net/api/clusters
#    Expected: 200 OK with data
# 5. Verify UI updates (may need cache clear)

RECORD:
- Flag name: CLUSTERS_VISIBLE, DIVINATION_ENABLED, etc.
- Current state (prod): OFF
- API 403/404 when OFF: yes/no
- API 200 when ON: yes/no
- UI gate works: yes/no
```

---

### Phase 7: Daily Engagement & Streaks (1 hour)

#### T7.1.1: Complete check-in
```bash
# 1. Open "Daily Check-in" or "Today's Reflection"
# 2. Answer prompt, submit

RECORD:
- Request: POST /api/checkin
- Response: checkin_id, streak_count
- Event: CHECKIN_COMPLETE fired?
```

#### T7.1.4: Streak API
```bash
# 1. Complete 3 check-ins on consecutive days
# 2. Call: GET /api/checkin/streak

RECORD:
- Response: {"current_streak": 3}
- Accuracy: matches manual count?
```

---

### Phase 8: Data & Content (1.5 hours)

#### T8.1.1: Create diary entry
```bash
# 1. Click "Diary" or "Journal"
# 2. Create new entry: title, text
# 3. Submit

RECORD:
- Request: POST /api/diary
- Response: entry_id, created_at
- Database: INSERT INTO diary_entries?
```

#### T8.1.3: Diary analytics (CRITICAL MISSING TRACKING)
```bash
# 1. Create diary entry (as above)
# 2. Check DevTools Console:
#    - Any trackEvent call?
#    - Check Network tab for POST to analytics endpoint
#    - Look for event: "DIARY_CREATE" or "diary_entry_created"

RECORD:
- trackEvent called: yes/no
- Event name: (if fired)
- Payload: {user_id, entry_id, ...}?

# EXPECTED: false (known issue: diary has zero tracking)
```

#### T8.2–T8.4: Dreams, messaging, testimonials
```bash
# Same pattern as diary: create, then check for trackEvent call
# EXPECTED RESULT: all return false (no tracking on any of these)
```

---

### Phase 9: Referral & Promotions (1 hour)

#### T9.1.1: Generate referral link
```bash
# 1. Go to Settings → "Referrals" or "Share"
# 2. Click "Generate Link" or "Copy Referral Link"

RECORD:
- Link format: https://selfprime.net/?ref=ABC123
- Unique: yes/no
- QR code generated: yes/no
```

#### T9.1.5: Referral analytics (CRITICAL MISSING TRACKING)
```bash
# 1. Generate referral link
# 2. Open in new browser (incognito), check for ?ref=ABC123
# 3. Did it track the click?
#    - Check DevTools Network: any POST to analytics?
#    - Expected event: "REFERRAL_CLICK" or similar

RECORD:
- Click tracked: yes/no
- Event name: (if fired)

# EXPECTED: false (known issue: click-through tracking missing)
```

#### T9.2.3: Promo code analytics
```bash
# 1. Create promo code (backend):
#    psql $DATABASE_URL -c "INSERT INTO promo_codes VALUES('SAVE20', 0.20, ...)"
# 2. Checkout with code: SAVE20
# 3. Monitor for trackEvent: "PROMO_APPLIED"

RECORD:
- trackEvent called: yes/no
- Discount applied: yes/no

# EXPECTED: false (known issue: promo tracking missing)
```

---

### Phase 10: Error Handling (1 hour)

#### T10.1.1: API timeout
```bash
# 1. Use slow network (DevTools Network tab → Throttling)
# 2. Slow 3G or offline
# 3. Try to generate profile

RECORD:
- Timeout: yes/no
- Error message: "Slow connection..." or "Try again"?
- Retry mechanism: automatic/manual?
- UX acceptable: yes/no
```

#### T10.1.2: LLM provider down
```bash
# 1. Simulate Anthropic API failure
#    (test account with $0 balance is the easiest trigger)
# 2. Try to generate profile

RECORD:
- Fallback triggered: yes/no
- Fallback provider: DeepSeek/Groq?
- User sees error: yes/no/transparent?
- Profile still generated: yes/no
```

#### T10.2.1–T10.3.3: [Continue with boundary and concurrency tests]

---

## Recording Results

### For Each Test:
1. **Timestamp:** ISO 8601 (2026-06-11T14:32:00Z)
2. **Status:** PASS | FAIL | PARTIAL | BLOCKED
3. **Input:** Exact values used
4. **Expected:** From test plan
5. **Actual:** What really happened
6. **Match:** true/false
7. **Notes:** Observations, error messages, screenshots

### JSON Format
Add to `docs/HUMANDESIGN_TEST_RESULTS.json` under `test_categories[category].tests[]`:

```json
{
  "test_id": "T1.1.1",
  "category": "user_signup_auth",
  "scenario": "New user signup (email)",
  "timestamp": "2026-06-11T14:32:00Z",
  "status": "PASS",
  "input": {"email": "test-user-1@example.com", "password": "..."},
  "expected_result": "Account created, email verification sent",
  "actual_result": "Account created successfully, email sent to inbox",
  "http_status": 201,
  "response_body": {"user_id": "user_123", "email": "test-user-1@example.com"},
  "side_effects": {
    "db_changes": ["users table: 1 row inserted"],
    "events_fired": ["SIGNUP"],
    "notifications_sent": ["verification_email"]
  },
  "latency_ms": 234,
  "match": true,
  "notes": "Works as expected"
}
```

### Markdown Format
Update `docs/HUMANDESIGN_TEST_RESULTS.md` with results table:

```markdown
#### T1.1.1: New user signup (email)
- **Status:** ✅ PASS
- **HTTP Status:** 201
- **Latency:** 234 ms
- **Match:** Yes
- **Notes:** Account created, verification email sent. Works correctly.
```

---

## Testing Tips

### DevTools Setup
```javascript
// Paste in Console to monitor all trackEvent calls:
window.originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('FETCH:', args[0], args[1]);
  return window.originalFetch(...args);
};

// Monitor for specific events:
if (window._trackEvent) {
  window._originalTrack = window._trackEvent;
  window._trackEvent = function(event, props) {
    console.log('EVENT:', event, props);
    return window._originalTrack(event, props);
  };
}
```

### Database Verification
```bash
# Connect to prod Neon database:
export NEON_API_KEY="$(gcloud secrets versions access latest --secret=NEON_ORGANIZATION_KEY --project=factory-495015 | tr -d '\r\n\357\273\277')"
psql "$(npx --yes neonctl connection-string production --project-id <PROJECT_ID>)" \
  -c "SELECT * FROM users WHERE email='test-user-1@example.com'"

# Check recent events:
psql $DATABASE_URL -c "SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT 10"

# Check feature flags:
psql $DATABASE_URL -c "SELECT flag_name, enabled FROM feature_flags"
```

### Screenshot Markers
For critical UX tests, save screenshots:
1. Error screens
2. Feature gates (UI locked when flag OFF)
3. Unexpected routing
4. Payment flows

---

## Timeline

| Phase | Tests | Hours | Dates |
|-------|-------|-------|-------|
| 1. Auth | 14 | 2 | Day 1 morning |
| 2. Charts | 11 | 2 | Day 1 afternoon |
| 3. Profiles | 12 | 2 | Day 2 morning |
| 4. Subscription | 16 | 3 | Day 2 afternoon |
| 5. Practitioner | 11 | 1.5 | Day 3 morning |
| 6. Feature Flags | 23 | 2 | Day 3 afternoon |
| 7. Engagement | 9 | 1 | Day 4 morning |
| 8. Data/Content | 16 | 1.5 | Day 4 afternoon |
| 9. Referral | 8 | 1 | Day 5 morning |
| 10. Error Handling | 9 | 1 | Day 5 afternoon |
| **TOTAL** | **129** | **16.5** | 5 days |

---

## After Execution

1. **Consolidate Results** — Update `HUMANDESIGN_TEST_RESULTS.json` with all 129 test objects
2. **Summary Tables** — Update pass/fail counts in `HUMANDESIGN_TEST_RESULTS.md`
3. **Classify Findings** — Mark as logic errors, routing errors, missing tracking, etc.
4. **Export for Opus** — Save JSON to share with Opus for deep analysis

---

## Questions?

See:
- Test Plan: `docs/HUMANDESIGN_COMPREHENSIVE_TEST_PLAN.md`
- Known Issues: `docs/HUMANDESIGN_TEST_RESULTS.md` → "Critical Findings"
- KPIs: `docs/kpis/humandesign.md`
