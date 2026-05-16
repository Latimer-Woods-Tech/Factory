#!/usr/bin/env python3
"""
revenue_digest.py — Stage 2 M3 revenue + reliability digest.

Captures the two Stage 2 signals the cost digest doesn't capture:
  • Stripe MRR  — sum of unit_amount × quantity across active subscriptions
  • Sentry user-facing error rate — errors with a user.id over 24h

The cost digest already tracks daily Stripe `charge` balance transactions
(the "buying today?" snapshot). MRR answers the durable Stage 2 question
"staying?" — and user-facing error rate answers "shipping right?" from the
customer's seat (vs. internal error volume).

Output:
  docs/revenue/<YYYY-MM-DD>.json    Daily snapshot
  docs/revenue/summary.json         Rolling 30-day window + month-over-month
  docs/revenue/summary.md           Human-readable

Requires env (each optional — missing creds → skipped, not failed):
  STRIPE_API_KEY                            Stripe (active subscriptions)
  SENTRY_AUTH_TOKEN, SENTRY_ORG             Sentry org stats
  POSTHOG_API_KEY, POSTHOG_PROJECT_ID       (optional) PostHog funnel
  PUSHOVER_USER, PUSHOVER_TOKEN             (optional) digest send

Usage:
  python scripts/revenue_digest.py                # full snapshot
  python scripts/revenue_digest.py --date 2026-05-14
  python scripts/revenue_digest.py --provider stripe
  python scripts/revenue_digest.py --pushover
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import urllib.error
import urllib.request

PROVIDERS = ("stripe_mrr", "sentry_users", "posthog_funnel")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "revenue"

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("revenue")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def jwarn(msg: str, /, **kw: Any) -> None:
    log.warning(json.dumps({"event": msg, **kw}))


def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    max_retries: int = 4,
    timeout: int = 30,
) -> tuple[int, bytes]:
    """Same retry semantics as cost_digest.http_request — kept duplicated to
    avoid coupling Stage 2 to Stage 1 file structure during shadow mode."""
    last_status = 0
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(url, method=method, data=body, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            last_status = e.code
            if e.code in (429,) or 500 <= e.code < 600:
                wait = min(2 ** attempt, 30)
                jwarn("http_retry", url=url, status=e.code, attempt=attempt, wait=wait)
                time.sleep(wait)
                continue
            return e.code, e.read() if e.fp else b""
        except urllib.error.URLError as e:
            jwarn("http_urlerror", url=url, err=str(e.reason), attempt=attempt)
            time.sleep(min(2 ** attempt, 30))
    return last_status or 599, b""


@dataclass
class RevenueLine:
    provider: str
    label: str
    metric: str           # 'usd' | 'count' | 'ratio'
    value: float
    detail: dict[str, Any] = field(default_factory=dict)
    skipped: bool = False
    skip_reason: str = ""


@dataclass
class RevenueDigest:
    date: str
    generated: str
    lines: list[RevenueLine] = field(default_factory=list)


def collect_stripe_mrr(_target_day: str) -> list[RevenueLine]:
    """Sum active subscriptions → monthly recurring revenue (USD).

    Stripe `subscriptions.list?status=active` paginates via `starting_after`.
    For each subscription, MRR contribution = sum(items[*].price.unit_amount
    × items[*].quantity), normalised by `price.recurring.interval`:
      - 'month' → as-is
      - 'year'  → divided by 12
      - 'week'  → multiplied by ~4.345
      - 'day'   → multiplied by ~30.44
    """
    key = os.environ.get("STRIPE_API_KEY")
    if not key:
        return [RevenueLine("stripe_mrr", "Active subscription MRR", "usd", 0.0,
                            skipped=True, skip_reason="missing STRIPE_API_KEY")]

    interval_to_monthly = {"month": 1.0, "year": 1.0 / 12.0,
                           "week": 4.34524, "day": 30.4368}
    mrr_cents = 0
    sub_count = 0
    by_product: dict[str, int] = {}
    starting_after: str | None = None
    pages = 0

    while True:
        qs = {"status": "active", "limit": 100, "expand[]": "data.items.data.price"}
        if starting_after:
            qs["starting_after"] = starting_after
        url = "https://api.stripe.com/v1/subscriptions?" + urlencode(qs)
        status, body = http_request(url, headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        })
        if status != 200:
            return [RevenueLine("stripe_mrr", "Active subscription MRR", "usd", 0.0,
                                skipped=True, skip_reason=f"API status {status}")]
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return [RevenueLine("stripe_mrr", "Active subscription MRR", "usd", 0.0,
                                skipped=True, skip_reason="unexpected response shape")]

        subs = data.get("data") or []
        for sub in subs:
            sub_count += 1
            items = (sub.get("items") or {}).get("data") or []
            for it in items:
                qty = int(it.get("quantity") or 1)
                price = it.get("price") or {}
                unit = int(price.get("unit_amount") or 0)
                recurring = price.get("recurring") or {}
                interval = recurring.get("interval") or "month"
                interval_count = int(recurring.get("interval_count") or 1)
                multiplier = interval_to_monthly.get(interval, 1.0) / max(interval_count, 1)
                contrib_cents = int(round(unit * qty * multiplier))
                mrr_cents += contrib_cents
                product = price.get("product") or "unknown"
                by_product[product] = by_product.get(product, 0) + contrib_cents

        pages += 1
        if not data.get("has_more") or not subs:
            break
        if pages >= 50:
            # Safety cap. 50 pages × 100 subs/page = 5,000 active subs. Above
            # that the number is incomplete; surface it loudly rather than
            # silently undercount MRR.
            jwarn("stripe_mrr_truncated", pages=pages, last_id=subs[-1].get("id"))
            mrr_usd = round(mrr_cents / 100.0, 2)
            return [RevenueLine(
                "stripe_mrr", "Active subscription MRR", "usd", mrr_usd,
                detail={
                    "subscription_count": sub_count,
                    "pages_fetched": pages,
                    "by_product_cents": by_product,
                    "arr_estimate_usd": round(mrr_usd * 12, 2),
                    "truncated": True,
                    "next_starting_after": subs[-1].get("id"),
                },
                skipped=True,
                skip_reason="pagination cap hit (>5,000 active subs) — value incomplete",
            )]
        starting_after = subs[-1].get("id")

    mrr_usd = round(mrr_cents / 100.0, 2)
    return [RevenueLine(
        "stripe_mrr", "Active subscription MRR", "usd", mrr_usd,
        detail={
            "subscription_count": sub_count,
            "pages_fetched": pages,
            "by_product_cents": by_product,
            "arr_estimate_usd": round(mrr_usd * 12, 2),
            "truncated": False,
        },
    )]


def collect_sentry_user_errors(target_day: str) -> list[RevenueLine]:
    """User-facing error rate = errors-with-user.id / sessions over the day.

    Sentry stats_v2 with `category=error` gives total error volume; the user
    breakdown requires events/discover-style queries. For shadow mode we
    report two metrics separately and let the digest reader compute the rate:
      - errors_24h (count)
      - errors_with_user_24h (count, filtered by has:user.id)

    True user-impact-rate (errors/sessions) requires PostHog session count
    or Sentry session-replay totals — wired in next iteration.
    """
    token = os.environ.get("SENTRY_AUTH_TOKEN")
    org = os.environ.get("SENTRY_ORG", "latwood-tech")
    if not token:
        return [RevenueLine("sentry_users", "User-facing errors (24h)", "count", 0.0,
                            skipped=True, skip_reason="missing SENTRY_AUTH_TOKEN")]

    # Total errors — explicit window so the result is deterministic for a
    # given --date and matches the user-filtered query below. Sentry expects
    # ISO 8601 with `Z`; URL-encode safely.
    day = datetime.strptime(target_day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start_iso = day.isoformat().replace("+00:00", "Z")
    end_iso = (day + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    stats_qs = urlencode({
        "start": start_iso,
        "end": end_iso,
        "interval": "1d",
        "field": "sum(quantity)",
        "category": "error",
    })
    total_url = f"https://sentry.io/api/0/organizations/{org}/stats_v2/?{stats_qs}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    status, body = http_request(total_url, headers=headers)
    if status != 200:
        return [RevenueLine("sentry_users", "User-facing errors (24h)", "count", 0.0,
                            skipped=True, skip_reason=f"stats_v2 status {status}")]
    try:
        data = json.loads(body)
        total_errors = int(sum(g.get("totals", {}).get("sum(quantity)", 0)
                               for g in data.get("groups", [])))
    except (json.JSONDecodeError, ValueError, TypeError, KeyError):
        return [RevenueLine("sentry_users", "User-facing errors (24h)", "count", 0.0,
                            skipped=True, skip_reason="unexpected stats_v2 shape")]

    # Errors with user.id — events search via the discover-like endpoint.
    # urlencode handles +00:00 in ISO timestamps (a literal `+` in a query
    # string would be parsed as a space by Sentry's URL parser).
    user_qs = urlencode({
        "field": "count()",
        "query": "event.type:error has:user.id",
        "start": start_iso,
        "end": end_iso,
    })
    user_url = f"https://sentry.io/api/0/organizations/{org}/events/?{user_qs}"
    status2, body2 = http_request(user_url, headers=headers)
    user_errors = 0
    if status2 == 200:
        try:
            data2 = json.loads(body2)
            for row in data2.get("data", []) or []:
                user_errors += int(row.get("count()", 0) or 0)
        except (json.JSONDecodeError, ValueError, TypeError):
            user_errors = 0

    ratio = round(user_errors / total_errors, 4) if total_errors > 0 else 0.0
    return [
        RevenueLine("sentry_users", "Total errors (24h)", "count", float(total_errors)),
        RevenueLine("sentry_users", "User-facing errors (24h)", "count", float(user_errors),
                    detail={"ratio_user_to_total": ratio}),
    ]


def collect_posthog_funnel(target_day: str) -> list[RevenueLine]:
    """PostHog conversion rate for the primary monetization funnel.

    Funnel definition lives in PostHog (managed via issue #657 G34). The
    script reads a configured funnel by `POSTHOG_FUNNEL_ID` and reports
    conversion ratio + step counts.
    """
    key = os.environ.get("POSTHOG_API_KEY")
    project = os.environ.get("POSTHOG_PROJECT_ID")
    funnel_id = os.environ.get("POSTHOG_FUNNEL_ID")
    if not key or not project or not funnel_id:
        return [RevenueLine("posthog_funnel", "Monetization funnel conversion", "ratio", 0.0,
                            skipped=True,
                            skip_reason="missing POSTHOG_API_KEY/PROJECT_ID/FUNNEL_ID")]

    url = (
        f"https://app.posthog.com/api/projects/{project}/insights/funnel/?id={funnel_id}"
        f"&date_from={target_day}&date_to={target_day}"
    )
    status, body = http_request(url, headers={
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    if status != 200:
        return [RevenueLine("posthog_funnel", "Monetization funnel conversion", "ratio", 0.0,
                            skipped=True, skip_reason=f"API status {status}")]
    try:
        data = json.loads(body)
        steps = data.get("result", []) or []
        if not steps:
            raise ValueError("empty result")
        entered = int(steps[0].get("count", 0) or 0)
        converted = int(steps[-1].get("count", 0) or 0)
        ratio = round(converted / entered, 4) if entered > 0 else 0.0
        return [RevenueLine(
            "posthog_funnel", "Monetization funnel conversion", "ratio", ratio,
            detail={"step_counts": [int(s.get("count", 0) or 0) for s in steps],
                    "entered": entered, "converted": converted},
        )]
    except (json.JSONDecodeError, ValueError, TypeError, KeyError) as e:
        return [RevenueLine("posthog_funnel", "Monetization funnel conversion", "ratio", 0.0,
                            skipped=True, skip_reason=f"parse error: {e}")]


PROVIDER_FNS = {
    "stripe_mrr": collect_stripe_mrr,
    "sentry_users": collect_sentry_user_errors,
    "posthog_funnel": collect_posthog_funnel,
}


def write_daily_snapshot(digest: RevenueDigest) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    p = OUT_DIR / f"{digest.date}.json"
    p.write_text(json.dumps(asdict(digest), indent=2) + "\n", encoding="utf-8")
    return p


def rebuild_summary() -> dict[str, Any]:
    if not OUT_DIR.exists():
        return {}
    snapshots: list[RevenueDigest] = []
    for p in sorted(OUT_DIR.glob("????-??-??.json")):
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            lines = [RevenueLine(**l) for l in raw.get("lines", [])]
            snapshots.append(RevenueDigest(date=raw["date"], generated=raw["generated"], lines=lines))
        except Exception:  # noqa: BLE001
            continue
    last_30 = snapshots[-30:]

    def latest(provider: str, label_contains: str | None = None) -> float:
        for d in reversed(last_30):
            for l in d.lines:
                if l.skipped or l.provider != provider:
                    continue
                if label_contains and label_contains not in l.label:
                    continue
                return l.value
        return 0.0

    mrr_now = latest("stripe_mrr", "MRR")
    mrr_30d_ago = 0.0
    if len(last_30) >= 30:
        for l in last_30[0].lines:
            if not l.skipped and l.provider == "stripe_mrr" and "MRR" in l.label:
                mrr_30d_ago = l.value
                break
    mrr_delta = round(mrr_now - mrr_30d_ago, 2)
    mrr_delta_pct = round((mrr_delta / mrr_30d_ago * 100), 1) if mrr_30d_ago > 0 else None

    summary = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "window_days": len(last_30),
        "mrr_now_usd": mrr_now,
        "mrr_30d_ago_usd": mrr_30d_ago,
        "mrr_delta_usd": mrr_delta,
        "mrr_delta_pct": mrr_delta_pct,
        "arr_estimate_usd": round(mrr_now * 12, 2),
        "user_facing_errors_latest": latest("sentry_users", "User-facing"),
        "total_errors_latest": latest("sentry_users", "Total"),
        "funnel_conversion_latest": latest("posthog_funnel"),
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    md = [
        "# Revenue + Reliability Digest — Stage 2",
        "",
        f"*Generated: {summary['generated']}*",
        "",
        "## The 5 Stage 2 questions",
        "",
        "| Question | Metric | Today |",
        "|---|---|--:|",
        f"| Are people buying? | New charges (24h) | (see cost digest) |",
        f"| Are people staying? | MRR (USD) | ${mrr_now:,.2f} |",
        f"| Are we shipping right? | User-facing errors (24h) | {int(summary['user_facing_errors_latest'])} |",
        f"| Are we shipping? | (completion tracker) | (see completion digest) |",
        f"| Is it affordable? | (cost digest) | (see cost digest) |",
        "",
        "## MRR trend",
        "",
        f"- Now: **${mrr_now:,.2f}** (ARR ${summary['arr_estimate_usd']:,.2f})",
        f"- 30d ago: ${mrr_30d_ago:,.2f}",
        f"- Delta: ${mrr_delta:+,.2f}"
        + (f" ({mrr_delta_pct:+.1f}%)" if mrr_delta_pct is not None else ""),
        "",
        "## Reliability",
        "",
        f"- User-facing error events (24h): {int(summary['user_facing_errors_latest'])}",
        f"- Total error events (24h): {int(summary['total_errors_latest'])}",
        f"- Funnel conversion (latest): {summary['funnel_conversion_latest']:.2%}",
    ]
    (OUT_DIR / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return summary


def push_pushover(digest: RevenueDigest) -> None:
    user = os.environ.get("PUSHOVER_USER")
    token = os.environ.get("PUSHOVER_TOKEN")
    if not user or not token:
        jwarn("pushover_skipped", reason="missing_creds")
        return
    parts: list[str] = []
    for l in digest.lines:
        if l.skipped:
            continue
        if l.metric == "usd":
            parts.append(f"{l.label}: ${l.value:,.2f}")
        elif l.metric == "ratio":
            parts.append(f"{l.label}: {l.value:.2%}")
        else:
            parts.append(f"{l.label}: {int(l.value)}")
    data = urlencode({
        "token": token, "user": user,
        "title": f"Revenue digest — {digest.date}",
        "message": "\n".join(parts) or "(no data)",
    }).encode()
    status, _ = http_request(
        "https://api.pushover.net/1/messages.json",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=data,
    )
    if status != 200:
        jwarn("pushover_failed", status=status)


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 2 revenue + reliability digest")
    parser.add_argument("--date", help="Day to report (YYYY-MM-DD UTC). Default: today.")
    parser.add_argument("--provider", choices=PROVIDERS, help="Single provider")
    parser.add_argument("--pushover", action="store_true", help="Send Pushover digest")
    args = parser.parse_args()

    # MRR is point-in-time (current active subs), so default is "today" not yesterday.
    target = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    providers = (args.provider,) if args.provider else PROVIDERS

    digest = RevenueDigest(date=target, generated=datetime.now(timezone.utc).isoformat())
    for p in providers:
        try:
            digest.lines.extend(PROVIDER_FNS[p](target))
        except Exception as e:  # noqa: BLE001
            log.error(json.dumps({"event": "provider_failed", "provider": p, "err": str(e)}))
            digest.lines.append(RevenueLine(p, "error", "count", 0.0,
                                            skipped=True, skip_reason=str(e)))

    snapshot_path = write_daily_snapshot(digest)
    jlog("revenue_digest_written", path=str(snapshot_path))
    rebuild_summary()

    if args.pushover:
        push_pushover(digest)

    return 0


if __name__ == "__main__":
    sys.exit(main())
