# Completion Tracker — Operator Doc

This directory contains the cross-repo completion-tracking system for the five Latimer-Woods-Tech products: **HumanDesign (HD)**, **videoking (VK)**, **Factory / apps/admin-studio (FA)**, **cypher-healing (CH)**, **xico-city (XC)**.

## File layout

Lives in the **Factory** repo:

```
.github/workflows/
  completion-tracker.yml        # nightly aggregate + drift PR
  label-sync.yml                # label-driven matrix updates
.github/
  label-sync-config.yml         # repo list, label conventions, status map
scripts/
  aggregate_completion.py       # main aggregator (this dir's .py)
  sync_labels_to_matrix.py      # label → matrix reconciler (companion)
  init-matrix-issues.py         # one-shot seeder (creates feature:* issues)
docs/
  COMPLETION_TRACKER.md         # human-readable roll-up (PR-managed)
  completion-tracker.json       # full snapshot (PR-managed)
  completion-tracker-history.jsonl # append-only history (PR-managed)
```

Lives in each **product repo**:

```
.github/workflows/notify-factory.yml
docs/FUNCTIONS_MATRIX.md        (HD, VK, CH, XC)
apps/admin-studio/docs/FUNCTIONS_MATRIX.md  (FA)
```

## Secrets (Factory repo → Settings → Secrets and variables → Actions)

| Secret                     | Used by                | How to set                                                                                |
|---------------------------|------------------------|-------------------------------------------------------------------------------------------|
| `FACTORY_APP_ID`           | both workflows         | App ID of the `factory-cross-repo` GitHub App (Settings → Developer settings → GitHub Apps) |
| `FACTORY_APP_PRIVATE_KEY`  | both workflows         | PEM private key for that App (paste the entire file including `-----BEGIN/END-----` lines) |
| `SENTRY_AUTH_TOKEN`        | aggregator             | Sentry → Settings → Auth Tokens → scope `org:read event:read project:read` for org `latwood-tech` |
| `PUSHOVER_USER`            | aggregator digest      | Pushover account → User Key                                                               |
| `PUSHOVER_TOKEN`           | aggregator digest      | Pushover → Create Application → API Token                                                 |

The `factory-cross-repo` App must be installed on **HumanDesign, videoking, Factory, cypher-healing, xico-city** with these repo permissions: Contents: read+write, Pull requests: read+write, Issues: read, Actions: read.

## Trigger model

`completion-tracker.yml` runs:

1. **Scheduled** — cron `30 10 * * *` (06:30 ET ≈ 10:30 UTC).
2. **Manual** — `workflow_dispatch`.
3. **Reactive** — `repository_dispatch[matrix-updated]`, fired by each product repo's `notify-factory.yml` whenever the matrix file changes on `main`.

`label-sync.yml` runs on issue events **within the Factory repo** and on a daily 11:00 UTC reconciler sweep. Issue events from product repos (HumanDesign, videoking, cypher-healing, xico-city) do **not** directly trigger this workflow — label changes in those repos are picked up by the scheduled sweep. For near-real-time reactivity from a product repo, that repo must emit a `repository_dispatch[matrix-updated]` event to Factory (the same mechanism used by `notify-factory.yml`).

## Drift-PR flow

The aggregator writes `docs/COMPLETION_TRACKER.md`, `docs/completion-tracker.json`, and appends a line to `docs/completion-tracker-history.jsonl`. If any of those three changed, the workflow:

1. Creates branch `completion-tracker/<DATE>-<RUN_ID>`.
2. Commits as `factory-cross-repo[bot]`.
3. Opens a PR titled `completion-tracker drift <DATE> — <PCT>% weighted`.
4. Adds labels `automation`, `documentation`, `auto-merge` — the existing `auto-merge-approved-prs.yml` flow picks these up.

The PR body contains the rendered `COMPLETION_TRACKER.md` digest, capped at 60 KB.

## Status emoji legend (strict)

| Emoji | Meaning |
|---|---|
| ✅ | automated test exists AND latest CI run on main is green AND no unresolved Sentry issues touching this row's endpoint |
| ⚠️ | passes tests but has open Sentry issues OR known issues in production |
| ❌ | automated test missing, OR CI failing, OR confirmed broken in production |
| 🔍 | not yet verified (default for new rows; auto-set when Last Verified > 30 days) |

The aggregator parser refuses rows whose Status cell does not **start** with one of these. No emoji-overloading.

## How to add a new repo

1. Add a row to `REPOS` in `scripts/aggregate_completion.py` (key, name, repo, matrix_path).
2. Add the same row to `.github/label-sync-config.yml`.
3. Add the repo to the App installation, and to the `repositories:` list in both workflows (`completion-tracker.yml` and `label-sync.yml`).
4. Add to `SMOKE_AFFECTED` in `aggregate_completion.py` for any sections that should react to smoke-test red. Edit this list intentionally — no inference.
5. Drop `.github/workflows/notify-factory.yml` into the new repo so it can fire `repository_dispatch[matrix-updated]`.
6. Run `python scripts/init-matrix-issues.py --repo <owner/name> --matrix <path>` once to seed `feature:*` issues.

