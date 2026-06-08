#!/usr/bin/env python3
"""
platform_conformance.py — Stage 1 M1 cohesion scorer for Latimer-Woods-Tech.

Scores each app repo against PLATFORM_STANDARDS.md's 10 conformance dimensions
(weighted total = 100). Runs in *shadow mode* — emits scores, does not gate
merges. Output feeds the cohesion-score column in COMPLETION_TRACKER.md and the
daily Pushover digest.

Dimensions (per PLATFORM_STANDARDS.md §"Conformance audit dimensions"):
  1. Stack            (weight 10) — wrangler.jsonc valid, ESM only, no node:crypto, Hono
  2. Code patterns    (weight 15) — @lwt/logger, @lwt/errors, idempotent webhooks, request_id
  3. Tests            (weight 15) — vitest deterministic, playwright tiers, coverage floor
  4. Observability    (weight 10) — Sentry init, sourcemap upload, structured logs, SLO doc
  5. Security         (weight 15) — CodeQL workflow, npm audit, OIDC publish, secret-scanning
  6. Schema           (weight  5) — expand/contract, rollback documented, dry-run in CI
  7. Workflows        (weight 10) — _app-* reusables, ≤5 caller files, branch protection
  8. Release          (weight  5) — semver tags, CHANGELOG, ADRs linked
  9. Performance      (weight 10) — SLO budgets, synthetic checks, smoke + canary
  10. Privacy         (weight  5) — PII_INVENTORY, DSR endpoints, audit log middleware

Outputs:
  docs/conformance/<repo>.json         Per-repo score breakdown
  docs/conformance/summary.json        All repos in one snapshot
  docs/conformance/summary.md          Human-readable summary
  Pushover digest (optional, --pushover flag)

Requires env:
  GITHUB_TOKEN                          GitHub API access for all repos
  PUSHOVER_USER, PUSHOVER_TOKEN         (optional) For digest delivery

Usage:
  python scripts/platform_conformance.py                  # full scan, write all outputs
  python scripts/platform_conformance.py --repo HD        # single repo
  python scripts/platform_conformance.py --json-only      # skip markdown
  python scripts/platform_conformance.py --pushover       # send digest after scan
  python scripts/platform_conformance.py --check          # exit 1 if any repo < 70 (Stage 4 prep)

This is *shadow mode* until Stage 4. Failures here do not block PRs.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlencode

import urllib.error
import urllib.request

# ───────────── config ─────────────

REPOS: list[dict[str, str]] = [
    {"key": "HD", "name": "HumanDesign",          "repo": "Latimer-Woods-Tech/HumanDesign"},
    {"key": "CC", "name": "capricast",            "repo": "Latimer-Woods-Tech/capricast"},
    {"key": "FA", "name": "factory-admin-studio", "repo": "Latimer-Woods-Tech/Factory"},
    {"key": "CH", "name": "cypher-healing",       "repo": "Latimer-Woods-Tech/coh"},
    {"key": "XC", "name": "xico-city",            "repo": "Latimer-Woods-Tech/xico-city"},
    # Extended 2026-06-08 — every in-scope Factory repo is now scored (sense-layer
    # evenness). Repos lacking the expected structure simply score low; that is an
    # accurate signal, not an error.
    # NOTE: factory-admin is intentionally NOT scored as a peer — it is a legacy
    # deployment surface of Admin Studio (= the monorepo, scored as FA), not a
    # separate product. See docs/decisions/2026-06-08-admin-studio-boundary.md.
    {"key": "FB", "name": "focusbro",             "repo": "Latimer-Woods-Tech/focusbro"},
    {"key": "IJ", "name": "ijustus",              "repo": "Latimer-Woods-Tech/ijustus"},
    {"key": "KC", "name": "kairoscouncil",        "repo": "Latimer-Woods-Tech/kairoscouncil"},
    {"key": "NA", "name": "neighbor-aid",         "repo": "Latimer-Woods-Tech/neighbor-aid"},
    {"key": "TC", "name": "the-calling",          "repo": "Latimer-Woods-Tech/the-calling"},
    {"key": "XP", "name": "xpelevator",           "repo": "Latimer-Woods-Tech/xpelevator"},
    {"key": "WB", "name": "wordis-bond",          "repo": "Latimer-Woods-Tech/wordis-bond"},
]

DIMENSIONS: list[tuple[str, str, int]] = [
    ("stack",         "Stack",         10),
    ("code_patterns", "Code patterns", 15),
    ("tests",         "Tests",         15),
    ("observability", "Observability", 10),
    ("security",      "Security",      15),
    ("schema",        "Schema",         5),
    ("workflows",     "Workflows",     10),
    ("release",       "Release",        5),
    ("performance",   "Performance",   10),
    ("privacy",       "Privacy",        5),
]
TOTAL_WEIGHT = sum(w for _, _, w in DIMENSIONS)  # 100
SHADOW_THRESHOLD = 70  # warned; not enforced until Stage 4

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "conformance"

# ───────────── logging ─────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stderr,
)
log = logging.getLogger("conformance")


def jlog(msg: str, /, **kw: Any) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def jwarn(msg: str, /, **kw: Any) -> None:
    log.warning(json.dumps({"event": msg, **kw}))


def jerr(msg: str, /, **kw: Any) -> None:
    log.error(json.dumps({"event": msg, **kw}))


# ───────────── http with retry ─────────────

def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    max_retries: int = 4,
    timeout: int = 30,
) -> tuple[int, bytes, dict[str, str]]:
    """Single request with backoff on 5xx + 429. Returns (status, body, headers)."""
    last_status = 0
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


def github_token() -> str:
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        jerr("missing_github_token")
        sys.exit(2)
    return tok


def gh_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {github_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "lwt-platform-conformance/1.0",
    }


def gh_get_file(repo: str, path: str, ref: str = "main") -> str | None:
    """Fetch a file's text content from a repo. Returns None if 404."""
    url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={ref}"
    status, body, _ = http_request(url, headers=gh_headers())
    if status == 404:
        return None
    if status != 200:
        jwarn("gh_get_file_failed", repo=repo, path=path, status=status)
        return None
    try:
        meta = json.loads(body)
    except json.JSONDecodeError:
        return None
    if meta.get("type") != "file":
        return None
    encoding = meta.get("encoding")
    content = meta.get("content", "")
    if encoding == "base64":
        import base64
        try:
            return base64.b64decode(content).decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            return None
    return content


