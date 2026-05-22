# Aggregator Phase 2: HTTP Mocking Design — G2 Phase 2

**Milestone:** G2 (Aggregator + sync scripts have no unit tests)  
**Phase:** 2 (Render + main() orchestration)  
**Current Coverage:** 41% (Phase 1: 75 unit tests covering parsing, status logic, overlays)  
**Target Coverage:** 70%  
**Gap:** 29 percentage points via HTTP mocking + render + main() tests  

---

## Problem Statement

Phase 1 shipped pure-logic tests for the aggregator scripts (`aggregate_completion.py`, `init-matrix-issues.py`, `sync_labels_to_matrix.py`). These scripts call external HTTP services:
- **GitHub API** — fetch FUNCTIONS_MATRIX.md, latest action runs, workflows, PR searches
- **Sentry API** — fetch unresolved issues (24h window)
- **Stripe API** — fetch subscriptions, charges, balance transactions
- **Pushover API** — send digest notifications

Current test suite has **zero coverage** for:
1. HTTP client behavior (retries on 5xx/429, abort on 4xx, exponential backoff)
2. Error handling paths (timeout, malformed JSON, network failure)
3. Orchestration logic in `main()` (how the overlays compose, snapshot writes, history append)
4. Render functions (`render_markdown()`, `render_pushover()`)

The scripts use Python's `urllib.request` (not Node.js, no third-party HTTP mock libraries available in the test environment). Mock Service Worker (MSW) targets Node.js + browser; `unittest.mock` is the standard Python approach but requires careful fixture integration given the `importlib.util` module-loading pattern already in place.

---

## Viable Approaches

### Option A: Monkey-patch `urllib.request.urlopen` with `unittest.mock`

**Approach:** Use `unittest.mock.patch` to replace the global `urllib.request.urlopen` function. All HTTP calls are routed through this singleton, making it a single interception point.

**Pros:**
- No external dependencies (stdlib `unittest.mock` only)
- Single patch location (all scripts import `urllib.request.urlopen`)
- Fine-grained control per call via `MagicMock` + `side_effect`
- Already used in Phase 1 tests (e.g., `test_gh_*` functions in `test_init_matrix_issues.py`)
- Easy to test error paths (raise `urllib.error.HTTPError` deterministically)

**Cons:**
- Requires context manager per test (some verbosity if many calls per test)
- Mock setup can be tightly coupled to implementation detail (URLopen internals)
- No automatic request/response matching (must manually sequence responses via `side_effect`)
- Stack of mocked calls with side effects can be hard to debug if responses are out of order

**PoC Code Snippet:**

```python
def test_aggregate_completion_end_to_end(aggregate):
    """Orchestration test: fetch repo matrices, apply overlays, render, write snapshot."""
    from unittest.mock import patch, MagicMock
    import json
    
    # Pre-build responses
    responses = {
        "hd_matrix": b"## 1. Auth\n| ID | F | ... | HD-AUTH-001 | ...",
        "cc_matrix": b"## 1. Auth\n| ID | F | ... | CC-AUTH-001 | ...",
        "fa_matrix": b"",  # returns empty
        "ch_matrix": b"",
        "xc_matrix": b"",
        "hd_latest_run": {"workflow_runs": [{"conclusion": "success"}]},
        "sentry_issues": [{"culprit": "Error in /api/me/subscriptions"}],
        "stripe_active": {"data": []},
    }
    
    call_sequence = [
        # GitHub: fetch HD matrix
        MagicMock(return_value=_FakeResp(200, responses["hd_matrix"])),
        # GitHub: fetch CC matrix
        MagicMock(return_value=_FakeResp(200, responses["cc_matrix"])),
        # ... more calls in order ...
        # Sentry: fetch unresolved issues
        MagicMock(return_value=_FakeResp(200, json.dumps(responses["sentry_issues"]).encode())),
        # ... etc ...
    ]
    
    with patch("urllib.request.urlopen", side_effect=call_sequence):
        rc = aggregate.main()
    
    assert rc == 0
    # Verify snapshot was written (mocked file I/O not needed; real files OK in test)
    assert Path("docs/completion-tracker.json").exists()
```

---

### Option B: HTTP URL routing table + factory pattern

**Approach:** Create a test-mode HTTP client abstraction that routes requests by URL pattern to deterministic responses. Inject this via dependency injection or environment flag.

**Pros:**
- More declarative (easier to read which URLs are mocked vs. unmocked)
- Decouples test setup from urllib internals
- URL → response mappings are explicit and reusable across tests
- Can switch between real HTTP and mocked HTTP via env var (useful for integration tests)

**Cons:**
- Requires wrapping all scripts' HTTP calls in a function that accepts a client (refactor)
- More boilerplate (client factory, request/response classes)
- Harder to implement error injection (timeout, malformed JSON)
- More moving parts to maintain

**PoC Code Snippet:**

