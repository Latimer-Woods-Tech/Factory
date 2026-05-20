# Completion Tracker
_Generated 2026-05-20T12:42:40+00:00 by `scripts/aggregate_completion.py`._

## 🚨 CI red on main: XC

## Roll-up
| Repo | ✅ | ⚠️ | ❌ | 🔍 | Total | Pass % | Pass % (known) | **Weighted** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **HD** HumanDesign | 64 | 1 | 18 | 6 | 89 | 71.9% | 77.1% | **74.9%** (Δ+0.0) |
| **CC** capricast | 0 | 0 | 0 | 64 | 64 | 0.0% | 0.0% | **0.0%** (Δ+0.0) |
| **FA** factory-admin-studio 🟧smoke | 0 | 0 | 0 | 43 | 43 | 0.0% | 0.0% | **0.0%** (Δ+0.0) |
| **CH** cypher-healing | 0 | 0 | 41 | 4 | 45 | 0.0% | 0.0% | **0.0%** (Δ+0.0) |
| **XC** xico-city 🚨 🟧smoke | 0 | 0 | 24 | 5 | 29 | 0.0% | 0.0% | **0.0%** (Δ+0.0) |

**Overall weighted pass: 26.5% (Δ+0.0)** · known: 43.2% · raw: 23.7%

## HD — HumanDesign
### Authentication & Authorization — 91.5% weighted (11✅ 1⚠️ 0❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-AUTH-001` | Sign Up | ✅ | 5 | — | — |
| `HD-AUTH-002` | Sign In | ✅ | 5 | — | — |
| `HD-AUTH-003` | Sign Out | ✅ | 5 | — | — |
| `HD-AUTH-004` | Session Persistence | ⚠️ | 5 | — | — |
| `HD-AUTH-005` | Password Reset Request | ✅ | 5 | — | — |
| `HD-AUTH-006` | Password Reset Confirm | ✅ | 5 | — | — |
| `HD-AUTH-007` | 2FA Setup | ✅ | 5 | — | — |
| `HD-AUTH-008` | 2FA Verification | ✅ | 5 | — | — |
| `HD-AUTH-009` | OAuth - Google | ✅ | 5 | — | — |
| `HD-AUTH-010` | OAuth - Apple | ✅ | 5 | — | — |
| `HD-AUTH-011` | Middleware Redirect | ✅ | 4 | — | — |
| `HD-AUTH-012` | JWT Validation | ✅ | 5 | — | — |

### Chart Generation — 67.5% weighted (7✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-CHART-001` | Birth Data Input | ✅ | 4 | — | — |
| `HD-CHART-002` | Chart Generation | ✅ | 4 | — | — |
| `HD-CHART-003` | Chart Retrieval | ✅ | 4 | — | — |
| `HD-CHART-004` | Chart Update | ❌ | 4 | — | — |
| `HD-CHART-005` | Chart Delete | ❌ | 5 | — | — |
| `HD-CHART-006` | Today's Hint | ✅ | 3 | — | — |
| `HD-CHART-007` | Human Design Types | ✅ | 4 | — | — |
| `HD-CHART-008` | Gene Keys | ✅ | 4 | — | — |
| `HD-CHART-009` | Astrology Natal Chart | ✅ | 4 | — | — |
| `HD-CHART-010` | Cross-Synthesis | ❌ | 4 | — | — |

### Profile & Blueprint — 75.0% weighted (6✅ 0⚠️ 2❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-PROF-001` | Personal Dashboard | ✅ | 4 | — | — |
| `HD-PROF-002` | My Blueprint Page | ✅ | 4 | — | — |
| `HD-PROF-003` | My Charts Page | ✅ | 4 | — | — |
| `HD-PROF-004` | Profile Settings | ✅ | 3 | — | — |
| `HD-PROF-005` | Profile Update API | ✅ | 3 | — | — |
| `HD-PROF-006` | Profile Photo Upload | ❌ | 3 | — | — |
| `HD-PROF-007` | Timezone Management | ❌ | 4 | — | — |
| `HD-PROF-008` | Locale/Language | ✅ | 3 | — | — |