def gh_list_dir(repo: str, path: str, ref: str = "main") -> list[dict[str, Any]]:
    """List directory contents from a repo. Returns [] if 404."""
    url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={ref}"
    status, body, _ = http_request(url, headers=gh_headers())
    if status != 200:
        return []
    try:
        items = json.loads(body)
    except json.JSONDecodeError:
        return []
    return items if isinstance(items, list) else []


def gh_get_first_file(repo: str, paths: list[str]) -> str | None:
    """Return the first existing file content from a list of candidate paths."""
    for path in paths:
        content = gh_get_file(repo, path)
        if content is not None:
            return content
    return None


def gh_get_deploy_workflow_text(repo: str, extra_paths: list[str] | None = None) -> str:
    """Best-effort concatenation of deploy workflow file contents."""
    candidates = list(extra_paths or [])
    candidates.extend([
        ".github/workflows/deploy.yml",
        ".github/workflows/_app-deploy.yml",
        ".github/workflows/deploy-workers.yml",
        ".github/workflows/deploy-worker.yml",
        ".github/workflows/deploy-worker-only.yml",
    ])
    # Include any workflow whose filename contains "deploy".
    for item in gh_list_dir(repo, ".github/workflows"):
        name = item.get("name", "").lower()
        path = item.get("path", "")
        if "deploy" in name and path:
            candidates.append(path)

    seen: set[str] = set()
    contents: list[str] = []
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        text = gh_get_file(repo, path)
        if text:
            contents.append(text)
    return "\n".join(contents)


def gh_search_code(repo: str, query: str) -> int:
    """Count code search hits. Returns -1 on error."""
    full_q = f"{query} repo:{repo}"
    url = f"https://api.github.com/search/code?q={urlencode({'q': full_q})[2:]}"
    status, body, _ = http_request(url, headers=gh_headers())
    if status != 200:
        return -1
    try:
        return int(json.loads(body).get("total_count", 0))
    except (json.JSONDecodeError, ValueError):
        return -1


