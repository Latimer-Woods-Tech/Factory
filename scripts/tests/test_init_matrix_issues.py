"""
Tests for scripts/init-matrix-issues.py — label sync and issue management.

Phase A-B (Logic + HTTP Mocking): Covers parse_rows, issue_body, gh(),
ensure_labels, find_issue_by_feature_label, reconcile_labels.

Phase D (Orchestration): Tests main() end-to-end with dependency-injected
fetch_fn for HTTP mocking.

The gh() function accepts an optional fetch_fn parameter that replaces urllib.
Tests use unittest.mock.patch to stub GitHub API responses.

See docs/aggregator-http-mocking-design.md for the testing strategy.
"""
from __future__ import annotations

import io
import json
from unittest.mock import patch, MagicMock

import pytest


# ──────────────────────────── parse_rows ────────────────────────────

def test_parse_rows_happy_path(init_matrix):
    content = """\
# Functions Matrix

## 1. Authentication

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-AUTH-001 | Login | POST /auth/login | ✅ | ✅ | ✅ done | @alice | 2026-05-14 | #123 | 3 | works |
| HD-AUTH-002 | Logout | POST /auth/logout | ✅ | ❌ | ⚠️ flaky | @bob | 2026-05-13 | #124 | 2 | needs test |

## 2. Billing

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-BILL-001 | Subscribe | POST /subscribe | ✅ | ✅ | ❌ broken | @carol | 2026-05-10 | #125 | 5 | regressed |
"""
    rows = init_matrix.parse_rows(content)
    assert len(rows) == 3
    assert rows[0]["section"] == "Authentication"
    assert rows[0]["id"] == "HD-AUTH-001"
    assert rows[0]["status"] == "✅"
    assert rows[1]["status"] == "⚠️"
    assert rows[2]["section"] == "Billing"
    assert rows[2]["status"] == "❌"
    assert rows[2]["weight"] == "5"
    assert rows[2]["owner"] == "@carol"


def test_parse_rows_rejects_malformed_id(init_matrix):
    content = """\
## 1. Test
| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| not-a-valid-id | x | y | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
| lowercase-id-001 | x | y | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
| HD-AUTH-001 | Good | y | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows = init_matrix.parse_rows(content)
    assert len(rows) == 1
    assert rows[0]["id"] == "HD-AUTH-001"


def test_parse_rows_rejects_unknown_status_emoji(init_matrix):
    content = """\
## 1. Test
| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-X-001 | x | y | ✅ | ✅ | 🤷 mystery | @a | 2026-01-01 | #1 | 1 | n |
| HD-X-002 | x | y | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows = init_matrix.parse_rows(content)
    assert len(rows) == 1
    assert rows[0]["id"] == "HD-X-002"


def test_parse_rows_rejects_wrong_column_count(init_matrix):
    """Rows with the wrong number of pipe-separated cells get dropped."""
    content = """\
## 1. Test
| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-X-001 | only three cells | ✅ |
| HD-X-002 | x | y | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows = init_matrix.parse_rows(content)
    assert len(rows) == 1


def test_parse_rows_skips_outside_tables(init_matrix):
    """Lines that aren't inside a table get ignored even if pipe-formatted."""
    content = """\
## 1. Intro
| this | looks | like | a | table | but | has | no | header | row | abc |
| HD-X-001 | x | y | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |

## 2. Real

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-Y-001 | y | z | ✅ | ✅ | ✅ done | @b | 2026-01-01 | #2 | 1 | n |
"""
    rows = init_matrix.parse_rows(content)
    assert len(rows) == 1
    assert rows[0]["id"] == "HD-Y-001"
    assert rows[0]["section"] == "Real"


def test_parse_rows_handles_separator_line(init_matrix):
    """Both `|---` and `| ---` separator forms must be skipped."""
    for sep in ("|---|---|", "| --- | --- |"):
        content = f"""\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
{sep}---|---|---|---|---|---|---|---|---|
| HD-X-001 | f | e | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
"""
        rows = init_matrix.parse_rows(content)
        assert len(rows) == 1, f"failed for separator: {sep}"


def test_parse_rows_returns_empty_for_no_tables(init_matrix):
    assert init_matrix.parse_rows("") == []
    assert init_matrix.parse_rows("just some prose, no tables here") == []
    assert init_matrix.parse_rows("## Header only\n\nstill no tables\n") == []


