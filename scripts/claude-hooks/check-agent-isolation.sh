#!/usr/bin/env bash
# =============================================================================
# Claude Code PreToolUse hook — agent worktree-isolation enforcer.
#
# Purpose:
#   Reject Agent({...}) calls that will likely touch git branch state or run
#   deploys without isolation: "worktree". Without isolation, parallel
#   sub-agents share the parent working tree and predictably:
#     - git checkout over each other's uncommitted edits
#     - git reset --hard wipes another agent's in-flight work
#     - background processes (wrangler deploys) get killed mid-flight by
#       another agent's branch operation
#
# Activation (opt-in, per the same philosophy as .githooks/pre-commit):
#   Add to .claude/settings.local.json (your clone only) or
#   .claude/settings.json (shared project policy):
#
#   {
#     "hooks": {
#       "PreToolUse": [
#         {
#           "matcher": "Agent",
#           "hooks": [
#             { "type": "command", "command": "bash ./scripts/claude-hooks/check-agent-isolation.sh" }
#           ]
#         }
#       ]
#     }
#   }
#
# Bypass:
#   - Pass isolation: "worktree" in the Agent call (correct fix)
#   - Use a read-only subagent_type (Explore, claude-code-guide, Plan, statusline-setup)
#   - Remove the hook from settings.json (escape hatch)
#
# Cross-platform note: relies on jq + bash. On Windows, runs under git-bash
# which ships with the Cloudflare/GitHub Desktop / Git for Windows install.
# =============================================================================
set -euo pipefail

# Tool input arrives on stdin as JSON. If we can't read or parse it, fail-open
# (exit 0) — we don't want to block all tool use because of a hook bug.
input="$(cat 2>/dev/null || true)"
if [ -z "$input" ]; then exit 0; fi
if ! command -v jq >/dev/null 2>&1; then
  echo "claude-hooks/check-agent-isolation: jq not found on PATH; skipping (fail-open)." >&2
  exit 0
fi

tool="$(printf '%s' "$input" | jq -r '.tool_name // ""' 2>/dev/null || true)"
[ "$tool" = "Agent" ] || exit 0

iso="$(printf '%s' "$input" | jq -r '.tool_input.isolation // ""' 2>/dev/null || true)"
if [ "$iso" = "worktree" ]; then exit 0; fi

# Read-only subagent types — no isolation needed because they don't write.
subtype="$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // ""' 2>/dev/null || true)"
case "$subtype" in
  Explore|claude-code-guide|Plan|statusline-setup) exit 0 ;;
esac

# Heuristic: only block when the prompt looks like it will touch branch state
# or trigger a deploy. Pure code-edit tasks are allowed without isolation
# because they're recoverable; branch-altering or deploy tasks are not.
prompt="$(printf '%s' "$input" | jq -r '.tool_input.prompt // ""' 2>/dev/null || true)"
risky_pattern='git[[:space:]]+(checkout|switch|reset|rebase|push|commit|cherry-pick|merge)|wrangler[[:space:]]+(pages[[:space:]]+)?deploy|gh[[:space:]]+pr[[:space:]]+create|npm[[:space:]]+publish'
if printf '%s' "$prompt" | grep -qiE "$risky_pattern"; then
  cat <<'MSG' >&2
❌ Agent call touches branch state or runs a deploy without isolation:"worktree".

This will race with other sub-agents in the same working tree — see today's
incident log in [[feedback_agent_worktree_isolation]] and CLAUDE.md
"Sub-Agent Isolation".

Fix one of:
  1. Add isolation: "worktree" to the Agent({...}) call.
  2. Use subagent_type: "Explore" if the work is read-only.
  3. Run the operation directly in the main session instead of spawning a sub-agent.

To bypass intentionally, remove this hook from .claude/settings*.json.
MSG
  exit 2
fi

exit 0