# ───────────── data classes ─────────────

@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class DimensionScore:
    key: str
    title: str
    weight: int
    score: int  # 0-100
    checks: list[CheckResult] = field(default_factory=list)


@dataclass
class RepoScore:
    repo_key: str
    repo_name: str
    repo_path: str
    timestamp: str
    cohesion: int  # 0-100 weighted average
    dimensions: list[DimensionScore] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# ───────────── check helpers ─────────────

def text_contains(text: str | None, pattern: str | re.Pattern[str]) -> bool:
    if text is None:
        return False
    if isinstance(pattern, str):
        return pattern in text
    return bool(pattern.search(text))


def check(name: str, passed: bool, detail: str = "") -> CheckResult:
    return CheckResult(name=name, passed=passed, detail=detail)


def score_from_checks(checks: list[CheckResult]) -> int:
    """0-100 score = (passed / total) × 100. Empty list = 0."""
    if not checks:
        return 0
    passed = sum(1 for c in checks if c.passed)
    return round(passed / len(checks) * 100)


def any_search_hit(repo: str, queries: list[str]) -> bool:
    """True when at least one GitHub code-search query returns a positive hit."""
    return any(gh_search_code(repo, q) > 0 for q in queries)


def has_typed_env_bindings(repo: str) -> bool:
    """
    Detect typed Worker env wiring with flexible patterns used across portfolio repos.

    A repo passes when it has:
    1) An `Env` declaration (`interface Env` or `type Env =`), and
    2) Hono bindings usage wired to that Env (`Bindings: Env` in app/type wiring).
    """
    search_roots = ("src", "apps")
    env_declaration_patterns = ('"interface Env"', '"type Env ="')
    typed_binding_patterns = ('"new Hono<{ Bindings: Env"', '"Bindings: Env"')

    env_queries = [f"path:{root}/ {pattern}" for root in search_roots for pattern in env_declaration_patterns]
    binding_queries = [f"path:{root}/ {pattern}" for root in search_roots for pattern in typed_binding_patterns]
    has_env_declaration = any_search_hit(repo, env_queries)
    has_typed_bindings = any_search_hit(repo, binding_queries)
    return has_env_declaration and has_typed_bindings


# ───────────── dimensions ─────────────

def dim_stack(repo: str) -> DimensionScore:
    wrangler = gh_get_file(repo, "wrangler.jsonc") or gh_get_file(repo, "wrangler.toml")
    pkg_json = gh_get_file(repo, "package.json") or "{}"
    try:
        pkg = json.loads(pkg_json)
    except json.JSONDecodeError:
        pkg = {}
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

    checks = [
        check("wrangler.jsonc present",       wrangler is not None),
        check("ESM ('type': 'module')",       pkg.get("type") == "module"),
        check("Hono in deps",                 "hono" in deps),
        check("No node:crypto imports",       gh_search_code(repo, '"node:crypto"') == 0),
        check("No Express",                   "express" not in deps),
    ]
    return DimensionScore("stack", "Stack", 10, score_from_checks(checks), checks)


def dim_code_patterns(repo: str) -> DimensionScore:
    pkg_json_path = "package.json"
    src_path = "src/"
    if repo == "Latimer-Woods-Tech/Factory":
        pkg_json_path = "apps/admin-studio/package.json"
        src_path = "apps/admin-studio/src/"

    pkg_json = gh_get_file(repo, pkg_json_path) or "{}"
    try:
        deps = {**json.loads(pkg_json).get("dependencies", {}),
                **json.loads(pkg_json).get("devDependencies", {})}
    except json.JSONDecodeError:
        deps = {}

    checks = [
        check("@latimer-woods-tech/logger in deps",     "@latimer-woods-tech/logger" in deps),
        check("@latimer-woods-tech/errors in deps",     "@latimer-woods-tech/errors" in deps),
        check("@latimer-woods-tech/monitoring in deps", "@latimer-woods-tech/monitoring" in deps),
        check("No console.log in src/",                 gh_search_code(repo, f'path:{src_path} "console.log"') in (0, -1)),
        check("Typed Env bindings",                     has_typed_env_bindings(repo)),
    ]
    return DimensionScore("code_patterns", "Code patterns", 15, score_from_checks(checks), checks)


