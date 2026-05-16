#!/usr/bin/env python3
"""
launch_readiness.py — Stage 2 M3 Launch Readiness Scorecard.

Composite per-product and org-wide score (0-100) aggregated from the
shadow-mode data sources that already land daily on main:

  • docs/conformance/summary.json       per-app cohesion (0-100)
  • docs/completion-tracker.json        per-app completion % (0-100)
  • docs/cost/summary.json              org cost vs caps
  • docs/revenue/summary.json           org MRR (when revenue digest lands)

Per-app composite (weighted):
  Conformance       60%
  Completion        30%
  Reliability       10%   (placeholder — fed by Sentry user-facing error
                          rate once apps emit user IDs; issue #723)

Org composite (weighted):
  Avg conformance   40%
  Cost adherence    20%   (under cap → 100; over → scaled down)
  MRR trend         20%   (positive delta → 100; flat → 50; negative → 0)
  Reliability       20%   (placeholder)

Dimensions with no data report `score: null` and are excluded from the
weighted average (the remaining weights are renormalised). This keeps
the score honest in early Stage 2 when revenue + reliability are sparse.

Output:
  docs/scorecard/<YYYY-MM-DD>.json
  docs/scorecard/summary.json
  docs/scorecard/summary.md

Usage:
  python scripts/launch_readiness.py
  python scripts/launch_readiness.py --date 2026-05-14
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "scorecard"
CONFORMANCE = ROOT / "docs" / "conformance" / "summary.json"
COMPLETION = ROOT / "docs" / "completion-tracker.json"
COST = ROOT / "docs" / "cost" / "summary.json"
REVENUE = ROOT / "docs" / "revenue" / "summary.json"

# Map historical completion-tracker keys → canonical conformance keys.
# Conformance uses HD/VK/FA/CH/XC (its own naming); completion tracker
# transitioned VK → CC mid-May 2026 when videoking → capricast. Treat as
# the same product so we don't double-count.
REPO_KEY_ALIAS = {"CC": "VK"}

# Cost caps (matches cost_digest.py ANTHROPIC_DAILY_CAP_USD + planned others).
COST_CAPS_USD = {
    "anthropic": 50.0,
    # leave others uncapped for now; they're observe-only in Stage 1
}

PER_APP_WEIGHTS = {"conformance": 0.60, "completion": 0.30, "reliability": 0.10}
ORG_WEIGHTS = {"conformance": 0.40, "cost": 0.20, "mrr": 0.20, "reliability": 0.20}

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("scorecard")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


@dataclass
class Dimension:
    key: str
    weight: float
    score: float | None     # None = no data available yet
    detail: str = ""


@dataclass
class AppScore:
    repo_key: str
    repo_name: str
    composite: float        # 0-100, renormalised over available dimensions
    dimensions: list[Dimension] = field(default_factory=list)


@dataclass
class Scorecard:
    date: str
    generated: str
    apps: list[AppScore] = field(default_factory=list)
    org: AppScore | None = None


def _load_json(p: Path) -> dict[str, Any] | None:
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _norm_key(k: str) -> str:
    """Apply REPO_KEY_ALIAS so VK and CC collapse to one logical product."""
    return REPO_KEY_ALIAS.get(k, k)


def _composite(dims: list[Dimension]) -> float:
    """Weighted average of dimensions with data; renormalise over present weight."""
    present = [d for d in dims if d.score is not None]
    if not present:
        return 0.0
    total_w = sum(d.weight for d in present)
    if total_w <= 0:
        return 0.0
    return round(sum(d.score * d.weight for d in present) / total_w, 1)


def _score_cost_adherence(cost: dict[str, Any] | None) -> tuple[float | None, str]:
    """100 if last daily total under all caps; scale down per-cap overage."""
    if not cost:
        return None, "no cost data"
    dailies = cost.get("daily_totals") or []
    if not dailies:
        return None, "no daily_totals"
    latest = dailies[-1]
    # Provider-level breakdown isn't in the rollup; conservative read uses
    # totals_by_provider to estimate per-cap usage as MTD average.
    by_provider = cost.get("totals_by_provider") or {}
    if not by_provider:
        return 100.0, f"latest total ${latest.get('total_usd', 0):.2f}"
    over_ratios: list[float] = []
    for provider, cap in COST_CAPS_USD.items():
        spent = float(by_provider.get(provider) or 0)
        days = max(len(dailies), 1)
        per_day = spent / days
        if cap > 0 and per_day > 0:
            over_ratios.append(per_day / cap)
    if not over_ratios:
        return 100.0, "no capped provider data"
    worst = max(over_ratios)
    if worst <= 1.0:
        score = round(100 * (1 - worst / 2), 1)  # 0% → 100, 100% of cap → 50
    else:
        score = round(max(0, 50 - (worst - 1) * 50), 1)  # over cap → < 50, hits 0 at 2x
    return score, f"worst-cap utilisation {worst:.0%}"


def _score_mrr(revenue: dict[str, Any] | None) -> tuple[float | None, str]:
    """Score MRR trend: positive delta → 100, flat → 50, negative → 0.
    If MRR is zero (Stage 2 starting reality), return None so the dim is
    excluded rather than falsely deflating the org score."""
    if not revenue:
        return None, "no revenue data"
    mrr_now = float(revenue.get("mrr_now_usd") or 0)
    if mrr_now <= 0:
        return None, "MRR is 0 — Stage 2 not yet generating recurring"
    delta_pct = revenue.get("mrr_delta_pct")
    if delta_pct is None:
        return 50.0, f"MRR ${mrr_now:,.2f}, no trend yet"
    if delta_pct >= 5:
        return 100.0, f"MRR ${mrr_now:,.2f}, +{delta_pct:.1f}% over 30d"
    if delta_pct >= 0:
        return 75.0, f"MRR ${mrr_now:,.2f}, flat {delta_pct:+.1f}%"
    if delta_pct >= -10:
        return 25.0, f"MRR ${mrr_now:,.2f}, declining {delta_pct:.1f}%"
    return 0.0, f"MRR ${mrr_now:,.2f}, declining sharply {delta_pct:.1f}%"


def compute(target_day: str) -> Scorecard:
    conformance = _load_json(CONFORMANCE)
    completion = _load_json(COMPLETION)
    cost = _load_json(COST)
    revenue = _load_json(REVENUE)

    # Per-app scores
    apps: list[AppScore] = []
    conf_repos = conformance.get("repos") if conformance else []
    repo_weighted: dict[str, float] = completion.get("repo_weighted") if completion else {} or {}
    completion_by_key = {_norm_key(k): v for k, v in repo_weighted.items()}

    for r in conf_repos or []:
        repo_key = r.get("repo_key", "?")
        repo_name = r.get("repo_name", "?")
        conf_score = float(r.get("cohesion", 0))
        comp_score = completion_by_key.get(_norm_key(repo_key))
        comp_dim_score = float(comp_score) if comp_score is not None else None
        # Reliability: placeholder. Wired when issue #723 lands and apps emit
        # Sentry user.id. For now: report None so it's excluded, not 0.
        rel_dim_score: float | None = None

        dims = [
            Dimension("conformance", PER_APP_WEIGHTS["conformance"], conf_score,
                      f"cohesion {conf_score:.0f}/100"),
            Dimension("completion", PER_APP_WEIGHTS["completion"], comp_dim_score,
                      f"completion {comp_dim_score:.0f}%" if comp_dim_score is not None
                      else "no completion data"),
            Dimension("reliability", PER_APP_WEIGHTS["reliability"], rel_dim_score,
                      "awaiting per-app Sentry user.id emission (#723)"),
        ]
        apps.append(AppScore(repo_key, repo_name, _composite(dims), dims))

    # Org-wide score
    if apps:
        avg_conf = round(sum(a.dimensions[0].score for a in apps
                             if a.dimensions[0].score is not None) / len(apps), 1)
    else:
        avg_conf = 0.0
    cost_score, cost_detail = _score_cost_adherence(cost)
    mrr_score, mrr_detail = _score_mrr(revenue)
    org_dims = [
        Dimension("conformance", ORG_WEIGHTS["conformance"], avg_conf if apps else None,
                  f"avg cohesion across {len(apps)} apps"),
        Dimension("cost", ORG_WEIGHTS["cost"], cost_score, cost_detail),
        Dimension("mrr", ORG_WEIGHTS["mrr"], mrr_score, mrr_detail),
        Dimension("reliability", ORG_WEIGHTS["reliability"], None,
                  "awaiting Sentry user-facing error rate (#723)"),
    ]
    org = AppScore("ORG", "Latimer-Woods-Tech (portfolio)", _composite(org_dims), org_dims)

    return Scorecard(
        date=target_day,
        generated=datetime.now(timezone.utc).isoformat(),
        apps=apps,
        org=org,
    )


def write_snapshot(s: Scorecard) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    p = OUT_DIR / f"{s.date}.json"
    p.write_text(json.dumps(asdict(s), indent=2) + "\n", encoding="utf-8")
    return p


def render_summary(s: Scorecard) -> None:
    org = s.org
    md = [
        "# Launch Readiness Scorecard",
        "",
        f"*Generated: {s.generated} · Reporting day: {s.date}*",
        "",
        "## Org composite",
        "",
        f"**{org.composite:.1f} / 100** — {org.repo_name}",
        "",
        "| Dimension | Weight | Score | Detail |",
        "|---|--:|--:|---|",
    ]
    for d in (org.dimensions if org else []):
        score_str = f"{d.score:.0f}" if d.score is not None else "—"
        md.append(f"| {d.key} | {d.weight:.0%} | {score_str} | {d.detail} |")
    md.extend([
        "",
        "## Per-app scorecard",
        "",
        "| Repo | Composite | Conformance | Completion | Reliability |",
        "|---|--:|--:|--:|--:|",
    ])
    for a in sorted(s.apps, key=lambda x: -x.composite):
        scores = {d.key: d for d in a.dimensions}
        def col(k: str) -> str:
            d = scores.get(k)
            if d is None or d.score is None:
                return "—"
            return f"{d.score:.0f}"
        md.append(
            f"| **{a.repo_name}** ({a.repo_key}) | **{a.composite:.1f}** "
            f"| {col('conformance')} | {col('completion')} | {col('reliability')} |"
        )
    md.extend([
        "",
        "## Notes on dimensions reporting `—`",
        "",
        "- **Reliability** awaits per-app Sentry user.id emission (issue #723 — `@lwt/monitoring` adoption).",
        "- **MRR** is excluded from the org score until Stripe MRR > 0 (Stage 2 acquisition target).",
        "  Dimensions with no data are excluded from the weighted average rather than scored as 0,",
        "  so the score reflects what we can measure today, not penalise what we haven't wired yet.",
        "",
        "## Targets",
        "",
        "- **Stage 2 exit:** org composite ≥ 60, every dimension scoring (no `—`)",
        "- **Stage 4 exit:** every per-app composite ≥ 70 (matches conformance shadow threshold)",
        "- **Stage 5 exit:** every per-app composite ≥ 80 + privacy/a11y conformance ≥ 80",
    ])
    (OUT_DIR / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (OUT_DIR / "summary.json").write_text(
        json.dumps({
            "generated": s.generated,
            "date": s.date,
            "org_composite": org.composite if org else 0.0,
            "apps": [{"repo_key": a.repo_key, "repo_name": a.repo_name,
                      "composite": a.composite} for a in s.apps],
        }, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 2 Launch Readiness Scorecard")
    parser.add_argument("--date", help="Day to report (YYYY-MM-DD UTC). Default: today.")
    args = parser.parse_args()
    target = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    s = compute(target)
    p = write_snapshot(s)
    render_summary(s)
    jlog("scorecard_written", path=str(p), org=s.org.composite if s.org else 0.0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
