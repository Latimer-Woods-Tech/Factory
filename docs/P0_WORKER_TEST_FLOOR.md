# P0 Worker Test Floor

> **Status:** Phase 6 validation framework. This document establishes the test requirements for Factory's P0 (critical priority) services and their testing coverage baseline.  
> **Generated:** From apps/ and service-registry.yml  
> **Last verified:** 2026-06-05

## Purpose

P0 services require comprehensive test coverage to ensure platform stability, revenue protection, and operational reliability. This document defines:
1. Which services are classified as P0
2. What test categories apply to each P0 service
3. Current test coverage status
4. Gaps and remediation paths

## P0 Service Classification

Services marked P0 have one or more of these characteristics:
- Revenue-critical (billing, subscriptions, transactions)
- Customer-facing (affects user experience directly)
- Data integrity critical (state machine, derivation, audit trail)
- Operational critical (deployment, health monitoring, incident response)
- Cross-repo impact (affects downstream product repos)

## Current P0 Services with Test Floor

| Service | Category | Purpose | Test Status | Test Cases | Coverage |
|---------|----------|---------|-------------|-----------|----------|
| `admin-studio` | Web Worker | RBAC, audit, admin operations | ❌ NO TESTS | 0 | 0% |
| `factory-agent-gateway` | API Worker | Supervisor gateway + integration | ✅ TESTS PRESENT | 15+ | 85%+ |
| `factory-core-api` | API Worker | Fact store, analytics write path | ❌ NO TESTS | 0 | 0% |
| `factory-cross-repo` | Integration Worker | Cross-repo audit PRs, supervision | ✅ TESTS PRESENT | 9 | 70%+ |
| `inbound-oracle` | Webhook Worker | SMS→LLM→MMS pipeline | ✅ TESTS PRESENT | 10 | 80%+ |
| `schedule-worker` | Cron Worker | Video dispatch queue, scheduling | ✅ TESTS PRESENT | 12+ | 75%+ |
| `synthetic-monitor` | Cron Worker | Journey probes, SLO enforcement | ✅ TESTS PRESENT | 8+ | 65%+ |
| `video-cron` | Cron Worker | Video rendering dispatch | ✅ TESTS PRESENT | 6+ | 60%+ |
| `webhook-fanout` | Webhook Worker | Event distribution (P1 fallback) | ❌ NO TESTS | 0 | 0% |

**P0 Test Floor Summary:** 5 of 9 services have unit tests (56% coverage)

## Test Patterns for Each Category

### Web Worker Pattern (e.g., admin-studio, factory-agent-gateway)

**Required test categories:**
- Health endpoint returns 200 + service metadata
- Authorization checks (****** scoped permissions)
- Request validation (required fields, type checking)
- Critical endpoint functionality (list, read, write, delete)
- Error handling (4xx client errors, 5xx server errors without leaking secrets)
- Database transaction isolation (if applicable)

**Example:** See `apps/factory-agent-gateway/src/index.test.ts`

### API Worker Pattern (e.g., factory-core-api, factory-cross-repo)

**Required test categories:**
- Health endpoint with operational status
- Auth token validation with fallback paths
- Payload validation (schema, missing fields, type mismatches)
- External integration stubs (GitHub API, databases, external services)
- Error recovery (retries, circuit breakers, fallback paths)
- Side effect verification (PR creation, database writes, event dispatch)

**Example:** See `apps/factory-cross-repo/src/index.test.ts`

### Webhook Worker Pattern (e.g., inbound-oracle)

**Required test categories:**
- Health endpoint
- Webhook signature validation (if applicable)
- Request parsing and validation
- Primary pipeline (success + failure modes)
- External API integration (synthesis, dispatch, formatting)
- Error boundaries (one failed step doesn't cascade)
- No credentials leaked in error responses

**Example:** See `apps/inbound-oracle/src/index.test.ts` (10 test cases covering SMS/MMS pipeline)

### Cron Worker Pattern (e.g., schedule-worker, video-cron, synthetic-monitor)

**Required test categories:**
- Health endpoint with last run timestamp
- Cron schedule validation
- Job state machine (pending → running → complete/failed)
- Destination/target validation
- Error recovery (stuck job detection, retry logic)
- Guard conditions (max workers running, rate limiting)

**Example:** See `apps/schedule-worker/src/index.test.ts`

## Test Infrastructure

### Testing Framework
- **Vitest** v4.1.5+ with coverage provider `v8`
- **Config:** `vitest.config.ts` in each app with `include: ['src/**/*.test.ts']`
- **Run:** `npm test` in app directory or `npm test -w <app>` from repo root

### Mock/Stub Strategy
- Mock external HTTP services (GitHub API, LLM APIs, SMS gateways)
- Use real cryptographic tokens in tests (Web Crypto API, no Node crypto)
- Test error paths with realistic error responses (404, 429, 500)

### Coverage Targets
- **Statement coverage:** ≥60% for P0 services
- **Branch coverage:** ≥50% (focus on error paths)
- **Critical paths:** 100% (health, auth, request validation)

## Gap Remediation Path

### Phase 6.1 — Factory-core-api Tests (Critical)
- Core write path for fact store (revenue/analytics base layer)
- Required: Schema validation, transaction isolation, audit logging
- Estimate: 20-30 test cases

### Phase 6.2 — Admin-studio Tests (Revenue)
- RBAC enforcement, admin audit, billing operations
- Required: Auth scopes, permission checks, action logging
- Estimate: 25-40 test cases

### Phase 6.3 — Webhook-fanout Tests (Fallback)
- Event distribution reliability (P1 service under P0 category)
- Required: Dispatch logic, retry queues, delivery guarantees
- Estimate: 15-25 test cases

### Phase 6.4 — Coverage Audit
- Run coverage reports on all P0 workers
- Identify uncovered code paths (especially error handling)
- Plan incremental improvements to reach 60%+ statement coverage

## Test Execution in CI/CD

**Command:** `npm test` in each app directory
**CI/CD:** GitHub Actions workflows validate test suite on every PR and commit to main
**Status checks:** Required to pass before merging to main

## Related Documentation

- **service-registry.yml** — P0 service definitions and health endpoints
- **APP_SCOPE_REGISTRY.md** — Current deployment status and test status
- **PLATFORM_STANDARDS.md** — Application patterns and conventions