### Billing & Subscriptions — 100.0% weighted (12✅ 0⚠️ 0❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-BILL-001` | View Pricing Page | ✅ | 3 | — | — |
| `HD-BILL-002` | Select Plan | ✅ | 5 | — | — |
| `HD-BILL-003` | Stripe Checkout | ✅ | 5 | — | — |
| `HD-BILL-004` | Webhook - Payment Success | ✅ | 5 | — | — |
| `HD-BILL-005` | Webhook - Payment Failed | ✅ | 5 | — | — |
| `HD-BILL-006` | Upgrade Plan | ✅ | 5 | — | — |
| `HD-BILL-007` | Downgrade Plan | ✅ | 5 | — | — |
| `HD-BILL-008` | Cancel Subscription | ✅ | 5 | — | — |
| `HD-BILL-009` | Reactivate Subscription | ✅ | 5 | — | — |
| `HD-BILL-010` | View Invoices | ✅ | 4 | — | — |
| `HD-BILL-011` | Update Payment Method | ✅ | 5 | — | — |
| `HD-BILL-012` | Retention Flow | ✅ | 4 | — | — |

### Practitioner Features — 61.3% weighted (5✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-PRAC-001` | Practitioner Dashboard | ✅ | 4 | — | — |
| `HD-PRAC-002` | Client Management | ✅ | 4 | — | — |
| `HD-PRAC-003` | Add Client | ✅ | 4 | — | — |
| `HD-PRAC-004` | Generate Client Chart | ✅ | 4 | — | — |
| `HD-PRAC-005` | Client Session Notes | ❌ | 4 | — | — |
| `HD-PRAC-006` | Practitioner Profile | ✅ | 3 | — | — |
| `HD-PRAC-007` | Public Practitioner Page | ❌ | 4 | — | — |
| `HD-PRAC-008` | Booking Integration | ❌ | 4 | — | — |

### UI/UX Components — 60.0% weighted (7✅ 0⚠️ 4❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-UI-001` | Shell Bootstrap | ✅ | 1 | — | — |
| `HD-UI-002` | Authentication Overlay | ✅ | 4 | — | — |
| `HD-UI-003` | Router | ✅ | 1 | — | — |
| `HD-UI-004` | Sidebar Navigation | ✅ | 3 | — | — |
| `HD-UI-005` | Modal System | ❌ | 3 | — | — |
| `HD-UI-006` | Form Validation | ✅ | 3 | — | — |
| `HD-UI-007` | Error Handling | ❌ | 3 | — | — |
| `HD-UI-008` | Loading States | ❌ | 3 | — | — |
| `HD-UI-009` | Internationalization | ✅ | 3 | — | — |
| `HD-UI-010` | Responsive Design | ❌ | 3 | — | — |
| `HD-UI-011` | Accessibility | ✅ | 3 | — | — |

### Marketing Pages — 57.7% weighted (5✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-MKT-001` | Homepage | ✅ | 4 | — | — |
| `HD-MKT-002` | Marketing Page | ✅ | 4 | — | — |
| `HD-MKT-003` | Pricing Page | ❌ | 4 | — | — |
| `HD-MKT-004` | Practitioners Page | ❌ | 4 | — | — |
| `HD-MKT-005` | FAQ/Help | ❌ | 3 | — | — |
| `HD-MKT-006` | Legal - Privacy | ✅ | 3 | — | — |
| `HD-MKT-007` | Legal - Terms | ✅ | 3 | — | — |
| `HD-MKT-008` | 404 Page | ✅ | 1 | — | — |

### API Health & Monitoring — 57.1% weighted (4✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-HEALTH-001` | Health Endpoint | ✅ | 1 | — | — |
| `HD-HEALTH-002` | Version Info | ✅ | 1 | — | — |
| `HD-HEALTH-003` | Database Health | ❌ | 2 | — | — |
| `HD-HEALTH-004` | Sentry Error Tracking | ❌ | 2 | — | — |
| `HD-HEALTH-005` | PostHog Analytics | ❌ | 2 | — | — |
| `HD-HEALTH-006` | Rate Limiting | ✅ | 5 | — | — |
| `HD-HEALTH-007` | CORS Configuration | ✅ | 1 | — | — |

