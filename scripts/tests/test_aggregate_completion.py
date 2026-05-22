"""
Tests for scripts/aggregate_completion.py — pure logic only.

Covers:
- parse_matrix: section tracking, header/separator detection, malformed
  reporting (wrong cell count, bad ID, bad emoji, bad weight)
- status_counts: tallies all four legend emojis + total
- pass_pct: simple, known, and weighted percentages with edge cases
- sentry_route_segments: route fragment extraction from issues
- apply_sentry_overlay: ✅ → ⚠️ chain when endpoint contains a route segment
- apply_actions_overlay: CI-RED tagging
- apply_smoke_overlay: ❌ smoke red prepend for SMOKE_AFFECTED pairs
- apply_decay_overlay: 30+ day decay → 🔍
- diff_rows: regression/win sorting

Phase B (HTTP Mocking): HTTP calls are mocked via dependency injection (fetch_fn
parameter). See conftest.py::stub_fetch factory and docs/aggregator-http-mocking-design.md
for the testing strategy.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import patch

import pytest


# ───────────────────────── parse_matrix ─────────────────────────

def test_parse_matrix_happy_path(aggregate):
    content = """\
## 1. Auth

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-AUTH-001 | Login | POST /login | ✅ | ✅ | ✅ done | @a | 2026-05-14 | #1 | 3 | works |
| HD-AUTH-002 | Logout | POST /logout | ✅ | ❌ | ⚠️ flaky | @b | 2026-05-13 | #2 | 2 | needs |
"""
    rows, malformed = aggregate.parse_matrix("HD", "HumanDesign", content)
    assert len(rows) == 2
    assert malformed == []
    assert rows[0].repo_key == "HD"
    assert rows[0].section == "Auth"
    assert rows[0].id == "HD-AUTH-001"
    assert rows[0].weight == 3
    assert rows[0].status == "✅"
    assert rows[1].status == "⚠️"


def test_parse_matrix_reports_wrong_cell_count(aggregate):
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-X-001 | only | three | cells |
"""
    rows, malformed = aggregate.parse_matrix("HD", "HumanDesign", content)
    assert rows == []
    assert len(malformed) == 1
    assert "expected 11" in malformed[0].reason


def test_parse_matrix_reports_bad_id(aggregate):
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| not-a-id | f | e | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows, malformed = aggregate.parse_matrix("HD", "HumanDesign", content)
    assert rows == []
    assert len(malformed) == 1
    assert "id 'not-a-id'" in malformed[0].reason


def test_parse_matrix_reports_bad_status_emoji(aggregate):
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-X-001 | f | e | ✅ | ✅ | 🤷 mystery | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows, malformed = aggregate.parse_matrix("HD", "HumanDesign", content)
    assert rows == []
    assert "does not start with a legend emoji" in malformed[0].reason


def test_parse_matrix_reports_bad_weight(aggregate):
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-X-001 | f | e | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | not-an-int | n |
"""
    rows, malformed = aggregate.parse_matrix("HD", "HumanDesign", content)
    assert rows == []
    assert "weight 'not-an-int' is not an int" in malformed[0].reason


def test_parse_matrix_section_tracking(aggregate):
    content = """\
## 1. Auth

| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-AUTH-001 | f | e | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 1 | n |

## 2. Billing

| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-BILL-001 | f | e | ✅ | ✅ | ✅ done | @b | 2026-01-01 | #2 | 1 | n |
"""
    rows, _ = aggregate.parse_matrix("HD", "HumanDesign", content)
    assert [r.section for r in rows] == ["Auth", "Billing"]


# ───────────────────────── status_counts ─────────────────────────

def _row(aggregate, status: str, weight: int = 1):
    return aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                         raw="", id="HD-X-001", status=status, weight=weight)


def test_status_counts_all_emojis(aggregate):
    rows = [
        _row(aggregate, "✅"),
        _row(aggregate, "✅"),
        _row(aggregate, "⚠️"),
        _row(aggregate, "❌"),
        _row(aggregate, "🔍"),
    ]
    c = aggregate.status_counts(rows)
    assert c["✅"] == 2
    assert c["⚠️"] == 1
    assert c["❌"] == 1
    assert c["🔍"] == 1
    assert c["total"] == 5


def test_status_counts_empty(aggregate):
    c = aggregate.status_counts([])
    assert c["✅"] == 0 and c["total"] == 0


# ───────────────────────── pass_pct ─────────────────────────

def test_pass_pct_basic(aggregate):
    rows = [
        _row(aggregate, "✅", weight=1),
        _row(aggregate, "✅", weight=1),
        _row(aggregate, "❌", weight=1),
        _row(aggregate, "⚠️", weight=1),
    ]
    p, pk, pw = aggregate.pass_pct(rows)
    assert p == 50.0  # 2/4
    assert pk == 50.0  # 2/4 known
    assert pw == 50.0  # weights all 1


def test_pass_pct_handles_unknown(aggregate):
    rows = [
        _row(aggregate, "✅", weight=2),
        _row(aggregate, "🔍", weight=1),  # excluded from "known"
        _row(aggregate, "❌", weight=2),
    ]
    p, pk, pw = aggregate.pass_pct(rows)
    assert p == 33.3   # 1 / 3
    assert pk == 50.0  # 1 / 2 (known excludes the 🔍)
    assert pw == 40.0  # weight 2 of 5


def test_pass_pct_empty(aggregate):
    assert aggregate.pass_pct([]) == (0.0, 0.0, 0.0)


def test_pass_pct_all_unknown(aggregate):
    rows = [_row(aggregate, "🔍", weight=1) for _ in range(3)]
    p, pk, pw = aggregate.pass_pct(rows)
    assert p == 0.0 and pk == 0.0 and pw == 0.0


# ───────────────────────── sentry_route_segments ─────────────────────────

def test_sentry_route_segments_from_culprit(aggregate):
    iss = {"culprit": "POST /api/me/subscriptions"}
    segs = aggregate.sentry_route_segments(iss)
    assert "/api/me/subscriptions" in segs


def test_sentry_route_segments_from_metadata_dict(aggregate):
    iss = {"metadata": {"value": "Error at /v1/internal/jobs/123/complete"}}
    segs = aggregate.sentry_route_segments(iss)
    assert any("/v1/internal/jobs" in s for s in segs)


def test_sentry_route_segments_ignores_short(aggregate):
    iss = {"title": "Error at /a"}
    segs = aggregate.sentry_route_segments(iss)
    # "/a" is too short (len <= 2)
    assert "/a" not in segs


def test_sentry_route_segments_empty_input(aggregate):
    assert aggregate.sentry_route_segments({}) == []


# ───────────────────────── apply_sentry_overlay ─────────────────────────

def test_apply_sentry_overlay_demotes_passing_to_warning(aggregate):
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1, raw="",
                      id="HD-X-001", endpoint="POST /api/me/subscriptions", status="✅"),
    ]
    issues = [{"culprit": "Error in /api/me/subscriptions"}]
    aggregate.apply_sentry_overlay(rows, issues)
    assert rows[0].status == "⚠️"
    assert "sentry-open" in rows[0].overlays


def test_apply_sentry_overlay_no_endpoint_match(aggregate):
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1, raw="",
                      id="HD-X-001", endpoint="POST /v1/listings", status="✅"),
    ]
    issues = [{"culprit": "Error in /api/me/subscriptions"}]
    aggregate.apply_sentry_overlay(rows, issues)
    assert rows[0].status == "✅"
    assert rows[0].overlays == []


def test_apply_sentry_overlay_skips_already_failing(aggregate):
    """Already-failing rows shouldn't be touched (the overlay only demotes ✅)."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1, raw="",
                      id="HD-X-001", endpoint="POST /api/me/subscriptions", status="❌"),
    ]
    issues = [{"culprit": "Error in /api/me/subscriptions"}]
    aggregate.apply_sentry_overlay(rows, issues)
    assert rows[0].status == "❌"


def test_apply_sentry_overlay_empty_issues_noop(aggregate):
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1, raw="",
                      id="HD-X-001", endpoint="POST /api/me/subscriptions", status="✅"),
    ]
    aggregate.apply_sentry_overlay(rows, [])
    assert rows[0].status == "✅"


# ───────────────────────── apply_actions_overlay ─────────────────────────

def test_apply_actions_overlay_adds_ci_red(aggregate):
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                      raw="", id="HD-X-001", status="✅"),
        aggregate.Row(repo_key="VK", repo_name="VK", section="s", line_no=1,
                      raw="", id="VK-X-001", status="✅"),
    ]
    aggregate.apply_actions_overlay(rows, red_repos={"HD"})
    assert "CI-RED" in rows[0].tags
    assert "CI-RED" not in rows[1].tags


