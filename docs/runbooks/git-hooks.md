# Git Hooks (Local Safety Net)

> Lightweight pre-commit safety net. Catches wrong-branch commits and detached-HEAD commits before they happen.

## Why this exists

A class of errors specific to multi-branch workflows (and especially to automated agents working in this repo): a `git checkout` silently fails, the agent doesn't notice, and subsequent commits land on the wrong branch. Recovery is straightforward (cherry-pick) but costly enough that prevention is worth a 50-line shell script.

This hook caught its first regression on 2026-05-23 — the lifecycle work earlier in this session had two such failures that the hook would have prevented.

## What the hook does

`.githooks/pre-commit` runs before each `git commit` and:

**Hard fails (block the commit):**
- Detached HEAD (no current branch)
- Commit targeting `main` or `master` directly

**Always prints (visibility):**
- Current branch name
- Count of staged files + the first 10 paths

**Soft warnings (do not block):**
- Staged content contains a "REMOVE BEFORE MERGE" marker
- Branch name starts with `origin/` (unusual)

## How to activate (per clone)

The hook lives in the repo at `.githooks/pre-commit`. Git doesn't run it until you explicitly point at the directory:

```bash
git config core.hooksPath .githooks
```

That's a one-time setup per clone. After that, every `git commit` runs the hook.

To verify it's active:

```bash
git config core.hooksPath
# expected output: .githooks
```

## How to bypass (use sparingly)

```bash
git commit --no-verify -m "..."
```

Bypassing is sometimes legitimate (rebasing, emergency fix, you're committing on main intentionally with rights). The hook exists as a safety net, not a gate. CI checks provide the load-bearing enforcement.

## What this hook is NOT

- **Not a code-quality linter.** That's a different layer.
- **Not the only protection.** Branch protection (ruleset 15843812) is the actual gate.
- **Not enforced across all contributors.** Each clone activates it independently. The repo cannot force activation.

## Failure modes & how to recover

### Hook is too noisy
The visibility banner (`🌿 pre-commit: branch=...`) prints on every commit. If you find it noisy:

```bash
git config core.hooksPath ""  # disable
```

Or edit `.githooks/pre-commit` to comment out the visibility section.

### Hook is blocking a legitimate commit
Use `--no-verify`. If you find yourself bypassing routinely, the hook's rule is too strict — open a PR to relax it.

### Hook fails with a permission error on Unix-like systems
```bash
chmod +x .githooks/pre-commit
```

(Windows users running Git for Windows / WSL don't need this; the Bash shim handles it.)

## Future iterations

Possible additions, NOT in this PR:

- **Scope check**: warn if a branch like `feat/admin-foo` is staging files outside `apps/admin/` (a heuristic; would need a per-branch convention map)
- **Commit message lint**: enforce `<type>(<scope>): <description>` per CLAUDE.md commit format
- **Pre-push hook**: re-run tests / typecheck before push
- **Server-side hook (CI-equivalent)**: a workflow that scans new commits' branch refs and posts a comment if they look mis-routed

If any of these become valuable, they ship as separate small PRs. This PR keeps the hook minimal so its mental cost stays minimal.

## Related

- [`.githooks/pre-commit`](../../.githooks/pre-commit) — the hook itself
- `git help hooks` — upstream Git documentation
- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — the four-defense model (this hook is supplementary, not part of those four defenses)
