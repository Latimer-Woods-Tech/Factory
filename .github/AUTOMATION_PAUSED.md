# Automation Kill Switch

> **TL;DR:** Create the file `.github/automation-paused` on `main` and every Factory automation that mutates state will skip-cleanly until the file is removed.

This file (`AUTOMATION_PAUSED.md`, uppercase) is **documentation**. The trigger is the lowercase, extensionless `automation-paused` file in the same directory. The trigger MUST NOT exist on main except during a deliberate freeze.

## Purpose

A single, presence-based chokepoint for the entire Factory automation surface. Defense Layer #1 from the [workflow lifecycle decision](../docs/decisions/2026-05-23-workflow-lifecycle.md)'s "governance of governance" section.

## What respects it

| Surface | Phase | Behavior when paused |
|---|--:|---|
| `snapshot-pr-helper.mjs` | 2 | Skip-clean (exit 0), post one-line "paused" comment on PR |
| Workflow Health Warden | 3 (planned) | No auto-quarantine, no auto-disable |
| Workflow budget gate | 4 (planned) | Advisory only (does not block PRs) |

## What does NOT respect it (by design)

- **GitHub branch protection ruleset 15843812** — enforced by GitHub itself, outside Factory's control loop. Working as intended.
- **`apply-sec-hardening`** — re-applies branch protection from canonical config. Pausing this would re-open the incident class it exists to close (#529).
- **`credential-scrub`, `codeql`, `dependency-review`** — PR gates that must keep working even during a freeze; otherwise you can't merge a fix for whatever caused the freeze.
- **Manual `gh` CLI actions by a human** — pausing automation should not pause humans.

## How to use

**Pause (full procedure):**

```bash
gh api repos/Latimer-Woods-Tech/Factory/contents/.github/automation-paused \
  -X PUT \
  -f message="freeze automation: <one-line reason>" \
  -f content="$(printf '' | base64)" \
  -f branch=chore/automation-pause-$(date -u +%Y%m%d-%H%M)

gh pr create --base main \
  --head chore/automation-pause-$(date -u +%Y%m%d-%H%M) \
  --title "🛑 PAUSE Factory automation" \
  --body "Reason: <what triggered the freeze>. Resume by deleting .github/automation-paused."
```

CODEOWNER review and merge. The freeze takes effect on the next event.

**Resume:**

Open a PR deleting `.github/automation-paused`. CODEOWNER review and merge.

**Verify what's paused right now:**

```bash
gh api repos/Latimer-Woods-Tech/Factory/contents/.github/automation-paused 2>/dev/null \
  && echo "🛑 PAUSED" \
  || echo "✓ active"
```

## Why presence-only (no YAML, no toggle)

- Fewer failure modes — the kill switch cannot misinterpret its own content
- Cannot be partially broken by a typo (`PAUSED=fasle`)
- Reviewable in one glance from `gh pr view` — file is added or removed, full stop
- Smaller surface area = less to verify when the kill switch is the thing you're relying on

## Why this matters

The argument that drove its addition: every additional layer of automation adds both protection AND new surface area for hallucinated or drifted behavior. Periodic audits help, structural blast-radius limits help, but the most powerful defense is a single switch that disengages everything fast — without requiring the operator to remember which workflow to disable.

See the discussion in [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../docs/decisions/2026-05-23-workflow-lifecycle.md) ("Governance of Governance" section, added pre-Phase 3).
