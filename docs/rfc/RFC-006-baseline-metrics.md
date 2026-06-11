# RFC-006 Phase 0 Baseline Metrics

*Captured: 2026-06-11T00:00:00.000Z*
*Purpose: 14-day observation window baseline. Compare after Phase 1 enforcement.*

## Issue state distribution

| Status | Count |
|---|---:|
| status:intake | 0 |
| status:ready | 0 |
| status:in_progress | 43 |
| status:in_review | 0 |
| status:blocked | 0 |
| status:verifying | 0 |
| status:done | 0 |
| status:cancelled | 0 |
| (unlabeled) | 46 |
| **Total open** | **89** |

## PR queue

| Metric | Count |
|---|---:|
| Open PRs total | 35 |
| Open impl PRs (non-snapshot, non-chore) | 35 |
| Open snapshot PRs | 0 |

## Key Phase 0 exit criteria status

- [ ] `In Progress` items all have valid owner/lease or review artifact
- [ ] All blockers have type, owner, next action
- [ ] Duplicate cleanup: survivor records for all closed duplicates — see RFC-006-duplicate-triage.md
- [x] Snapshot PR backlog older than 24h = zero — 19 stale snapshot PRs closed 2026-06-11
- [ ] Project auto-archive enabled — run `setup-project-autoarchive.yml` and follow manual UI step
- [x] Baseline dashboard captured — this document

## Notes

- `status:*` labels were added by RFC-006 Phase 0 (setup-project-status-options bootstrap).
  The high `unlabeled` count (46) reflects issues created before labels were provisioned;
  they are candidates for bulk-labeling via the lifecycle controller in Phase 1.
- `status:in_progress` (43) includes Sentry-mirrored issues claimed by the supervisor loop
  (`agent:claimed:supervisor` label) — most lack an explicit human lease. Phase 2 will
  enforce lease records and expire stale ones.
- Snapshot PR queue was 19 open before this baseline. All 19 were closed with RFC-006
  explanation comments on 2026-06-11. The generation workflows continue to run; new
  snapshot PRs will either auto-merge or accumulate for the next drain cycle.
- No issues carry `label:duplicate` or `[Duplicate]` in title (confirmed by search on 2026-06-11).
  See `RFC-006-duplicate-triage.md` for the full search record and ambiguous cases.

## Next check-in

Compare these numbers after 14 days (by 2026-06-25) before promoting Phase 1 to enforce mode.
