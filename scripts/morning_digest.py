#!/usr/bin/env python3
"""
morning_digest.py — single Pushover digest that answers all 5 Stage 2
questions in one message.

Reads the snapshots already landing daily on main and emits ONE
human-readable Pushover. Runs after the upstream digests so all four
sources are fresh:

  06:37 UTC  cost-observability.yml      → docs/cost/summary.json
  07:07 UTC  revenue-digest.yml          → docs/revenue/summary.json
  07:37 UTC  launch-readiness.yml        → docs/scorecard/summary.json
  ??         aggregate_completion.py     → docs/completion-tracker.json
  08:00 UTC  THIS

  The completion tracker has its own cadence — we read whatever's freshest.

The individual workflows keep their own Pushover sends for traceability
and direct debugging; this is the morning roll-up that pairs the
day-over-day delta with concrete asks (PRs needing your merge button).

Output:
  • Pushover priority-0 message (or priority-1 if score dropped by >5)
  • docs/digest/<YYYY-MM-DD>.md            human-readable copy
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SNAP_DIR = ROOT / "docs" / "digest"
CONFORMANCE = ROOT / "docs" / "conformance" / "summary.json"
COMPLETION = ROOT / "docs" / "completion-tracker.json"
COST = ROOT / "docs" / "cost" / "summary.json"
REVENUE = ROOT / "docs" / "revenue" / "summary.json"
SCORECARD = ROOT / "docs" / "scorecard" / "summary.json"

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("digest")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def jwarn(msg: str, /, **kw: Any) -> None:
    log.warning(json.dumps({"event": msg, **kw}))


def _load_json(p: Path) -> dict[str, Any] | None:
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _previous_scorecard(today: str) -> dict[str, Any] | None:
    """Find yesterday's per-app scores by reading the most recent snapshot
    other than today's. Used to compute day-over-day delta."""
    d = ROOT / "docs" / "scorecard"
    if not d.exists():
        return None
    snapshots = sorted(d.glob("????-??-??.json"))
    # Filter out today's
    snapshots = [p for p in snapshots if p.stem != today]
    if not snapshots:
        return None
    return _load_json(snapshots[-1])


def _http_get_json(url: str, *, headers: dict[str, str] | None = None,
                   timeout: int = 20) -> Any | None:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read())
    except (urllib.error.HTTPError, urllib.error.URLError,
            json.JSONDecodeError, TimeoutError):
        return None


def _open_pr_asks() -> tuple[int, list[dict[str, Any]]]:
    """Pull open non-draft PRs in the Factory repo.

    Returns (total_open_non_draft, oldest_first_list). Uses GitHub Search
    API's `total_count` for the true count and sorts by `created` ascending
    so the result starts with the oldest PRs — the ones most likely to
    need user attention.

    Uses GH_TOKEN if present, falls back to unauthenticated public read.
    """
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    # Search API: total_count is authoritative; `draft:false` excludes drafts
    # so we don't have to paginate just to filter them.
    q = "repo:Latimer-Woods-Tech/Factory is:pr is:open draft:false"
    url = ("https://api.github.com/search/issues?per_page=30&sort=created&order=asc"
           f"&q={urlencode({'q': q})[2:]}")
    payload = _http_get_json(url, headers=headers)
    if not payload:
        return 0, []
    total = int(payload.get("total_count") or 0)
    asks: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        labels = [l.get("name") for l in item.get("labels", [])]
        age_days = max(0, int((datetime.now(timezone.utc)
                               - datetime.fromisoformat(item["created_at"]
                                                       .replace("Z", "+00:00"))).days))
        asks.append({
            "number": item["number"],
            "title": item["title"],
            "age_days": age_days,
            "is_high_risk": "risk:high" in labels,
        })
    return total, asks


def _fmt_money(usd: float) -> str:
    return f"${usd:,.2f}"


