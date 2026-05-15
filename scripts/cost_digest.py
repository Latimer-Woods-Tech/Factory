#!/usr/bin/env python3
"""
cost_digest.py — Stage 1 M2 cost observability for Latimer-Woods-Tech.

Collects daily $ figures across 5 cost centers and emits a digest:
  • Cloudflare (Workers + R2 + KV + D1 + Queues; billing API)
  • Anthropic  (LLM tokens; usage API)
  • Sentry     (event ingestion; org stats endpoint)
  • Stripe     (no platform cost; we track GROSS REVENUE in same digest)
  • GCP        (Cloud Run + Cloud Logging; billing API)

Output:
  docs/cost/<YYYY-MM-DD>.json    Daily snapshot
  docs/cost/summary.json         Rolling 30-day window
  docs/cost/summary.md           Human-readable trends
  Pushover digest (optional, --pushover)

This is *shadow / observation* mode. There is no enforcement until Stage 4.
Per ROADMAP cost ceiling: $50 Anthropic + $0 GitHub Actions during Stage 1.

Requires env (each provider is optional — missing creds → skipped, not failed):
  CF_API_TOKEN, CF_ACCOUNT_ID                  Cloudflare
  ANTHROPIC_ADMIN_KEY                          Anthropic admin API
  SENTRY_AUTH_TOKEN                            Sentry
  STRIPE_API_KEY                               Stripe
  GCP_BILLING_TOKEN, GCP_BILLING_ACCOUNT_ID    GCP billing
  PUSHOVER_USER, PUSHOVER_TOKEN                (optional) digest

Usage:
  python scripts/cost_digest.py                # one-day snapshot, all providers
  python scripts/cost_digest.py --date 2026-05-14
  python scripts/cost_digest.py --pushover     # send digest after collection
  python scripts/cost_digest.py --provider anthropic   # single provider
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

# ───────────── config ─────────────

PROVIDERS = ("cloudflare", "anthropic", "sentry", "stripe", "gcp")
ANTHROPIC_DAILY_CAP_USD = 50  # ROADMAP Stage 1 ceiling

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "cost"

# ───────────── logging ─────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("cost")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def jwarn(msg: str, /, **kw: Any) -> None:
    log.warning(json.dumps({"event": msg, **kw}))


def jerr(msg: str, /, **kw: Any) -> None:
    log.error(json.dumps({"event": msg, **kw}))


# ───────────── http ─────────────

def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    max_retries: int = 4,
    timeout: int = 30,
) -> tuple[int, bytes]:
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


# ───────────── data classes ─────────────

@dataclass
class CostLine:
    provider: str
    label: str
    amount_usd: float
    detail: dict[str, Any] = field(default_factory=dict)
    skipped: bool = False
    skip_reason: str = ""


@dataclass
class CostDigest:
    date: str  # YYYY-MM-DD (UTC, the day we're reporting ON)
    generated: str  # ISO timestamp
    lines: list[CostLine] = field(default_factory=list)

    @property
    def total_usd(self) -> float:
        return round(sum(l.amount_usd for l in self.lines if not l.skipped), 2)


# ───────────── providers ─────────────

def date_range_for(target_day: str) -> tuple[str, str]:
    """Return (start_iso, end_iso) covering the 24h of `target_day` in UTC."""
    day = datetime.strptime(target_day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start = day
    end = day + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def collect_cloudflare(target_day: str) -> list[CostLine]:
    token = os.environ.get("CF_API_TOKEN")
    account = os.environ.get("CF_ACCOUNT_ID")
    if not token or not account:
        return [CostLine("cloudflare", "Workers + R2 + KV + D1", 0.0, skipped=True,
                         skip_reason="missing CF_API_TOKEN or CF_ACCOUNT_ID")]

    # Cloudflare exposes invoice data via:
    #   GET /accounts/{account_id}/billing/invoices  (last 12 months)
    # For daily granularity we'd use the Analytics GraphQL API or the
    # newer Workers usage endpoint. As of 2026-05 the public per-day cost
    # endpoint is gated; this script collects monthly-to-date and divides
    # by the number of days elapsed.
    start, end = date_range_for(target_day)
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/billing/profile"
    status, body = http_request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    if status != 200:
        return [CostLine("cloudflare", "Workers + R2 + KV + D1", 0.0, skipped=True,
                         skip_reason=f"API status {status}")]
    try:
        data = json.loads(body)
        mtd = float(data.get("result", {}).get("month_to_date_spend", 0.0))
    except (json.JSONDecodeError, ValueError, KeyError):
        return [CostLine("cloudflare", "Workers + R2 + KV + D1", 0.0, skipped=True,
                         skip_reason="unexpected response shape")]
    day_of_month = datetime.strptime(target_day, "%Y-%m-%d").day
    daily_estimate = round(mtd / max(day_of_month, 1), 2)
    return [CostLine("cloudflare", "Workers + R2 + KV + D1 (MTD/day est.)", daily_estimate,
                     detail={"month_to_date": mtd, "day_of_month": day_of_month, "window": [start, end]})]


def collect_anthropic(target_day: str) -> list[CostLine]:
    """Anthropic Admin API: GET /v1/organizations/cost_report.

    Verified live against the real endpoint 2026-05-15. Response shape:
      {
        "data": [
          {
            "starting_at": "2026-05-13T00:00:00Z",
            "ending_at":   "2026-05-14T00:00:00Z",
            "results": [
              { "currency": "USD", "amount": "65.5071",
                "workspace_id": null, "model": null, ... },
              ...
            ]
          }
        ],
        "has_more": false,
        "next_page": null
      }

    `amount` is a STRING; sum across all results in the target day's bucket.
    Requires an admin/service API key (sk-ant-admin01-* or svac_*) — regular
    sk-ant-api* keys are rejected with 401 "invalid x-api-key".
    """
    key = os.environ.get("ANTHROPIC_ADMIN_KEY")
    if not key:
        return [CostLine("anthropic", "LLM tokens", 0.0, skipped=True,
                         skip_reason="missing ANTHROPIC_ADMIN_KEY")]
    start, end = date_range_for(target_day)
    # Anthropic accepts ISO 8601 with `Z`. Python's isoformat emits `+00:00`
    # which becomes a space when interpreted as a URL query plus-sign,
    # producing HTTP 400. Normalise to `Z` and URL-encode safely.
    qs = urlencode({
        "starting_at": start.replace("+00:00", "Z"),
        "ending_at":   end.replace("+00:00", "Z"),
    })
    url = f"https://api.anthropic.com/v1/organizations/cost_report?{qs}"
    total = 0.0
    pages = 0
    while True:
        status, body = http_request(url, headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Accept": "application/json",
        })
        if status != 200:
            reason = f"API status {status}"
            if status == 401:
                reason += " (admin key required — sk-ant-api* won't work)"
            return [CostLine("anthropic", "LLM tokens", 0.0, skipped=True,
                             skip_reason=reason)]
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return [CostLine("anthropic", "LLM tokens", 0.0, skipped=True,
                             skip_reason="unexpected response shape")]
        for bucket in data.get("data") or []:
            for row in bucket.get("results") or []:
                try:
                    total += float(row.get("amount", 0) or 0)
                except (TypeError, ValueError):
                    continue
        pages += 1
        next_url = data.get("next_page")
        if not data.get("has_more") or not next_url or pages >= 50:
            break
        url = next_url  # Anthropic returns absolute URL for next page

    return [CostLine("anthropic", "LLM tokens", round(total, 2),
                     detail={"daily_cap_usd": ANTHROPIC_DAILY_CAP_USD,
                             "window": [start, end], "pages_fetched": pages})]


def collect_sentry(target_day: str) -> list[CostLine]:
    token = os.environ.get("SENTRY_AUTH_TOKEN")
    org = os.environ.get("SENTRY_ORG", "latwood-tech")
    if not token:
        return [CostLine("sentry", "Event ingestion", 0.0, skipped=True,
                         skip_reason="missing SENTRY_AUTH_TOKEN")]
    # Sentry exposes org-level stats:
    #   GET /api/0/organizations/{org}/stats_v2?category=error&statsPeriod=1d
    # The platform cost depends on plan tier — for shadow mode we report
    # event count and let the digest reader infer cost based on plan ceiling.
    url = (
        f"https://sentry.io/api/0/organizations/{org}/stats_v2/"
        "?statsPeriod=1d&interval=1d&field=sum(quantity)&category=error"
    )
    status, body = http_request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    if status != 200:
        return [CostLine("sentry", "Event ingestion", 0.0, skipped=True,
                         skip_reason=f"API status {status}")]
    try:
        data = json.loads(body)
        events = int(sum(g.get("totals", {}).get("sum(quantity)", 0)
                         for g in data.get("groups", [])))
    except (json.JSONDecodeError, ValueError, TypeError, KeyError):
        return [CostLine("sentry", "Event ingestion", 0.0, skipped=True,
                         skip_reason="unexpected response shape")]
    # Cost rough heuristic: $0.0003 per error event over plan ceiling
    # (placeholder; refine when plan tier is confirmed).
    cost = round(events * 0.0003, 2)
    return [CostLine("sentry", "Event ingestion", cost,
                     detail={"events_24h": events, "rate_per_event_usd": 0.0003})]


def collect_stripe(target_day: str) -> list[CostLine]:
    """Stripe is revenue, not cost. We report GROSS revenue + Stripe fees."""
    key = os.environ.get("STRIPE_API_KEY")
    if not key:
        return [
            CostLine("stripe", "Gross revenue (GAINS)", 0.0, skipped=True,
                     skip_reason="missing STRIPE_API_KEY"),
            CostLine("stripe", "Stripe fees", 0.0, skipped=True,
                     skip_reason="missing STRIPE_API_KEY"),
        ]
    start = datetime.strptime(target_day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    url = (
        "https://api.stripe.com/v1/balance_transactions"
        f"?created[gte]={int(start.timestamp())}&created[lt]={int(end.timestamp())}"
        "&limit=100"
    )
    status, body = http_request(url, headers={
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    if status != 200:
        return [CostLine("stripe", "Gross revenue", 0.0, skipped=True,
                         skip_reason=f"API status {status}")]
    try:
        data = json.loads(body)
        txns = data.get("data", []) or []
        gross_cents = sum(t.get("amount", 0) for t in txns if t.get("type") == "charge")
        fees_cents = sum(t.get("fee", 0) for t in txns if t.get("type") == "charge")
    except (json.JSONDecodeError, ValueError, KeyError):
        return [CostLine("stripe", "Gross revenue", 0.0, skipped=True,
                         skip_reason="unexpected response shape")]
    return [
        CostLine("stripe", "Gross revenue (GAINS)", round(-gross_cents / 100.0, 2),
                 detail={"transaction_count": len(txns)}),  # negative because it's revenue, not cost
        CostLine("stripe", "Stripe fees", round(fees_cents / 100.0, 2)),
    ]


def collect_gcp(target_day: str) -> list[CostLine]:
    token = os.environ.get("GCP_BILLING_TOKEN")
    account = os.environ.get("GCP_BILLING_ACCOUNT_ID")
    if not token or not account:
        return [CostLine("gcp", "Cloud Run + Logging", 0.0, skipped=True,
                         skip_reason="missing GCP_BILLING_TOKEN or GCP_BILLING_ACCOUNT_ID")]
    # GCP Cloud Billing API: BigQuery-backed; raw cost data is in a billing
    # export dataset, not a simple REST endpoint. For shadow mode we emit a
    # placeholder pending the BQ export setup. The full implementation
    # queries a configured BQ table and sums cost for the date.
    return [CostLine("gcp", "Cloud Run + Logging", 0.0, skipped=True,
                     skip_reason="GCP billing export not yet wired (see runbook)")]


PROVIDER_FNS = {
    "cloudflare": collect_cloudflare,
    "anthropic": collect_anthropic,
    "sentry": collect_sentry,
    "stripe": collect_stripe,
    "gcp": collect_gcp,
}


# ───────────── output ─────────────

def write_daily_snapshot(digest: CostDigest) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    p = OUT_DIR / f"{digest.date}.json"
    p.write_text(json.dumps(asdict(digest), indent=2) + "\n", encoding="utf-8")
    return p


def rebuild_summary() -> dict[str, Any]:
    """Aggregate the last 30 daily snapshots into summary.json + summary.md."""
    if not OUT_DIR.exists():
        return {}
    snapshots: list[CostDigest] = []
    for p in sorted(OUT_DIR.glob("????-??-??.json")):
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            lines = [CostLine(**l) for l in raw.get("lines", [])]
            snapshots.append(CostDigest(date=raw["date"], generated=raw["generated"], lines=lines))
        except Exception:  # noqa: BLE001
            continue
    last_30 = snapshots[-30:]

    summary = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "window_days": len(last_30),
        "totals_by_provider": {},
        "daily_totals": [{"date": d.date, "total_usd": d.total_usd} for d in last_30],
    }
    for provider in PROVIDERS:
        amounts = [l.amount_usd for d in last_30 for l in d.lines
                   if l.provider == provider and not l.skipped]
        summary["totals_by_provider"][provider] = round(sum(amounts), 2)

    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    # Markdown
    lines = [
        "# Cost Digest — Rolling 30 days",
        "",
        f"*Generated: {summary['generated']}*",
        "",
        "## Provider totals (window)",
        "",
        "| Provider | $ |",
        "|----------|--:|",
    ]
    for p_name, amount in summary["totals_by_provider"].items():
        lines.append(f"| {p_name} | {amount:.2f} |")
    lines.extend([
        "",
        "## Daily totals",
        "",
        "| Date | $ |",
        "|------|--:|",
    ])
    for row in summary["daily_totals"]:
        lines.append(f"| {row['date']} | {row['total_usd']:.2f} |")
    (OUT_DIR / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    return summary


def push_pushover(digest: CostDigest) -> None:
    user = os.environ.get("PUSHOVER_USER")
    token = os.environ.get("PUSHOVER_TOKEN")
    if not user or not token:
        jwarn("pushover_skipped", reason="missing_creds")
        return
    by_provider: dict[str, float] = {}
    for l in digest.lines:
        if l.skipped:
            continue
        by_provider[l.provider] = round(by_provider.get(l.provider, 0.0) + l.amount_usd, 2)
    body_lines = [f"{p}: ${a:.2f}" for p, a in by_provider.items()]
    body_lines.append(f"total: ${digest.total_usd:.2f}")
    msg = "\n".join(body_lines)
    data = urlencode({
        "token": token, "user": user,
        "title": f"Cost digest — {digest.date}", "message": msg,
    }).encode()
    status, _ = http_request(
        "https://api.pushover.net/1/messages.json",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=data,
    )
    if status != 200:
        jwarn("pushover_failed", status=status)


# ───────────── CLI ─────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 1 cost digest")
    parser.add_argument("--date", help="Day to report (YYYY-MM-DD UTC). Default: yesterday.")
    parser.add_argument("--provider", choices=PROVIDERS, help="Single provider")
    parser.add_argument("--pushover", action="store_true", help="Send Pushover digest")
    args = parser.parse_args()

    target = args.date or (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    providers = (args.provider,) if args.provider else PROVIDERS

    digest = CostDigest(date=target, generated=datetime.now(timezone.utc).isoformat())
    for p in providers:
        try:
            digest.lines.extend(PROVIDER_FNS[p](target))
        except Exception as e:  # noqa: BLE001
            jerr("provider_failed", provider=p, err=str(e))
            digest.lines.append(CostLine(p, "error", 0.0, skipped=True, skip_reason=str(e)))

    snapshot_path = write_daily_snapshot(digest)
    jlog("digest_written", path=str(snapshot_path), total_usd=digest.total_usd)
    rebuild_summary()

    if args.pushover:
        push_pushover(digest)

    # Anthropic cost cap warning (advisory)
    a_lines = [l for l in digest.lines if l.provider == "anthropic" and not l.skipped]
    a_total = sum(l.amount_usd for l in a_lines)
    if a_total > ANTHROPIC_DAILY_CAP_USD:
        jwarn("anthropic_over_cap", spent=a_total, cap=ANTHROPIC_DAILY_CAP_USD)

    return 0


if __name__ == "__main__":
    sys.exit(main())