## How to flip a row's status

You have three paths. Choose one:

### A. Edit the matrix directly
PR against `docs/FUNCTIONS_MATRIX.md` (or `apps/admin-studio/docs/FUNCTIONS_MATRIX.md` for Factory). Change the emoji in the Status column. Don't break the 11-cell row shape. Update Last Verified to today. The next aggregator run picks it up.

### B. Label-driven (recommended)
Find the issue titled `[<ID>] <Feature name>` in the relevant repo. Swap its `status:*` label (`status:passing`, `status:issues`, `status:fail`, `status:unknown`). The label-sync workflow will open a PR against the matrix to reconcile. The convention is:

- `feature:<ID>` (required, e.g. `feature:HD-AUTH-001`) — identifies the row
- `status:passing | issues | fail | unknown` (required) — maps to ✅ / ⚠️ / ❌ / 🔍
- `weight:1 | 2 | 3 | 4 | 5` (optional override; matrix is canonical otherwise)
- `owner:@<handle>` (optional override)

### C. Side effects
Sentry-only changes are automatic on the next aggregator run (✅ → ⚠️ when a touching issue is unresolved). CI-RED tags appear automatically. Decay (Last Verified > 30 days) flips Status to 🔍 automatically.

## Overlays — what they do

| Overlay | Source | Effect |
|---|---|---|
| Sentry | `https://sentry.io/api/0/organizations/latwood-tech/issues/?statsPeriod=24h&query=is:unresolved` | Any ✅ row whose Endpoint/Component contains a route segment from an unresolved issue → ⚠️ with overlay tag `sentry-open`. |
| Actions | `GET /repos/{owner}/{repo}/actions/runs?branch=main&status=completed&per_page=1` | If latest run on main is `conclusion=failure`, repo gets a 🚨 banner and every ✅ row in that repo gets visual tag `CI-RED`. **Status emoji is not changed.** |
| Smoke | Latest run of any workflow whose name contains "smoke" | If red, sections enumerated in `SMOKE_AFFECTED` get `❌ smoke red` prepended to the Notes column. Heuristic by repo+section fragment — explicit, no clever inference. |
| Decay | Row's `Last Verified` date | If older than 30 days, Status → 🔍, Notes gets `(auto-decay)`. |

## Pushover digest format

```
Completion: 47.0% (Δ+1.5) | known: 62%
HD: 75% (Δ+1) • VK: 0% (Δ+0) • FA: 0% (Δ+0) • CH: 0% (Δ+0) • XC: 0% (Δ+0)
↑ wins: HD-CHART-005, VK-BILL-002, ...
↓ regressions: HD-AUTH-004, ...
🚨 CI red: HD, VK
```

If `PUSHOVER_USER` or `PUSHOVER_TOKEN` is unset the digest is skipped (warn, not fail).

## Troubleshooting

### Malformed rows
The parser strictly requires 11 pipe-separated cells; Status must START with a legend emoji; ID must match `^[A-Z]+-[A-Z0-9]+-\d+$` (middle segment may contain digits, e.g. `XC-S01-001`); Weight must be an integer. Malformed rows are logged to stderr (structured JSON) and counted in the snapshot's `malformed[]` with `repo_key`, `matrix_path`, `line_no`, `reason`. The `COMPLETION_TRACKER.md` lists them at the bottom. Fix the source row and re-run.

### Sentry rate limits
Sentry caps issue list at ~100 requests/min per token. The aggregator makes a single list call per run; if you see HTTP 429 in stderr, the retry-with-backoff (4 attempts, exponential) handles it. If it still fails the overlay is skipped (no ✅ → ⚠️ downgrades that run) and a `sentry_fail` event is logged. Re-running the workflow is safe.

### App token scope mismatch
If `fetch_matrix_fail` shows 404 for a repo the App is installed on, the App probably wasn't granted Contents:read on that specific repo. Reinstall and re-tick repos in the App settings.

### Drift PR didn't open
Check `steps.drift.outputs.changed`. If `false` the outputs were byte-identical to the previous run — no PR by design. To force one, set the `force_pr` input to `"true"` when triggering via `workflow_dispatch`, or run `git commit --allow-empty` against the docs in a manual run.

### Pushover digest didn't fire
The aggregator logs `pushover_skipped_no_creds` if either secret is missing. `pushover_fail` with non-200 means Pushover rejected the message — usually a wrong user key or rate cap (10k messages/month per app).

### Label-sync looped
If you see the same `matrix-sync/` branch reopen after merge, the issue label probably disagrees with what was just merged. Resolve by editing the issue label, not the matrix.

### XC matrix has `&#124;` in cells
Intentional. The xico-city registry has endpoints with literal `|` (e.g. `rekordbox|serato`). Pipes inside table cells break the parser, so they're rendered as `&#124;` — which GitHub renders as `|` in the table.