### Data Integrity & Security — 100.0% weighted (7✅ 0⚠️ 0❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-SEC-001` | SQL Injection Protection | ✅ | 5 | — | — |
| `HD-SEC-002` | XSS Protection | ✅ | 5 | — | — |
| `HD-SEC-003` | CSRF Token | ✅ | 5 | — | — |
| `HD-SEC-004` | Password Hashing | ✅ | 5 | — | — |
| `HD-SEC-005` | JWT Expiration | ✅ | 5 | — | — |
| `HD-SEC-006` | Input Validation | ✅ | 5 | — | — |
| `HD-SEC-007` | Output Sanitization | ✅ | 5 | — | — |

### Performance — 0.0% weighted (0✅ 0⚠️ 0❌ 6🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `HD-PERF-001` | Homepage Load Time | 🔍 | 3 | — | — |
| `HD-PERF-002` | API Response Time | 🔍 | 3 | — | — |
| `HD-PERF-003` | Chart Generation | 🔍 | 4 | — | — |
| `HD-PERF-004` | Bundle Size | 🔍 | 3 | — | — |
| `HD-PERF-005` | Time to Interactive | 🔍 | 3 | — | — |
| `HD-PERF-006` | Database Query Time | 🔍 | 3 | — | — |

## CC — capricast
### Authentication & Accounts — 0.0% weighted (0✅ 0⚠️ 0❌ 7🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-AUTH-001` | Sign Up (Next.js) | 🔍 | 5 | — | — |
| `VK-AUTH-002` | Sign In (Next.js) | 🔍 | 5 | — | — |
| `VK-AUTH-003` | Auth catch-all (Better-Auth) | 🔍 | 5 | — | — |
| `VK-AUTH-004` | Worker auth routes | 🔍 | 5 | — | — |
| `VK-AUTH-005` | Session middleware | 🔍 | 5 | — | — |
| `VK-AUTH-006` | Admin middleware | 🔍 | 5 | — | — |
| `VK-AUTH-007` | Account routes | 🔍 | 4 | — | — |

### Video Catalog & Playback — 0.0% weighted (0✅ 0⚠️ 0❌ 9🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-VID-001` | Video list/detail API | 🔍 | 4 | — | — |
| `VK-VID-002` | Watch page | 🔍 | 4 | — | — |
| `VK-VID-003` | Video player component | 🔍 | 4 | — | — |
| `VK-VID-004` | Video feed / discovery | 🔍 | 4 | — | — |
| `VK-VID-005` | Home page | 🔍 | 4 | — | — |
| `VK-VID-006` | Search | 🔍 | 4 | — | — |
| `VK-VID-007` | Upload flow | 🔍 | 5 | — | — |
| `VK-VID-008` | Playlists | 🔍 | 3 | — | — |
| `VK-VID-009` | Channels | 🔍 | 4 | — | — |

### Live Conference & Realtime — 0.0% weighted (0✅ 0⚠️ 0❌ 8🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-RT-001` | Conference API | 🔍 | 4 | — | — |
| `VK-RT-002` | Conference room DO | 🔍 | 4 | — | — |
| `VK-RT-003` | Conference WebSocket | 🔍 | 4 | — | — |
| `VK-RT-004` | Video room DO | 🔍 | 4 | — | — |
| `VK-RT-005` | Creator notifications DO | 🔍 | 3 | — | — |
| `VK-RT-006` | User presence DO | 🔍 | 3 | — | — |
| `VK-RT-007` | Conference UI | 🔍 | 4 | — | — |
| `VK-RT-008` | Watch party & chat | 🔍 | 4 | — | — |