def dim_tests(repo: str) -> DimensionScore:
    vitest_cfg = gh_get_file(repo, "vitest.config.ts") or gh_get_file(repo, "vitest.config.mts")
    pw_cfg = gh_get_file(repo, "playwright.config.ts")
    test_dirs = gh_list_dir(repo, "tests") + gh_list_dir(repo, "test")

    checks = [
        check("vitest.config present",        vitest_cfg is not None),
        check("playwright.config present",    pw_cfg is not None),
        check("tests/ or test/ dir present",  len(test_dirs) > 0),
        check("Smoke tier present",           text_contains(pw_cfg, "smoke")),
        check("Coverage thresholds set",      text_contains(vitest_cfg, re.compile(r"thresholds?\s*:"))),
    ]
    return DimensionScore("tests", "Tests", 15, score_from_checks(checks), checks)


def dim_observability(repo: str) -> DimensionScore:
    deploy_yml = gh_get_deploy_workflow_text(repo)
    slo_paths = ["docs/SLO.md", "docs/slo.md"]
    sentry_query = '"@sentry/"'
    monitoring_query = '"@latimer-woods-tech/monitoring"'
    structured_log_query = '"request_id"'
    if repo == "Latimer-Woods-Tech/Factory":
        deploy_yml = gh_get_deploy_workflow_text(repo, extra_paths=[".github/workflows/deploy-admin-studio.yml"])
        slo_paths = ["apps/admin-studio/docs/SLO.md", "apps/admin-studio/docs/slo.md", *slo_paths]
        sentry_query = 'path:apps/admin-studio/src/ "@sentry/"'
        monitoring_query = 'path:apps/admin-studio/src/ "@latimer-woods-tech/monitoring"'
        structured_log_query = 'path:apps/admin-studio/src/ "request_id"'
    slo_doc = gh_get_first_file(repo, slo_paths)

    checks = [
        check("Sentry import",                 gh_search_code(repo, sentry_query) > 0),
        check("@lwt/monitoring consumed",      gh_search_code(repo, monitoring_query) > 0),
        check("Sourcemap upload step",         text_contains(deploy_yml, re.compile(r"sourcemaps?", re.IGNORECASE))),
        check("SLO doc present",               slo_doc is not None),
        check("Structured log fields",         gh_search_code(repo, structured_log_query) > 0),
    ]
    return DimensionScore("observability", "Observability", 10, score_from_checks(checks), checks)


def dim_security(repo: str) -> DimensionScore:
    codeql = gh_get_file(repo, ".github/workflows/codeql.yml")
    publish = gh_get_file(repo, ".github/workflows/publish.yml") or ""
    ci = gh_get_file(repo, ".github/workflows/ci.yml") or ""

    checks = [
        check("CodeQL workflow present",       codeql is not None),
        check("npm audit step in CI",          "npm audit" in ci or "npm audit" in publish),
        check("No NPM_TOKEN in workflows",     not (re.search(r"NPM_TOKEN", ci or "")
                                                or re.search(r"NPM_TOKEN", publish))),
        check("Trusted Publishers (OIDC)",     "id-token: write" in publish or "trusted" in publish.lower()),
        check("Renovate config present",       gh_get_file(repo, "renovate.json") is not None
                                              or gh_get_file(repo, ".github/renovate.json") is not None),
    ]
    return DimensionScore("security", "Security", 15, score_from_checks(checks), checks)


def check_rollback_blocks(
    migration_files: list[dict[str, Any]],
    changed_files: set[str],
    repo: str,
) -> tuple[list[str], list[str]]:
    """
    Check every SQL migration file for a ``-- ROLLBACK:`` comment block.

    Rules
    -----
    * The marker is ``-- ROLLBACK:`` (case-insensitive), anywhere in the file.
    * ``-- ROLLBACK: NONE -- ADR-XXX`` is valid (irreversible migration documented
      via an ADR reference).
    * A migration whose *path* appears in ``changed_files`` is considered **new**
      (added in the current PR).  New migrations without the block are **errors**
      (the dimension check fails).
    * Pre-existing migrations without the block are **warnings** (debt; not
      blocking the conformance score, but surfaced in the report).

    Returns
    -------
    errors   : list of file paths for new migrations missing the block
    warnings : list of file paths for existing migrations missing the block
    """
    ROLLBACK_RE = re.compile(r"--\s*ROLLBACK\s*:", re.IGNORECASE)
    errors: list[str] = []
    warnings: list[str] = []

    sql_files = [m for m in migration_files if m.get("name", "").endswith(".sql")]
    for item in sql_files:
        path = item.get("path", "")
        content = gh_get_file(repo, path) or ""
        if ROLLBACK_RE.search(content):
            continue  # block found — passes
        if path in changed_files:
            errors.append(path)
        else:
            warnings.append(path)

    return errors, warnings


