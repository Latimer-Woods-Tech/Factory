"""
Tests for scripts/sync_labels_to_matrix.py — parser + label decoder only.

Covers:
- parse_matrix: 11-cell strict parser with full positional metadata
  (status_suffix preservation, section tracking, malformed reporting)
- parse_issue_labels: extracts feature/status/weight/owner from GitHub
  issue label names, with normalization (status word → emoji, owner
  @-prefix, weight 1-5 range)

HTTP, write paths, and main() are out of scope for this file.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest


# ───────────────────────── parse_matrix ─────────────────────────

def test_parse_matrix_preserves_status_suffix(sync_labels):
    """Status cell '⚠️ flaky on iOS' must split into emoji '⚠️' + suffix 'flaky on iOS'."""
    content = """\
## 1. Auth
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-AUTH-001 | Login | POST /login | ✅ | ✅ | ⚠️ flaky on iOS | @a | 2026-01-01 | #1 | 3 | n |
"""
    rows, malformed = sync_labels.parse_matrix(content)
    assert len(rows) == 1
    assert malformed == []
    r = rows[0]
    assert r.status == "⚠️"
    assert r.status_suffix == "flaky on iOS"
    assert r.section == "Auth"
    assert r.line_no == 4
    assert r.weight == "3"  # kept as string


def test_parse_matrix_emoji_only_status_has_empty_suffix(sync_labels):
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-X-001 | f | e | ✅ | ✅ | ✅ | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows, _ = sync_labels.parse_matrix(content)
    assert len(rows) == 1
    assert rows[0].status == "✅"
    assert rows[0].status_suffix == ""


def test_parse_matrix_reports_malformed_with_line_no(sync_labels):
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| not-a-id | f | e | ✅ | ✅ | ✅ ok | @a | 2026-01-01 | #1 | 1 | n |
| HD-X-001 | f | e | ✅ | ✅ | ✅ ok | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows, malformed = sync_labels.parse_matrix(content)
    assert len(rows) == 1
    assert len(malformed) == 1
    line_no, raw, reason = malformed[0]
    assert line_no == 4
    assert "not-a-id" in reason


def test_parse_matrix_raw_line_preserved(sync_labels):
    """The raw, verbatim line must be retained for in-place rewriting."""
    raw_line = "| HD-AUTH-001 | Login |   POST /login   | ✅ | ✅ | ✅ done | @a | 2026-01-01 | #1 | 3 | works |"
    content = f"""\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
{raw_line}
"""
    rows, _ = sync_labels.parse_matrix(content)
    assert rows[0].raw == raw_line  # verbatim, including internal spaces


def test_parse_matrix_section_tracking_resets_at_section_break(sync_labels):
    """A new ## section without a header line should NOT carry table state."""
    content = """\
## 1. First

| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-A-001 | f | e | ✅ | ✅ | ✅ ok | @a | 2026-01-01 | #1 | 1 | n |

## 2. Second (no table yet)

This is just prose; no header line.
| HD-B-001 | this | should | NOT | be | parsed | as | a | row | x | y |

## 3. Third

| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-C-001 | f | e | ✅ | ✅ | ✅ ok | @c | 2026-01-01 | #3 | 1 | n |
"""
    rows, _ = sync_labels.parse_matrix(content)
    ids = [r.id for r in rows]
    assert ids == ["HD-A-001", "HD-C-001"]
    sections = [r.section for r in rows]
    assert sections == ["First", "Third"]


def test_parse_matrix_separator_lines_skipped(sync_labels):
    """Both `|---` and `| ---` separators must not be parsed as rows."""
    content = """\
## 1. T
| ID | F | E | M | A | S | O | L | I | W | N |
|---|---|---|---|---|---|---|---|---|---|---|
| HD-X-001 | f | e | ✅ | ✅ | ✅ ok | @a | 2026-01-01 | #1 | 1 | n |
"""
    rows, malformed = sync_labels.parse_matrix(content)
    assert len(rows) == 1
    assert malformed == []  # separator did not produce a malformed row


def test_parse_matrix_empty_input(sync_labels):
    rows, malformed = sync_labels.parse_matrix("")
    assert rows == []
    assert malformed == []


# ───────────────────────── parse_issue_labels ─────────────────────────

