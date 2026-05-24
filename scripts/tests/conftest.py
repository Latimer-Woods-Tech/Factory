"""
Pytest fixtures for scripts/ helper tests.

The helpers in scripts/ are hyphen-named (init-matrix-issues.py,
update-sri-hashes.mjs would be — JS only). Hyphen names are not importable
as modules, so we load them via importlib.util.spec_from_file_location().
This conftest provides the cached imports so test files don't repeat the
boilerplate.

HTTP Mocking Strategy (Phase 2):
  The aggregator scripts (aggregate_completion.py, init-matrix-issues.py,
  sync_labels_to_matrix.py) accept an optional `fetch_fn` parameter on their
  main() and helper functions. When provided, this function is called instead
  of making real HTTP requests.

  fetch_fn signature: Callable[[str], tuple[int, bytes, dict[str, str]]] | None
    - Takes: url (str)
    - Returns: (status: int, body: bytes, headers: dict)
    - If None, uses real urllib

  Example test usage:
    def test_something(aggregate, stub_fetch):
        stub = stub_fetch(200, b'{"data": []}')
        result = aggregate.main(fetch_fn=stub)
        assert result == 0
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Callable
from unittest.mock import Mock

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # repo/
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_module(module_name: str, filename: str):
    """Load a script file as an importable module."""
    path = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def init_matrix():
    """Load scripts/init-matrix-issues.py as a module."""
    return _load_module("init_matrix_issues", "init-matrix-issues.py")


@pytest.fixture(scope="session")
def aggregate():
    """Load scripts/aggregate_completion.py as a module."""
    return _load_module("aggregate_completion_under_test", "aggregate_completion.py")


@pytest.fixture(scope="session")
def sync_labels():
    """Load scripts/sync_labels_to_matrix.py as a module."""
    return _load_module("sync_labels_to_matrix_under_test", "sync_labels_to_matrix.py")


@pytest.fixture(scope="session")
def platform_conformance():
    """Load scripts/platform_conformance.py as a module."""
    return _load_module("platform_conformance_under_test", "platform_conformance.py")


# ────────────────────── HTTP Mocking (Phase 2) ──────────────────────


@pytest.fixture
def stub_fetch():
    """
    Factory for creating stub HTTP fetch functions for tests.

    Returns a callable that creates a fetch_fn matching the signature:
      (url: str) -> tuple[int, bytes, dict[str, str]]

    Usage:
      stub = stub_fetch(200, b'{"status":"ok"}')
      # Use in test:
      result = aggregate.main(fetch_fn=stub)

    The factory maintains state (responses list) so you can set up
    multiple responses for sequential calls, or use the default factory
    to return the same response for all calls.
    """

    class StubFetchFactory:
        def __init__(self):
            self.responses = []
            self.call_count = 0
            self.recorded_urls = []

        def __call__(
            self,
            status: int = 404,
            body: bytes | str = b"",
            headers: dict[str, str] | None = None,
        ) -> Callable[[str], tuple[int, bytes, dict[str, str]]]:
            """
            Create a stub fetch function that always returns the same response.

            Args:
              status: HTTP status code (default 404)
              body: Response body as bytes or str (str is auto-encoded to UTF-8)
              headers: Response headers dict (default empty)

            Returns:
              A function matching: (url: str) -> (status, body, headers)
            """
            if isinstance(body, str):
                body = body.encode("utf-8")
            if headers is None:
                headers = {}

            def fetch_fn(url: str) -> tuple[int, bytes, dict[str, str]]:
                self.recorded_urls.append(url)
                self.call_count += 1
                return status, body, headers

            return fetch_fn

        def with_responses(
            self, responses: list[tuple[int, bytes | str, dict[str, str] | None]]
        ) -> Callable[[str], tuple[int, bytes, dict[str, str]]]:
            """
            Create a stub that cycles through multiple responses.

            Args:
              responses: List of (status, body, headers) tuples

            Returns:
              A function that returns responses in order, repeating the last
            """
            self.responses = [
                (status, body.encode("utf-8") if isinstance(body, str) else body, headers or {})
                for status, body, headers in responses
            ]
            self.call_count = 0

            def fetch_fn(url: str) -> tuple[int, bytes, dict[str, str]]:
                self.recorded_urls.append(url)
                idx = min(self.call_count, len(self.responses) - 1)
                self.call_count += 1
                if idx >= 0:
                    return self.responses[idx]
                return 404, b"", {}

            return fetch_fn

    return StubFetchFactory()


@pytest.fixture
def stub_fetch_error():
    """
    Factory for creating error-injecting stub functions.

    Returns a callable that creates fetch_fn functions for error scenarios.

    Usage:
      stub = stub_fetch_error(500, "Internal Server Error")
      # Use in test:
      result = aggregate.fetch_matrix(..., fetch_fn=stub)
    """

    def create_error_stub(
        status: int, message: str = "", headers: dict[str, str] | None = None
    ) -> Callable[[str], tuple[int, bytes, dict[str, str]]]:
        """
        Create a fetch_fn that returns an error response.

        Args:
          status: HTTP error status (e.g., 500, 429, 403)
          message: Error message for response body
          headers: Additional headers (e.g., Retry-After for 429)

        Returns:
          A fetch_fn that always returns the error
        """
        body = message.encode("utf-8") if message else b""
        if headers is None:
            headers = {}

        def fetch_fn(url: str) -> tuple[int, bytes, dict[str, str]]:
            return status, body, headers

        return fetch_fn

    return create_error_stub


@pytest.fixture
def stub_fetch_timeout():
    """
    Factory for creating timeout-simulating stub functions.

    Raises URLError to simulate network timeout.

    Usage:
      from urllib.error import URLError
      stub = stub_fetch_timeout()
      # The fetch_fn will raise URLError when called
    """
    import urllib.error

    def create_timeout_stub() -> Callable[[str], tuple[int, bytes, dict[str, str]]]:
        """Create a fetch_fn that raises URLError (timeout)."""
        def fetch_fn(url: str) -> tuple[int, bytes, dict[str, str]]:
            raise urllib.error.URLError("Connection timeout")
        return fetch_fn

    return create_timeout_stub


@pytest.fixture
def stub_fetch_malformed():
    """
    Factory for creating malformed-response stubs.

    Returns a callable that creates fetch_fn functions returning invalid JSON.

    Usage:
      stub = stub_fetch_malformed()  # returns 200 with broken JSON
      result = aggregate.fetch_sentry_unresolved(..., fetch_fn=stub)
    """

    def create_malformed_stub(
        body: str = "{invalid json", status: int = 200
    ) -> Callable[[str], tuple[int, bytes, dict[str, str]]]:
        """
        Create a fetch_fn that returns malformed JSON.

        Args:
          body: Malformed JSON string (default: incomplete object)
          status: HTTP status (default 200, so caller expects valid JSON)

        Returns:
          A fetch_fn that returns the malformed body
        """
        def fetch_fn(url: str) -> tuple[int, bytes, dict[str, str]]:
            return status, body.encode("utf-8"), {}

        return fetch_fn

    return create_malformed_stub


# ────────────────────── Pre-built Response Fixtures ──────────────────────


@pytest.fixture
def github_api_stub():
    """
    Pre-built stubs for common GitHub API responses.

    Usage:
      stub = github_api_stub["matrix"]  # Returns stub for FUNCTIONS_MATRIX
      result = aggregate.fetch_matrix(..., fetch_fn=stub)
    """

    matrix_md = """\
