# HumanDesign (selfprime) Comprehensive Logic & Routing Test Plan

**Purpose:** Systematically test every functional pathway and option in the application to identify logic routing errors.

**Status:** Test plan created 2026-06-11 · Awaiting execution

---

## Test Scope

This plan covers:
1. **User Flows** — signup, login, chart calculation, profile generation, tier upgrades
2. **Feature Flags** — all 7 flags ON/OFF combinations (128 total states, focus on critical paths)
3. **User States** — free tier, paid tier, practitioner, admin
4. **Core Pathways** — happy path, edge cases, error states
5. **Data Validation** — input validation, boundary conditions, type checking

---

## 1. User Signup & Authentication Flow

### 1.1 Signup Pathways
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T1.1.1 | New user signup (email) | valid email, password | Account created, email verified sent | | |
| T1.1.2 | Signup with OAuth (Google) | Google OAuth | Account created, linked to Google | | |
| T1.1.3 | Signup with OAuth (Apple) | Apple OAuth | Account created, linked to Apple | | |
| T1.1.4 | Duplicate email signup | existing email | Error: email exists, prompt login | | |
| T1.1.5 | Invalid email format | bad-email | Error: invalid email | | |
| T1.1.6 | Weak password | "123" | Error: password requirements not met | | |
| T1.1.7 | Missing required fields | empty fields | Error: required fields missing | | |

### 1.2 Login Pathways
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T1.2.1 | Login with email/password | correct creds | Logged in, redirected to dashboard | | |
| T1.2.2 | Login with wrong password | wrong password | Error: invalid credentials | | |
| T1.2.3 | Login nonexistent email | fake@email.com | Error: user not found | | |
| T1.2.4 | OAuth login | valid OAuth | Logged in, existing account linked | | |
| T1.2.5 | Session persistence | login, close tab, return | Session still valid, logged in | | |
| T1.2.6 | Logout | click logout | Session cleared, redirected to login | | |
| T1.2.7 | Email not verified | unverified email login | Warning or block; prompt verify | | |

---

## 2. Chart Calculation Flow

### 2.1 Chart Input Validation
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T2.1.1 | Valid birth data | full date, time, location | Chart calculated, stored | | |
| T2.1.2 | Missing time of birth | date, location, no time | Handled gracefully (default or error) | | |
| T2.1.3 | Missing location | date, time, no location | Handled gracefully | | |
| T2.1.4 | Invalid date | future date | Error: date validation | | |
| T2.1.5 | Timezone handling | UTC vs local | Correct chart calculated | | |
| T2.1.6 | Duplicate chart | same birth data | New chart or reuse existing? | | |
| T2.1.7 | Multiple charts per user | 3+ different charts | All stored, user can select default | | |

### 2.2 Chart Calculation Accuracy
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T2.2.1 | Known chart | celebrity birth data | Chart matches published data | | |
| T2.2.2 | Boundary times (sunrise) | exact sunrise time | Correct house calculation | | |
| T2.2.3 | Boundary times (sunset) | exact sunset time | Correct house calculation | | |
| T2.2.4 | Daylight saving transition | DST boundary date | Time correctly adjusted | | |

---

## 3. Profile Generation (Oracle)

### 3.1 Profile Generation Flow
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T3.1.1 | Generate profile (free user) | chart data | LLM synthesis starts, completes | | |
| T3.1.2 | Profile generation latency | time LLM call | p95 < 5s (or document actual) | | |
| T3.1.3 | Generate profile (paid user) | chart data | Same or enhanced synthesis | | |
| T3.1.4 | Generate second profile | same user, same chart | Cached or regenerated? | | |
| T3.1.5 | LLM provider fallback | Anthropic fails | Falls back to DeepSeek/Groq | | |
| T3.1.6 | LLM cost tracking | multiple profiles | Cost logged to llm_token_tracking | | |
| T3.1.7 | Profile view after generation | refresh page | Profile persists and displays | | |