def dim_schema(repo: str, changed_files: set[str] | None = None) -> DimensionScore:
    if changed_files is None:
        changed_files = set()
    migrations = gh_list_dir(repo, "migrations") + gh_list_dir(repo, "src/db/migrations")

    rollback_errors, rollback_warnings = check_rollback_blocks(migrations, changed_files, repo)

    rollback_passed = len(rollback_errors) == 0
    rollback_detail = ""
    if rollback_errors:
        rollback_detail = f"New migrations missing -- ROLLBACK: block: {', '.join(rollback_errors)}"
    elif rollback_warnings:
        rollback_detail = (
            f"WARN: {len(rollback_warnings)} existing migration(s) missing -- ROLLBACK: block "
            f"(debt — not blocking): {', '.join(rollback_warnings)}"
        )

    checks = [
        check("Migrations directory present",  len(migrations) > 0),
        check("ROLLBACK block enforced",       rollback_passed, rollback_detail),
        check("Numbered file naming",          any(re.match(r"^\d{4}_", m.get("name", "")) for m in migrations)),
    ]
    return DimensionScore("schema", "Schema", 5, score_from_checks(checks), checks)


def dim_workflows(repo: str) -> DimensionScore:
    workflows = gh_list_dir(repo, ".github/workflows")
    workflow_count = len([w for w in workflows if w.get("name", "").endswith((".yml", ".yaml"))])
    ci_yml = gh_get_file(repo, ".github/workflows/ci.yml") or ""

    checks = [
        check("≤5 workflow files",                  workflow_count <= 5),
        check("Uses _app-ci reusable",              "_app-ci.yml" in ci_yml or "uses: Latimer-Woods-Tech/Factory" in ci_yml),
        check("CODEOWNERS present",                 gh_get_file(repo, ".github/CODEOWNERS") is not None
                                                   or gh_get_file(repo, "CODEOWNERS") is not None),
    ]
    return DimensionScore("workflows", "Workflows", 10, score_from_checks(checks), checks)


def dim_release(repo: str) -> DimensionScore:
    changelog = gh_get_file(repo, "CHANGELOG.md")
    pkg = gh_get_file(repo, "package.json") or "{}"
    try:
        version = json.loads(pkg).get("version", "")
    except json.JSONDecodeError:
        version = ""

    checks = [
        check("CHANGELOG.md present",          changelog is not None),
        check("Semver version (n.n.n)",        bool(re.match(r"^\d+\.\d+\.\d+", version))),
        check("ADR directory present",         len(gh_list_dir(repo, "docs/adr")) > 0
                                              or len(gh_list_dir(repo, "adr")) > 0),
    ]
    return DimensionScore("release", "Release", 5, score_from_checks(checks), checks)


def dim_performance(repo: str) -> DimensionScore:
    slo_doc = gh_get_file(repo, "docs/SLO.md") or gh_get_file(repo, "docs/slo.md") or ""
    canary = gh_get_file(repo, ".github/workflows/_app-prod-canary.yml") \
             or gh_get_file(repo, ".github/workflows/canary.yml") \
             or gh_get_file(repo, ".github/workflows/deploy.yml") or ""

    checks = [
        check("p95 budgets declared",          "p95" in slo_doc.lower()),
        check("Canary or post-deploy verify",  "canary" in canary.lower()
                                              or "post-deploy" in canary.lower()
                                              or "_post-deploy-verify" in canary),
        check("Synthetic / smoke workflow",    any("smoke" in w.get("name", "").lower()
                                                   for w in gh_list_dir(repo, ".github/workflows"))),
    ]
    return DimensionScore("performance", "Performance", 10, score_from_checks(checks), checks)


