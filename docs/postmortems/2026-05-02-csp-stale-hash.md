# 2026-05-02: CSP stale hash blocked FOUC script

**Severity:** P2  **Duration:** ~2 days  **Impact:** All selfprime.net users (theme/density not applying on load)

## What happened
PR #57 (2026-05-01) added density to the FOUC inline script in `client/index.html`. The SHA-256 hash changed. The hash in `client/public/_headers` was not updated. Every page load produced a CSP violation. Visual bugs: thin sidebar, floating bodygraph between pages.

## Root cause
No coupling between "change inline script" and "update CSP hash." Two separate manual steps with no automated check.

## Timeline
- 2026-05-01: PR #57 merged
- 2026-05-02 ~20:30 UTC: First real user hits production, reports visual bugs
- 2026-05-02 ~21:15 UTC: PR #74 opened, merged, deployed. One hash in `_headers`.

## What we changed
- Updated CSP hash (PR #74)
- Added CSP management procedure to `security.md` playbook

## What we're monitoring
CSP violations in browser console. Could extend `credential-scrub.yml` to lint CSP hashes.