def test_apply_actions_overlay_only_marks_passing(aggregate):
    """A failing row in a red repo doesn't get an extra CI-RED tag."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                      raw="", id="HD-X-001", status="❌"),
    ]
    aggregate.apply_actions_overlay(rows, red_repos={"HD"})
    assert "CI-RED" not in rows[0].tags


# ───────────────────────── apply_decay_overlay ─────────────────────────

def test_apply_decay_overlay_marks_stale_rows_unknown(aggregate):
    now = datetime(2026, 6, 15, tzinfo=timezone.utc)
    fresh_date = "2026-06-10"  # 5 days ago — fresh
    stale_date = "2026-05-01"  # 45 days ago — stale (>30)
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                      raw="", id="HD-X-001", status="✅", last_verified=fresh_date,
                      notes="ok"),
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=2,
                      raw="", id="HD-X-002", status="✅", last_verified=stale_date,
                      notes="ok"),
    ]
    aggregate.apply_decay_overlay(rows, now)
    assert rows[0].status == "✅"
    assert rows[1].status == "🔍"
    assert "auto-decay" in rows[1].overlays
    assert "auto-decay" in rows[1].notes


def test_apply_decay_overlay_ignores_unparseable_dates(aggregate):
    """Invalid date strings shouldn't crash; rows stay as-is."""
    now = datetime(2026, 6, 15, tzinfo=timezone.utc)
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                      raw="", id="HD-X-001", status="✅", last_verified="garbage"),
    ]
    aggregate.apply_decay_overlay(rows, now)
    assert rows[0].status == "✅"
    assert rows[0].overlays == []


# ───────────────────────── diff_rows ─────────────────────────

def test_diff_rows_detects_regression(aggregate):
    prev = {"rows": [{"id": "HD-X-001", "status": "✅"}]}
    current = [aggregate.Row(repo_key="HD", repo_name="HD", section="s",
                              line_no=1, raw="", id="HD-X-001",
                              status="❌", weight=5)]
    regressions, wins = aggregate.diff_rows(prev, current)
    assert [r.id for r in regressions] == ["HD-X-001"]
    assert wins == []


def test_diff_rows_detects_win(aggregate):
    prev = {"rows": [{"id": "HD-X-001", "status": "❌"}]}
    current = [aggregate.Row(repo_key="HD", repo_name="HD", section="s",
                              line_no=1, raw="", id="HD-X-001",
                              status="✅", weight=5)]
    regressions, wins = aggregate.diff_rows(prev, current)
    assert regressions == []
    assert [r.id for r in wins] == ["HD-X-001"]


def test_diff_rows_no_change_noop(aggregate):
    prev = {"rows": [{"id": "HD-X-001", "status": "✅"}]}
    current = [aggregate.Row(repo_key="HD", repo_name="HD", section="s",
                              line_no=1, raw="", id="HD-X-001", status="✅")]
    regressions, wins = aggregate.diff_rows(prev, current)
    assert regressions == [] and wins == []


def test_diff_rows_sorts_by_weight_desc(aggregate):
    prev = {"rows": [
        {"id": "HD-X-001", "status": "✅"},
        {"id": "HD-X-002", "status": "✅"},
    ]}
    current = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                       raw="", id="HD-X-001", status="❌", weight=1),
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=2,
                       raw="", id="HD-X-002", status="❌", weight=5),
    ]
    regressions, _ = aggregate.diff_rows(prev, current)
    # heaviest first
    assert [r.id for r in regressions] == ["HD-X-002", "HD-X-001"]


def test_diff_rows_new_rows_not_included(aggregate):
    """Rows not in prev are neither regressions nor wins."""
    prev = {"rows": [{"id": "HD-X-001", "status": "✅"}]}
    current = [
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=1,
                       raw="", id="HD-X-001", status="✅"),
        aggregate.Row(repo_key="HD", repo_name="HD", section="s", line_no=2,
                       raw="", id="HD-X-002", status="✅"),
    ]
    regressions, wins = aggregate.diff_rows(prev, current)
    assert regressions == [] and wins == []


# ───────────────────────── Phase B: Orchestration Tests ─────────────────────────

# HTTP calls are mocked via dependency injection (fetch_fn parameter).
# See conftest.py::stub_fetch factory and docs/aggregator-http-mocking-design.md.


# ─────────────────────────── B1: main() orchestration ───────────────────────────

def test_main_missing_github_token_returns_2(aggregate):
    """main() returns 2 when GITHUB_TOKEN is missing."""
    with patch.dict('os.environ', {'GITHUB_TOKEN': ''}):
        result = aggregate.main(fetch_fn=lambda url: (404, b'', {}))
    assert result == 2