def render(today: str) -> tuple[str, int, str]:
    """Return (pushover_body, pushover_priority, markdown_for_file)."""
    scorecard = _load_json(SCORECARD) or {}
    prev = _previous_scorecard(today) or {}
    cost = _load_json(COST) or {}
    revenue = _load_json(REVENUE) or {}
    completion = _load_json(COMPLETION) or {}

    org_now = float(scorecard.get("org_composite") or 0)
    org_prev = float(prev.get("org_composite") or 0) if prev else None
    delta = (org_now - org_prev) if org_prev is not None else None
    delta_str = ""
    priority = 0
    if delta is not None:
        if delta >= 1:
            delta_str = f" (▲{delta:.1f})"
        elif delta <= -1:
            delta_str = f" (▼{abs(delta):.1f})"
            if delta <= -5:
                priority = 1
        else:
            delta_str = " (flat)"

    # Cost line (yesterday's UTC day)
    dailies = cost.get("daily_totals") or []
    cost_yday = float(dailies[-1].get("total_usd") or 0) if dailies else 0
    cost_30d = sum(float(d.get("total_usd") or 0) for d in dailies)

    # Revenue line
    mrr_now = float(revenue.get("mrr_now_usd") or 0)
    mrr_delta_pct = revenue.get("mrr_delta_pct")
    arr = float(revenue.get("arr_estimate_usd") or 0)

    # Completion line
    overall = float(completion.get("overall_weighted") or 0)

    # Per-app — top + bottom
    apps = scorecard.get("apps") or []
    apps_sorted = sorted(apps, key=lambda a: -float(a.get("composite") or 0))
    top = apps_sorted[0] if apps_sorted else {}
    bot = apps_sorted[-1] if apps_sorted else {}

    # Open PR asks — total comes from Search total_count; list is already
    # sorted oldest-first by the API.
    total_open, asks = _open_pr_asks()
    high_risk_awaiting = [a for a in asks if a["is_high_risk"]]
    oldest = asks[:3]

    # Body
    lines = [
        f"Factory health: {org_now:.1f}/100{delta_str}",
        "",
        f"Yesterday: spent {_fmt_money(cost_yday)} · MRR {_fmt_money(mrr_now)}"
        + (f" ({mrr_delta_pct:+.1f}%)" if mrr_delta_pct is not None else "")
        + f" · ARR {_fmt_money(arr)} · completion {overall:.0f}%",
    ]
    if top and bot:
        lines.append(f"Top: {top.get('repo_name','?')} {float(top.get('composite') or 0):.0f}"
                     f"  ·  Bot: {bot.get('repo_name','?')} {float(bot.get('composite') or 0):.0f}")
    lines.append("")
    if total_open > 0 and oldest:
        lines.append(f"Open PRs: {total_open} (oldest:")
        for a in oldest:
            tag = " [risk:high]" if a["is_high_risk"] else ""
            title = (a["title"][:50] + "…") if len(a["title"]) > 50 else a["title"]
            lines.append(f"  #{a['number']} {a['age_days']}d{tag}: {title}")
        lines.append(")")
    else:
        lines.append(f"Open PRs: {total_open}")

    # Markdown copy
    md = [
        f"# Morning digest — {today}",
        "",
        f"**Factory health: {org_now:.1f} / 100**{delta_str}",
        "",
        "## Composite breakdown",
        "",
    ]
    for app in apps_sorted:
        md.append(f"- {app.get('repo_name','?')} ({app.get('repo_key','?')}): "
                  f"**{float(app.get('composite') or 0):.1f}**")
    md.extend([
        "",
        "## Yesterday's headline numbers",
        "",
        f"- Spent: {_fmt_money(cost_yday)}",
        f"- MRR: {_fmt_money(mrr_now)} → ARR {_fmt_money(arr)}"
        + (f" ({mrr_delta_pct:+.1f}% over 30d)" if mrr_delta_pct is not None else ""),
        f"- Cost 30-day window: {_fmt_money(cost_30d)}",
        f"- Completion (weighted): {overall:.1f}%",
        "",
        "## Open PRs",
        "",
    ])
    if total_open > 0 and asks:
        md.insert(-1, f"_{total_open} total open · showing oldest {min(15, len(asks))}_")
        md.insert(-1, "")
        for a in asks[:15]:
            tag = " 🔴" if a["is_high_risk"] else ""
            md.append(f"- #{a['number']} ({a['age_days']}d){tag} — {a['title']}")
    else:
        md.append(f"- {total_open} open")

    return "\n".join(lines), priority, "\n".join(md) + "\n"


def push_pushover(message: str, *, title: str, priority: int = 0) -> None:
    user = os.environ.get("PUSHOVER_USER")
    token = os.environ.get("PUSHOVER_TOKEN")
    if not user or not token:
        jwarn("pushover_skipped", reason="missing_creds")
        return
    data = urlencode({
        "token": token,
        "user": user,
        "title": title,
        "message": message,
        "priority": str(priority),
        # priority 1 is "high"; user gets an audible alert
    }).encode()
    req = urllib.request.Request(
        "https://api.pushover.net/1/messages.json",
        method="POST",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                jwarn("pushover_failed", status=resp.status)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        jwarn("pushover_error", err=str(e))


def write_snapshot(date_str: str, md: str) -> Path:
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    p = SNAP_DIR / f"{date_str}.md"
    p.write_text(md, encoding="utf-8")
    return p


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 2 morning digest")
    parser.add_argument("--date", help="Reporting day (YYYY-MM-DD UTC). Default: today.")
    parser.add_argument("--pushover", action="store_true", help="Send Pushover digest")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print body to stdout; don't write file or send.")
    args = parser.parse_args()

    today = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    body, priority, md = render(today)

    if args.dry_run:
        print(body)
        return 0

    p = write_snapshot(today, md)
    jlog("digest_written", path=str(p), priority=priority)
    if args.pushover:
        push_pushover(body, title=f"Factory · {today}", priority=priority)
    return 0


if __name__ == "__main__":
    sys.exit(main())
