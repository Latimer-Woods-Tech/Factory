# Agent Ship Runbook

## Purpose

Factory owns the canonical cross-repo shipping orchestration for the external app repos in this workspace.

The orchestration entrypoint is:

```bash
node scripts/agent-ship.mjs
```

The repo contract lives in:

```bash
scripts/agent-ship.repos.mjs
```

This keeps shipping policy centralized in Factory while allowing each external repo to keep its own validation commands.

## Registered Repos

Current fleet in the registry:

1. `videoking`
2. `xico-city`
3. `humandesign`
4. `coh`
5. `focusbro`

If a repo has no safe validation contract yet, the registry leaves `validate` empty and shipping is blocked unless `--allow-unvalidated` is passed.

Current exceptions observed during validation:

1. `humandesign` requires `GITHUB_TOKEN` for `npm run verify:push`
2. `focusbro` has no mature validate contract yet and is intentionally blocked by default for unattended shipping

## Commands

List repos:

```bash
node scripts/agent-ship.mjs --list
```

Validate one repo:

```bash
node scripts/agent-ship.mjs --repo videoking --validate-only
```

Validate all registered repos:

```bash
node scripts/agent-ship.mjs --all --validate-only
```

Commit and push one repo:

```bash
node scripts/agent-ship.mjs --repo videoking --message "chore(videoking): example"
```

Commit, push, and create or update a pull request:

```bash
node scripts/agent-ship.mjs --repo videoking --message "chore(videoking): example" --open-pr --pr-title "chore(videoking): example"
```

Commit without push:

```bash
node scripts/agent-ship.mjs --repo xico-city --message "chore(xico-city): example" --no-push
```

Dry run:

```bash
node scripts/agent-ship.mjs --repo humandesign --message "chore(humandesign): example" --dry-run
```

## Safety Rules

1. Validation runs before commit and push unless `--allow-unvalidated` is explicitly set.
2. Shipping from `main` is blocked unless `--allow-main` is explicitly set.
3. Merge-conflicted repos are blocked.
4. Clean repos are treated as a no-op.
5. Repos without upstream tracking are pushed with `git push -u origin <branch>`.
6. Validation steps can fail on output patterns, not only exit codes, for repos whose legacy scripts log fatal conditions without returning non-zero.
7. Pull request automation requires GitHub CLI (`gh`) and an authenticated GitHub session or token.

## VS Code Tasks

Factory now includes these workspace tasks:

1. `factory: agent ship repo`
2. `factory: agent validate repo`
3. `factory: agent validate all repos`
4. `factory: agent ship repo dry run`
5. `factory: agent ship repo and open PR`

These tasks call the same orchestrator and keep the shipping surface consistent.

## Maintenance

When adding or changing a repo contract:

1. update `scripts/agent-ship.repos.mjs`
2. run `node scripts/agent-ship.mjs --list`
3. run `node scripts/agent-ship.mjs --repo <name> --validate-only`
4. update this runbook if the safety model changes