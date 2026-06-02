# G2 Phase 2 Planning: Executive Summary

**Milestone:** G2 (Aggregator + sync scripts have no unit tests)  
**Current State:** 75 unit tests, 41% coverage (Phase 1 complete)  
**Target:** 70% coverage via HTTP mocking + orchestration tests  
**Effort:** 15 hours (2–3 days)  
**Status:** Ready to execute — design + task breakdown complete  

---

## Recommended Approach

**Option A + C Hybrid: `unittest.mock.patch` + Dependency-Injected `fetch_fn`**

### Why This Approach?

1. **Proven in Phase 1** — Already using `unittest.mock.patch("urllib.request.urlopen")` in existing tests
2. **Minimal refactoring** — Only orchestration functions (`main()`) need a `fetch_fn=None` parameter
3. **Error testing** — Easy to inject HTTP failures (5xx, 429, timeout, malformed JSON)
4. **Zero external deps** — Uses only stdlib `unittest.mock`
5. **Backward compatible** — Production code unchanged

### How It Works

**Production code** (unchanged):
```python
def main() -> int:
    # ... uses http_request() as before ...
    content = fetch_matrix(repo, path, token)
    # ...
```

**Test code** (new):
```python
def stub_fetch(url: str, **kwargs) -> tuple[int, bytes, dict]:
    """Returns (status, body, headers)"""
    if "FUNCTIONS_MATRIX" in url:
        return 200, b"## 1. Auth\n...", {}
    return 404, b"", {}

# Test passes stub_fetch to main()
rc = aggregate.main(fetch_fn=stub_fetch)
assert rc == 0
```

**Error injection** (when needed):
```python
with patch("urllib.request.urlopen", side_effect=HTTPError(...)):
    rc = aggregate.main()
    assert rc == 0  # Graceful degradation
```

---

## Coverage Gap Analysis

| Category | Current | Phase 2 | Tests |
|----------|---------|---------|-------|
| parse_matrix, parse_rows | 100% | 100% | 0 (already done) |
| Overlays (sentry, actions, decay) | 100% | 100% | 0 (already done) |
| render_markdown() | 0% | 90%+ | 4 new |
| render_pushover() | 0% | 90%+ | 3 new |
| main() orchestration | 0% | 80%+ | 3 new |
| HTTP error handling | 5% | 90%+ | 6 new |
| Sentry integration | 20% | 90%+ | 4 new |
| Stripe integration | 10% | 90%+ | 4 new |
| Label sync (init-matrix) | 30% | 85%+ | 5 new |
| Label sync (sync_labels) | 25% | 85%+ | 3 new |
| **Total** | **41%** | **70%** | **32 new tests** |

**29-32 new tests** to reach 70% (estimate accounts for some overlap/consolidation).

---

## Execution Plan

**5 Phases, 15 hours total:**

### Phase A: Setup & Refactoring (3 h)
- Add `stub_fetch` fixture to conftest.py
- Refactor `main()` functions in all 3 scripts to accept `fetch_fn` parameter
- Verify render functions are pure (no HTTP calls)

### Phase B: Core Orchestration Tests (5 h)
- 3 tests for main() orchestration (happy path + error paths)
- 4 tests for render_markdown()
- 3 tests for render_pushover()

### Phase C: Integration Tests (4 h)
- 6 tests for HTTP error handling (5xx, 429, timeout, JSON decode)
- 4 tests for Sentry integration
- 4 tests for Stripe integration

### Phase D: Label Sync Tests (2 h)
- 5 tests for init-matrix-issues.py orchestration
- 3 tests for sync_labels_to_matrix.py orchestration

### Phase E: Validation & Docs (1 h)
- Run coverage report (verify ≥70%)
- Update test preambles with fetch_fn explanation
- Close G2 in GAP_REGISTER.md

---

## Success Criteria

- [x] Design doc complete (`docs/aggregator-http-mocking-design.md`)
- [x] Execution plan complete (`docs/G2_PHASE_2_EXECUTION_PLAN.md`)
- [ ] Coverage increases 41% → 70%+ (via pytest --cov)
- [ ] All 29+ new tests pass consistently
- [ ] No external dependencies added
- [ ] Production code backward compatible
- [ ] G2 closed in GAP_REGISTER.md

---

## Key Files

1. **Design Doc:** `docs/aggregator-http-mocking-design.md`
   - Problem statement, 3 approaches, trade-offs, PoC code
   - Coverage gap analysis, blocker mitigation

2. **Execution Plan:** `docs/G2_PHASE_2_EXECUTION_PLAN.md`
   - Task breakdown (A1–E3)
   - Test specifications (32 tests)
   - Acceptance criteria per task
   - Timeline + risk mitigation

3. **Scripts to Refactor:**
   - `scripts/aggregate_completion.py` — main() + fetch_* functions
   - `scripts/init-matrix-issues.py` — main() + gh() wrappers
   - `scripts/sync_labels_to_matrix.py` — main() + parse_issue_labels

4. **Test Files to Extend:**
   - `scripts/tests/test_aggregate_completion.py` — add 16 new tests
   - `scripts/tests/test_init_matrix_issues.py` — add 5 new tests
   - `scripts/tests/test_sync_labels_to_matrix.py` — add 3 new tests
   - `scripts/tests/conftest.py` — add stub_fetch fixture

---

## Ready to Execute

All planning is complete. No blocking decisions remain. Agent can begin Phase A (refactoring) immediately.

**Next step:** Execute Phase A (Setup & Refactoring, 3 h) → Phase B (Core tests, 5 h) → ...

---

## Appendix: Why Not Other Options?

### Option B (HTTP routing table + factory pattern)
- **Rejected:** More boilerplate, requires wrapping all HTTP calls in a new client abstraction
- **Cost:** 5–7 extra hours of refactoring
- **Benefit:** Slightly more declarative (not worth the cost)

### Option D (Real integration tests with mocked services)
- **Rejected:** Would require Docker/Testcontainers or network mocking libraries (testserver-ng, etc.)
- **Cost:** External dependencies, slower tests
- **Benefit:** Tests are more realistic (not worth the cost for Unit tests)

### Why NOT MSW (Mock Service Worker)?
- **Reason:** MSW targets Node.js + browser; Python's urllib is not supported
- **Cost:** Would need to rewrite scripts in Node.js (out of scope)

---

## Document Location

```
docs/
├── aggregator-http-mocking-design.md          (design + PoC code)
├── G2_PHASE_2_EXECUTION_PLAN.md               (task breakdown + specs)
└── G2_PHASE_2_SUMMARY.md                      (this file)
```

All three files are ready for implementation.