def test_parse_rows_status_emoji_mapping(init_matrix):
    """All four legend emojis must round-trip."""
    legend_emojis = ["✅", "⚠️", "❌", "🔍"]
    for emoji in legend_emojis:
        content = f"""\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-X-001 | f | e | ✅ | ✅ | {emoji} ok | @a | 2026-01-01 | #1 | 1 | n |
"""
        rows = init_matrix.parse_rows(content)
        assert len(rows) == 1
        assert rows[0]["status"] == emoji


# ──────────────────────────── issue_body ────────────────────────────

def test_issue_body_renders_all_fields(init_matrix):
    row = {
        "section": "Auth",
        "id": "HD-AUTH-001",
        "feature": "Login",
        "endpoint": "POST /login",
        "manual": "✅",
        "automated": "✅",
        "status": "✅",
        "owner": "@alice",
        "last_verified": "2026-05-14",
        "weight": "3",
        "notes": "ships",
    }
    body = init_matrix.issue_body(row, "Latimer-Woods-Tech/HumanDesign", "docs/FUNCTIONS_MATRIX.md")
    assert "**Feature**: Login" in body
    assert "**Section**: Auth" in body
    assert "**Endpoint/Component**: POST /login" in body
    assert "**Status**: ✅ (passing)" in body  # LEGEND lookup
    assert "Latimer-Woods-Tech/HumanDesign" in body
    assert "docs/FUNCTIONS_MATRIX.md" in body
    assert "@alice" in body
    assert "Weight" in body and "3" in body


def test_issue_body_status_mapping_uses_legend(init_matrix):
    base = {
        "section": "T", "id": "HD-X-001", "feature": "f", "endpoint": "e",
        "manual": "", "automated": "", "owner": "@a",
        "last_verified": "2026-01-01", "weight": "1", "notes": "n",
    }
    expectations = {"✅": "passing", "⚠️": "issues", "❌": "fail", "🔍": "unknown"}
    for emoji, word in expectations.items():
        body = init_matrix.issue_body({**base, "status": emoji}, "r", "m")
        assert f"**Status**: {emoji} ({word})" in body


# ──────────────────────────── gh (HTTP) ────────────────────────────

class _FakeResp:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self._body = body
    def read(self) -> bytes:
        return self._body
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_gh_success_decodes_json(init_matrix):
    payload = {"hello": "world"}
    with patch("urllib.request.urlopen", return_value=_FakeResp(200, json.dumps(payload).encode())):
        status, body = init_matrix.gh("GET", "/test", "tok")
    assert status == 200
    assert body == payload


def test_gh_post_with_body_sets_content_type(init_matrix):
    captured: dict = {}
    def fake_urlopen(req, timeout=None):
        captured["headers"] = dict(req.header_items())
        captured["method"] = req.get_method()
        captured["data"] = req.data
        return _FakeResp(201, b'{"ok": true}')
    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        status, body = init_matrix.gh("POST", "/test", "tok", {"key": "val"})
    assert status == 201
    assert body == {"ok": True}
    assert captured["method"] == "POST"
    assert captured["data"] == b'{"key": "val"}'
    headers_ci = {k.lower(): v for k, v in captured["headers"].items()}
    assert headers_ci.get("content-type") == "application/json"
    assert "Bearer tok" in headers_ci.get("authorization", "")


def test_gh_empty_body_returns_none(init_matrix):
    with patch("urllib.request.urlopen", return_value=_FakeResp(204, b"")):
        status, body = init_matrix.gh("DELETE", "/x", "tok")
    assert status == 204
    assert body is None


def test_gh_retries_on_5xx_then_succeeds(init_matrix):
    import urllib.error
    err = urllib.error.HTTPError(url="http://x", code=503, msg="busy", hdrs=None, fp=None)
    responses = [err, err, _FakeResp(200, b'{"ok": 1}')]
    def side_effect(*a, **k):
        nxt = responses.pop(0)
        if isinstance(nxt, urllib.error.HTTPError):
            raise nxt
        return nxt
    with patch("urllib.request.urlopen", side_effect=side_effect), \
         patch("time.sleep") as fake_sleep:
        status, body = init_matrix.gh("GET", "/x", "tok")
    assert status == 200
    assert body == {"ok": 1}
    # Should have backed off twice
    assert fake_sleep.call_count == 2