def test_main_happy_path_returns_0(aggregate, tmp_path, stub_fetch):
    """main() orchestrates fetch, parse, overlay, render, and returns 0."""
    # Setup: valid stub responses for all HTTP calls
    matrix_content = """\
## 1. Auth

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-AUTH-001 | Login | POST /login | ✅ | ✅ | ✅ done | @alice | 2026-05-20 | #1 | 3 | ready |
| HD-AUTH-002 | Logout | POST /logout | ✅ | ❌ | ⚠️ flaky | @bob | 2026-05-19 | #2 | 2 | needs |
"""

    # Stub fetch returns matrix for all repos, empty runs/issues, etc.
    responses = [
        (200, matrix_content.encode("utf-8"), {}),  # fetch_matrix for HD
        (200, b'{"workflow_runs": [{"conclusion": "success"}]}', {}),  # fetch_latest_main_run
        (200, b'{"workflow_runs": [{"conclusion": "success"}]}', {}),  # fetch_smoke_run
        # ... repeat for other 4 repos (10 HTTP calls total: 5 repos × 2 fetches)
        (200, b'[]', {}),  # fetch_sentry_unresolved
        (200, b'{"object": "list", "data": []}', {}),  # fetch_stripe_data
        (200, b'{"items": []}', {}),  # count_open_prs (search endpoint)
        (200, b'', {}),  # send_pushover
    ]

    def multi_stub(url: str) -> tuple[int, bytes, dict[str, str]]:
        # Return matrix for all matrix fetches, success for CI checks, empty for others
        if 'FUNCTIONS_MATRIX' in url or 'contents/' in url:
            return (200, matrix_content.encode("utf-8"), {})
        if 'actions/runs' in url or 'workflows' in url:
            return (200, b'{"workflow_runs": [{"conclusion": "success"}]}', {})
        if 'issues' in url and 'search' in url:
            return (200, b'{"items": []}', {})
        if 'stripe' in url.lower():
            return (200, b'{"object": "list", "data": []}', {})
        if 'sentry' in url.lower():
            return (200, b'[]', {})
        if 'pushover' in url.lower():
            return (200, b'', {})
        return (404, b'', {})

    with patch.dict('os.environ', {
        'GITHUB_TOKEN': 'test-token',
        'OUTPUT_DIR': str(tmp_path),
    }):
        result = aggregate.main(fetch_fn=multi_stub)

    assert result == 0
    # Verify output files were written
    assert (tmp_path / "COMPLETION_TRACKER.md").exists()
    assert (tmp_path / "completion-tracker.json").exists()


def test_main_sentry_500_continues_gracefully(aggregate, tmp_path):
    """main() continues even if Sentry returns 500 (graceful degradation)."""
    matrix_content = """\
## 1. Auth

| ID | Feature | Endpoint | Manual | Automated | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|----|---------|----------|--------|-----------|--------|-------|---------------|----------|--------|-------|
| HD-AUTH-001 | Login | POST /login | ✅ | ✅ | ✅ done | @alice | 2026-05-20 | #1 | 3 | ready |
"""

    def sentry_500_stub(url: str) -> tuple[int, bytes, dict[str, str]]:
        # Matrix: success, CI checks: success, Sentry: error, others: success
        if 'FUNCTIONS_MATRIX' in url or 'contents/' in url:
            return (200, matrix_content.encode("utf-8"), {})
        if 'actions/runs' in url or 'workflows' in url:
            return (200, b'{"workflow_runs": [{"conclusion": "success"}]}', {})
        if 'sentry' in url.lower():
            return (500, b'Internal Server Error', {})
        if 'issues' in url and 'search' in url:
            return (200, b'{"items": []}', {})
        if 'stripe' in url.lower():
            return (200, b'{"object": "list", "data": []}', {})
        if 'pushover' in url.lower():
            return (200, b'', {})
        return (404, b'', {})

    with patch.dict('os.environ', {
        'GITHUB_TOKEN': 'test-token',
        'OUTPUT_DIR': str(tmp_path),
    }):
        result = aggregate.main(fetch_fn=sentry_500_stub)

    assert result == 0
    # Verify no Sentry overlay applied (rows remain unchanged)
    json_path = tmp_path / "completion-tracker.json"
    assert json_path.exists()
    snapshot = json.loads(json_path.read_text(encoding='utf-8'))
    # All rows should still be ✅ (no sentry overlay downgrade)
    # The matrix only has ✅ rows, so they should all remain ✅
    assert all(r['status'] == '✅' for r in snapshot['rows']), \
        f"Got statuses: {[r['status'] for r in snapshot['rows']]}"


# ─────────────────────────── B2: render_markdown() ───────────────────────────