```python
# New file: scripts/http_client.py
class HTTPResponse:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self.body = body
    def read(self): return self.body
    def __enter__(self): return self
    def __exit__(self, *a): return False

class HTTPClient:
    def __init__(self, routes=None):
        self.routes = routes or {}
    
    def request(self, url: str, **kwargs) -> HTTPResponse:
        for pattern, response in self.routes.items():
            if pattern in url:
                if callable(response):
                    return response(url, **kwargs)
                return response
        raise ValueError(f"No mock route for {url}")

# In test:
routes = {
    "api.github.com/repos/Latimer-Woods-Tech/HumanDesign/contents/docs/FUNCTIONS_MATRIX.md": 
        HTTPResponse(200, b"## 1. Auth\n..."),
    "sentry.io/api/0/organizations/latwood-tech/issues":
        HTTPResponse(200, json.dumps([{"culprit": "Error in /api"}]).encode()),
}
client = HTTPClient(routes)
# Pass client to aggregate functions via refactored signatures
rc = aggregate.main(http_client=client)
```

---

### Option C: Parameterized HTTP fetch function (dependency injection)

**Approach:** Extract the HTTP logic into a testable function parameter. Scripts' main functions accept a `fetch_fn` parameter for testing; production code uses `urllib.request.urlopen` directly.

**Pros:**
- Minimal refactoring (one parameter added to orchestration functions)
- Natural separation: logic functions are already pure, orchestrators are parameterizable
- Easy to test error handling (inject a fetch_fn that raises exceptions)
- Clear contract for testing

**Cons:**
- Requires changing function signatures of orchestration functions
- Introduces an extra parameter that's always `None` in production code
- Less elegant than a proper DI container (feel like a code smell)

**PoC Code Snippet:**

```python
# Refactored aggregate_completion.main():
def main(fetch_fn=None) -> int:
    if fetch_fn is None:
        fetch_fn = http_request  # Use real urllib by default
    
    # ... rest of logic ...
    content = fetch_matrix(..., fetch_fn=fetch_fn)  # Pass it through

# In test:
def fake_fetch(url, **kwargs):
    # Returns (status, body, headers) like http_request()
    if "FUNCTIONS_MATRIX" in url:
        return 200, b"## 1. Auth\n...", {}
    if "sentry.io" in url:
        return 200, json.dumps([...]).encode(), {}
    return 404, b"", {}

rc = aggregate.main(fetch_fn=fake_fetch)
```

---

## Recommendation: Option A + Option C Hybrid

**Choice:** Option A (unittest.mock) as the baseline, with Option C for main() orchestration.

**Rationale:**
- **Proven in Phase 1:** Phase 1 tests already use `patch("urllib.request.urlopen")` for HTTP client tests. This is familiar to future maintainers and working production code.
- **Minimal refactoring:** Only `main()` and the three `render_*()` functions need a `fetch_fn` parameter; all other functions stay pure.
- **Error testing:** Easier to inject failure scenarios (timeouts, malformed JSON) via a parameterized fetch function.
- **Coverage gap:** Addresses the 29% coverage gap by testing the orchestration layer (main) + render logic, which are currently 0% covered.

**Implementation Strategy:**
1. Add `fetch_fn=None` parameter to `main()` and each `render_*()` function
2. In production, `fetch_fn` defaults to `http_request` (the existing urllib wrapper)
3. In tests, inject a stub fetch function that returns deterministic responses
4. For error cases (5xx, 429, timeout), use `unittest.mock.patch` directly on `urllib.request.urlopen` to raise exceptions

**Execution Plan:**
1. Create stub fetch function in conftest.py (reusable across all scripts)
2. Refactor `aggregate.main()` to accept `fetch_fn` parameter
3. Refactor `render_markdown()` and `render_pushover()` similarly
4. Write end-to-end test: fetch matrices → apply overlays → render → write snapshot
5. Write error path tests: Sentry timeout, Stripe 500, GitHub 403
6. Refactor `init-matrix-issues.py` and `sync_labels_to_matrix.py` (similar pattern)

---

## Coverage Gap Analysis: 41% → 70%

**Current coverage (Phase 1, 75 tests):**
- `parse_matrix()`: 100% (all edge cases, malformed handling)
- `parse_rows()`: 100% (init-matrix-issues)
- `status_counts()`, `pass_pct()`, `sentry_route_segments()`: 100%
- Overlay functions: 100%
- `render_markdown()`, `render_pushover()`: 0% (never called in tests)
- `main()`: 0% (never called in tests; HTTP orchestration untested)
- Error handling (retries, timeouts, malformed JSON): 5% (only basic HTTP client tests)

**Tests needed (Phase 2, target +29%):**