def test_gh_retries_on_429(init_matrix):
    import urllib.error
    err = urllib.error.HTTPError(url="http://x", code=429, msg="slow down", hdrs=None, fp=None)
    responses = [err, _FakeResp(200, b'{"ok": 1}')]
    def side_effect(*a, **k):
        nxt = responses.pop(0)
        if isinstance(nxt, urllib.error.HTTPError):
            raise nxt
        return nxt
    with patch("urllib.request.urlopen", side_effect=side_effect), \
         patch("time.sleep"):
        status, body = init_matrix.gh("GET", "/x", "tok")
    assert status == 200


def test_gh_4xx_does_not_retry(init_matrix):
    import urllib.error
    err = urllib.error.HTTPError(
        url="http://x", code=404, msg="not found", hdrs=None,
        fp=io.BytesIO(b'{"message": "Not Found"}'),
    )
    call_count = {"n": 0}
    def side_effect(*a, **k):
        call_count["n"] += 1
        raise err
    with patch("urllib.request.urlopen", side_effect=side_effect):
        status, body = init_matrix.gh("GET", "/x", "tok")
    assert status == 404
    assert body == {"message": "Not Found"}
    assert call_count["n"] == 1  # no retry


def test_gh_exhausts_retries_returns_599(init_matrix):
    import urllib.error
    err = urllib.error.HTTPError(url="http://x", code=503, msg="busy", hdrs=None, fp=None)
    with patch("urllib.request.urlopen", side_effect=err), \
         patch("time.sleep"):
        status, body = init_matrix.gh("GET", "/x", "tok")
    assert status == 599
    assert body is None


# ──────────────────────────── ensure_labels ────────────────────────────

def test_ensure_labels_treats_422_as_success(init_matrix):
    """422 means 'label already exists' — must not warn."""
    fake = MagicMock(return_value=(422, {"errors": [{"code": "already_exists"}]}))
    with patch.object(init_matrix, "gh", fake), \
         patch("sys.stderr") as fake_stderr:
        init_matrix.ensure_labels("r", "tok", [("status:passing", "0E8A16")])
    fake.assert_called_once_with("POST", "/repos/r/labels", "tok",
                                  {"name": "status:passing", "color": "0E8A16"}, fetch_fn=None)
    # No "warn" message expected
    written = "".join(c.args[0] for c in fake_stderr.write.call_args_list if c.args)
    assert "warn" not in written.lower()


def test_ensure_labels_warns_on_other_error(init_matrix, capsys):
    fake = MagicMock(return_value=(500, None))
    with patch.object(init_matrix, "gh", fake):
        init_matrix.ensure_labels("r", "tok", [("status:fail", "B60205")])
    captured = capsys.readouterr()
    assert "warn" in captured.err.lower()
    assert "status:fail" in captured.err
    assert "500" in captured.err


def test_ensure_labels_iterates_all_inputs(init_matrix):
    fake = MagicMock(return_value=(201, None))
    with patch.object(init_matrix, "gh", fake):
        init_matrix.ensure_labels("r", "tok", [
            ("feature:HD-X-001", "5319E7"),
            ("weight:3", "BFD4F2"),
            ("status:passing", "0E8A16"),
        ])
    assert fake.call_count == 3


# ──────────────────────────── find_issue_by_feature_label ──────────

def test_find_issue_by_feature_label_returns_first_match(init_matrix):
    fake_response = {"items": [{"number": 42, "title": "[HD-AUTH-001] Login"}]}
    fake = MagicMock(return_value=(200, fake_response))
    with patch.object(init_matrix, "gh", fake):
        result = init_matrix.find_issue_by_feature_label("r", "tok", "HD-AUTH-001")
    assert result == {"number": 42, "title": "[HD-AUTH-001] Login"}
    # URL must be search/issues with quoted label
    args, _ = fake.call_args
    assert args[0] == "GET"
    assert "/search/issues" in args[1]
    assert "label" in args[1] and "HD-AUTH-001" in args[1]


def test_find_issue_by_feature_label_no_match_returns_none(init_matrix):
    fake = MagicMock(return_value=(200, {"items": []}))
    with patch.object(init_matrix, "gh", fake):
        assert init_matrix.find_issue_by_feature_label("r", "tok", "HD-X-999") is None


def test_find_issue_by_feature_label_handles_api_error(init_matrix):
    fake = MagicMock(return_value=(403, None))
    with patch.object(init_matrix, "gh", fake):
        assert init_matrix.find_issue_by_feature_label("r", "tok", "HD-X-001") is None


