#!/usr/bin/env python3
"""
sync_labels_to_matrix.py — inverse of init-matrix-issues.py.

For every repo in the label-sync config, this script:
  1. Fetches FUNCTIONS_MATRIX.md from `main`.
  2. Parses rows strictly into the 11-cell schema (same parser semantics as
     init-matrix-issues.py / aggregate_completion.py — redefined locally
     because the sibling script's filename uses a hyphen and cannot be
     imported without importlib gymnastics).
  3. Fetches every open Issue in the repo that carries a `feature:<ID>`
     label (paged), and derives the intended row state from:
        status:passing|issues|fail|unknown  →  ✅ / ⚠️ / ❌ / 🔍
        weight:N                             →  weight cell
        owner:@handle                        →  owner cell (co-owners preserved)
     Issue URL → `Issue/PR` cell. Last Verified is bumped to today ONLY when
     the row's status actually changes.
  4. Diffs desired vs current; if any row would change, opens a PR on the
     target repo with branch `auto/label-sync-YYYYMMDD-HHMM` and a single
     commit `chore(matrix): sync from issue labels`. The PR body is a diff
     table `| ID | Field | Was | Now | Issue |`. Labels: automation,
     documentation, auto-merge. Reviewer: adrper79-dot.
  5. Logs orphans (matrix rows with no issue, issues whose feature label
     points at a non-existent matrix ID).
  6. Emits a structured JSON summary on stdout (last line).

Idempotent: if nothing has changed, zero PRs are opened.

Contract with label-sync.yml:
    python scripts/sync_labels_to_matrix.py --config <path.yml> [--dry-run]

Env:
    GITHUB_TOKEN  — app-minted token with repo+issues scope across all 5
                    repos (provided by actions/create-github-app-token
                    upstream; this script does NOT mint tokens).
    GH_TOKEN      — mirrored so the `gh` CLI picks up the same creds.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import yaml  # installed by label-sync.yml (`pip install pyyaml`)

# ---------- logging (match aggregate_completion.py style) ----------

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("label-sync")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def jwarn(msg: str, /, **kw: Any) -> None:
    log.warning(json.dumps({"event": msg, **kw}))


def jerr(msg: str, /, **kw: Any) -> None:
    log.error(json.dumps({"event": msg, **kw}))


# ---------- constants (match init-matrix-issues.py) ----------

ID_RE = re.compile(r"^[A-Z]+-[A-Z0-9]+-\d+$")
HEADER_RE = re.compile(r"^\|\s*ID\s*\|", re.IGNORECASE)
SECTION_RE = re.compile(r"^##\s+\d*\.?\s*(.+?)\s*$")
LEGEND = {"✅": "passing", "⚠️": "issues", "❌": "fail", "🔍": "unknown"}
STATUS_TO_EMOJI = {v: k for k, v in LEGEND.items()}
BOT_OWNER = "@factory-cross-repo[bot]"


# ---------- gh API helper (redefined from init-matrix-issues.py) ----------

def gh(method: str, path: str, token: str, body: dict[str, Any] | None = None) -> tuple[int, Any]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "sync-labels-to-matrix",
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
            payload = None
            if e.fp:
                try:
                    payload = json.loads(e.read())
                except Exception:
                    payload = None
            return e.code, payload
        except urllib.error.URLError as e:
            jwarn("http_urlerror", path=path, err=str(e.reason), attempt=attempt)
            time.sleep(min(2 ** attempt, 30))
    return 599, None


def gh_raw(path: str, token: str) -> tuple[int, bytes]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "sync-labels-to-matrix",
    }
    req = urllib.request.Request(f"https://api.github.com{path}", headers=headers)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (429,) or 500 <= e.code < 600:
                time.sleep(min(2 ** attempt, 30))
                continue
            return e.code, b""
        except urllib.error.URLError:
            time.sleep(min(2 ** attempt, 30))
    return 599, b""


# ---------- row model ----------

@dataclass
class MatrixRow:
    """One parsed row with full positional metadata so we can rewrite in place."""
    line_no: int                    # 1-based
    raw: str                        # original line, verbatim
    cells: list[str]                # 11 stripped cells
    section: str
    id: str
    feature: str
    endpoint: str
    manual: str
    automated: str
    status: str                     # emoji only
    status_suffix: str              # any trailing text after emoji in the status cell
    owner: str
    last_verified: str
    issue_pr: str
    weight: str                     # kept as string to preserve formatting
    notes: str


def parse_matrix(content: str) -> tuple[list[MatrixRow], list[tuple[int, str, str]]]:
    """Strict 11-cell parser. Returns (rows, malformed=[(line_no, raw, reason)])."""
    rows: list[MatrixRow] = []
    malformed: list[tuple[int, str, str]] = []
    section = ""
    in_table = False
    for line_no, raw in enumerate(content.splitlines(), 1):
        sm = SECTION_RE.match(raw)
        if sm:
            section = sm.group(1).strip()
            in_table = False
            continue
        if HEADER_RE.match(raw):
            in_table = True
            continue
        if raw.startswith("|---") or raw.startswith("| ---"):
            continue
        if not raw.startswith("|"):
            in_table = False
            continue
        if not in_table:
            continue
        parts = [p.strip() for p in raw.split("|")[1:-1]]
        if len(parts) != 11:
            malformed.append((line_no, raw, f"expected 11 cells, got {len(parts)}"))
            continue
        rid = parts[0]
        if not ID_RE.match(rid):
            malformed.append((line_no, raw, f"id '{rid}' invalid"))
            continue
        status_cell = parts[5]
        status_emoji = next((e for e in LEGEND if status_cell.startswith(e)), None)
        if status_emoji is None:
            malformed.append((line_no, raw, f"status '{status_cell}' missing legend emoji"))
            continue
        status_suffix = status_cell[len(status_emoji):].lstrip()
        rows.append(MatrixRow(
            line_no=line_no, raw=raw, cells=parts, section=section,
            id=rid, feature=parts[1], endpoint=parts[2],
            manual=parts[3], automated=parts[4],
            status=status_emoji, status_suffix=status_suffix,
            owner=parts[6], last_verified=parts[7],
            issue_pr=parts[8], weight=parts[9], notes=parts[10],
        ))
    return rows, malformed


# ---------- issue label parsing ----------

@dataclass
class IssueState:
    number: int
    url: str
    feature_id: str
    status: str | None = None       # emoji or None
    weight: str | None = None
    owner: str | None = None        # with leading @
    labels: list[str] = field(default_factory=list)


def parse_issue_labels(
    issue: dict[str, Any],
    *,
    feature_prefix: str = "feature:",
    status_prefix: str = "status:",
    weight_prefix: str = "weight:",
    owner_prefix: str = "owner:",
    status_to_emoji: dict[str, str] | None = None,
) -> IssueState | None:
    _s2e = status_to_emoji if status_to_emoji is not None else STATUS_TO_EMOJI
    labels = [lbl["name"] for lbl in issue.get("labels", []) if isinstance(lbl, dict)]
    feature_id: str | None = None
    status_emoji: str | None = None
    weight: str | None = None
    owner: str | None = None
    for name in labels:
        if name.startswith(feature_prefix):
            feature_id = name[len(feature_prefix):].strip()
        elif name.startswith(status_prefix):
            key = name[len(status_prefix):].strip().lower()
            status_emoji = _s2e.get(key)
        elif name.startswith(weight_prefix):
            w = name[len(weight_prefix):].strip()
            if w.isdigit() and 1 <= int(w) <= 5:
                weight = w
        elif name.startswith(owner_prefix):
            o = name[len(owner_prefix):].strip()
            if o and not o.startswith("@"):
                o = "@" + o
            owner = o
    if not feature_id:
        return None
    return IssueState(
        number=int(issue["number"]),
        url=issue.get("html_url", ""),
        feature_id=feature_id,
        status=status_emoji,
        weight=weight,
        owner=owner,
        labels=labels,
    )


def fetch_feature_issues(repo: str, token: str, *, labels_cfg: dict[str, str] | None = None) -> list[IssueState]:
    """Page through open issues with any `feature:*` label. The list endpoint
    supports passing a single label; we list all and filter client-side to
    catch the whole feature:* family without N+1 label calls."""
    _lcfg = labels_cfg or {}
    feature_prefix = _lcfg.get("feature_prefix", "feature:")
    status_prefix = _lcfg.get("status_prefix", "status:")
    weight_prefix = _lcfg.get("weight_prefix", "weight:")
    owner_prefix = _lcfg.get("owner_prefix", "owner:")
    status_map = _lcfg.get("status_map")
    status_to_emoji: dict[str, str] | None = None
    if isinstance(status_map, dict):
        status_to_emoji = {k: v for k, v in status_map.items()}
    out: list[IssueState] = []
    page = 1
    while True:
        q = urllib.parse.urlencode({
            "state": "open",
            "per_page": "100",
            "page": str(page),
        })
        status, body = gh("GET", f"/repos/{repo}/issues?{q}", token)
        if status != 200 or not isinstance(body, list):
            jerr("issue_list_fail", repo=repo, page=page, status=status)
            break
        if not body:
            break
        for issue in body:
            # list endpoint returns PRs too; skip them
            if "pull_request" in issue:
                continue
            st = parse_issue_labels(
                issue,
                feature_prefix=feature_prefix,
                status_prefix=status_prefix,
                weight_prefix=weight_prefix,
                owner_prefix=owner_prefix,
                status_to_emoji=status_to_emoji,
            )
            if st is not None:
                out.append(st)
        if len(body) < 100:
            break
        page += 1
        if page > 50:
            jwarn("issue_list_page_cap", repo=repo)
            break
    return out


# ---------- desired-state diff ----------

@dataclass
class Change:
    row_id: str
    field: str
    was: str
    now: str
    issue_url: str


def _merge_owner(current: str, desired_primary: str | None) -> str:
    """If desired_primary is set, replace the primary (non-bot) owner while
    preserving the @factory-cross-repo[bot] co-owner if present."""
    if desired_primary is None:
        return current
    has_bot = BOT_OWNER in current
    if has_bot:
        return f"{desired_primary}, {BOT_OWNER}"
    return desired_primary


def diff_row(row: MatrixRow, issue: IssueState, today_iso: str) -> tuple[list[Change], list[str]]:
    """Return (changes, new_cells). new_cells is None-equivalent when no change."""
    new_cells = list(row.cells)
    changes: list[Change] = []

    # status
    if issue.status and issue.status != row.status:
        new_cells[5] = issue.status  # drop any trailing suffix intentionally
        changes.append(Change(row.id, "Status", row.status, issue.status, issue.url))
        # bump last verified only on status change
        if row.last_verified != today_iso:
            new_cells[7] = today_iso
            changes.append(Change(row.id, "Last Verified", row.last_verified, today_iso, issue.url))

    # weight
    if issue.weight is not None and issue.weight != row.weight:
        new_cells[9] = issue.weight
        changes.append(Change(row.id, "Weight", row.weight, issue.weight, issue.url))

    # owner
    if issue.owner is not None:
        desired = _merge_owner(row.owner, issue.owner)
        if desired != row.owner:
            new_cells[6] = desired
            changes.append(Change(row.id, "Owner", row.owner, desired, issue.url))

    # issue/pr cell — always reflect the owning issue URL
    if issue.url and row.issue_pr.strip() != issue.url:
        new_cells[8] = issue.url
        changes.append(Change(row.id, "Issue/PR", row.issue_pr, issue.url, issue.url))

    return changes, new_cells


def render_row(cells: list[str]) -> str:
    """Re-render row using single-space padding (matches existing matrices)."""
    return "| " + " | ".join(cells) + " |"


# ---------- PR creation via gh CLI ----------

def run(cmd: list[str], *, cwd: str | None = None, check: bool = True, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, env=env)
    if check and proc.returncode != 0:
        jerr("subprocess_fail", cmd=cmd, rc=proc.returncode,
             stdout=proc.stdout[-400:], stderr=proc.stderr[-400:])
        raise RuntimeError(f"{cmd[0]} failed ({proc.returncode})")
    return proc


def open_pr_for_repo(
    repo: str,
    matrix_path: str,
    new_content: str,
    changes: list[Change],
    pr_cfg: dict[str, Any],
    now: datetime,
) -> str | None:
    """Clone the repo shallow, commit the edited matrix on a fresh branch,
    push, and open a PR via `gh`. Returns the PR URL or None on failure."""
    branch_prefix = pr_cfg.get("branch_prefix", "matrix-sync/")
    branch = f"{branch_prefix}{now.strftime('%Y%m%d-%H%M')}"
    commit_msg = "chore(matrix): sync from issue labels"
    base = pr_cfg.get("base", "main")
    labels = pr_cfg.get("labels") or ["automation", "documentation", "auto-merge"]
    reviewer = "adrper79-dot"

    # PR body
    body_lines = [
        "Automated sync: issue labels → FUNCTIONS_MATRIX.md.",
        "",
        "| ID | Field | Was | Now | Issue |",
        "|---|---|---|---|---|",
    ]
    for c in changes:
        was = (c.was or "—").replace("|", "&#124;")
        now_ = (c.now or "—").replace("|", "&#124;")
        body_lines.append(f"| `{c.row_id}` | {c.field} | {was} | {now_} | {c.issue_url or '—'} |")
    pr_body = "\n".join(body_lines) + "\n"

    with TemporaryDirectory(prefix="lsync-") as td:
        clone_url = f"https://github.com/{repo}.git"
        # Pass the token via GIT_CONFIG environment variables instead of
        # embedding it in the clone URL, to avoid the credential appearing in
        # logs or error output.
        token = os.environ.get("GITHUB_TOKEN", "")
        auth_env = os.environ.copy()
        auth_env["GIT_CONFIG_COUNT"] = "1"
        auth_env["GIT_CONFIG_KEY_0"] = "http.https://github.com/.extraHeader"
        auth_env["GIT_CONFIG_VALUE_0"] = f"Authorization: Bearer {token}"
        try:
            run(["git", "clone", "--depth", "1", "--branch", base, clone_url, td], env=auth_env)
            run(["git", "-C", td, "checkout", "-b", branch], env=auth_env)
            target = Path(td) / matrix_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(new_content, encoding="utf-8")
            run(["git", "-C", td, "config", "user.name", "factory-cross-repo[bot]"])
            run(["git", "-C", td, "config", "user.email",
                 "factory-cross-repo[bot]@users.noreply.github.com"])
            run(["git", "-C", td, "add", matrix_path])
            # If nothing actually changed on disk, bail idempotently.
            diff = run(["git", "-C", td, "diff", "--cached", "--name-only"], check=False)
            if not diff.stdout.strip():
                jlog("pr_noop_after_clone", repo=repo)
                return None
            run(["git", "-C", td, "commit", "-m", commit_msg])
            run(["git", "-C", td, "push", "-u", "origin", branch], env=auth_env)
            pr = run([
                "gh", "pr", "create",
                "--repo", repo,
                "--base", base,
                "--head", branch,
                "--title", commit_msg,
                "--body", pr_body,
                "--label", ",".join(labels),
                "--reviewer", reviewer,
            ])
            url = pr.stdout.strip().splitlines()[-1] if pr.stdout.strip() else None
            jlog("pr_opened", repo=repo, branch=branch, url=url)
            return url
        except Exception as e:
            jerr("pr_open_fail", repo=repo, err=str(e))
            return None


# ---------- per-repo reconcile ----------

def reconcile_repo(
    repo_cfg: dict[str, Any],
    token: str,
    pr_cfg: dict[str, Any],
    labels_cfg: dict[str, Any],
    now: datetime,
    dry_run: bool,
) -> dict[str, Any]:
    repo = repo_cfg["repo"]
    matrix_path = repo_cfg["matrix_path"]
    jlog("reconcile_start", repo=repo)

    status, blob = gh_raw(f"/repos/{repo}/contents/{matrix_path}", token)
    if status != 200:
        jerr("matrix_fetch_fail", repo=repo, status=status)
        return {"changed": 0, "orphans_matrix": [], "orphans_issue": [], "pr_url": None, "error": f"fetch {status}"}
    content = blob.decode("utf-8", "replace")

    rows, malformed = parse_matrix(content)
    if malformed:
        for line_no, _, reason in malformed:
            jwarn("matrix_malformed", repo=repo, line=line_no, reason=reason)
    rows_by_id: dict[str, MatrixRow] = {r.id: r for r in rows}

    issues = fetch_feature_issues(repo, token, labels_cfg=labels_cfg)
    issues_by_id: dict[str, IssueState] = {}
    issues_seen: dict[str, list[int]] = {}  # track duplicates
    issue_orphans: list[str] = []
    for iss in issues:
        if iss.feature_id in rows_by_id:
            if iss.feature_id in issues_seen:
                issues_seen[iss.feature_id].append(iss.number)
            else:
                issues_seen[iss.feature_id] = [iss.number]
                issues_by_id[iss.feature_id] = iss
        else:
            issue_orphans.append(iss.feature_id)

    for fid, nums in issues_seen.items():
        if len(nums) > 1:
            jwarn("duplicate_feature_label", repo=repo, feature_id=fid, issue_numbers=nums)

    matrix_orphans = [rid for rid in rows_by_id if rid not in issues_by_id]

    today_iso = now.strftime("%Y-%m-%d")
    all_changes: list[Change] = []
    # map: line_no → new_cells
    replacements: dict[int, list[str]] = {}
    for rid, iss in issues_by_id.items():
        row = rows_by_id[rid]
        changes, new_cells = diff_row(row, iss, today_iso)
        if changes:
            all_changes.extend(changes)
            replacements[row.line_no] = new_cells

    if not replacements:
        jlog("reconcile_noop", repo=repo,
             matrix_orphans=len(matrix_orphans), issue_orphans=len(issue_orphans))
        return {
            "changed": 0,
            "orphans_matrix": matrix_orphans,
            "orphans_issue": issue_orphans,
            "pr_url": None,
        }

    # rewrite content line by line
    new_lines: list[str] = []
    for line_no, raw in enumerate(content.splitlines(), 1):
        if line_no in replacements:
            new_lines.append(render_row(replacements[line_no]))
        else:
            new_lines.append(raw)
    # preserve trailing newline if the original had one
    new_content = "\n".join(new_lines) + ("\n" if content.endswith("\n") else "")

    if dry_run:
        jlog("reconcile_dry_run", repo=repo, changes=len(all_changes))
        return {
            "changed": len(all_changes),
            "orphans_matrix": matrix_orphans,
            "orphans_issue": issue_orphans,
            "pr_url": None,
            "dry_run": True,
        }

    pr_url = open_pr_for_repo(repo, matrix_path, new_content, all_changes, pr_cfg, now)
    return {
        "changed": len(all_changes),
        "orphans_matrix": matrix_orphans,
        "orphans_issue": issue_orphans,
        "pr_url": pr_url,
    }


# ---------- entrypoint ----------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", required=True, help="path to label-sync-config.yml")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        jerr("missing_github_token")
        return 2
    # mirror to GH_TOKEN so `gh` CLI authenticates without extra setup
    os.environ.setdefault("GH_TOKEN", token)

    try:
        cfg = yaml.safe_load(Path(args.config).read_text())
    except Exception as e:
        jerr("config_load_fail", err=str(e))
        return 3

    repos = cfg.get("repos") or []
    pr_cfg = cfg.get("pr") or {}
    labels_cfg: dict[str, Any] = {}
    if isinstance(cfg.get("labels"), dict):
        labels_cfg.update(cfg["labels"])
    if isinstance(cfg.get("status_map"), dict):
        labels_cfg["status_map"] = cfg["status_map"]
    now = datetime.now(timezone.utc)

    summary: dict[str, Any] = {}
    for repo_cfg in repos:
        key = repo_cfg.get("key") or repo_cfg["repo"].split("/")[-1]
        try:
            summary[key] = reconcile_repo(repo_cfg, token, pr_cfg, labels_cfg, now, args.dry_run)
        except Exception as e:
            jerr("reconcile_crash", repo=repo_cfg.get("repo"), err=str(e))
            summary[key] = {
                "changed": 0, "orphans_matrix": [], "orphans_issue": [],
                "pr_url": None, "error": str(e),
            }

    # final structured summary — last line of stdout for the workflow to parse
    print(json.dumps(summary, ensure_ascii=False))
    jlog("done", repos=len(repos),
         total_changes=sum(r.get("changed", 0) for r in summary.values()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
