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

## Companion enforcement: Claude Code agent isolation

The pre-commit hook catches *commits* that landed on the wrong branch. It does **not** catch the upstream cause: parallel Claude Code sub-agents sharing one working tree and doing `git checkout` / `git reset --hard` over each other's in-flight edits.

Today's primary defense for that is a sentence in [`CLAUDE.md`](../../CLAUDE.md) ("Sub-Agent Isolation") instructing every write-capable `Agent` invocation to pass `isolation: "worktree"`. That converts the agent's work into a temporary `git worktree`, separate from the parent tree.

### Optional third-layer enforcement (PreToolUse hook)

If the soft rule keeps getting bypassed, install a Claude Code `PreToolUse` hook that hard-rejects `Agent` calls missing `isolation: "worktree"` when the prompt mentions branch-altering or deploy operations. Sketch:

`scripts/claude-hooks/check-agent-isolation.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // ""')
[ "$tool" = "Agent" ] || exit 0

iso=$(printf '%s' "$input" | jq -r '.tool_input.isolation // ""')
[ "$iso" = "worktree" ] && exit 0

subtype=$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // ""')
case "$subtype" in
  Explore|claude-code-guide|Plan|statusline-setup) exit 0 ;;
esac

prompt=$(printf '%s' "$input" | jq -r '.tool_input.prompt // ""')
if echo "$prompt" | grep -qiE 'git (checkout|switch|reset|rebase|push|commit)|wrangler (pages )?deploy|gh pr create'; then
  echo "❌ Agent call writes to branch/deploy state without isolation:'worktree'." >&2
  echo "   Add isolation: 'worktree' to this Agent({...}) call, or use subagent_type=Explore for read-only work." >&2
  exit 2
fi
exit 0
```

Wire it into `.claude/settings.json` (project-shared) or `.claude/settings.local.json` (just your clone):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [{ "type": "command", "command": "bash ./scripts/claude-hooks/check-agent-isolation.sh" }]
      }
    ]
  }
}
```

This is **opt-in by the same logic as the pre-commit hook** — a safety net, not a gate. It's documented here rather than installed by default so you can evaluate whether it produces too many false positives in your specific multi-agent workflow before turning it on.

## Worktree & merged-branch hygiene policy (RFC-006 Phase 0)

Adopted 2026-06-11 per RFC-006 Phase 0. Governs local clones, agent worktrees, and remote branches.

**Worktrees:**

- A worktree whose branch is **merged and whose tree is clean** may be removed automatically (`git worktree remove`). No approval needed.
- A worktree that is **dirty or whose branch is unmerged** is REPORTED but never deleted automatically — by any agent, sweep, or cleanup script. Uncommitted work is unrecoverable; deletion requires the human operator.
- Agents finishing a task in an isolated worktree must commit and push BEFORE ending their session. An uncommitted worktree at session end is a defect (this policy exists because of a real loss: the original RFC-006 draft died in an unpushed worktree, 2026-06-10).

**Remote branches:**

- `claude/*`, `auto/*`, `matrix-sync/*`, and `supervisor/*` branches whose PR is merged or closed may be deleted automatically (GitHub's "Automatically delete head branches" + periodic sweep).
- Unmerged remote branches older than 30 days are listed in the weekly governance checkpoint for manual review — never auto-deleted.

**Recovery:** a deleted merged branch is always recoverable from the merge commit. A deleted dirty worktree is not. That asymmetry is the entire policy.

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