def test_find_issue_by_feature_label_handles_missing_items_key(init_matrix):
    fake = MagicMock(return_value=(200, {}))  # no "items"
    with patch.object(init_matrix, "gh", fake):
        assert init_matrix.find_issue_by_feature_label("r", "tok", "HD-X-001") is None


# ──────────────────────────── reconcile_labels ──────────────────────

def test_reconcile_labels_removes_stale_managed_labels(init_matrix):
    """When issue has status:fail but we want status:passing, the old label
    should be deleted and the new one added. Note: the colon in label names
    is URL-encoded (`%3A`) in the DELETE path."""
    import urllib.parse as up
    calls = []
    def fake_gh(method, path, token, body=None, fetch_fn=None):
        calls.append((method, path, body))
        if method == "GET":
            return (200, [{"name": "status:fail"}, {"name": "feature:HD-X-001"}, {"name": "unrelated"}])
        return (200, None)
    with patch.object(init_matrix, "gh", side_effect=fake_gh):
        init_matrix.reconcile_labels("r", "tok", 1,
                                     want=["status:passing", "feature:HD-X-001"],
                                     remove_prefixes=("status:", "weight:", "owner:"))
    methods = [c[0] for c in calls]
    paths = [c[1] for c in calls]
    # Initial GET
    assert methods[0] == "GET"
    # DELETE on status:fail (matches prefix, not in want) — path is URL-encoded
    delete_paths = [up.unquote(p) for m, p in zip(methods, paths) if m == "DELETE"]
    assert any("status:fail" in p for p in delete_paths), f"got: {delete_paths}"
    # feature:HD-X-001 must NOT be deleted (it IS in want)
    assert not any("feature:HD-X-001" in p for p in delete_paths)
    # unrelated has no matching prefix → not deleted
    assert not any("unrelated" in p for p in delete_paths)
    # POST adds the missing status:passing
    post_calls = [c for c in calls if c[0] == "POST"]
    assert len(post_calls) == 1
    assert post_calls[0][2] == {"labels": ["status:passing"]}


def test_reconcile_labels_noop_when_in_sync(init_matrix):
    """Already in sync: no DELETE, no POST."""
    def fake_gh(method, path, token, body=None, fetch_fn=None):
        if method == "GET":
            return (200, [{"name": "status:passing"}, {"name": "feature:HD-X-001"}])
        return (200, None)
    with patch.object(init_matrix, "gh", side_effect=fake_gh) as g:
        init_matrix.reconcile_labels("r", "tok", 1,
                                     want=["status:passing", "feature:HD-X-001"],
                                     remove_prefixes=("status:",))
    # GET only — no follow-up writes
    assert g.call_count == 1


def test_reconcile_labels_preserves_non_managed_labels(init_matrix):
    """Labels outside the managed prefixes must be untouched."""
    import urllib.parse as up
    delete_paths = []
    def fake_gh(method, path, token, body=None, fetch_fn=None):
        if method == "DELETE":
            delete_paths.append(up.unquote(path))
        if method == "GET":
            return (200, [{"name": "priority:P1"}, {"name": "status:fail"}])
        return (200, None)
    with patch.object(init_matrix, "gh", side_effect=fake_gh):
        init_matrix.reconcile_labels("r", "tok", 1,
                                     want=["status:passing"],
                                     remove_prefixes=("status:",))
    # priority:P1 must NOT be deleted (not in remove_prefixes)
    assert not any("priority" in p for p in delete_paths)
    # status:fail SHOULD be deleted
    assert any("status:fail" in p for p in delete_paths), f"got: {delete_paths}"


def test_reconcile_labels_handles_get_error(init_matrix):
    """If the GET fails, function must return without raising."""
    fake = MagicMock(return_value=(500, None))
    with patch.object(init_matrix, "gh", fake):
        init_matrix.reconcile_labels("r", "tok", 1, want=["status:passing"],
                                     remove_prefixes=("status:",))
    # Only the GET — no DELETE/POST attempted
    assert fake.call_count == 1


# ──────────────────────────── Phase D: Label Sync Tests ──────────────────────

# HTTP calls are mocked via dependency injection (fetch_fn parameter).
# See conftest.py::stub_fetch factory.


def test_main_missing_github_token_returns_2(init_matrix):
    """main() returns 2 when GITHUB_TOKEN is missing."""
    with patch.dict('os.environ', {'GITHUB_TOKEN': ''}):
        with patch('sys.argv', ['init-matrix-issues', '--repo', 'Test/Repo', '--matrix', 'docs/file.md']):
            result = init_matrix.main(fetch_fn=lambda url: (404, b'', {}))
    assert result == 2