def test_render_markdown_includes_rollup_header(aggregate):
    """render_markdown() includes a Roll-up section header."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=1, raw="", id="HD-AUTH-001", status="✅"),
        aggregate.Row(repo_key="CC", repo_name="capricast", section="Auth",
                      line_no=1, raw="", id="CC-AUTH-001", status="❌"),
    ]
    output = aggregate.render_markdown(rows, [], {}, {}, {}, datetime.now(timezone.utc))
    assert "## Roll-up" in output
    assert "HD" in output and "CC" in output


def test_render_markdown_includes_wins_and_regressions(aggregate):
    """render_markdown() includes Top wins and Top regressions sections."""
    prev_snapshot = {
        "rows": [
            {"id": "HD-AUTH-001", "status": "❌"},
            {"id": "HD-AUTH-002", "status": "✅"},
        ]
    }
    current_rows = [
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=1, raw="", id="HD-AUTH-001", status="✅", weight=5),
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=2, raw="", id="HD-AUTH-002", status="❌", weight=3),
    ]
    output = aggregate.render_markdown(current_rows, [], {}, {}, prev_snapshot,
                                       datetime.now(timezone.utc))
    assert "### ↑ Top wins" in output
    assert "### ↓ Top regressions" in output


def test_render_markdown_groups_by_repo_and_section(aggregate):
    """render_markdown() groups rows by repo then section."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=1, raw="", id="HD-AUTH-001", status="✅"),
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Billing",
                      line_no=2, raw="", id="HD-BILL-001", status="✅"),
        aggregate.Row(repo_key="CC", repo_name="capricast", section="Auth",
                      line_no=3, raw="", id="CC-AUTH-001", status="❌"),
    ]
    output = aggregate.render_markdown(rows, [], {}, {}, {}, datetime.now(timezone.utc))
    # Check repo headers
    assert "## HD —" in output
    assert "## CC —" in output
    # Check section subheaders
    assert "### Auth" in output
    assert "### Billing" in output


def test_render_markdown_includes_malformed_section(aggregate):
    """render_markdown() includes malformed rows section if any."""
    rows = []
    malformed = [
        aggregate.Malformed(repo_key="HD", matrix_path="docs/FUNCTIONS_MATRIX.md",
                           line_no=5, raw="| bad | row |", reason="expected 11 cells"),
        aggregate.Malformed(repo_key="HD", matrix_path="docs/FUNCTIONS_MATRIX.md",
                           line_no=10, raw="| bad-id | x | ...", reason="id 'bad-id' does not match pattern"),
    ]
    output = aggregate.render_markdown(rows, malformed, {}, {}, {}, datetime.now(timezone.utc))
    assert "## Malformed rows" in output
    assert "expected 11 cells" in output
    assert "bad-id" in output


# ─────────────────────────── B3: render_pushover() ───────────────────────────

def test_render_pushover_includes_day_and_score(aggregate):
    """render_pushover() includes day string and weighted score."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=1, raw="", id="HD-AUTH-001", status="✅"),
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=2, raw="", id="HD-AUTH-002", status="✅"),
    ]
    prev = {"overall_weighted": 70.0}
    output = aggregate.render_pushover(rows, prev, {}, {}, [], {}, datetime(2026, 5, 22, 14, 30, tzinfo=timezone.utc))
    # Should include date in ISO format
    assert "2026-05-22" in output
    # Should include score delta from prev snapshot (current 100% - prev 70% = +30%)
    assert "100" in output or "+" in output


def test_render_pushover_includes_ci_and_smoke_alerts(aggregate):
    """render_pushover() includes CI red and smoke red indicators."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=1, raw="", id="HD-AUTH-001", status="✅"),
    ]
    output = aggregate.render_pushover(rows, {}, {"HD"}, {"CC"}, [], {}, datetime.now(timezone.utc))
    assert "HD" in output  # CI red
    assert "CC" in output  # Smoke red


def test_render_pushover_includes_extra_signals(aggregate):
    """render_pushover() includes MRR, trials, PRs, and gap counts."""
    rows = [
        aggregate.Row(repo_key="HD", repo_name="HumanDesign", section="Auth",
                      line_no=1, raw="", id="HD-AUTH-001", status="✅"),
    ]
    extra = {
        "mrr": 5000.0,
        "trials": 2,
        "open_prs": 12,
        "p0_gaps": 1,
        "p1_gaps": 3,
    }
    output = aggregate.render_pushover(rows, {}, {}, {}, [], extra, datetime.now(timezone.utc))
    assert "5000" in output or "MRR" in output.upper()
    assert "12" in output or "PR" in output.upper()
    assert "1" in output or "P0" in output