### Billing, Payouts & Stripe Connect — 0.0% weighted (0✅ 0⚠️ 0❌ 13🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-BILL-001` | Pricing page | 🔍 | 4 | — | — |
| `VK-BILL-002` | Stripe API routes | 🔍 | 5 | — | — |
| `VK-BILL-003` | Stripe lib | 🔍 | 5 | — | — |
| `VK-BILL-004` | Stripe webhooks | 🔍 | 5 | — | — |
| `VK-BILL-005` | Entitlements | 🔍 | 5 | — | — |
| `VK-BILL-006` | Trial activation | 🔍 | 5 | — | — |
| `VK-BILL-007` | Subscribe button | 🔍 | 5 | — | — |
| `VK-BILL-008` | Pay-per-view unlock | 🔍 | 5 | — | — |
| `VK-BILL-009` | Creator payouts API | 🔍 | 5 | — | — |
| `VK-BILL-010` | Payout service/lib | 🔍 | 5 | — | — |
| `VK-BILL-011` | Payout cron DO | 🔍 | 5 | — | — |
| `VK-BILL-012` | Earnings dashboard | 🔍 | 4 | — | — |
| `VK-BILL-013` | Admin payout batch | 🔍 | 5 | — | — |

### Creator Tools & Growth — 0.0% weighted (0✅ 0⚠️ 0❌ 12🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-CR-001` | Creator dashboard | 🔍 | 4 | — | — |
| `VK-CR-002` | Creator verification | 🔍 | 3 | — | — |
| `VK-CR-003` | Creator analytics | 🔍 | 3 | — | — |
| `VK-CR-004` | Dashboard analytics endpoint | 🔍 | 3 | — | — |
| `VK-CR-005` | Analytics dashboard UI | 🔍 | 4 | — | — |
| `VK-CR-006` | Growth manager | 🔍 | 3 | — | — |
| `VK-CR-007` | Referrals | 🔍 | 3 | — | — |
| `VK-CR-008` | Experiments | 🔍 | 2 | — | — |
| `VK-CR-009` | CRM | 🔍 | 2 | — | — |
| `VK-CR-010` | Events | 🔍 | 3 | — | — |
| `VK-CR-011` | Conference booking page | 🔍 | 4 | — | — |
| `VK-CR-012` | VIP features | 🔍 | 3 | — | — |

### Ads, Moderation & Admin — 0.0% weighted (0✅ 0⚠️ 0❌ 7🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-ADM-001` | Ads API | 🔍 | 3 | — | — |
| `VK-ADM-002` | Moderation API | 🔍 | 2 | — | — |
| `VK-ADM-003` | Admin routes | 🔍 | 2 | — | — |
| `VK-ADM-004` | Admin dashboard page | 🔍 | 2 | — | — |
| `VK-ADM-005` | Governance lib | 🔍 | 2 | — | — |
| `VK-ADM-006` | Dead letter queue | 🔍 | 2 | — | — |
| `VK-ADM-007` | Admin analytics | 🔍 | 2 | — | — |

### Notifications, Email & SEO — 0.0% weighted (0✅ 0⚠️ 0❌ 8🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `VK-NOT-001` | Notifications API | 🔍 | 3 | — | — |
| `VK-NOT-002` | Email API | 🔍 | 3 | — | — |
| `VK-NOT-003` | Email preferences | 🔍 | 3 | — | — |
| `VK-NOT-004` | Creator notifications lib | 🔍 | 3 | — | — |
| `VK-NOT-005` | SEO / sitemap | 🔍 | 1 | — | — |
| `VK-NOT-006` | Retry utility | 🔍 | 1 | — | — |
| `VK-NOT-007` | Platform config | 🔍 | 1 | — | — |
| `VK-NOT-008` | Types contract | 🔍 | 1 | — | — |

## FA — factory-admin-studio
### Health, Auth & Session — 0.0% weighted (0✅ 0⚠️ 0❌ 9🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-HEALTH-001` | Health check | 🔍 | 1 | — | smoke-red |
| `FA-AUTH-001` | Auth routes | 🔍 | 5 | — | smoke-red |
| `FA-AUTH-002` | `/me` profile | 🔍 | 5 | — | smoke-red |
| `FA-AUTH-003` | Env context middleware | 🔍 | 5 | — | smoke-red |
| `FA-AUTH-004` | Audit middleware | 🔍 | 2 | — | smoke-red |
| `FA-AUTH-005` | Require-confirmation middleware | 🔍 | 5 | — | smoke-red |
| `FA-AUTH-006` | CORS middleware | 🔍 | 1 | — | smoke-red |
| `FA-AUTH-007` | Request ID middleware | 🔍 | 1 | — | smoke-red |
| `FA-AUTH-008` | HMAC utility | 🔍 | 5 | — | smoke-red |