# PII column-name heuristics — curated to stay high-signal. Broad tokens like a
# bare "name" or "id" are intentionally excluded; they produce noise without
# adding coverage. Each pattern is matched (search) against the lowercased
# column identifier.
PII_COLUMN_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE) for p in (
        r"e?_?mail",
        r"phone", r"telephone", r"^mobile(_number)?$", r"^msisdn$",
        r"first_name", r"last_name", r"full_name", r"middle_name",
        r"sur_?name", r"given_name", r"maiden_name",
        r"date_of_birth", r"^dob$", r"birth_?date", r"^birthday$",
        r"^ssn$", r"social_security", r"national_id", r"passport",
        r"tax_id", r"drivers?_licen[sc]e",
        r"street_address", r"^address(_line\d?)?$", r"postal_code", r"^zip_?code$",
        r"^ip$", r"ip_address",
        r"user_agent",
        r"avatar",
        r"^latitude$", r"^longitude$",
        r"(google|oidc|apple|github)_sub",
        r"stripe_customer_id",
    )
]

# Column-type whitelist keeps the inline-column regex from matching constraint
# keywords (PRIMARY KEY, FOREIGN KEY, CONSTRAINT ...).
_SQL_COLUMN_TYPES = (
    r"text|varchar|character|char|citext|uuid|smallint|integer|int|int4|int8|"
    r"bigint|serial|bigserial|smallserial|boolean|bool|timestamptz|timestamp|"
    r"date|time|jsonb|json|numeric|decimal|real|double|float|bytea|inet|cidr|"
    r"macaddr|money|interval"
)
_ADD_COLUMN_RE = re.compile(
    r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?P<col>[a-zA-Z_][a-zA-Z0-9_]*)"?',
    re.IGNORECASE,
)
_INLINE_COLUMN_RE = re.compile(
    r'^\s*"?(?P<col>[a-zA-Z_][a-zA-Z0-9_]*)"?\s+(?:' + _SQL_COLUMN_TYPES + r')\b',
    re.IGNORECASE | re.MULTILINE,
)
_SQL_RESERVED = frozenset({
    "constraint", "primary", "foreign", "unique", "check", "key", "index",
    "create", "table", "alter", "add", "column", "references", "if", "not", "exists",
})
_DOC_IDENT_RE = re.compile(r"`([a-zA-Z_][a-zA-Z0-9_]*)`")


def extract_sql_columns(sql_text: str) -> set[str]:
    """Best-effort extraction of column identifiers declared or added in a migration."""
    cols: set[str] = set()
    for m in _ADD_COLUMN_RE.finditer(sql_text):
        cols.add(m.group("col").lower())
    for m in _INLINE_COLUMN_RE.finditer(sql_text):
        name = m.group("col").lower()
        if name not in _SQL_RESERVED:
            cols.add(name)
    return cols


def parse_documented_pii_fields(inventory_text: str | None) -> set[str]:
    """Collect backtick-quoted field identifiers documented in PII_INVENTORY.md."""
    if not inventory_text:
        return set()
    return {m.group(1).lower() for m in _DOC_IDENT_RE.finditer(inventory_text)}


def is_pii_column(name: str) -> bool:
    """True when a column identifier matches a known PII name pattern."""
    return any(p.search(name) for p in PII_COLUMN_PATTERNS)


def check_pii_schema_drift(
    migration_files: list[dict[str, Any]],
    inventory_text: str | None,
    changed_files: set[str],
    repo: str,
) -> tuple[list[str], list[str]]:
    """
    Diff PII-looking columns in migration SQL against documented fields in
    ``PII_INVENTORY.md`` (G12).

    A column whose name matches :data:`PII_COLUMN_PATTERNS` but whose identifier
    is absent from the inventory is *undocumented PII*. New migrations (path in
    ``changed_files``) → **errors** (fail the check); pre-existing migrations →
    **warnings** (debt, surfaced but non-blocking). Mirrors the G13 ROLLBACK
    new/existing split.

    Returns ``(errors, warnings)`` as lists of ``"path: column"`` strings.
    """
    documented = parse_documented_pii_fields(inventory_text)
    errors: list[str] = []
    warnings: list[str] = []

    sql_files = [m for m in migration_files if m.get("name", "").endswith(".sql")]
    for item in sql_files:
        path = item.get("path", "")
        content = gh_get_file(repo, path) or ""
        undocumented = sorted(
            col for col in extract_sql_columns(content)
            if is_pii_column(col) and col not in documented
        )
        for col in undocumented:
            entry = f"{path}: {col}"
            if path in changed_files:
                errors.append(entry)
            else:
                warnings.append(entry)

    return errors, warnings


