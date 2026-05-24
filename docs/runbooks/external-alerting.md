# External Alerting — Pushover

> Defense Layer #2 of the [governance-of-governance decision](../decisions/2026-05-23-governance-of-governance.md). Out-of-band notification channel for state-mutating automation.

## What it does

Every automation that mutates state (auto-approves, auto-merges, auto-quarantines, etc.) calls the Pushover helper to emit a notification. Pushover is an external service — its failure modes do not overlap with GitHub Actions or our own workflow logic, so it provides visibility into what the bots are doing that survives even if the GH-side audit trail is compromised.

## How to call it

**As a library (preferred):**
```js
import { notify } from '../scripts/pushover-notify.mjs';

await notify({
  title: '[Factory · QUARANTINE] smoke-admin-studio (Tier-2)',
  message: '10 consecutive failures since 2026-05-21',
  url: 'https://github.com/.../actions/runs/12345',
  priority: 1,  // 0=normal, 1=high. 2 is clamped to 1 (no emergency retry).
});
```

**As a CLI (shell-only callers):**
```bash
PUSHOVER_TITLE='[Factory · QUARANTINE] smoke-admin-studio' \
PUSHOVER_MESSAGE='10 consecutive failures since 2026-05-21' \
PUSHOVER_URL='https://github.com/.../actions/runs/12345' \
PUSHOVER_PRIORITY=1 \
node .github/scripts/pushover-notify.mjs
```

## Required secrets

| Secret | Where it lives | What it is |
|---|---|---|
| `PUSHOVER_USER_KEY` | Repo Actions secrets | Your Pushover user key (from pushover.net profile) |
| `PUSHOVER_APP_TOKEN` | Repo Actions secrets | The `videoking-alerts` app token (or whatever app you've registered) |

**If either is missing**, `notify()` logs a warning, emits an audit log entry, and returns `{ sent: false, reason: 'secrets-missing' }`. Callers MUST NOT throw on this — notifications are advisory, never load-bearing.

## Behavior matrix

| Condition | Result |
|---|---|
| Secrets present, valid input, Pushover returns 2xx | `{ sent: true, status: 200 }` |
| Secrets present, valid input, Pushover returns 4xx/5xx | `{ sent: false, reason: 'http-NNN', status: N }` |
| Secrets present, valid input, network error | `{ sent: false, reason: 'network-error' }` |
| Either secret missing | `{ sent: false, reason: 'secrets-missing' }` — no API call |
| `.github/automation-paused` present (kill switch armed) | `{ sent: false, reason: 'automation-paused' }` — no API call |
| Title/message empty | `{ sent: false, reason: 'title-empty' \| 'message-empty' }` — no API call |

## Kill switch interaction

If `.github/automation-paused` exists on the runner's working tree at notify-time, the helper returns `automation-paused` without calling Pushover. Rationale: when the global kill switch is armed, you've already decided to silence the system — paging the operator about silenced bots would defeat the purpose.

Exception: if `PUSHOVER_USER_KEY` and `PUSHOVER_APP_TOKEN` are both missing (i.e., this is a dev/test env where the channel isn't configured), the pause check is skipped and the call exits via `secrets-missing` instead. Dev environments shouldn't run pause logic they have no way to observe.

## Audit trail

Every call emits a single-line JSON log to stdout prefixed with `PUSHOVER_AUDIT:`:

```
PUSHOVER_AUDIT: {"ts":"2026-05-23T20:14:00.000Z","sent":true,"reason":null,"title":"[Factory · QUARANTINE] smoke-admin-studio","priority":1}
```

Schema is stable — do not change field names without updating the monthly governance audit script that greps for these lines.

To inspect the last day's notifications:
```bash
gh run list --created '>1 day ago' --json databaseId -q '.[].databaseId' \
  | xargs -I{} gh run view {} --log 2>/dev/null \
  | grep '^PUSHOVER_AUDIT:' \
  | head -30
```

## Common failure modes

**No notifications arrived after a known event:**
1. Check audit lines for the workflow run. If `sent: true`, the issue is on Pushover/device side (notification permissions, do-not-disturb).
2. If `sent: false, reason: 'secrets-missing'`, secrets aren't wired to that workflow's environment.
3. If `sent: false, reason: 'automation-paused'`, the kill switch is armed.
4. If `sent: false, reason: 'http-429'`, you've hit Pushover rate limits (free tier: 10,000/month).

**Too many notifications (paging fatigue):**
1. Check audit lines to see which workflow is emitting most.
2. Tune thresholds in the caller (e.g., Warden's "consecutive failures before pager" threshold).
3. Last resort: arm the kill switch while you investigate.

**Notifications fired during a maintenance window:**
1. Arm the kill switch BEFORE the window starts (commit `.github/automation-paused`).
2. Clear it after the window.

## Test the integration

```bash
PUSHOVER_USER_KEY=<your-key> \
PUSHOVER_APP_TOKEN=<your-token> \
PUSHOVER_TITLE='[Factory · TEST] integration probe' \
PUSHOVER_MESSAGE='If you can see this, external alerting is healthy.' \
node .github/scripts/pushover-notify.mjs

# Expect: a Pushover notification arrives on your device within 5 seconds.
# Expect: stdout includes PUSHOVER_AUDIT: {... "sent":true ...}
# Expect: exit code 0.
```

## Why presence-only kill switch, not env var

The kill switch is checked via file presence (`.github/automation-paused`) rather than an env var (`AUTOMATION_PAUSED=1`). Reasons:

1. File presence is a property of the repo, not the runner — every workflow sees the same state without explicit wiring.
2. Visible in `gh pr view` / `git log` — auditable.
3. Cannot be partially broken by typo (`PAUSED=fasle`).
4. Reduces the kill switch's own failure modes to "file exists" or "doesn't exist" — no parsing, no interpretation.

## Related

- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — the four-defense model this is part of
- [`.github/AUTOMATION_PAUSED.md`](../../.github/AUTOMATION_PAUSED.md) — kill switch operator docs
- [`.github/scripts/pushover-notify.mjs`](../../.github/scripts/pushover-notify.mjs) — implementation
- [`.github/scripts/pushover-notify.test.mjs`](../../.github/scripts/pushover-notify.test.mjs) — test suite (23 tests)