### Public Manifest & Function Catalog — 0.0% weighted (0✅ 0⚠️ 0❌ 4🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-CAT-001` | Public manifest | 🔍 | 2 | — | — |
| `FA-CAT-002` | Function catalog | 🔍 | 2 | — | — |
| `FA-CAT-003` | App registry | 🔍 | 2 | — | — |
| `FA-CAT-004` | Apps list | 🔍 | 2 | — | — |

### Test Runs & Deploys (CI/CD surface) — 0.0% weighted (0✅ 0⚠️ 0❌ 8🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-CICD-001` | Test runs API | 🔍 | 2 | — | — |
| `FA-CICD-002` | Deploys API | 🔍 | 5 | — | — |
| `FA-CICD-003` | GitHub dispatch | 🔍 | 2 | — | — |
| `FA-CICD-004` | GitHub API wrapper | 🔍 | 2 | — | — |
| `FA-CICD-005` | Repo API | 🔍 | 2 | — | — |
| `FA-CICD-006` | Studio tests webhook | 🔍 | 5 | — | — |
| `FA-CICD-007` | Deployment verification script | 🔍 | 2 | — | — |
| `FA-CICD-008` | Service registry check script | 🔍 | 2 | — | — |

### AI Analysis & Audit Trail — 0.0% weighted (0✅ 0⚠️ 0❌ 4🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-AI-001` | AI routes | 🔍 | 2 | — | — |
| `FA-AI-002` | AI analysis cycle (cron) | 🔍 | 2 | — | — |
| `FA-AI-003` | Audit log API | 🔍 | 5 | — | — |
| `FA-AI-004` | Timeline API | 🔍 | 2 | — | — |

### Observability, SLO & Ops — 0.0% weighted (0✅ 0⚠️ 0❌ 6🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-OBS-001` | Observability API | 🔍 | 2 | — | — |
| `FA-OBS-002` | SLO API | 🔍 | 2 | — | — |
| `FA-OBS-003` | Schema readiness | 🔍 | 2 | — | — |
| `FA-OBS-004` | Smoke tests API | 🔍 | 2 | — | — |
| `FA-OBS-005` | Synthetic checks | 🔍 | 2 | — | — |
| `FA-OBS-006` | Ops runbooks | 🔍 | 2 | — | — |

### Creators, Payouts & Stripe Connect — 0.0% weighted (0✅ 0⚠️ 0❌ 5🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-PAY-001` | Creator onboarding | 🔍 | 5 | — | — |
| `FA-PAY-002` | Admin creators | 🔍 | 2 | — | — |
| `FA-PAY-003` | Admin payouts | 🔍 | 5 | — | — |
| `FA-PAY-004` | Stripe Connect webhooks | 🔍 | 5 | — | — |
| `FA-PAY-005` | Studio subscriptions webhook | 🔍 | 5 | — | — |

### Feature Flags, DSR & Digest — 0.0% weighted (0✅ 0⚠️ 0❌ 7🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `FA-FLG-001` | Flagship / feature flags | 🔍 | 2 | — | — |
| `FA-FLG-002` | Data Subject Requests | 🔍 | 5 | — | — |
| `FA-FLG-003` | Digest orchestrator | 🔍 | 2 | — | — |
| `FA-FLG-004` | Digest collect | 🔍 | 2 | — | — |
| `FA-FLG-005` | Digest render | 🔍 | 2 | — | — |
| `FA-FLG-006` | Digest audio (TTS) | 🔍 | 2 | — | — |
| `FA-FLG-007` | Digest send | 🔍 | 2 | — | — |