| Test Category | Est. Tests | Complexity | Modules | Notes |
|---|---:|---|---|---|
| main() end-to-end | 3 | medium | aggregate, init-matrix, sync | Happy path + 1 red repo + 1 missing env |
| Render markdown | 4 | medium | aggregate | Roll-up table, regressions/wins, repo sections |
| Render Pushover | 3 | medium | aggregate | Day string, velocity delta, PR/gap counts |
| HTTP error paths | 6 | medium | aggregate, init-matrix, sync | Sentry 500, Stripe 403, GitHub timeout, malformed JSON |
| Sentry integration | 4 | low | aggregate | Fetch issues, route segment matching, overlay |
| Stripe integration | 4 | low | aggregate | Fetch subscriptions, active+trialing+new_24h counts |
| Label reconciliation | 5 | low | init-matrix, sync | Parse + diff + add/remove API calls |
| **Subtotal** | **29** | — | — | — |

**Execution timeline:**
- **Test fixture (stub fetch)**: 1 h
- **Refactor main() signatures**: 2 h
- **Write 29 tests**: 6 h (30 min/test avg)
- **Debug + coverage validation**: 2 h
- **Total**: ~11 h effort

---

## PoC: Stub Fetch Function (conftest.py)

```python
# scripts/tests/conftest.py (append)

@pytest.fixture
def mock_http():
    """
    Stub HTTP client for testing aggregate_completion.py orchestration.
    Returns (status, body, headers) tuples keyed by URL pattern.
    
    Usage:
        def test_aggregate_end_to_end(aggregate, mock_http):
            routes = {
                "api.github.com": (200, b'{"workflow_runs": [{"conclusion": "success"}]}', {}),
                "sentry.io": (200, json.dumps([]).encode(), {}),
            }
            def fake_fetch(url, **kwargs):
                for pattern, (status, body, hdrs) in routes.items():
                    if pattern in url:
                        return status, body, hdrs
                return 404, b"", {}
            
            rc = aggregate.main(fetch_fn=fake_fetch)
            assert rc == 0
    """
    def _stub_fetch(url: str, **kwargs) -> tuple[int, bytes, dict]:
        """Default: return 404 for all URLs (safe default in tests)."""
        return 404, b"", {}
    return _stub_fetch
```

---

## Identified Blockers & Mitigations

| Blocker | Severity | Mitigation |
|---------|----------|-----------|
| `main()` modifies file system (writes docs/completion-tracker.json) | medium | Use a temp directory per test; use `tmpdir` fixture or `monkeypatch.setenv()` |
| Sentry/Stripe tokens required at runtime | medium | Stub tokens in env vars during test setup; use `monkeypatch.setenv()` |
| History append (jsonl file) requires multiple calls to same path | low | Mock `Path.open()` for the history write; leave matrix writes as real files |
| Timestamp-dependent tests (decay_overlay, Pushover day string) | low | Already solved in Phase 1: mock `datetime.now()` via `patch("datetime.datetime.now")` |

---

## Next-Phase Task List (Ready to Execute)

- [ ] **Refactor aggregate_completion.py main()** — add `fetch_fn=None` parameter; extract `http_request()` function signature
- [ ] **Refactor render_markdown() and render_pushover()** — remove HTTP calls, accept pre-fetched data
- [ ] **Create conftest.py stub_fetch fixture** — reusable mock HTTP client
- [ ] **Write 3 main() orchestration tests** — happy path + error paths
- [ ] **Write 4 render_markdown() tests** — roll-up, regressions, repo sections, malformed rows
- [ ] **Write 3 render_pushover() tests** — day string, deltas, PR/gap integration
- [ ] **Write 6 HTTP error path tests** — 5xx, 429, timeout, JSON decode errors
- [ ] **Write 4 Sentry integration tests** — fetch → route matching → overlay
- [ ] **Write 4 Stripe integration tests** — MRR, trials, new charges
- [ ] **Write 5 label reconciliation tests** (init-matrix-issues.py + sync_labels_to_matrix.py)
- [ ] **Coverage validation** — run `pytest --cov=scripts --cov-report=term-missing` and confirm ≥70%
- [ ] **Document in comments** — add preamble to test files explaining the fetch_fn pattern

---

## Effort Estimate

| Phase | Tasks | Hours | Blocker |
|---|---|---|---|
| **Setup** | Fixture + confess refactor | 2 | None |
| **Core tests** | 3 × main() + 4 × render_markdown + 3 × render_pushover | 5 | None |
| **Integration** | 6 × HTTP error + 4 × Sentry + 4 × Stripe | 4 | None |
| **Label sync** | 5 × init-matrix + sync_labels (parallel) | 2 | None |
| **Debug + validation** | Coverage check + test flakiness + docs | 2 | None |
| **Total** | — | **15 h** | None |

**Timeline:** 2–3 days of focused work (assuming 5h/day dev time).

---

## Success Criteria

- [ ] Coverage increases from 41% to 70%+ (verified via `--cov-report=term-missing`)
- [ ] All 29 new tests pass consistently (no flakiness)
- [ ] `main()` orchestration is fully covered (HTTP → overlay → render → write)
- [ ] Error paths tested (Sentry 5xx, Stripe 403, GitHub timeout, malformed JSON)
- [ ] Refactored signatures are backward-compatible (production code unchanged, tests use `fetch_fn=` kwarg)
- [ ] No external dependencies added (urllib only, stdlib mock)
