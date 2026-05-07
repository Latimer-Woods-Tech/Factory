# 2026-05-06 - agent ship orchestrator

## What changed
- Added `scripts/agent-ship.mjs` as the canonical Factory-owned cross-repo shipping orchestrator.
- Added `scripts/agent-ship.repos.mjs` with repo-specific validation contracts for `videoking`, `xico-city`, `humandesign`, `coh`, and `focusbro`.
- Added `.vscode/tasks.json` to expose validate and ship flows in the workspace.
- Added optional PR creation/update support through GitHub CLI in the ship orchestrator.
- Added `docs/runbooks/agent-ship.md` to document the operating model and safety rules.
- Updated `README.md` and `docs/AGENTS.md` to point operators and agents at the canonical shipping path.

## What was verified
- `node scripts/agent-ship.mjs --list`
- `node scripts/agent-ship.mjs --repo videoking --validate-only`
- `node scripts/agent-ship.mjs --repo xico-city --validate-only`
- `node scripts/agent-ship.mjs --repo coh --validate-only`
- `node scripts/agent-ship.mjs --repo humandesign --validate-only` correctly failed on missing `GITHUB_TOKEN`
- `node scripts/agent-ship.mjs --repo focusbro --validate-only` correctly reported the missing validate contract
- `node scripts/agent-ship.mjs --repo videoking --message "chore(videoking): dry-run ship" --dry-run`
- `node scripts/agent-ship.mjs --help` after adding PR flags
- workspace diagnostics for the new Factory files

## What's left
- Extend the registry when additional external repos are added to the workspace.
- Mature `focusbro` with a real validate contract so `--allow-unvalidated` is no longer needed.
- Provide `GITHUB_TOKEN` when using the Factory orchestrator to validate or ship `humandesign`.
- Decide whether to add reusable PR body templates on top of the new PR orchestration.

## Decisions made / pending
- Decided to keep repo-specific validation commands in a central Factory registry instead of copying ship scripts into every repo.
- Decided to block unvalidated repos by default.
- Decided to use local GitHub CLI for PR creation and update so the orchestrator can complete the repo ship path end to end.