### 3.2 Profile Display & Content
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T3.2.1 | Profile sections present | generated profile | All expected sections visible | | |
| T3.2.2 | Profile read time estimate | generated text | Accurate reading time shown | | |
| T3.2.3 | Profile download/export | profile data | PDF or text export works | | |
| T3.2.4 | Profile sharing | share link | Shareable link generated, works | | |
| T3.2.5 | Profile editing | user edits text | Changes saved | | |

---

## 4. Tier & Subscription Flow

### 4.1 Free Tier Behavior
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T4.1.1 | Free tier limits | 1 chart, 1 profile | Cannot add more without upgrade | | |
| T4.1.2 | Free tier features hidden | premium features | Locked/hidden, CTA to upgrade | | |
| T4.1.3 | Free tier checkout button | click "upgrade" | Stripe checkout appears | | |
| T4.1.4 | Free tier checkout disabled? | ACS `disable_checkout=true` | Checkout blocked or allowed? | | |

### 4.2 Checkout & Payment
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T4.2.1 | Open checkout modal | click "upgrade" | Stripe form loads | | |
| T4.2.2 | Checkout disabled gate | ACS disabled | Checkout unavailable, error shown | | |
| T4.2.3 | Successful payment | valid card (test) | Subscription created, tier updated | | |
| T4.2.4 | Failed payment | declined card | Error shown, user not charged | | |
| T4.2.5 | Duplicate payment attempt | click pay 2x | Idempotency prevents double-charge | | |
| T4.2.6 | Checkout analytics | complete purchase | `CHECKOUT_COMPLETE` event fires | | |

### 4.3 Subscription Management
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T4.3.1 | View subscription status | open settings | Current tier, renewal date shown | | |
| T4.3.2 | Upgrade tier | free → premium | Billing adjusted prorated? | | |
| T4.3.3 | Downgrade tier | premium → free | Confirmation required; renewal on next cycle | | |
| T4.3.4 | Cancel subscription | click cancel | Subscription marked for cancellation | | |
| T4.3.5 | Reactivate canceled sub | resubscribe | Account reactivated | | |

---

## 5. Practitioner Features

### 5.1 Practitioner Signup & Activation
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T5.1.1 | Request practitioner access | paid user, request | Practitioner gate 1 triggered | | |
| T5.1.2 | Approve practitioner access | admin approves | User gains practitioner role | | |
| T5.1.3 | Add first client | invite client | `PRACTITIONER_GATE2_COMPLETED` fires | | |
| T5.1.4 | Practitioner activated status | 1+ clients active | `PRACTITIONER_ACTIVATED` fires | | |

### 5.2 Practitioner Tools
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T5.2.1 | Directory listing | practitioner profile | Listed in `/api/directory` | | |
| T5.2.2 | Client management | invite/remove clients | Client list updates correctly | | |
| T5.2.3 | Session notes | create session note | Note saved to `practitioner_session_notes` | | |
| T5.2.4 | Session templates | select template | Template populates form | | |
| T5.2.5 | Calendly booking link | link account | Bookings sync to `calendar_events` | | |

---

## 6. Feature Flags

### 6.1 Achievements (`ACHIEVEMENTS_VISIBLE`)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T6.1.1 | Achievements visible (ON) | user interacts | Achievements appear, tracked | | |
| T6.1.2 | CCR cron trigger | daily cron | Achievements polled and updated | | |
| T6.1.3 | Achievement unlock | meet criteria | Badge awarded, notification sent | | |

### 6.2 Clusters (`CLUSTERS_VISIBLE`, OFF)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T6.2.1 | Clusters hidden (OFF) | /api/clusters endpoint | 403/404 or empty response | | |
| T6.2.2 | Enable flag | toggle flag ON | /api/clusters returns data | | |
| T6.2.3 | UI clusters gate | flag OFF | Clusters section hidden | | |

### 6.3 Divination (`DIVINATION_ENABLED`, OFF)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T6.3.1 | Divination hidden (OFF) | try /api/divination | 403/404 or empty | | |
| T6.3.2 | Enable divination | toggle flag ON | /api/divination returns data | | |
| T6.3.3 | UI divination gate | flag OFF | Divination section hidden | | |