## CH — cypher-healing
### Authentication & Authorization — 0.0% weighted (0✅ 0⚠️ 4❌ 2🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-AUTH-001` | Sign Up | 🔍 | 5 | — | — |
| `CH-AUTH-002` | Sign In | 🔍 | 5 | — | — |
| `CH-AUTH-003` | Sign Out | ❌ | 5 | — | — |
| `CH-AUTH-004` | Password Reset Request | ❌ | 5 | — | — |
| `CH-AUTH-005` | Magic Link | ❌ | 5 | — | — |
| `CH-AUTH-006` | Auth Middleware | ❌ | 5 | — | — |

### Academy (Courses & Learning) — 0.0% weighted (0✅ 0⚠️ 5❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-ACAD-001` | List Courses | ❌ | 4 | — | — |
| `CH-ACAD-002` | Get Course | ❌ | 4 | — | — |
| `CH-ACAD-003` | Enroll in Course | ❌ | 5 | — | — |
| `CH-ACAD-004` | Lesson Progress | ❌ | 4 | — | — |
| `CH-ACAD-005` | Course Modules / Lessons | ❌ | 4 | — | — |

### Booking & Appointments — 0.0% weighted (0✅ 0⚠️ 5❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-BOOK-001` | List Services | ❌ | 4 | — | — |
| `CH-BOOK-002` | Book Appointment | ❌ | 5 | — | — |
| `CH-BOOK-003` | Availability Slots | ❌ | 4 | — | — |
| `CH-BOOK-004` | Cancel Appointment | ❌ | 5 | — | — |
| `CH-BOOK-005` | Appointment Reminder Email | ❌ | 3 | — | — |

### Events — 0.0% weighted (0✅ 0⚠️ 4❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-EVENT-001` | List Events | ❌ | 4 | — | — |
| `CH-EVENT-002` | Get Event | ❌ | 4 | — | — |
| `CH-EVENT-003` | Register for Event | ❌ | 5 | — | — |
| `CH-EVENT-004` | Event Registration Email | ❌ | 3 | — | — |

### Store / E-commerce — 0.0% weighted (0✅ 0⚠️ 4❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-STORE-001` | List Products | ❌ | 4 | — | — |
| `CH-STORE-002` | Buy Product | ❌ | 5 | — | — |
| `CH-STORE-003` | Order History | ❌ | 4 | — | — |
| `CH-STORE-004` | Order Confirmation Email | ❌ | 3 | — | — |

### Subscriptions & Membership — 0.0% weighted (0✅ 0⚠️ 4❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-SUB-001` | List Plans | ❌ | 4 | — | — |
| `CH-SUB-002` | Subscribe | ❌ | 5 | — | — |
| `CH-SUB-003` | My Subscription | ❌ | 4 | — | — |
| `CH-SUB-004` | Cancel Subscription | ❌ | 5 | — | — |

### Show / Episodes — 0.0% weighted (0✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-SHOW-001` | List Episodes | ❌ | 4 | — | — |
| `CH-SHOW-002` | Get Episode | ❌ | 4 | — | — |
| `CH-SHOW-003` | Admin: List/Create/Update Episode | ❌ | 2 | — | — |

### Communications — 0.0% weighted (0✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-COMM-001` | Send Appointment Reminders (SMS) | ❌ | 3 | — | — |
| `CH-COMM-002` | Send Event Reminders (SMS) | ❌ | 3 | — | — |
| `CH-COMM-003` | WebRTC Room Create | ❌ | 3 | — | — |

### Admin — 0.0% weighted (0✅ 0⚠️ 7❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-ADMIN-001` | Admin: Manage Courses | ❌ | 2 | — | — |
| `CH-ADMIN-002` | Admin: Manage Bookings | ❌ | 2 | — | — |
| `CH-ADMIN-003` | Admin: Manage Events | ❌ | 2 | — | — |
| `CH-ADMIN-004` | Admin: Manage Store | ❌ | 2 | — | — |
| `CH-ADMIN-005` | Admin: Audio Generation (ElevenLabs) | ❌ | 2 | — | — |
| `CH-ADMIN-006` | Admin: DB Migrations | ❌ | 1 | — | — |
| `CH-ADMIN-007` | Admin: Seed Data | ❌ | 1 | — | — |

