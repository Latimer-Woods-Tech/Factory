# Playbook: Branch-Protection Hardening
> Loaded by the supervisor for `branch-protection-hardening` template.  
> Canonical policy owner: `docs/supervisor/plans/branch-protection-hardening.yml`

## Purpose

This playbook defines the phased promotion of CI/GitHub status checks from
**warn-only (report mode)** to **required (blocking mode)** on protected
branches.  It is referenced by the parent rollout issue
[#270](https://github.com/Latimer-Woods-Tech/factory/issues/270) and
implements the gradual-hardening policy agreed there.

---

## The three-phase model

### Phase 0 — Baseline audit

Before adding any new check:

1. Run `gh api repos/Latimer-Woods-Tech/factory/branches/main/protection` and
   record the current `required_status_checks.contexts` list.
2. Capture a 7-day window of CI run data (pass/fail counts per check name) to
   establish a false-positive baseline for existing checks.
3. File or update the tracking comment on the parent rollout issue (#270) with
   the baseline data.

Artifact: comment on #270 with a snapshot table:

```
| Check name | 7-day runs | failures | failure-rate |
|---|---|---|---|
| validate    | 42         | 2        | 4.8%         |
```

### Phase 1 — Add check in warn-only mode

New checks are wired in CI first **without** being listed under
`required_status_checks`.  This means they run on every PR and produce a
pass/fail status, but a failing check does **not** block merge.

Steps:

1. Author a PR that adds or enables the check in the relevant workflow
   (`.github/workflows/ci.yml` or a dedicated workflow file).
2. In the PR description, note: `mode: warn-only — not yet required`.
3. Apply the label `hardening:warn-only` to the PR so the project board
   reflects Phase 1 state.
4. After merge, confirm the check appears on the next PR as a non-blocking
   status line.

### Phase 2 — Observe and measure

Run the check in warn-only mode for a **minimum of 14 calendar days** while
tracking:

| Metric | Threshold to promote |
|---|---|
| False-positive rate | < 5% of all runs |
| P50 check duration | < 5 min (does not gate promotions, but logged) |
| Distinct PRs blocked in warn mode | > 0 (confirms the check fires) |

False positive: a check run that fails on code that is actually correct
(human override required within 24 h, or a supervisor-filed issue with label
`hardening:fp`).

**Data source:** The `factory_events` analytics table records check run
outcomes when the `analytics` package integration is active.  Alternatively,
use the GitHub Checks API:

```bash
# List recent check runs for a given check name
gh api "repos/Latimer-Woods-Tech/factory/commits/{sha}/check-runs?check_name={name}" \
  --jq '[.check_runs[] | {name,conclusion,started_at}]'
```

### Phase 3 — Promote to required

**Pre-conditions (all must be true):**

1. Warn-only observation period ≥ 14 days.
2. False-positive rate < 5% over the observation window.
3. No other check was promoted in the **same calendar week** (one check per
   week maximum).
4. A CODEOWNER has reacted ✅ on the promotion issue.

**Promotion steps:**

1. Open a PR that adds the check name to `required_status_checks.contexts` in
   the branch-protection ruleset (via the GitHub API call below or a
   `.github/workflows/policy-drift-guard.yml` update).
2. Label the PR `hardening:promote`.
3. After merge, verify the check appears as **required** on the next PR opened
   against `main`.
4. Remove the `hardening:warn-only` label from the tracking issue and add
   `hardening:required`.
5. Update the tracking comment on #270 with the promotion date.

API call to add a required check (idempotent):

```bash
# Read current required checks
current=$(gh api repos/Latimer-Woods-Tech/factory/branches/main/protection \
  --jq '.required_status_checks.contexts')

# Add the new check name and PUT the updated ruleset
gh api repos/Latimer-Woods-Tech/factory/branches/main/protection \
  --method PUT \
  --field required_status_checks="$(echo "$current" | jq -c '. + ["<check-name>"]')" \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

---

## Rollback

If a promoted check causes merge blockage due to a false positive:

1. Open an emergency PR to remove the check name from `required_status_checks`
   (reverse of the promotion API call above).
2. Label the rollback PR `hardening:rollback`.
3. File a `hardening:fp` issue against the specific check with the PR number
   and failure evidence.
4. Reset the observation window (Phase 2) for that check — the 14-day clock
   restarts from zero after a rollback.

---

## Cadence and constraints

| Rule | Detail |
|---|---|
| One promotion per week | Never promote two checks in the same calendar week |
| 14-day minimum | Warn-only window cannot be shortened, even if FP rate is 0% |
| Human ✅ required | CODEOWNER reaction gating (FRIDGE rule 8) |
| Rollback resets clock | False-positive after promotion → 14-day re-observation |

---

## Check inventory

Maintain a table of known checks and their current hardening phase.  Update
this table after every promotion or rollback.

| Check name | Added | Phase | Observation window | FP rate | Promoted |
|---|---|---|---|---|---|
| `validate` | pre-repo | required | — | — | at repo creation |

Add new rows when checks enter Phase 1.

---

## Lessons learned

- **Start narrow.** Adding checks that cover only part of the codebase first
  reduces blast radius during Phase 2.
- **Name checks precisely.** The check name in `required_status_checks` must
  match the `name:` field in the workflow step exactly (case-sensitive).
- **Don't combine check addition with unrelated refactoring.** A check that
  lands alongside a large refactor is harder to diagnose when it fails.