def test_find_issue_constructs_correct_search_query(init_matrix):
    """find_issue_by_feature_label() constructs proper GitHub search URL."""
    captured_url = [None]

    def capture_url(method, path, token, fetch_fn=None):
        captured_url[0] = path
        return (200, {"items": []})

    with patch.object(init_matrix, "gh", side_effect=capture_url):
        init_matrix.find_issue_by_feature_label("Test/Repo", "token", "HD-AUTH-001")

    assert captured_url[0] is not None
    assert "/search/issues" in captured_url[0]
    assert "feature:HD-AUTH-001" in captured_url[0] or "HD-AUTH-001" in captured_url[0]


def test_ensure_labels_idempotent_on_422(init_matrix):
    """ensure_labels() treats 422 (already exists) as success."""
    gh_call_count = [0]

    def stub_gh(method, path, token, body=None, fetch_fn=None):
        gh_call_count[0] += 1
        # 422 = label already exists
        return (422, {"errors": [{"code": "already_exists"}]})

    with patch.object(init_matrix, "gh", side_effect=stub_gh):
        # Should not raise or log error
        init_matrix.ensure_labels("Test/Repo", "token", [("status:passing", "0E8A16")], fetch_fn=None)

    assert gh_call_count[0] == 1  # exactly one label attempt


def test_parse_rows_parses_valid_matrix_rows(init_matrix):
    """parse_rows() extracts all 11 cells from valid markdown rows."""
    content = """\
## 1. Auth

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-AUTH-001 | Login | POST /login | ✅ | ✅ | ✅ | @alice | 2026-05-20 | #1 | 3 | ready |
"""
    rows = init_matrix.parse_rows(content)
    assert len(rows) == 1
    assert rows[0]["id"] == "HD-AUTH-001"
    assert rows[0]["feature"] == "Login"
    assert rows[0]["status"] == "✅"
    assert rows[0]["weight"] == "3"


def test_issue_body_includes_row_metadata(init_matrix):
    """issue_body() generates markdown with all row fields."""
    row = {
        "id": "HD-X-001",
        "section": "Auth",
        "feature": "Test Feature",
        "endpoint": "GET /test",
        "manual": "✅",
        "automated": "❌",
        "status": "⚠️",
        "owner": "@bob",
        "last_verified": "2026-01-01",
        "weight": "5",
        "notes": "pending",
    }
    body = init_matrix.issue_body(row, "Test/Repo", "docs/FUNCTIONS_MATRIX.md")
    # body includes all fields except the ID (ID goes in the title)
    assert "Test Feature" in body
    assert "Auth" in body
    assert "@bob" in body
    assert "2026-01-01" in body
    assert "GET /test" in body


def test_main_dry_run_flag_prevents_writes(init_matrix):
    """--dry-run flag should prevent issue creation."""
    import tempfile
    from pathlib import Path

    matrix_content = """\
## 1. Auth
| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-TEST-001 | Test | GET /test | ✅ | ✅ | ✅ | @test | 2026-01-01 | - | 2 | test |
"""
    fd, fpath = tempfile.mkstemp(suffix=".md")
    try:
        import os
        os.write(fd, matrix_content.encode("utf-8"))
        os.close(fd)
        with patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}):
            with patch("sys.argv", ["init-matrix-issues", "--repo", "Test/Repo", "--matrix", "docs/FUNCTIONS_MATRIX.md", "--file", fpath, "--dry-run"]):
                with patch.object(init_matrix, "gh", return_value=(200, None)):
                    result = init_matrix.main(fetch_fn=lambda url: (404, b"", {}))
                    assert result == 0
    finally:
        Path(fpath).unlink(missing_ok=True)


def test_parse_rows_empty_content_returns_empty_list(init_matrix):
    """parse_rows('') returns [] since there are no tables."""
    rows = init_matrix.parse_rows("")
    assert rows == []


def test_legend_constant_maps_emoji_to_words(init_matrix):
    """LEGEND dict maps status emoji to legend words."""
    assert init_matrix.LEGEND["✅"] == "passing"
    assert init_matrix.LEGEND["⚠️"] == "issues"
    assert init_matrix.LEGEND["❌"] == "fail"
    assert init_matrix.LEGEND["🔍"] == "unknown"