## 1. Auth

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-AUTH-001 | Login | POST /login | ✅ | ✅ | ✅ | @alice | 2026-05-20 | #1 | 3 | ready |
| HD-AUTH-002 | Logout | POST /logout | ✅ | ❌ | ⚠️ | @bob | 2026-05-19 | #2 | 2 | flaky |

## 2. Billing

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-BILL-001 | Subscribe | POST /subscribe | ✅ | ✅ | ✅ | @carol | 2026-05-20 | #3 | 5 | stable |
""".encode("utf-8")

    runs_json = json.dumps({
        "workflow_runs": [
            {
                "id": 1001,
                "name": "CI",
                "conclusion": "success",
                "status": "completed",
                "head_branch": "main",
            }
        ]
    }).encode("utf-8")

    workflows_json = json.dumps({
        "workflows": [
            {"id": 100, "name": "CI", "path": ".github/workflows/ci.yml"},
            {"id": 101, "name": "smoke-tests", "path": ".github/workflows/smoke.yml"},
        ]
    }).encode("utf-8")

    return {
        "matrix": lambda url: (200, matrix_md, {}),
        "runs_success": lambda url: (200, runs_json, {}),
        "workflows": lambda url: (200, workflows_json, {}),
        "not_found": lambda url: (404, b"Not Found", {}),
    }


@pytest.fixture
def sentry_api_stub():
    """
    Pre-built stubs for common Sentry API responses.

    Usage:
      stub = sentry_api_stub["issues"]  # Returns stub for unresolved issues
      result = aggregate.fetch_sentry_unresolved(..., fetch_fn=stub)
    """

    issues_json = json.dumps([
        {
            "id": 1001,
            "title": "Error in POST /api/me/subscriptions",
            "status": "unresolved",
            "count": 5,
            "userCount": 3,
            "culprit": "Error in POST /api/me/subscriptions",
            "lastSeen": "2026-05-21T10:30:00Z",
        },
        {
            "id": 1002,
            "title": "Timeout in GET /api/live/status",
            "status": "unresolved",
            "count": 2,
            "userCount": 1,
            "metadata": {"value": "Failed at GET /api/live/status"},
            "lastSeen": "2026-05-21T09:15:00Z",
        }
    ]).encode("utf-8")

    return {
        "issues": lambda url: (200, issues_json, {}),
        "empty": lambda url: (200, json.dumps([]).encode("utf-8"), {}),
        "server_error": lambda url: (500, b"Internal Server Error", {}),
    }


@pytest.fixture
def stripe_api_stub():
    """
    Pre-built stubs for common Stripe API responses.

    Usage:
      stub = stripe_api_stub["subscriptions"]  # Returns stub for subscriptions list
      result = aggregate.fetch_stripe_data(..., fetch_fn=stub)
    """

    subscriptions_json = json.dumps({
        "object": "list",
        "data": [
            {
                "id": "sub_1",
                "status": "active",
                "current_period_start": 1700000000,
                "plan": {"amount": 9900, "interval": "month"},
            },
            {
                "id": "sub_2",
                "status": "trialing",
                "current_period_start": 1700000000,
                "plan": {"amount": 2900, "interval": "month"},
            },
        ],
        "has_more": False,
    }).encode("utf-8")

    return {
        "subscriptions": lambda url: (200, subscriptions_json, {}),
        "empty": lambda url: (200, json.dumps({"object": "list", "data": []}).encode("utf-8"), {}),
    }