### 6.4 One-Time Purchases (`ONE_TIME_PURCHASES_VISIBLE`, OFF)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T6.4.1 | Purchase hidden (OFF) | UI check | Synthesis token purchase not shown | | |
| T6.4.2 | Enable flag | toggle flag ON | Token purchase appears, buy button shown | | |
| T6.4.3 | Purchase flow | click buy token | Stripe checkout for one-time payment | | |
| T6.4.4 | Token usage | apply token | Gives X free syntheses | | |

### 6.5 ACS Checkout (`disable_checkout`)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T6.5.1 | Checkout disabled (TRUE) | try checkout | Cart blocked or unavailable | | |
| T6.5.2 | Enable checkout | disable_checkout=false | Normal checkout available | | |
| T6.5.3 | ACS feed toggle | change flag | Product feed updated | | |

### 6.6 Experiments (`EXPERIMENTS_ENABLED`, OFF)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T6.6.1 | Experiments hidden (OFF) | DAU < 500 | Experiment features disabled | | |
| T6.6.2 | DAU threshold met | DAU ≥ 500 (mock) | Feature flag unlocks | | |
| T6.6.3 | Experiment A/B assignment | new user | Assigned to variant (A/B) | | |

---

## 7. Daily Engagement & Streaks

### 7.1 Check-in Flow
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T7.1.1 | Complete check-in | daily prompt, response | `CHECKIN_COMPLETE` fires | | |
| T7.1.2 | Streak tracking | daily check-ins | Streak increments each day | | |
| T7.1.3 | Streak break | miss a day | Streak resets to 0 | | |
| T7.1.4 | Streak API | GET /api/checkin/streak | Current streak returned | | |
| T7.1.5 | Archived check-ins | view history | All check-ins listed | | |

### 7.2 Notifications & Reminders
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T7.2.1 | Daily reminder | 8am local time | Push notification sent | | |
| T7.2.2 | Transit alert | alert triggered | `alert_deliveries` recorded | | |
| T7.2.3 | Alert feedback | user marks "read" | Logged but not stored? | | |
| T7.2.4 | Mute alerts | user mutes | No more alerts for this transit | | |

---

## 8. Data & Content Features

### 8.1 Diary Entries (`trackEvent` missing)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T8.1.1 | Create diary entry | title, text | Entry saved to `diary_entries` | | |
| T8.1.2 | View diary history | list entries | All entries paginated | | |
| T8.1.3 | Diary analytics | create entries | `DIARY_CREATE` event fires? | | |
| T8.1.4 | Diary search | search text | Entries filtered | | |

### 8.2 Dream Analysis (`trackEvent` missing)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T8.2.1 | Log dream | date, description | Dream stored | | |
| T8.2.2 | LLM analysis | analyze dream | Oracle synthesis of dream | | |
| T8.2.3 | Dream analytics | create dream | `DREAM_CREATE` event fires? | | |

### 8.3 Messaging (`trackEvent` missing)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T8.3.1 | Send message | to practitioner | Message stored, notification sent | | |
| T8.3.2 | Receive message | practitioner replies | Conversation thread appears | | |
| T8.3.3 | Messaging analytics | send message | `MESSAGE_SENT` event fires? | | |

### 8.4 Testimonials (`trackEvent` missing)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T8.4.1 | Submit testimonial | text, rating | Stored to `platform_testimonials` | | |
| T8.4.2 | Admin approval | approve testimonial | Appears on public pages | | |
| T8.4.3 | Testimonial analytics | submit testimonial | `TESTIMONIAL_SUBMIT` event fires? | | |

---

## 9. Referral & Promotions

### 9.1 Referral Flow
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T9.1.1 | Generate referral link | user profile | Unique link created | | |
| T9.1.2 | Share referral | send link | Shared, tracking active | | |
| T9.1.3 | Referral signup | friend uses link | `referral_signups` recorded | | |
| T9.1.4 | Referral conversion | friend upgrades | Referrer credited | | |
| T9.1.5 | Referral analytics | full funnel | Click-through tracked? | | |