def dim_privacy(repo: str, changed_files: set[str] | None = None) -> DimensionScore:
    if changed_files is None:
        changed_files = set()
    pii = (
        gh_get_file(repo, "docs/PII_INVENTORY.md")
        or gh_get_file(repo, "docs/pii_inventory.md")
        or gh_get_file(repo, "docs/privacy/PII_INVENTORY.md")
    )
    retention = (
        gh_get_file(repo, "docs/RETENTION.md")
        or gh_get_file(repo, "docs/retention.md")
        or gh_get_file(repo, "docs/privacy/RETENTION.md")
        or gh_get_file(repo, "docs/runbooks/compliance.md")
    )
    def has_search_hit(*queries: str) -> bool:
        # Query both quoted and unquoted forms: GitHub code search behavior can
        # vary between exact string-literal matches and tokenized path matches.
        for query in queries:
            if gh_search_code(repo, query) > 0:
                return True
        return False

    export_hint = has_search_hit(
        '"data-export"',
        "data-export",
        '"/api/me/export"',
        "/api/me/export",
        '"/v1/me/data-export"',
        "/v1/me/data-export",
        '"/privacy/export"',
        "/privacy/export",
    )
    delete_hint = has_search_hit(
        '"DELETE /api/me"',
        "DELETE /api/me",
        '"/privacy/delete"',
        "/privacy/delete",
    )

    migrations = gh_list_dir(repo, "migrations") + gh_list_dir(repo, "src/db/migrations")
    pii_errors, pii_warnings = check_pii_schema_drift(migrations, pii, changed_files, repo)
    pii_drift_passed = len(pii_errors) == 0
    if pii_errors:
        pii_drift_detail = (
            f"New migration PII column(s) missing from PII_INVENTORY.md: {', '.join(pii_errors)}"
        )
    elif pii_warnings:
        pii_drift_detail = (
            f"WARN: {len(pii_warnings)} existing migration PII column(s) not documented in "
            f"PII_INVENTORY.md (debt — not blocking): {', '.join(pii_warnings)}"
        )
    else:
        pii_drift_detail = ""

    checks = [
        check("PII_INVENTORY.md present",      pii is not None),
        check("Retention policy doc present",  retention is not None),
        check("DSR endpoint hints (export + delete)", export_hint and delete_hint),
        check("Migration PII columns documented", pii_drift_passed, pii_drift_detail),
    ]
    return DimensionScore("privacy", "Privacy", 5, score_from_checks(checks), checks)


# Registry of dimension functions
DIMENSION_FNS: dict[str, Callable[[str], DimensionScore]] = {
    "stack": dim_stack,
    "code_patterns": dim_code_patterns,
    "tests": dim_tests,
    "observability": dim_observability,
    "security": dim_security,
    "schema": dim_schema,
    "workflows": dim_workflows,
    "release": dim_release,
    "performance": dim_performance,
    "privacy": dim_privacy,
}


# ───────────── scoring ─────────────

def score_repo(entry: dict[str, str]) -> RepoScore:
    repo_key = entry["key"]
    repo_name = entry["name"]
    repo_path = entry["repo"]
    jlog("scoring_repo", repo=repo_path)

    dims: list[DimensionScore] = []
    for key, _, _ in DIMENSIONS:
        try:
            dims.append(DIMENSION_FNS[key](repo_path))
        except Exception as e:  # noqa: BLE001 — log + skip; don't fail whole run
            jwarn("dimension_failed", repo=repo_path, dim=key, err=str(e))
            dims.append(DimensionScore(key, key.title(), next(w for k, _, w in DIMENSIONS if k == key), 0))

    weighted = sum(d.score * d.weight for d in dims)
    cohesion = round(weighted / TOTAL_WEIGHT) if TOTAL_WEIGHT else 0

    return RepoScore(
        repo_key=repo_key,
        repo_name=repo_name,
        repo_path=repo_path,
        timestamp=datetime.now(timezone.utc).isoformat(),
        cohesion=cohesion,
        dimensions=dims,
    )