### Platform / Health & SEO — 0.0% weighted (0✅ 0⚠️ 2❌ 2🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `CH-PLAT-001` | Stripe Webhook Handler | ❌ | 5 | — | — |
| `CH-PLAT-002` | Robots.txt | 🔍 | 1 | — | — |
| `CH-PLAT-003` | Sitemap | ❌ | 1 | — | — |
| `CH-PLAT-004` | Rate Limiting | 🔍 | 1 | — | — |

## XC — xico-city
### Authentication & Authorization — 0.0% weighted (0✅ 0⚠️ 2❌ 1🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-AUTH-001` | BetterAuth Session (Cookie) | 🔍 | 5 | — | smoke-red |
| `XC-AUTH-002` | Processor JWT (Service-to-Service) | ❌ | 5 | — | smoke-red |
| `XC-AUTH-003` | RLS Context Injection | ❌ | 5 | — | smoke-red |

### Media Processing & Jobs — 0.0% weighted (0✅ 0⚠️ 7❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-JOBS-001` | Create Job | ❌ | 4 | — | — |
| `XC-JOBS-002` | Get Job Status | ❌ | 4 | — | — |
| `XC-JOBS-003` | Confirm Job (Client ACK) | ❌ | 3 | — | — |
| `XC-JOBS-004` | Cut Points | ❌ | 3 | — | — |
| `XC-JOBS-005` | Processor Dispatch | ❌ | 5 | — | — |
| `XC-JOBS-006` | Internal Job Completion Callback | ❌ | 4 | — | — |
| `XC-JOBS-007` | Jobs Watchdog (Cron) | ❌ | 3 | — | — |

### Asset Management — 0.0% weighted (0✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-ASSET-001` | List/Get Asset | ❌ | 3 | — | — |
| `XC-ASSET-002` | Stem Separation | ❌ | 4 | — | — |
| `XC-ASSET-003` | Vocal Processing | ❌ | 4 | — | — |

### Uploads — 0.0% weighted (0✅ 0⚠️ 3❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-UPLOAD-001` | Request Presigned URL | ❌ | 4 | — | — |
| `XC-UPLOAD-002` | Initiate Upload | ❌ | 4 | — | — |
| `XC-UPLOAD-003` | Confirm Upload | ❌ | 4 | — | — |

### Marketplace / Listings — 0.0% weighted (0✅ 0⚠️ 2❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-LIST-001` | Browse Listings | ❌ | 4 | — | — |
| `XC-LIST-002` | Search Listings | ❌ | 4 | — | — |

### User Profile — 0.0% weighted (0✅ 0⚠️ 5❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-ME-001` | Onboarding | ❌ | 3 | — | — |
| `XC-ME-002` | Connect Accounts | ❌ | 3 | — | — |
| `XC-ME-003` | Download Asset | ❌ | 3 | — | — |
| `XC-ME-004` | Notifications | ❌ | 3 | — | — |
| `XC-ME-005` | Vocal Profile | ❌ | 4 | — | — |

### Billing & Payments — 0.0% weighted (0✅ 0⚠️ 2❌ 0🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-BILL-001` | Stripe Checkout Webhook | ❌ | 5 | — | — |
| `XC-BILL-002` | Stripe Connect Webhook | ❌ | 5 | — | — |

### Platform / Health — 0.0% weighted (0✅ 0⚠️ 0❌ 4🔍)
| ID | Feature | Status | W | Tags | Overlays |
|---|---|---|---:|---|---|
| `XC-PLAT-001` | Liveness | 🔍 | 1 | — | — |
| `XC-PLAT-002` | Readiness | 🔍 | 1 | — | — |
| `XC-PLAT-003` | Sentry Wiring | 🔍 | 1 | — | — |
| `XC-PLAT-004` | Scheduled Cron Dispatch | 🔍 | 1 | — | — |