### 9.2 Promo Codes (`trackEvent` missing)
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T9.2.1 | Apply promo code | valid code | Discount applied at checkout | | |
| T9.2.2 | Invalid code | bad code | Error shown | | |
| T9.2.3 | Promo analytics | apply code | `PROMO_APPLIED` event fires? | | |

---

## 10. Error Handling & Edge Cases

### 10.1 Network Errors
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T10.1.1 | API timeout | slow network | Graceful error, retry offered | | |
| T10.1.2 | LLM provider down | Anthropic 500 | Fallback to DeepSeek/Groq | | |
| T10.1.3 | Stripe down | payment fails | Error: try again later | | |
| T10.1.4 | DB connection error | connection timeout | 503 Service Unavailable | | |

### 10.2 Boundary Conditions
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T10.2.1 | Max chart size | 100KB birth data | Accepted or rejected clearly | | |
| T10.2.2 | Very old birth date | 1900 | Handled or rejected | | |
| T10.2.3 | Rate limiting | 100 requests/sec | 429 returned after threshold | | |
| T10.2.4 | Large response | 10MB profile | Streaming or pagination | | |

### 10.3 Concurrency
| Test ID | Scenario | Input | Expected Result | Actual Result | Match? |
|---------|----------|-------|-----------------|---------------|--------|
| T10.3.1 | Simultaneous chart calcs | 2 users, same data | Both succeed independently | | |
| T10.3.2 | Simultaneous checkout | 2 payment attempts | Idempotency prevents double-charge | | |
| T10.3.3 | Concurrent edits | user edits from 2 tabs | Last-write-wins or conflict detected | | |

---

## Test Execution Guide

### Setup
```bash
# 1. Access selfprime.net
curl -X GET https://selfprime.net/?start=1

# 2. Open browser DevTools → Network + Console
# 3. Note all requests/responses for each test
```

### Recording Results
For each test:
1. **Input:** Exact parameters entered
2. **Expected Result:** From spec or documented behavior
3. **Actual Result:** What actually happened
4. **Response codes:** HTTP status, API response
5. **Side effects:** DB changes, event fires, notifications sent
6. **Performance:** Latency (especially for T3.1.2)
7. **Issues found:** Any discrepancies

### Result Format (JSON)
```json
{
  "test_id": "T1.1.1",
  "category": "User Signup",
  "scenario": "New user signup (email)",
  "timestamp": "2026-06-11T14:32:00Z",
  "input": {
    "email": "test@example.com",
    "password": "Test123!@#"
  },
  "expected_result": "Account created, email verified sent",
  "actual_result": "Account created successfully",
  "http_status": 201,
  "response_body": { "user_id": "...", "email": "test@example.com" },
  "side_effects": {
    "db_user_created": true,
    "email_sent": true,
    "event_fired": "SIGNUP"
  },
  "latency_ms": 234,
  "match": true,
  "notes": "Works as expected"
}
```

---

## Analysis by Opus

Once results are gathered, Opus will:
1. **Identify mismatches** — actual vs expected
2. **Flag logic errors** — routing problems, missing validations, wrong states
3. **Prioritize issues** — by severity and user impact
4. **Suggest fixes** — specific code changes needed
5. **Create issue tickets** — with reproducible steps and expected fixes

---

## Known Issues Pre-Test

From `docs/kpis/humandesign.md`:
- **T4.2.2** Checkout gated: `disable_checkout=true` in ACS feed (test will verify if users see error or silently fail)
- **T6.1.2** Achievements cron: CCR routine `trig_01Bwsi2Ksn8yQ9MgVvgRSSwR` runs daily (verify timing)
- **T8.*, T9.2.3, T9.2.1.5** Missing `trackEvent` calls — these won't fire events (test will confirm)
- **T3.1.2** LLM latency unknown; target is <5s, actual may be >5s cold-start

---

## Timeline
- **2026-06-11** Plan created
- **2026-06-12–6-14** Execute tests (estimate 200+ tests × 2-5 min each = 10–15 hours)
- **2026-06-15** Opus review & gap analysis
- **2026-06-16–6-20** Fix & re-verify critical issues
