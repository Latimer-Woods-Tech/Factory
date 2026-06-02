# G2 Phase 2 Execution Plan — Aggregator HTTP Mocking Tests

**Milestone:** G2 (Aggregator + sync scripts have no unit tests)  
**Phase:** 2 (HTTP mocking + orchestration coverage)  
**Current State:** Phase 1 shipped 75 unit tests, 41% coverage (pure logic only)  
**Target:** 70% coverage via HTTP mocking, render functions, main() orchestration  
**Effort:** 15 hours (2–3 days focused work)  
**Approach:** Option A+C hybrid — `unittest.mock.patch` + dependency-injected `fetch_fn` parameter  

---

## Deliverables

1. **Design Doc:** `docs/aggregator-http-mocking-design.md` (✅ complete)
2. **This Execution Plan:** Task breakdown, dependencies, success criteria
3. **Refactored Code:** `scripts/aggregate_completion.py`, `scripts/init-matrix-issues.py`, `scripts/sync_labels_to_matrix.py` (main + render functions)
4. **29 New Tests:** Across all three scripts (Phase 2)
5. **Coverage Report:** `pytest --cov=scripts --cov-report=term-missing` showing ≥70%

---

## Task Breakdown (In Execution Order)

### Phase A: Setup & Refactoring (3 hours)

