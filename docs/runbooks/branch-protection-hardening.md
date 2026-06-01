# Branch Protection Hardening Runbook

This runbook covers the `apply-sec-hardening.yml` workflow — the Factory repo's
self-healing layer for ops-critical GitHub state that has historically drifted
(see issue #529 and PR #602 for incidents).

## What it covers

| # | Dimension | API path | Canonical file | Behavior on drift |
| - | --------- | -------- | -------------- | ----------------- |
| 1 | Classic Ruleset id `15843812` | `PUT /repos/{owner}/{repo}/rulesets/{id}` | `.github/security/main-ruleset.json` | Auto-repair (PUT canonical) + verify |
| 2 | Org-level Copilot coding-agent enablement | `GET /orgs/{org}/copilot/coding-agent/permissions` | (no file — read-only verify) | Warn-only (no per-repo writer exists) |

> **History (consolidation):** Factory previously ran a second dimension that
> PUT `.github/security/main-branch-protection.json` against the legacy
> `/branches/main/protection` API. PR #1000 brought the ruleset to parity-or-
> better with that mechanism (added `dependency-review` + flipped
> `required_review_thread_resolution` to `true`); the legacy half was retired
> after an 8-hour parallel-enforcement soak with zero drift. The legacy
> `/branches/main/protection` rules will sit unused on GitHub until an
> operator runs `gh api repos/Latimer-Woods-Tech/Factory/branches/main/protection -X DELETE`
> — not required for correctness; the ruleset enforces protection alone.

## What it does NOT cover

The **per-repo Copilot "skip approval for Copilot coding-agent workflows"
toggle** (announced in the [2026-03-13 GitHub changelog][skip-approval]) is
**UI-only** as of 2026-05-09. We probed every documented endpoint shape:

| Probe | Result |
| ----- | ------ |
| `GET repos/{owner}/{repo}/copilot/coding-agent` | 404 |
| `GET repos/{owner}/{repo}/copilot/coding_agent` | 404 |
| `GET repos/{owner}/{repo}/copilot/settings` | 404 |
| `GET repos/{owner}/{repo}/copilot` | 404 |
| `GET repos/{owner}/{repo}/actions/permissions/copilot` | 404 |
| `GET repos/{owner}/{repo}/actions/permissions/copilot-coding-agent` | 404 |
| `GET orgs/{org}/copilot/coding-agent` | 404 |
| `GET orgs/{org}/copilot/settings` | 404 |
| GraphQL `Repository.copilotPreviewSettings` | undefined field |

The official docs at
[`/rest/copilot/copilot-coding-agent-management`][docs-cca] list eight
endpoints (enterprise policy, org policy, per-repo enable/disable). None of
them control the per-repo skip-approval toggle. The workflow emits a
`::warning::` on every scheduled run with a pointer to this section.

[skip-approval]: https://github.blog/changelog/2026-03-13-optionally-skip-approval-for-copilot-coding-agent-actions-workflows/
[docs-cca]: https://docs.github.com/en/rest/copilot/copilot-coding-agent-management?apiVersion=2026-03-10

### Manual steps (per-repo Copilot toggle)

If the workflow run summary shows "Per-repo Copilot 'skip approval for
workflows' toggle is NOT API-controllable", verify the UI state at:

1. https://github.com/Latimer-Woods-Tech/Factory/settings/actions
2. Scroll to **Code & automation -> Actions -> General**.
3. Under the Copilot section, confirm "Require approval for all external
   contributors" is configured the way you want it for Copilot.
4. If it has regressed (e.g., re-prompting for approval on Copilot SWE Agent
   PRs that were previously auto-running), flip it back and add a note on
   issue [#602 §5 item #17][audit].

[audit]: https://github.com/Latimer-Woods-Tech/Factory/pull/602

## Cadence

- **Schedule:** every hour at `:47` (1h cadence).
- Was 6h until 2026-05-09; raised to 1h after #602 §7 rec #1 because
  branch-protection drift caused by manual UI changes can sit unrepaired for
  most of a workday under a 6h cycle.
- Offset 30 min after `policy-drift-guard.yml` (which runs at `:17`) so
  detection -> repair completes within the same cycle.

## How to update canonical config

To change the ruleset:

1. Edit `.github/security/main-ruleset.json`.
2. Open a PR. CI does not test the PUT (we won't apply unmerged config).
3. After merge, the next scheduled run (within 1h) will detect drift between
   the new canonical and live state, then PUT the canonical.
4. Alternatively, run `gh workflow run apply-sec-hardening.yml -R Latimer-Woods-Tech/Factory`
   for an immediate apply.

> **Required-status-check contexts MUST be bare check job names** (`validate`,
> `Analyze (javascript)`), never workflow-prefixed (`CI / validate`). Issue
> #529 was caused by exactly that mistake. The workflow's sanity check fails
> hard if the canonical contains `' / '` in any context.

## Manual repair (escape hatch)

If the workflow itself is broken or you need an immediate fix:

```bash
# Ruleset
gh api -X PUT repos/Latimer-Woods-Tech/Factory/rulesets/15843812 \
  -H "Accept: application/vnd.github+json" \
  --input <(jq 'del(._comment)' .github/security/main-ruleset.json)
```

After running either, **verify** with `curl` (per CLAUDE.md verification rule):

```bash
gh api repos/Latimer-Woods-Tech/Factory/branches/main/protection \
  --jq '.required_status_checks.contexts'
gh api repos/Latimer-Woods-Tech/Factory/rulesets/15843812 \
  --jq '[.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context]'
```

Both should output `["validate","Analyze (javascript)","dependency-review"]`
(or `["validate","Analyze (javascript)"]` for the ruleset) — confirm with
your eyes, not just CI.

## Rollback

To revert to the pre-1h, single-dimension behavior:

1. Revert the PR that introduced this runbook (and the workflow extension).
2. The cron returns to `47 */6 * * *`.
3. Only branch-protection (dimension 1) is checked.
4. Canonical files are unchanged on either side of the revert — no live state
   change.

## Related

- `docs/runbooks/automation-audit.md` — full landscape (PR #602)
- `docs/runbooks/secret-rotation.md` — for `FACTORY_APP_PRIVATE_KEY` rotation
- `.github/workflows/policy-drift-guard.yml` — the drift detector
