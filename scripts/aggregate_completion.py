#!/usr/bin/env python3
"""
aggregate_completion.py — cross-repo completion tracker for Latimer-Woods-Tech.

Pulls FUNCTIONS_MATRIX.md from 5 repos, strictly parses rows, overlays:
  - Sentry overlay (unresolved 24h issues → ✅ → ⚠️ on endpoint match)
  - Actions overlay (latest workflow run on main; failure → 🚨 banner + CI-RED tag)
  - Smoke overlay (any workflow named *smoke*; red → prepend "❌ smoke red" to
    specified repo+section pairs)
  - Decay overlay (Last Verified > 30 days → 🔍 (auto-decay))

Writes docs/COMPLETION_TRACKER.md (human), docs/completion-tracker.json
(snapshot), docs/completion-tracker-history.jsonl (append). Sends Pushover
digest. Production-grade: typed, retries on 5xx, structured stderr logging.

Requires env:
  GITHUB_TOKEN, SENTRY_AUTH_TOKEN, PUSHOVER_USER, PUSHOVER_TOKEN, STRIPE_SECRET_KEY.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import urlencode

import urllib.error
import urllib.request
import base64 as _b64

# Type alias for dependency-injected fetch function (used in testing)
FetchFn = Callable[[str], tuple[int, bytes, dict[str, str]]]

# ---------- config ----------

REPOS: list[dict[str, str]] = [
    {"key": "HD", "name": "HumanDesign",          "repo": "Latimer-Woods-Tech/HumanDesign",          "matrix_path": "docs/FUNCTIONS_MATRIX.md"},
    {"key": "CC", "name": "capricast",            "repo": "Latimer-Woods-Tech/capricast",            "matrix_path": "docs/FUNCTIONS_MATRIX.md"},
    {"key": "FA", "name": "factory-admin-studio", "repo": "Latimer-Woods-Tech/Factory",              "matrix_path": "apps/admin-studio/docs/FUNCTIONS_MATRIX.md"},
    {"key": "CH", "name": "cypher-healing",       "repo": "Latimer-Woods-Tech/coh",       "matrix_path": "docs/FUNCTIONS_MATRIX.md"},
    {"key": "XC", "name": "xico-city",            "repo": "Latimer-Woods-Tech/xico-city",            "matrix_path": "docs/FUNCTIONS_MATRIX.md"},
]

SENTRY_ORG = "latwood-tech"
LEGEND = {"✅", "⚠️", "❌", "🔍"}
ID_RE = re.compile(r"^[A-Z]+-[A-Z0-9]+-\d+$")  # middle segment may contain digits (e.g., XC-S01-001)
DECAY_DAYS = 30

# Repos+section name substrings that should receive the "❌ smoke red" prepend
# when a workflow whose name contains "smoke" is red on main. Explicit, no
# inference — edit this list intentionally.
SMOKE_AFFECTED: list[tuple[str, str]] = [
    ("HD", "auth"), ("HD", "billing"), ("HD", "chart"), ("HD", "health"),
    ("CC", "auth"), ("CC", "billing"),
    ("FA", "auth"), ("FA", "health"),
    ("CH", "auth"), ("CH", "platform"),
    ("XC", "auth"),
]

# ---------- logging ----------

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("aggregate")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def jwarn(msg: str, /, **kw: Any) -> None:
    log.warning(json.dumps({"event": msg, **kw}))


def jerr(msg: str, /, **kw: Any) -> None:
    log.error(json.dumps({"event": msg, **kw}))


# ---------- http with retry on 5xx ----------

def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    max_retries: int = 4,
    timeout: int = 30,
) -> tuple[int, bytes, dict[str, str]]:
    """Single request with backoff on 5xx and 429. Returns (status, body, headers)."""
    last_status: int = 0
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(url, method=method, data=body, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read(), dict(resp.headers.items())
        except urllib.error.HTTPError as e:
            last_status = e.code
            if e.code in (429,) or 500 <= e.code < 600:
                wait = min(2 ** attempt, 30)
                jwarn("http_retry", url=url, status=e.code, attempt=attempt, wait=wait)
                time.sleep(wait)
                continue
            return e.code, e.read() if e.fp else b"", dict(e.headers.items()) if e.headers else {}
        except urllib.error.URLError as e:
            jwarn("http_urlerror", url=url, err=str(e.reason), attempt=attempt)
            time.sleep(min(2 ** attempt, 30))
    return last_status or 599, b"", {}


# ---------- data classes ----------

@dataclass
class Row:
    repo_key: str
    repo_name: str
    section: str
    line_no: int
    raw: str
    id: str = ""
    feature: str = ""
    endpoint: str = ""
    sentry_project: str = ""
    manual: str = ""
    automated: str = ""
    status: str = ""
    owner: str = ""
    last_verified: str = ""
    issue_pr: str = ""
    weight: int = 0
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    overlays: list[str] = field(default_factory=list)


@dataclass
class Malformed:
    repo_key: str
    matrix_path: str
    line_no: int
    raw: str
    reason: str


# ---------- parser ----------

HEADER_RE = re.compile(r"^\|\s*ID\s*\|", re.IGNORECASE)
SECTION_RE = re.compile(r"^##\s+\d*\.?\s*(.+?)\s*$")


def parse_matrix(repo_key: str, repo_name: str, content: str) -> tuple[list[Row], list[Malformed]]:
    rows: list[Row] = []
    malformed: list[Malformed] = []
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
        # split on pipes — drop leading/trailing empties from outer pipes
        parts = [p.strip() for p in raw.split("|")[1:-1]]
        if len(parts) != 12:
            malformed.append(Malformed(repo_key, repo_name, line_no, raw, f"expected 12 cells, got {len(parts)}"))
            continue
        rid, feat, ep, sentry_proj, manual, auto, status, owner, lv, issue, weight, notes = parts
        if not ID_RE.match(rid):
            malformed.append(Malformed(repo_key, repo_name, line_no, raw, f"id '{rid}' does not match ^[A-Z]+-[A-Z]+-\\d+$"))
            continue
        status_emoji = next((e for e in LEGEND if status.startswith(e)), None)
        if status_emoji is None:
            malformed.append(Malformed(repo_key, repo_name, line_no, raw, f"status '{status}' does not start with a legend emoji"))
            continue
        try:
            w = int(weight)
        except ValueError:
            malformed.append(Malformed(repo_key, repo_name, line_no, raw, f"weight '{weight}' is not an int"))
            continue
        rows.append(Row(
            repo_key=repo_key, repo_name=repo_name, section=section, line_no=line_no, raw=raw,
            id=rid, feature=feat, endpoint=ep, sentry_project=sentry_proj, manual=manual, automated=auto,
            status=status_emoji, owner=owner, last_verified=lv, issue_pr=issue,
            weight=w, notes=notes,
        ))
    return rows, malformed


# ---------- github ----------

def github_get(path: str, token: str, *, raw: bool = False, fetch_fn: FetchFn | None = None) -> tuple[int, bytes]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
        "User-Agent": "latwood-completion-aggregator",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    url = f"https://api.github.com{path}"
    if fetch_fn is None:
        status, body, _ = http_request(url, headers=headers)
    else:
        status, body, _ = fetch_fn(url)
    return status, body


def fetch_matrix(repo: str, matrix_path: str, token: str, fetch_fn: FetchFn | None = None) -> str | None:
    status, body = github_get(f"/repos/{repo}/contents/{matrix_path}", token, raw=True, fetch_fn=fetch_fn)
    if status != 200:
        jerr("fetch_matrix_fail", repo=repo, path=matrix_path, status=status)
        return None
    return body.decode("utf-8", errors="replace")


def fetch_latest_main_run(repo: str, token: str, fetch_fn: FetchFn | None = None) -> dict[str, Any] | None:
    status, body = github_get(
        f"/repos/{repo}/actions/runs?{urlencode({'branch':'main','status':'completed','per_page':1})}",
        token,
        fetch_fn=fetch_fn,
    )
    if status != 200:
        jerr("fetch_runs_fail", repo=repo, status=status)
        return None
    try:
        data = json.loads(body)
        runs = data.get("workflow_runs") or []
        return runs[0] if runs else None
    except json.JSONDecodeError:
        return None


def fetch_smoke_run(repo: str, token: str, fetch_fn: FetchFn | None = None) -> dict[str, Any] | None:
    """Find any workflow whose name contains 'smoke' and return latest main run."""
    status, body = github_get(f"/repos/{repo}/actions/workflows?per_page=100", token, fetch_fn=fetch_fn)
    if status != 200:
        return None
    try:
        wfs = json.loads(body).get("workflows", [])
    except json.JSONDecodeError:
        return None
    smoke = [w for w in wfs if "smoke" in (w.get("name") or "").lower()]
    if not smoke:
        return None
    wf = smoke[0]
    status, body = github_get(
        f"/repos/{repo}/actions/workflows/{wf['id']}/runs?{urlencode({'branch':'main','per_page':1})}",
        token,
        fetch_fn=fetch_fn,
    )
    if status != 200:
        return None
    try:
        runs = json.loads(body).get("workflow_runs") or []
        return runs[0] if runs else None
    except json.JSONDecodeError:
        return None


# ---------- sentry ----------



# ---------- extra signals ----------

def fetch_stripe_data(stripe_key: str, fetch_fn: FetchFn | None = None) -> dict[str, Any]:
    if not stripe_key:
        jwarn("stripe_skipped_no_key")
        return {"mrr": 0.0, "trials": 0, "new_charges_24h": 0}
    creds = _b64.b64encode(f"{stripe_key}:".encode()).decode()
    hdrs = {"Authorization": f"Basic {creds}", "User-Agent": "latwood-completion-aggregator"}

    def sg(path: str) -> dict[str, Any]:
        url = f"https://api.stripe.com/v1{path}"
        if fetch_fn is None:
            st, body, _ = http_request(url, headers=hdrs)
        else:
            st, body, _ = fetch_fn(url)
        if st != 200:
            jerr("stripe_fail", path=path, status=st)
            return {}
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}

    active = sg("/subscriptions?status=active&limit=100")
    mrr = sum(
        (s.get("plan") or {}).get("amount", 0) / 100
        for s in active.get("data", [])
        if (s.get("plan") or {}).get("interval") == "month"
    )
    trials = len(sg("/subscriptions?status=trialing&limit=100").get("data", []))
    cutoff = int((datetime.now(timezone.utc) - timedelta(hours=24)).timestamp())
    charges = sg(f"/charges?created[gte]={cutoff}&limit=25")
    new_24h = sum(1 for c in charges.get("data", []) if c.get("paid"))
    return {"mrr": mrr, "trials": trials, "new_charges_24h": new_24h}


def count_open_prs(token: str, fetch_fn: FetchFn | None = None) -> int:
    st, body = github_get(
        "/search/issues?" + urlencode({"q": "is:open is:pr org:Latimer-Woods-Tech", "per_page": 1}),
        token,
        fetch_fn=fetch_fn,
    )
    if st == 200:
        try:
            return json.loads(body).get("total_count", 0)
        except json.JSONDecodeError:
            pass
    return 0


def count_gap_p0_p1() -> tuple[int, int]:
    gap_path = Path("docs/GAP_REGISTER.md")
    if not gap_path.exists():
        return 0, 0
    content = gap_path.read_text()
    p0 = len(re.findall(r"[|][^|]*P0[^|]*[|]", content, re.IGNORECASE))
    p1 = len(re.findall(r"[|][^|]*P1[^|]*[|]", content, re.IGNORECASE))
    return p0, p1


def fetch_sentry_unresolved(token: str, project: str | None = None, fetch_fn: FetchFn | None = None) -> list[dict[str, Any]]:
    if not token:
        jwarn("sentry_skipped_no_token")
        return []
    # If project specified, query that project; otherwise query org-wide
    if project:
        url = f"https://sentry.io/api/0/organizations/{SENTRY_ORG}/projects/{project}/issues/?{urlencode({'statsPeriod':'24h','query':'is:unresolved'})}"
    else:
        url = f"https://sentry.io/api/0/organizations/{SENTRY_ORG}/issues/?{urlencode({'statsPeriod':'24h','query':'is:unresolved'})}"
    if fetch_fn is None:
        status, body, _ = http_request(url, headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "latwood-completion-aggregator",
        })
    else:
        status, body, _ = fetch_fn(url)
    if status != 200:
        jerr("sentry_fail", project=project, status=status)
        return []
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return []


def sentry_route_segments(issue: dict[str, Any]) -> list[str]:
    """Extract candidate route segments / file paths from a Sentry issue."""
    segs: set[str] = set()
    for key in ("culprit", "title", "metadata"):
        v = issue.get(key)
        if isinstance(v, str):
            segs.update(re.findall(r"/[A-Za-z0-9_\-./:]+", v))
        elif isinstance(v, dict):
            for vv in v.values():
                if isinstance(vv, str):
                    segs.update(re.findall(r"/[A-Za-z0-9_\-./:]+", vv))
    return [s for s in segs if len(s) > 2]


# ---------- overlays ----------

def apply_sentry_overlay(rows: list[Row], sentry_token: str, fetch_fn: FetchFn | None = None) -> None:
    # Group rows by sentry_project for per-project queries
    by_project: dict[str, list[Row]] = {}
    for r in rows:
        if r.sentry_project:
            by_project.setdefault(r.sentry_project, []).append(r)

    for project, project_rows in by_project.items():
        issues = fetch_sentry_unresolved(sentry_token, project=project, fetch_fn=fetch_fn)
        if not issues:
            continue
        # Build segments from issues
        segments: list[tuple[str, dict[str, Any]]] = []
        for iss in issues:
            for seg in sentry_route_segments(iss):
                segments.append((seg.lower(), iss))
        # Apply overlay to rows in this project
        for r in project_rows:
            if r.status != "✅":
                continue
            ep_lower = r.endpoint.lower()
            for seg, _iss in segments:
                if seg in ep_lower:
                    r.status = "⚠️"
                    r.overlays.append("sentry-open")
                    break


def apply_actions_overlay(rows: list[Row], red_repos: set[str]) -> None:
    for r in rows:
        if r.repo_key in red_repos and r.status == "✅":
            r.tags.append("CI-RED")


def apply_smoke_overlay(rows: list[Row], red_smoke_repos: set[str]) -> None:
    for r in rows:
        if r.repo_key not in red_smoke_repos:
            continue
        sec_low = r.section.lower()
        for repo_key, fragment in SMOKE_AFFECTED:
            if repo_key == r.repo_key and fragment in sec_low:
                r.notes = f"❌ smoke red — {r.notes}" if r.notes else "❌ smoke red"
                r.overlays.append("smoke-red")
                break


def apply_decay_overlay(rows: list[Row], today: datetime) -> None:
    for r in rows:
        try:
            d = datetime.strptime(r.last_verified, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if (today - d).days > DECAY_DAYS:
            r.status = "🔍"
            r.notes = f"(auto-decay) {r.notes}".strip()
            r.overlays.append("auto-decay")


# ---------- stats ----------

def status_counts(rows: Iterable[Row]) -> dict[str, int]:
    c = {"✅": 0, "⚠️": 0, "❌": 0, "🔍": 0}
    for r in rows:
        c[r.status] = c.get(r.status, 0) + 1
    c["total"] = sum(v for k, v in c.items() if k in LEGEND)
    return c


def pass_pct(rows: list[Row]) -> tuple[float, float, float]:
    """(pass_pct, pass_pct_of_known, weighted_pass_pct)"""
    total = len(rows)
    if total == 0:
        return 0.0, 0.0, 0.0
    passing = sum(1 for r in rows if r.status == "✅")
    unknown = sum(1 for r in rows if r.status == "🔍")
    known = total - unknown
    p = 100.0 * passing / total
    pk = 100.0 * passing / known if known else 0.0
    w_total = sum(r.weight for r in rows) or 1
    w_pass = sum(r.weight for r in rows if r.status == "✅")
    pw = 100.0 * w_pass / w_total
    return round(p, 1), round(pk, 1), round(pw, 1)


# ---------- diff vs previous ----------

def load_previous(snapshot_path: Path) -> dict[str, Any]:
    if not snapshot_path.exists():
        return {}
    try:
        return json.loads(snapshot_path.read_text())
    except json.JSONDecodeError:
        return {}


def diff_rows(prev: dict[str, Any], current: list[Row]) -> tuple[list[Row], list[Row]]:
    """Return (regressions, wins) — rows whose status changed in either direction."""
    prev_rows = {r["id"]: r["status"] for r in prev.get("rows", [])}
    regressions: list[Row] = []
    wins: list[Row] = []
    ranking = {"✅": 3, "⚠️": 2, "🔍": 1, "❌": 0}
    for r in current:
        prev_status = prev_rows.get(r.id)
        if prev_status is None:
            continue
        prev_score = ranking.get(prev_status, 1)
        cur_score = ranking.get(r.status, 1)
        if cur_score < prev_score:
            regressions.append(r)
        elif cur_score > prev_score:
            wins.append(r)
    # heaviest first
    regressions.sort(key=lambda x: -x.weight)
    wins.sort(key=lambda x: -x.weight)
    return regressions, wins


# ---------- render ----------

def render_markdown(
    rows: list[Row],
    malformed: list[Malformed],
    red_repos: set[str],
    red_smoke: set[str],
    prev: dict[str, Any],
    now: datetime,
) -> str:
    overall = pass_pct(rows)
    parts: list[str] = []
    parts.append("# Completion Tracker")
    parts.append(f"_Generated {now.isoformat(timespec='seconds')} by `scripts/aggregate_completion.py`._\n")
    if red_repos:
        parts.append(f"## 🚨 CI red on main: {', '.join(sorted(red_repos))}\n")
    parts.append("## Roll-up")
    parts.append("| Repo | ✅ | ⚠️ | ❌ | 🔍 | Total | Pass % | Pass % (known) | **Weighted** |")
    parts.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    by_repo: dict[str, list[Row]] = {}
    for r in rows:
        by_repo.setdefault(r.repo_key, []).append(r)
    for repo in REPOS:
        k = repo["key"]
        rs = by_repo.get(k, [])
        c = status_counts(rs)
        p, pk, pw = pass_pct(rs)
        prev_pw = (prev.get("repo_weighted") or {}).get(k)
        delta = f" (Δ{pw - prev_pw:+.1f})" if isinstance(prev_pw, (int, float)) else ""
        red = " 🚨" if k in red_repos else ""
        smoke = " 🟧smoke" if k in red_smoke else ""
        parts.append(f"| **{k}** {repo['name']}{red}{smoke} | {c['✅']} | {c['⚠️']} | {c['❌']} | {c['🔍']} | {c['total']} | {p:.1f}% | {pk:.1f}% | **{pw:.1f}%**{delta} |")
    prev_overall = prev.get("overall_weighted")
    delta_overall = f" (Δ{overall[2] - prev_overall:+.1f})" if isinstance(prev_overall, (int, float)) else ""
    parts.append(f"\n**Overall weighted pass: {overall[2]:.1f}%{delta_overall}** · known: {overall[1]:.1f}% · raw: {overall[0]:.1f}%\n")

    regressions, wins = diff_rows(prev, rows)
    if wins:
        parts.append("### ↑ Top wins")
        for r in wins[:5]:
            parts.append(f"- `{r.id}` ({r.repo_key}) — {r.feature} (weight {r.weight}) → {r.status}")
        parts.append("")
    if regressions:
        parts.append("### ↓ Top regressions")
        for r in regressions[:5]:
            parts.append(f"- `{r.id}` ({r.repo_key}) — {r.feature} (weight {r.weight}) → {r.status}")
        parts.append("")

    for repo in REPOS:
        k = repo["key"]
        rs = by_repo.get(k, [])
        if not rs:
            continue
        parts.append(f"## {k} — {repo['name']}")
        sec_groups: dict[str, list[Row]] = {}
        for r in rs:
            sec_groups.setdefault(r.section, []).append(r)
        for section, section_rows in sec_groups.items():
            sc = status_counts(section_rows)
            _, _, pw = pass_pct(section_rows)
            parts.append(f"### {section} — {pw:.1f}% weighted ({sc['✅']}✅ {sc['⚠️']}⚠️ {sc['❌']}❌ {sc['🔍']}🔍)")
            parts.append("| ID | Feature | Status | W | Tags | Overlays |")
            parts.append("|---|---|---|---:|---|---|")
            for r in section_rows:
                tags = ",".join(r.tags) or "—"
                ov = ",".join(r.overlays) or "—"
                parts.append(f"| `{r.id}` | {r.feature} | {r.status} | {r.weight} | {tags} | {ov} |")
            parts.append("")

    if malformed:
        parts.append("## Malformed rows (skipped from aggregate)")
        for m in malformed:
            parts.append(f"- `{m.repo_key}` {m.matrix_path}:{m.line_no} — {m.reason}")
        parts.append("")

    return "\n".join(parts) + "\n"


# ---------- pushover ----------

def send_pushover(text: str, user: str, token: str, fetch_fn: FetchFn | None = None) -> None:
    if not user or not token:
        jwarn("pushover_skipped_no_creds")
        return
    body = urlencode({"user": user, "token": token, "message": text, "title": "Completion tracker"}).encode()
    url = "https://api.pushover.net/1/messages.json"
    if fetch_fn is None:
        status, resp, _ = http_request(
            url,
            method="POST",
            body=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    else:
        status, resp, _ = fetch_fn(url)
    if status != 200:
        jerr("pushover_fail", status=status, body=resp[:200].decode("utf-8", "replace"))


def render_pushover(
    rows: list[Row],
    prev: dict[str, Any],
    red_ci: set[str],
    red_smoke: set[str],
    sentry_issues: list[dict[str, Any]],
    extra: dict[str, Any],
    now: datetime,
) -> str:
    """Rich morning digest: completion, velocity, CI, Sentry, revenue, PRs."""
    try:
        et = now.astimezone(timezone(timedelta(hours=-4)))
        day_str = et.strftime("%Y-%m-%d · %a %b %-d · %-I:%M %p ET")
    except Exception:
        day_str = now.strftime("%Y-%m-%d %H:%M UTC")

    overall = pass_pct(rows)
    prev_overall = prev.get("overall_weighted") or 0.0
    delta = overall[2] - prev_overall
    sign = "+" if delta >= 0 else ""

    by_repo: dict[str, list[Row]] = {}
    for r in rows:
        by_repo.setdefault(r.repo_key, []).append(r)
    prev_repo = prev.get("repo_weighted") or {}
    repo_chunks: list[str] = []
    for repo in REPOS:
        k = repo["key"]
        rs = by_repo.get(k, [])
        if not rs:
            repo_chunks.append(k + "—")
            continue
        _, _, pw = pass_pct(rs)
        d = pw - (prev_repo.get(k) or 0.0)
        arrow = "↑" if d > 0.5 else ("↓" if d < -0.5 else "=")
        badge = "🔴" if k in red_ci else ("🟠" if k in red_smoke else "")
        repo_chunks.append(k + " " + str(int(pw)) + arrow + badge)

    regressions, wins = diff_rows(prev, rows)
    win_str = " · ".join(w.feature for w in wins[:3]) or "none today"
    reg_str = " · ".join(r.feature for r in regressions[:3]) or "none today"

    ci_parts: list[str] = []
    if red_ci:
        ci_parts.append("🔴 CI: " + ", ".join(sorted(red_ci)))
    if red_smoke:
        ci_parts.append("🟠 Smoke: " + ", ".join(sorted(red_smoke)))
    ci_line = " · ".join(ci_parts) if ci_parts else "✅ CI clean"

    sc = len(sentry_issues)
    sentry_line = "🐛 Sentry: " + (str(sc) + " open" if sc else "clean")

    mrr = extra.get("mrr", 0.0)
    trials = extra.get("trials", 0)
    new_24h = extra.get("new_charges_24h", 0)
    rev = "💰 MRR $" + str(int(mrr))
    if trials:
        rev += " · " + str(trials) + " trialing"
    if new_24h:
        rev += " · " + str(new_24h) + " new today 🎉"
    elif not mrr and not trials:
        rev += " · no revenue yet"

    prs = extra.get("open_prs", "?")
    p0 = extra.get("p0_gaps", "?")
    p1 = extra.get("p1_gaps", "?")
    pr_line = "📋 " + str(prs) + " PRs · P0: " + str(p0) + " · P1: " + str(p1)

    parts = [
        "LatWood · " + day_str,
        "📊 " + str(round(overall[2], 1)) + "% (" + sign + str(round(delta, 1)) + ") · known " + str(round(overall[1], 1)) + "%",
        "  ".join(repo_chunks),
        "↑ " + win_str,
        "↓ " + reg_str,
        ci_line,
        sentry_line,
        rev,
        pr_line,
    ]
    return "\n".join(parts)

# ---------- main ----------

def main(fetch_fn: FetchFn | None = None) -> int:
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        jerr("missing_github_token")
        return 2
    sentry_token = os.environ.get("SENTRY_AUTH_TOKEN", "")
    pushover_user = os.environ.get("PUSHOVER_USER", "")
    pushover_token = os.environ.get("PUSHOVER_TOKEN", "")
    out_dir = Path(os.environ.get("OUTPUT_DIR", "docs"))
    out_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    all_rows: list[Row] = []
    all_malformed: list[Malformed] = []
    red_ci: set[str] = set()
    red_smoke: set[str] = set()

    for repo in REPOS:
        jlog("fetch_repo", repo=repo["repo"])
        content = fetch_matrix(repo["repo"], repo["matrix_path"], token, fetch_fn=fetch_fn)
        if content is None:
            continue
        rows, malformed = parse_matrix(repo["key"], repo["name"], content)
        for m in malformed:
            m.matrix_path = repo["matrix_path"]
        all_rows.extend(rows)
        all_malformed.extend(malformed)
        jlog("parsed", repo=repo["key"], rows=len(rows), malformed=len(malformed))

        # actions overlay
        latest = fetch_latest_main_run(repo["repo"], token, fetch_fn=fetch_fn)
        if latest and latest.get("conclusion") == "failure":
            red_ci.add(repo["key"])
        # smoke overlay
        smoke = fetch_smoke_run(repo["repo"], token, fetch_fn=fetch_fn)
        if smoke and smoke.get("conclusion") == "failure":
            red_smoke.add(repo["key"])

    # Fail loud: zero rows across every repo means the fetch or parse layer is
    # broken (e.g. auth regression), not that completion is 0. Publishing a
    # 0-row snapshot as truth froze the tracker at 0.0% for 17 days once
    # (2026-05-25 → 2026-06-11). Never again.
    if not all_rows:
        jerr("no_rows_any_repo", repos=[r["repo"] for r in REPOS])
        return 1

    # sentry overlay (per-project)
    apply_sentry_overlay(all_rows, sentry_token, fetch_fn=fetch_fn)
    apply_actions_overlay(all_rows, red_ci)
    apply_smoke_overlay(all_rows, red_smoke)
    apply_decay_overlay(all_rows, now)

    # fetch unresolved issues for digest rendering (org-wide)
    issues = fetch_sentry_unresolved(sentry_token, fetch_fn=fetch_fn)

    # prev snapshot
    prev_path = out_dir / "completion-tracker.json"
    prev = load_previous(prev_path)

    # write outputs
    md = render_markdown(all_rows, all_malformed, red_ci, red_smoke, prev, now)
    (out_dir / "COMPLETION_TRACKER.md").write_text(md, encoding='utf-8')

    overall = pass_pct(all_rows)
    by_repo_w: dict[str, float] = {}
    for repo in REPOS:
        rs = [r for r in all_rows if r.repo_key == repo["key"]]
        by_repo_w[repo["key"]] = pass_pct(rs)[2] if rs else 0.0

    snapshot = {
        "generated_at": now.isoformat(),
        "overall_weighted": overall[2],
        "overall_known": overall[1],
        "overall_raw": overall[0],
        "repo_weighted": by_repo_w,
        "ci_red": sorted(red_ci),
        "smoke_red": sorted(red_smoke),
        "rows": [asdict(r) for r in all_rows],
        "malformed": [asdict(m) for m in all_malformed],
    }
    prev_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding='utf-8')

    # history append
    history_path = out_dir / "completion-tracker-history.jsonl"
    with history_path.open("a") as fp:
        fp.write(json.dumps({
            "ts": now.isoformat(),
            "overall_weighted": overall[2],
            "overall_known": overall[1],
            "repo_weighted": by_repo_w,
            "ci_red": sorted(red_ci),
            "smoke_red": sorted(red_smoke),
            "malformed_count": len(all_malformed),
        }) + "\n")

    # extra signals for the rich digest
    stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
    stripe_data = fetch_stripe_data(stripe_key, fetch_fn=fetch_fn)
    open_prs = count_open_prs(token, fetch_fn=fetch_fn)
    p0_gaps, p1_gaps = count_gap_p0_p1()
    extra = {
        "mrr": stripe_data.get("mrr", 0.0),
        "trials": stripe_data.get("trials", 0),
        "new_charges_24h": stripe_data.get("new_charges_24h", 0),
        "open_prs": open_prs,
        "p0_gaps": p0_gaps,
        "p1_gaps": p1_gaps,
    }

    # pushover
    send_pushover(
        render_pushover(all_rows, prev, red_ci, red_smoke, issues, extra, now),
        pushover_user,
        pushover_token,
        fetch_fn=fetch_fn,
    )

    jlog("done", overall=overall[2], rows=len(all_rows), malformed=len(all_malformed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