# ───────────── output ─────────────

def write_per_repo_json(score: RepoScore) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{score.repo_key.lower()}.json"
    path.write_text(json.dumps(asdict(score), indent=2) + "\n", encoding="utf-8")


def write_summary_json(scores: list[RepoScore]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "total_weight": TOTAL_WEIGHT,
        "shadow_threshold": SHADOW_THRESHOLD,
        "repos": [asdict(s) for s in scores],
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def write_summary_md(scores: list[RepoScore]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [
        "# Platform Conformance — Shadow Mode",
        "",
        f"*Generated: {today} (UTC). Stage 1 shadow — scores are advisory, not enforced.*",
        "",
        "## Cohesion summary",
        "",
        "| Repo | Cohesion |" + "".join(f" {t} ({w}) |" for _, t, w in DIMENSIONS),
        "|------|---------:|" + "|".join("-----:" for _ in DIMENSIONS) + "|",
    ]
    for s in scores:
        row = f"| {s.repo_name} | **{s.cohesion}** |"
        for key, _, _ in DIMENSIONS:
            d = next(d for d in s.dimensions if d.key == key)
            row += f" {d.score} |"
        lines.append(row)
    lines.append("")
    lines.append(f"**Shadow threshold:** {SHADOW_THRESHOLD}. Below this would block deploys once Stage 4 ships.")
    lines.append("")
    for s in scores:
        lines.append(f"## {s.repo_name} — {s.cohesion}/100")
        lines.append("")
        for d in s.dimensions:
            lines.append(f"### {d.title} — {d.score}/100 (weight {d.weight})")
            for c in d.checks:
                tick = "✅" if c.passed else "❌"
                lines.append(f"- {tick} {c.name}" + (f" — {c.detail}" if c.detail else ""))
            lines.append("")
    (OUT_DIR / "summary.md").write_text("\n".join(lines), encoding="utf-8")


def push_pushover(scores: list[RepoScore]) -> None:
    user = os.environ.get("PUSHOVER_USER")
    token = os.environ.get("PUSHOVER_TOKEN")
    if not user or not token:
        jwarn("pushover_skipped", reason="missing_creds")
        return
    title = "Platform Conformance (shadow)"
    body_lines = [f"{s.repo_name}: {s.cohesion}/100" for s in scores]
    avg = round(sum(s.cohesion for s in scores) / len(scores)) if scores else 0
    body_lines.append(f"avg: {avg}/100")
    msg = "\n".join(body_lines)
    data = urlencode({"token": token, "user": user, "title": title, "message": msg}).encode()
    status, _, _ = http_request(
        "https://api.pushover.net/1/messages.json",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=data,
    )
    if status != 200:
        jwarn("pushover_failed", status=status)


# ───────────── CLI ─────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 1 conformance scorer")
    parser.add_argument("--repo", help="Score a single repo by key (e.g., HD, VK, XC)")
    parser.add_argument("--json-only", action="store_true", help="Skip markdown output")
    parser.add_argument("--pushover", action="store_true", help="Send Pushover digest")
    parser.add_argument("--check", action="store_true",
                        help="Exit 1 if any repo < threshold (Stage 4 prep; default off)")
    args = parser.parse_args()

    targets = REPOS if not args.repo else [r for r in REPOS if r["key"] == args.repo]
    if not targets:
        jerr("unknown_repo", key=args.repo)
        return 2

    scores: list[RepoScore] = []
    for entry in targets:
        scores.append(score_repo(entry))
        write_per_repo_json(scores[-1])

    write_summary_json(scores)
    if not args.json_only:
        write_summary_md(scores)
    if args.pushover:
        push_pushover(scores)

    for s in scores:
        jlog("repo_scored", repo=s.repo_path, cohesion=s.cohesion)

    if args.check:
        failing = [s for s in scores if s.cohesion < SHADOW_THRESHOLD]
        if failing:
            jerr("below_threshold", repos=[s.repo_key for s in failing], threshold=SHADOW_THRESHOLD)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