#### A1. Add stub_fetch fixture to conftest.py (0.5 h)
**Owner:** Agent  
**File:** `scripts/tests/conftest.py`  
**Changes:**
- Add `@pytest.fixture` named `stub_fetch` that returns a stub HTTP client function
- Stub returns `(status: int, body: bytes, headers: dict)` tuples
- Default behavior: return 404 for all URLs (safe for tests that don't call HTTP)
- Document usage in docstring

**Acceptance:**
- Fixture is importable as `(aggregate, stub_fetch)` in test functions
- Calling `stub_fetch(url)` returns `(int, bytes, dict)` tuple

---

#### A2. Refactor aggregate_completion.main() — add fetch_fn parameter (0.75 h)
**Owner:** Agent  
**File:** `scripts/aggregate_completion.py`  
**Changes:**
1. Add `fetch_fn: Callable[[str], tuple[int, bytes, dict]] | None = None` parameter to `main()` signature
2. In `main()`, set `fetch_fn = fetch_fn or http_request` (default to real urllib in production)
3. Identify all HTTP calls in `main()`:
   - `fetch_matrix()` — calls `github_get()`
   - `fetch_latest_main_run()` — calls `github_get()`
   - `fetch_smoke_run()` — calls `github_get()`
   - `fetch_sentry_unresolved()` — calls `http_request()` directly
   - `fetch_stripe_data()` — calls `http_request()` directly
   - `count_open_prs()` — calls `github_get()`
4. Pass `fetch_fn` through the call chain: `main()` → `fetch_*()` functions
5. Modify each `fetch_*()` to accept `fetch_fn` and use it instead of calling `http_request()`/`github_get()` directly

**Acceptance:**
- `main()` signature includes `fetch_fn=None` parameter
- All HTTP calls flow through the injected `fetch_fn` (or default to `http_request`)
- Production code unchanged: `aggregate.main()` still works (backwards compatible)
- Tests can pass `fetch_fn=stub_fetch(...)` to control HTTP behavior

**Code Pattern:**
```python
def fetch_matrix(repo: str, matrix_path: str, token: str, fetch_fn=None) -> str | None:
    if fetch_fn is None:
        fetch_fn = http_request
    # ... fetch_fn now used for the GitHub call ...
```

---

#### A3. Refactor aggregate_completion.render_markdown() and render_pushover() (0.75 h)
**Owner:** Agent  
**File:** `scripts/aggregate_completion.py`  
**Changes:**
1. `render_markdown()` already accepts `rows` + `prev` snapshot — **no HTTP calls to refactor**
2. `render_pushover()` already accepts `rows` + `extra` dict (which contains pre-computed MRR, trials, etc.) — **no HTTP calls to refactor**
3. Verify no HTTP calls are embedded in these functions (they're pure rendering)
4. If any HTTP calls exist, extract them to `main()` layer

**Acceptance:**
- `render_markdown()` and `render_pushover()` are pure functions (no HTTP, no side effects)
- All HTTP data passed as parameters to these functions

---

#### A4. Refactor init-matrix-issues.py main() — add fetch_fn parameter (0.5 h)
**Owner:** Agent  
**File:** `scripts/init-matrix-issues.py`  
**Changes:**
- Same pattern as A2: add `fetch_fn=None` parameter to `main()`
- Pass it through to `gh()` function calls

**Acceptance:**
- `main(fetch_fn=...)` signature in place
- HTTP calls routed through `fetch_fn`

---

#### A5. Refactor sync_labels_to_matrix.py main() — add fetch_fn parameter (0.5 h)
**Owner:** Agent  
**File:** `scripts/sync_labels_to_matrix.py`  
**Changes:**
- Same pattern as A2 and A4

**Acceptance:**
- `main(fetch_fn=...)` signature in place

---

### Phase B: Core Orchestration Tests (5 hours)

#### B1. Write 3 aggregate_completion.main() tests (1.5 h)
**Owner:** Agent  
**File:** `scripts/tests/test_aggregate_completion.py` (append new section)  
**Tests:**

1. **test_main_happy_path_full_orchestration**
   - Setup: stub fetch that returns 5 valid FUNCTIONS_MATRIX files + 1 red repo + Sentry issues
   - Call: `aggregate.main(fetch_fn=stub_fetch)`
   - Assert:
     - Return code == 0
     - `docs/completion-tracker.json` written (real file)
     - Snapshot contains all 5 repo keys with weighted % > 0
     - `red_ci` set contains the red repo key

2. **test_main_missing_github_token_returns_2**
   - Patch: `os.environ.get("GITHUB_TOKEN")` → `""`
   - Call: `aggregate.main()`
   - Assert: return code == 2

3. **test_main_sentry_500_continues_with_empty_issues**
   - Setup: stub fetch raises HTTPError 500 for Sentry URL
   - Call: `aggregate.main(fetch_fn=stub_fetch)`
   - Assert:
     - Return code == 0 (graceful degradation)
     - No Sentry overlay applied (issues list empty)

**Acceptance:**
- All 3 tests pass
- main() is covered end-to-end (orchestration)

---

#### B2. Write 4 render_markdown() tests (1 h)
**Owner:** Agent  
**File:** `scripts/tests/test_aggregate_completion.py` (append)  
**Tests:**

1. **test_render_markdown_rollup_table**
   - Setup: 2 repos with 5 rows each (different statuses)
   - Call: `render_markdown(rows, malformed=[], red_repos={}, red_smoke={})`
   - Assert:
     - Output contains "## Roll-up" header
     - Each repo key appears in the table (HD, CC, FA, CH, XC)
     - Pass % values are calculated (e.g., "50.0%")

2. **test_render_markdown_wins_and_regressions**
   - Setup: rows with status changes (✅ → ❌ regressions, ❌ → ✅ wins)
   - Setup: prev snapshot with old statuses
   - Call: `render_markdown(rows, prev, ...)`
   - Assert:
     - "### ↑ Top wins" section present
     - "### ↓ Top regressions" section present
     - Top 5 sorted by weight descending

3. **test_render_markdown_per_repo_sections**
   - Setup: rows grouped by repo + section
   - Call: `render_markdown(rows, ...)`
   - Assert:
     - Each repo has a "## REPO_KEY — name" header
     - Sections grouped under repo (e.g., "### Auth", "### Billing")
     - Row details table per section (ID, Feature, Status, Weight, Tags, Overlays)

4. **test_render_markdown_malformed_rows_section**
   - Setup: malformed list with 2 entries (bad ID, wrong cell count)
   - Call: `render_markdown(rows, malformed, ...)`
   - Assert:
     - "## Malformed rows (skipped from aggregate)" section present
     - Both malformed entries listed with reason

**Acceptance:**
- All 4 tests pass
- render_markdown() coverage ≥90%

---

#### B3. Write 3 render_pushover() tests (1.5 h)
**Owner:** Agent  
**File:** `scripts/tests/test_aggregate_completion.py` (append)  
**Tests:**

1. **test_render_pushover_includes_day_and_weighted_score**
   - Setup: rows, prev snapshot with different overall_weighted
   - Call: `render_pushover(rows, prev, red_ci={}, red_smoke={}, sentry_issues=[], extra={}, now=...)`
   - Assert:
     - Output contains day string (e.g., "Wed May 22 · 2:30 PM ET")
     - Weighted score present (e.g., "72.5%")
     - Delta present if prev score exists (e.g., "(+2.1)")

2. **test_render_pushover_includes_ci_status_and_sentry**
   - Setup: red_ci = {"HD"}, red_smoke = {"CC"}, sentry_issues = [1 issue], extra = {...}
   - Call: `render_pushover(...)`
   - Assert:
     - "🔴 CI: HD" in output
     - "🟠 Smoke: CC" in output
     - "🐛 Sentry: 1 open" in output
     - "💰 MRR $N" in output

3. **test_render_pushover_includes_wins_regressions_and_pr_count**
   - Setup: prev snapshot with 3 wins and 3 regressions; extra = {"open_prs": 12, "p0_gaps": 1, "p1_gaps": 3}
   - Call: `render_pushover(rows, prev, ...)`
   - Assert:
     - "↑" line includes win features
     - "↓" line includes regression features
     - "📋" line shows "12 PRs · P0: 1 · P1: 3"

**Acceptance:**
- All 3 tests pass
- render_pushover() fully integrated with extra signals

---

### Phase C: Integration Tests (4 hours)

#### C1. Write 6 HTTP error path tests (2 h)
**Owner:** Agent  
**File:** `scripts/tests/test_aggregate_completion.py` (append new section: "HTTP Error Handling")  
**Tests:**

1. **test_fetch_matrix_retries_on_500_succeeds_second_attempt**
   - Setup: patch `urllib.request.urlopen` to raise HTTPError(503) first, succeed second
   - Call: `aggregate.fetch_matrix(...)`
   - Assert: returns valid matrix content (no exception)

2. **test_fetch_matrix_retries_on_429_rate_limit**
   - Setup: patch to raise HTTPError(429) first, succeed second
   - Call: `aggregate.fetch_matrix(...)`
   - Assert: returns valid matrix content, sleep called 1× with backoff

3. **test_fetch_sentry_issues_handles_json_decode_error**
   - Setup: patch `http_request` to return (200, b"not valid json", {})
   - Call: `aggregate.fetch_sentry_unresolved(...)`
   - Assert: returns empty list [] (graceful degradation)

4. **test_fetch_stripe_data_handles_500_gracefully**
   - Setup: patch to return (500, b"", {}) for Stripe endpoint
   - Call: `aggregate.fetch_stripe_data(...)`
   - Assert: returns {"mrr": 0.0, "trials": 0, "new_charges_24h": 0} (safe defaults)

5. **test_github_get_4xx_does_not_retry**
   - Setup: patch to raise HTTPError(403) for GitHub call
   - Call: `aggregate.github_get(...)`
   - Assert: returns (403, body) on first attempt only (no retry)

6. **test_http_request_timeout_after_max_retries**
   - Setup: patch to raise URLError("timeout") consistently
   - Call: `aggregate.http_request(..., max_retries=2)`
   - Assert: returns (599, b"", {}), sleep called 2× for backoff

**Acceptance:**
- All 6 tests pass
- Error handling fully covered (no unhandled exceptions in HTTP layer)

---

#### C2. Write 4 Sentry integration tests (1 h)
**Owner:** Agent  
**File:** `scripts/tests/test_aggregate_completion.py` (append)  
**Tests:**

1. **test_sentry_route_segments_extracts_from_culprit**
   - Setup: issue = {"culprit": "Error in POST /api/me/subscriptions"}
   - Call: `aggregate.sentry_route_segments(issue)`
   - Assert: returns ["/api/me/subscriptions"] or similar

2. **test_sentry_route_segments_extracts_from_metadata**
   - Setup: issue = {"metadata": {"value": "Failed at GET /v1/internal/jobs/123/status"}}
   - Call: `aggregate.sentry_route_segments(issue)`
   - Assert: returns segments matching the route

3. **test_apply_sentry_overlay_downgrades_matching_endpoint**
   - Setup: row with endpoint = "POST /api/me/subscriptions", status = "✅"
   - Setup: issue with culprit = "Error in /api/me/subscriptions"
   - Call: `aggregate.apply_sentry_overlay([row], [issue])`
   - Assert: row.status == "⚠️", row.overlays contains "sentry-open"

4. **test_fetch_sentry_unresolved_calls_correct_url**
   - Setup: patch `http_request` to capture URL
   - Call: `aggregate.fetch_sentry_unresolved("token")`
   - Assert: URL contains `statsPeriod=24h` and `is:unresolved` query params

**Acceptance:**
- All 4 tests pass
- Sentry integration end-to-end

---

#### C3. Write 4 Stripe integration tests (1 h)
**Owner:** Agent  
**File:** `scripts/tests/test_aggregate_completion.py` (append)  
**Tests:**

1. **test_fetch_stripe_data_calculates_mrr**
   - Setup: stub to return subscriptions list with plans
   - Call: `aggregate.fetch_stripe_data("sk-test-...")`
   - Assert: mrr is sum of monthly plan amounts / 100

2. **test_fetch_stripe_data_counts_trialing**
   - Setup: stub to return {"data": [sub, sub]} for trialing endpoint
   - Call: `aggregate.fetch_stripe_data(...)`
   - Assert: trials == 2

3. **test_fetch_stripe_data_counts_new_charges_24h**
   - Setup: stub to return {"data": [charge1, charge2]} where both have paid=True
   - Call: `aggregate.fetch_stripe_data(...)`
   - Assert: new_charges_24h == 2

4. **test_fetch_stripe_data_missing_key_returns_defaults**
   - Setup: stripe_key = ""
   - Call: `aggregate.fetch_stripe_data("")`
   - Assert: returns {"mrr": 0.0, "trials": 0, "new_charges_24h": 0}

**Acceptance:**
- All 4 tests pass
- Stripe integration ready

---

### Phase D: Label Sync Tests (2 hours)

#### D1. Write label reconciliation tests for init-matrix-issues.py (2.5 h)
**Owner:** Agent  
**File:** `scripts/tests/test_init_matrix_issues.py` (append)  
**Tests:**

1. **test_find_issue_by_feature_label_constructs_query**
   - Setup: patch `github_get` to capture URL
   - Call: `init_matrix.find_issue_by_feature_label(repo, "feature-login", token)`
   - Assert: URL contains search query with label filter

2. **test_reconcile_labels_adds_missing**
   - Setup: current_labels = ["status:passing"], desired_labels = ["status:passing", "weight:5"]
   - Call: `init_matrix.reconcile_labels(desired, current, repo, token, patch_gh_fn)`
   - Assert: patch_gh_fn called with POST to create "weight:5" label

3. **test_reconcile_labels_removes_obsolete**
   - Setup: current = ["status:passing", "weight:3"], desired = ["status:passing"]
   - Call: `init_matrix.reconcile_labels(desired, current, repo, token, patch_gh_fn)`
   - Assert: patch_gh_fn called with DELETE for "weight:3"

4. **test_ensure_labels_treats_422_as_idempotent**
   - Setup: patch `gh` to return (422, {"errors": [{"code": "already_exists"}]})
   - Call: `init_matrix.ensure_labels(repo, token, [("status:passing", "0E8A16")])`
   - Assert: no error logged (idempotent)

5. **test_main_init_matrix_orchestration** (end-to-end)
   - Setup: fetch valid FUNCTIONS_MATRIX, parse rows, stub GitHub API for label operations
   - Call: `init_matrix.main(fetch_fn=stub_fetch)`
   - Assert: return code == 0, labels created/updated in GitHub

**Acceptance:**
- All 5 tests pass
- init-matrix-issues orchestration covered

---

#### D2. Write label sync tests for sync_labels_to_matrix.py (1.5 h)
**Owner:** Agent  
**File:** `scripts/tests/test_sync_labels_to_matrix.py` (append)  
**Tests:**

1. **test_sync_labels_main_fetches_labels_and_updates_rows**
   - Setup: stub fetch for matrix, stub `gh()` for label list
   - Call: `sync_labels.main(fetch_fn=stub_fetch)`
   - Assert: return code == 0

2. **test_parse_issue_labels_extracts_status_weight_owner**
   - Setup: labels = ["status:passing", "weight:3", "owner:alice"]
   - Call: `sync_labels.parse_issue_labels(labels)`
   - Assert: returns {"status": "✅", "weight": "3", "owner": "@alice"}

3. **test_parse_issue_labels_normalizes_status_word_to_emoji**
   - Setup: labels = ["status:flaky", "status:broken", "status:done"]
   - Call: `sync_labels.parse_issue_labels(labels)` for each
   - Assert: "flaky" → "⚠️", "broken" → "❌", "done" → "✅"

**Acceptance:**
- All 3 tests pass
- sync_labels_to_matrix orchestration covered

---

### Phase E: Validation & Documentation (2 hours)

#### E1. Run coverage report and verify ≥70% (0.5 h)
**Owner:** Agent  
**Command:** `pytest scripts/tests/ --cov=scripts --cov-report=term-missing`  
**Acceptance:**
- Overall coverage ≥70%
- Lines marked as "missing" are only stubs or dead code
- All main() functions ≥80% covered
- All render_*() functions ≥80% covered

---

#### E2. Add test documentation preamble to test files (0.75 h)
**Owner:** Agent  
**Files:** 
- `scripts/tests/test_aggregate_completion.py` (update preamble)
- `scripts/tests/test_init_matrix_issues.py` (update preamble)
- `scripts/tests/test_sync_labels_to_matrix.py` (update preamble)

**Changes:**
- Add section explaining the `fetch_fn` parameter pattern
- Note: "HTTP calls are mocked via dependency injection; see conftest.py::stub_fetch"
- Link back to `docs/aggregator-http-mocking-design.md`

**Acceptance:**
- Future maintainers understand the testing strategy without reading design doc

---

#### E3. Update GAP_REGISTER.md G2 entry (0.75 h)
**Owner:** Agent  
**File:** `docs/GAP_REGISTER.md`  
**Change:**
- Update G2 row: change status from "in-progress" to "closed"
- Update description: "Phase 2 shipped via PR #[N] — 29 additional tests, 70% combined coverage on all 3 scripts (60% init-matrix-issues, 80% aggregate_completion, 72% sync_labels_to_matrix)"

**Acceptance:**
- GAP_REGISTER reflects G2 closure

---

## Execution Checklist

- [ ] A1: Fixture added to conftest.py (stub_fetch)
- [ ] A2: aggregate_completion.py main() refactored (fetch_fn parameter)
- [ ] A3: render_markdown() and render_pushover() verified as pure (no HTTP calls)
- [ ] A4: init-matrix-issues.py main() refactored
- [ ] A5: sync_labels_to_matrix.py main() refactored
- [ ] B1: 3 × main() orchestration tests written + passing
- [ ] B2: 4 × render_markdown() tests written + passing
- [ ] B3: 3 × render_pushover() tests written + passing
- [ ] C1: 6 × HTTP error path tests written + passing
- [ ] C2: 4 × Sentry integration tests written + passing
- [ ] C3: 4 × Stripe integration tests written + passing
- [ ] D1: 5 × init-matrix-issues tests written + passing
- [ ] D2: 3 × sync_labels_to_matrix tests written + passing
- [ ] E1: Coverage report shows ≥70% overall
- [ ] E2: Test file preambles updated with fetch_fn explanation
- [ ] E3: GAP_REGISTER.md G2 entry closed
- [ ] **CI passes**: `npm run test` in Factory repo (scripts tests)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Refactoring main() breaks production | Low | High | Test production code path: `aggregate.main()` (no fetch_fn) on a real test matrix |
| File system writes in tests cause flakiness | Medium | Medium | Use `tmpdir` fixture; isolate writes to temp dir |
| Stub fetch function doesn't cover all edge cases | Medium | Low | Accept that Phase 3 can add more edge cases; current set covers 70% target |
| Test execution time balloons | Low | Low | Each test < 100ms (no real HTTP); total should be < 5s |

---

## Success Criteria (Final)

- [ ] Coverage: 41% → 70% (verified via pytest --cov)
- [ ] Tests: 75 → 104 (29 new tests, all passing)
- [ ] No external dependencies added (urllib only)
- [ ] Production code backward compatible (main() still works without fetch_fn)
- [ ] Design doc complete (aggregator-http-mocking-design.md)
- [ ] PR ready for review with clear commit history
- [ ] GAP_REGISTER.md G2 closed

---

## Timeline

**Day 1 (5 h):**
- A1, A2, A3, A4, A5 (refactoring)
- B1 (main() tests)

**Day 2 (5 h):**
- B2, B3 (render tests)
- C1, C2, C3 (integration tests)

**Day 3 (5 h):**
- D1, D2 (label sync tests)
- E1, E2, E3 (validation + docs)
- PR review + fixes

**Total: 3 days, 15 hours focused effort**
