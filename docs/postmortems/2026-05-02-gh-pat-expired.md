# 2026-05-02: GH_PAT expired, blocked GitHub Actions supervisor first run

**Severity:** P3  **Duration:** ~10 minutes  **Impact:** First supervisor run failed, Pushover alert sent

## What happened
The `GH_PAT` org secret held an expired PAT. The supervisor loop used it to read templates from the factory repo. First run: `FATAL: 401 Bad credentials`. Pushover alert fired correctly — the error handling worked as designed.

## Root cause
Long-lived PATs expire. Automated workflows should not depend on manually-rotated personal tokens.

## Timeline
- Supervisor triggered, fatal error, Pushover fired
- PR #157: switched to `github.token` (built-in, always valid)
- Second run: clean, 7 templates loaded, 0 issues processed

## What we changed
- Supervisor now uses `github.token` for factory repo reads
- Added expired credentials pattern to `security.md` playbook
- TODO: for cross-repo writes (HumanDesign, videoking, xico-city), wire the Factory GitHub App token

## What we're monitoring
Pushover digest from every supervisor run. Fatal errors surface immediately.