def test_parse_issue_labels_extracts_full_state(sync_labels):
    issue = {
        "number": 42,
        "html_url": "https://github.com/Latimer-Woods-Tech/HumanDesign/issues/42",
        "labels": [
            {"name": "feature:HD-AUTH-001"},
            {"name": "status:passing"},
            {"name": "weight:3"},
            {"name": "owner:@alice"},
        ],
    }
    state = sync_labels.parse_issue_labels(issue)
    assert state is not None
    assert state.number == 42
    assert state.feature_id == "HD-AUTH-001"
    assert state.status == "✅"  # mapped from 'passing' → emoji
    assert state.weight == "3"
    assert state.owner == "@alice"


def test_parse_issue_labels_status_word_mapping(sync_labels):
    """All four legend words must map back to emojis."""
    cases = {
        "passing": "✅",
        "issues":  "⚠️",
        "fail":    "❌",
        "unknown": "🔍",
    }
    for word, emoji in cases.items():
        issue = {"number": 1, "labels": [
            {"name": "feature:HD-X-001"},
            {"name": f"status:{word}"},
        ]}
        state = sync_labels.parse_issue_labels(issue)
        assert state.status == emoji, f"{word} → expected {emoji}, got {state.status}"


def test_parse_issue_labels_returns_none_without_feature_id(sync_labels):
    """No feature: label → not tracked, return None."""
    issue = {"number": 1, "labels": [
        {"name": "status:passing"},
        {"name": "weight:3"},
    ]}
    assert sync_labels.parse_issue_labels(issue) is None


def test_parse_issue_labels_no_labels_at_all(sync_labels):
    assert sync_labels.parse_issue_labels({"number": 1, "labels": []}) is None
    assert sync_labels.parse_issue_labels({"number": 1}) is None  # labels key missing


def test_parse_issue_labels_owner_adds_at_prefix(sync_labels):
    """owner:alice (no @) → '@alice' in state."""
    issue = {"number": 1, "labels": [
        {"name": "feature:HD-X-001"},
        {"name": "owner:alice"},
    ]}
    state = sync_labels.parse_issue_labels(issue)
    assert state.owner == "@alice"


def test_parse_issue_labels_owner_preserves_at_prefix(sync_labels):
    issue = {"number": 1, "labels": [
        {"name": "feature:HD-X-001"},
        {"name": "owner:@alice"},
    ]}
    state = sync_labels.parse_issue_labels(issue)
    assert state.owner == "@alice"


def test_parse_issue_labels_weight_outside_range_dropped(sync_labels):
    """weight must be 1-5; 0, 6, 99, 'three' get dropped (state.weight is None)."""
    for bad in ("0", "6", "99", "three", ""):
        issue = {"number": 1, "labels": [
            {"name": "feature:HD-X-001"},
            {"name": f"weight:{bad}"},
        ]}
        state = sync_labels.parse_issue_labels(issue)
        assert state.weight is None, f"bad weight '{bad}' should be dropped, got {state.weight!r}"


def test_parse_issue_labels_weight_in_range(sync_labels):
    for good in ("1", "2", "3", "4", "5"):
        issue = {"number": 1, "labels": [
            {"name": "feature:HD-X-001"},
            {"name": f"weight:{good}"},
        ]}
        state = sync_labels.parse_issue_labels(issue)
        assert state.weight == good


def test_parse_issue_labels_unknown_status_word_drops(sync_labels):
    """status:reviewing isn't a legend word — state.status should be None."""
    issue = {"number": 1, "labels": [
        {"name": "feature:HD-X-001"},
        {"name": "status:reviewing"},
    ]}
    state = sync_labels.parse_issue_labels(issue)
    assert state is not None
    assert state.feature_id == "HD-X-001"
    assert state.status is None


def test_parse_issue_labels_preserves_all_label_names(sync_labels):
    """state.labels should carry the full list for downstream consumers."""
    issue = {"number": 1, "labels": [
        {"name": "feature:HD-X-001"},
        {"name": "status:passing"},
        {"name": "weight:3"},
        {"name": "owner:@alice"},
        {"name": "priority:P1"},  # not extracted but preserved
        {"name": "team:platform"},
    ]}
    state = sync_labels.parse_issue_labels(issue)
    assert state is not None
    assert "priority:P1" in state.labels
    assert "team:platform" in state.labels


def test_parse_issue_labels_ignores_non_dict_label_entries(sync_labels):
    """Labels with non-dict entries (api anomaly) shouldn't crash."""
    issue = {"number": 1, "labels": [
        {"name": "feature:HD-X-001"},
        "not-a-dict",  # malformed
        None,
        {"name": "status:passing"},
    ]}
    state = sync_labels.parse_issue_labels(issue)
    assert state is not None
    assert state.feature_id == "HD-X-001"
    assert state.status == "✅"
