#!/usr/bin/env python3
"""
init-matrix-issues.py — idempotently open one GitHub Issue per matrix row.

For every row in a FUNCTIONS_MATRIX.md, create (or update labels on) an Issue:
  title:  [<ID>] <Feature>
  body:   formatted row contents + traceability footer
  labels: feature:<ID>, status:<passing|issues|fail|unknown>, weight:<n>,
          (optional) owner:<handle>

Idempotent: existing issues identified by the `feature:<ID>` label are not
recreated; labels are reconciled instead. Run once per repo to seed the
label-driven loop maintained by `label-sync.yml`.

Requires env `GITHUB_TOKEN` with `repo` scope (or App token with Issues:write).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ID_RE = re.compile(r"^[A-Z]+-[A-Z0-9]+-\d+$")
LEGEND = {"✅": "passing", "⚠️": "issues", "❌": "fail", "🔍": "unknown"}
HEADER_RE = re.compile(r"^\|\s*ID\s*\|", re.IGNORECASE)


def gh(method: str, path: str, token: str, body: dict[str, Any] | None = None) -> tuple[int, Any]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "init-matrix-issues",
    }
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"https://api.github.com{path}", method=method, headers=headers, data=data)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code in (429,) or 500 <= e.code < 600:
                time.sleep(min(2 ** attempt, 30))
                continue
            return e.code, json.loads(e.read()) if e.fp else None
    return 599, None


def parse_rows(content: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    section = ""
    in_table = False
    for line in content.splitlines():
        sm = re.match(r"^##\s+\d*\.?\s*(.+?)\s*$", line)
        if sm:
            section = sm.group(1).strip()
            in_table = False
            continue
        if HEADER_RE.match(line):
            in_table = True
            continue
        if line.startswith("|---") or line.startswith("| ---"):
            continue
        if not line.startswith("|") or not in_table:
            in_table = in_table and line.startswith("|")
            continue
        parts = [p.strip() for p in line.split("|")[1:-1]]
        if len(parts) != 11:
            continue
        rid = parts[0]
        if not ID_RE.match(rid):
            continue
        status_emoji = next((e for e in LEGEND if parts[5].startswith(e)), None)
        if status_emoji is None:
            continue
        rows.append({
            "section": section,
            "id": rid, "feature": parts[1], "endpoint": parts[2],
            "manual": parts[3], "automated": parts[4],
            "status": status_emoji, "owner": parts[6], "last_verified": parts[7],
            "issue_pr": parts[8], "weight": parts[9], "notes": parts[10],
        })
    return rows


def ensure_labels(repo: str, token: str, labels: list[tuple[str, str]]) -> None:
    """Create labels if missing. labels = [(name, color_hex)]."""
    for name, color in labels:
        status, _ = gh("POST", f"/repos/{repo}/labels", token, {"name": name, "color": color})
        if status not in (201, 422):  # 422 = already exists
            print(f"[warn] label create {name} → {status}", file=sys.stderr)


def find_issue_by_feature_label(repo: str, token: str, feature_id: str) -> dict[str, Any] | None:
    q = urllib.parse.quote(f'repo:{repo} is:issue label:"feature:{feature_id}"')
    status, body = gh("GET", f"/search/issues?q={q}&per_page=1", token)
    if status != 200 or not body:
        return None
    items = body.get("items") or []
    return items[0] if items else None


def issue_body(row: dict[str, str], repo: str, matrix_path: str) -> str:
    return f"""**Feature**: {row['feature']}
**Section**: {row['section']}
**Endpoint/Component**: {row['endpoint']}
**Manual Test**: {row['manual']}
**Automated Test**: {row['automated']}
**Status**: {row['status']} ({LEGEND[row['status']]})
**Owner**: {row['owner']}
**Last Verified**: {row['last_verified']}
**Weight**: {row['weight']}
**Notes**: {row['notes']}

---
_Row tracked from `{matrix_path}` in `{repo}`. Edit the `status:*` label here to drive a matrix PR._
"""


def reconcile_labels(repo: str, token: str, number: int, want: list[str], remove_prefixes: tuple[str, ...]) -> None:
    status, body = gh("GET", f"/repos/{repo}/issues/{number}/labels", token)
    if status != 200:
        return
    current = {lbl["name"] for lbl in (body or [])}
    # remove anything in the managed prefixes that we don't want
    for name in current:
        if any(name.startswith(p) for p in remove_prefixes) and name not in want:
            gh("DELETE", f"/repos/{repo}/issues/{number}/labels/{urllib.parse.quote(name)}", token)
    # add anything missing
    missing = [w for w in want if w not in current]
    if missing:
        gh("POST", f"/repos/{repo}/issues/{number}/labels", token, {"labels": missing})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="owner/name, e.g. Latimer-Woods-Tech/HumanDesign")
    ap.add_argument("--matrix", required=True, help="path to FUNCTIONS_MATRIX.md in the repo")
    ap.add_argument("--file", help="local path to read instead of fetching from repo")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("missing GITHUB_TOKEN", file=sys.stderr)
        return 2

    if args.file:
        content = open(args.file).read()
    else:
        status, body = gh("GET", f"/repos/{args.repo}/contents/{args.matrix}", token)
        if status != 200 or not body or "content" not in body:
            print(f"failed to fetch matrix: {status}", file=sys.stderr)
            return 3
        import base64
        content = base64.b64decode(body["content"]).decode("utf-8", "replace")

    rows = parse_rows(content)
    print(f"parsed {len(rows)} rows from {args.matrix}", file=sys.stderr)

    ensure_labels(args.repo, token, [
        ("feature:*", "0E8A16"),  # placeholder; per-feature labels created on the fly
        ("status:passing", "0E8A16"),
        ("status:issues",  "FBCA04"),
        ("status:fail",    "B60205"),
        ("status:unknown", "D4C5F9"),
        ("weight:1", "C2E0C6"),
        ("weight:2", "C2E0C6"),
        ("weight:3", "BFD4F2"),
        ("weight:4", "FEF2C0"),
        ("weight:5", "F9D0C4"),
    ])

    created = 0
    updated = 0
    for row in rows:
        feature_label = f"feature:{row['id']}"
        ensure_labels(args.repo, token, [(feature_label, "5319E7")])
        status_label = f"status:{LEGEND[row['status']]}"
        weight_label = f"weight:{row['weight']}"
        wants = [feature_label, status_label, weight_label]
        owner = (row.get("owner") or "").strip()
        if owner.startswith("@"):
            wants.append(f"owner:{owner}")

        existing = find_issue_by_feature_label(args.repo, token, row["id"])
        title = f"[{row['id']}] {row['feature']}"
        body = issue_body(row, args.repo, args.matrix)
        if existing:
            number = existing["number"]
            if args.dry_run:
                print(f"would update #{number} ({row['id']})")
                continue
            reconcile_labels(args.repo, token, number, wants, ("status:", "weight:", "owner:"))
            gh("PATCH", f"/repos/{args.repo}/issues/{number}", token, {"title": title, "body": body})
            updated += 1
        else:
            if args.dry_run:
                print(f"would create issue for {row['id']}")
                continue
            status, _ = gh("POST", f"/repos/{args.repo}/issues", token,
                           {"title": title, "body": body, "labels": wants})
            if status == 201:
                created += 1
            else:
                print(f"[warn] create failed {row['id']} → {status}", file=sys.stderr)

    print(f"created={created} updated={updated}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
