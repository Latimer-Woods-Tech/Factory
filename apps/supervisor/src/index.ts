## 🚨 Review Limit Reached — Manual Intervention Required

PR **[#297: feat(admin+supervisor): hardened automation — LLM consensus, hallucination guards, supervisor template pipeline, docs quality gate](https://github.com/Latimer-Woods-Tech/factory/pull/297)** has been rejected by the 2-party LLM reviewer **3 times** without a successful fix.

### Unresolved concerns
- **Bot** · `?`: - **Architecture** · `apps/supervisor/src/index.ts:23`: Using Node.js Buffer in Worker source code — must use Uint8Array, TextEncoder, TextDecoder instead
- **Bot** · `?`: - **Architecture** · `apps/supervisor/src/planner/load.ts:34`: Using Node.js Buffer in Worker source code — must use Uint8Array, TextEncoder, TextDecoder instead

### Action required
1. Open the PR: https://github.com/Latimer-Woods-Tech/factory/pull/297
2. Read the review comments from `factory-cross-repo[bot]`
3. Either approve the PR (if the bot is wrong) or close it and fix the underlying issue

_Filed automatically by factory-cross-repo after 3 failed review cycles._