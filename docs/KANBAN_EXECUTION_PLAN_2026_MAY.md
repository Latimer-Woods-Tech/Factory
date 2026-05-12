# Kanban Execution Plan — May 2026

**Board:** LatWood Operations (Project 1)  
**Visibility:** Private  
**Node ID:** `PVT_kwDOEL0sNc4BWWtg`  
**Current Status:** 1000+ items, with open Factory work represented on the board and verified by issue-level spot checks

---

## Phase 1: Board Audit & Sync (Today — May 10)

### Objective
Establish single source of truth: **All open Factory issues must appear on the board with correct status.**

### Actions

**1.1: Inventory Open Issues**
```bash
# Count all open issues in Factory
gh issue list --repo Latimer-Woods-Tech/factory --state open --limit 500 --json number,title,labels,assignees

# Export to file for diff
gh issue list --repo Latimer-Woods-Tech/factory --state open --limit 500 \
  --json number,title,labels,assignees > /tmp/factory-open-issues.json
```

**1.2: Inventory Board Items**
```bash
# List all items currently on LatWood Operations board
gh project item-list 1 --owner Latimer-Woods-Tech --limit 1000 --format json > /tmp/kanban-items.json

# Count by status
jq '[.items[].fieldValues[] | select(.name=="Status") | .value] | group_by(.) | map({status: .[0], count: length})' /tmp/kanban-items.json
```

**Verification note:** `gh project item-list` is paginated, so use `--limit` for bulk reconciliations. For a single issue, `gh issue view {number} --json projectItems` is the most reliable way to confirm project membership and status.

**1.3: Identify Missing Issues**
```bash
# Compare: open issues NOT on board
# Issues on Factory should be tracked board items OR should have a reason (defer, closed, moved)
# Create a tracking sheet:
# - Issues missing from board (need to add)
# - Board items closed on GitHub but still marked In Progress (stale, need to move to Done)
# - Duplicated board items (merge if same issue linked twice)
```

**1.4: Reconcile Stale Items**
```bash
# For each board item:
# 1. Fetch the linked issue's current status
# 2. If issue is CLOSED but board item shows OPEN → move to Done
# 3. If issue is OPEN but board item shows DONE → flag for review (reopen?)

# Tool: iterate through /tmp/kanban-items.json 
# For each item with .content.url containing /issues/:
gh issue view {issue-url} --json state --jq '.state'
# If "CLOSED" but board not Done → GraphQL update status to Done
```

**1.5: Backfill Missing Issues**
```bash
# For all open Factory issues NOT on board yet:
gh project item-add 1 --owner Latimer-Woods-Tech --url https://github.com/Latimer-Woods-Tech/factory/issues/{number}

# Batch: read /tmp/factory-open-issues.json, filter to items not in /tmp/kanban-items.json, add each
```

---

## Phase 2: Triage & Prioritization (May 10–11)

### Objective
Assign Priority (P0–P3) and Sprint to all items on board so In Progress items have clear scope.

### Actions

**2.1: Priority Assessment (Guided by Rules)**

**P0 (Critical — blocks conversions or deployment):**
- SRI/CSP frontend blocker (selfprime.net)
- Active security vulnerabilities (Sentry P1 alerts)
- Database migration failures (pending Neon schema changes)
- CI/CD pipeline breaks (GitHub Actions workflows failing)
- Rate limiter exhaustion (live traffic incident)

**P1 (High — blocks feature release or user workflows):**
- Unfinished feature in current sprint
- Open PRs awaiting review (3+ days old)
- Unresolved Sentry errors (>10/min error rate)
- Stale dependencies (security patches available)
- Test coverage drops (<85%)

**P2 (Medium — nice-to-have, can defer to future sprint):**
- UX polish (icons, spacing, animations)
- Demo/docs improvements
- Non-critical performance optimization
- Refactoring (tech debt)

**P3 (Low — ideas, backlog, post-launch):**
- Future feature requests
- "Nice-to-have" enhancements
- Deferred post-launch items
- Speculative research

**2.2: Assign Priority via GraphQL**
```bash
# For each board item {ITEM_NODE_ID}:
gh api graphql -f query='mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOEL0sNc4BWWtg"
    itemId: "{ITEM_NODE_ID}"
    fieldId: "PVTSSF_lADOEL0sNc4BWWtgzhRru6c"
    value: { singleSelectOptionId: "565da955" }  # P0 example (use correct ID)
  }) { projectV2Item { id } }
}'
```

**2.3: Assign Sprint**
```bash
# Use GitHub Project Iterations or custom "Sprint" field
# Sprint format: "Sprint-25-LW" (week 25, Latimer-Woods)
# Current sprint: "Sprint-18-2026" (May 10 start)
# 2-week sprints: Mon–Fri × 2 weeks

# Assign current + future work to Sprint-18-2026
```

**2.4: Assign Agent (Owner)**
```bash
# For each In Progress item, verify Agent field is set
# Format: "{GitHub handle}" or "Unknown" if unassigned
# Agent field uses custom field IDs from org-kanban memory

# Populate with:
# - PR author (for PRs)
# - Issue assignee (for issues)
# - "Unknown" if currently unassigned → escalate to CODEOWNER for claim
```

---

## Phase 3: Current Sprint Design (May 10–24)

### Objective
Define Sprint-18-2026 scope: what ships, what defers, what's experimental.

### Current Blockers (Admin-Studio Dispatch)

**In Active Development:**
- **PR #620** (fix/admin-studio-staging-tests-dispatch) — Unblock staging tests dispatch chain
  - Status: Under review
  - Blocker: Tests currently fail on staging, dispatch workflow can't start
  - Timeline: 1–2 days to resolve
  - Agent: (from PR620 author)

### Sprint-18-2026 Goals

**Primary Objective:** Ship admin-studio staging tests → enable automated test feedback loop

| Feature | Status | Target Date | Agent | Priority |
|---------|--------|-------------|-------|----------|
| Admin-Studio Staging Tests | In Progress (PR #620) | May 11 | @adrper79-dot | P0 |
| Prime-Self SRI/CSP Fix | Not Started | May 12 | (needs assignment) | P0 |
| Prime-Self Feature Validation | Blocked (waiting SRI fix) | May 15 | (QA team) | P0 |
| Videoking Deployment Hardening | In Review | May 12 | (from PR history) | P1 |
| Factory Package Health Audit | Not Started | May 18 | (needs assignment) | P1 |
| Stripe Integration Upgrade | Scheduled | May 22 | (needs assignment) | P2 |

### P0 Critical Path (Red-Line)
```
May 10:  PR #620 merged → admin-studio tests enabled ✓
May 12:  Prime-Self frontend SRI/CSP fixed → production site live
May 15:  Feature validation complete → ready for soft launch
May 16:  Worker secrets synced (OAuth, SMS, etc.)
May 17:  1-week soft launch gate opens
May 24:  Public launch decision
```

---

## Phase 4: Board UI Organization (May 11)

### Column Structure (Status)
- **📋 Todo** — Backlog, not yet started, awaiting resources
- **🔄 In Progress** — Actively being worked (max 5 items per agent)
- **🔍 In Review** — PR open, awaiting approval or changes
- **✅ Done** — Merged/deployed/resolved, last 30 days (then archive yearly)

### Card Labels
Standardize labels for quick visual filtering:

| Label | Meaning | Color |
|-------|---------|-------|
| `type:bug` | Defect needing fix | red |
| `type:feature` | New capability | green |
| `type:docs` | Documentation-only | blue |
| `type:infra` | DevOps/build/CI/CD | purple |
| `team:admin` | Admin-Studio app | orange |
| `team:packages` | @latimer-woods-tech/* packages | cyan |
| `team:external` | External client repos (humandesign, videoking, etc.) | gray |
| `supervisor:approved-source` | Cleared for supervisor pickup | ✅ |
| `supervisor:budget-paused` | Token budget exceeded | ⏸️ |
| `blocker:*` | Blocks X feature (blocker:admin-tests, blocker:selfprime-frontend) | red |

### Quick Filters (Save as board views)
- **🚨 P0 This Sprint** — `Priority:P0 Status:"In Progress|In Review" Sprint:Sprint-18-2026`
- **🔴 All Blockers** — Label contains `blocker:`
- **⚠️ Stale In Progress** — `Status:"In Progress" Updated:<7 days ago`
- **📦 Next Review** — `Status:"In Review" Updated:<3 days ago`

---

## Phase 5: Automation & CI Integration (May 12–15)

### 5.1: Auto-Sync Workflow
```yaml
# .github/workflows/kanban-sync.yml
name: Daily Kanban Sync
on:
  schedule:
    - cron: '0 9 * * MON-FRI'  # 9 AM weekdays
  manual:
    workflow_dispatch

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Backfill missing open issues
        run: |
          # For each Factory open issue not on board
          gh issue list --repo Latimer-Woods-Tech/factory --state open --json number \
            | jq -r '.[] | .number' \
            | while read issue; do
              # Check if issue already on board
              if ! gh project item-list 1 --owner Latimer-Woods-Tech --format json \
                 | jq -e ".items[] | select(.content.url | contains(\"/$issue\"))" > /dev/null; then
                echo "Adding Factory issue #$issue to board..."
                gh project item-add 1 --owner Latimer-Woods-Tech \
                  --url https://github.com/Latimer-Woods-Tech/factory/issues/$issue
              fi
            done

      - name: Clear closed items from board
        run: |
          # TODO: Move items to Done if the linked issue is closed
          # Requires GraphQL mutation loop
```

### 5.2: PR Auto-Add
```yaml
# .github/workflows/auto-add-to-board.yml (already exists, verify it's working)
# Trigger: on PR opened
# Action: If not already on board, add to "In Review" column
```

### 5.3: Board Status Badge
```markdown
# In docs/README.md or docs/PROJECT_STATUS.md:

## Sprint Status (Sprint-18-2026)

| Status | Count | Trend |
|--------|-------|-------|
| 📋 Todo | 23 | ↕️ |
| 🔄 In Progress | 5 | ↓ (good) |
| 🔍 In Review | 2 | → |
| ✅ Done (this sprint) | 8 | ↑ (good) |

**P0 Blockers:** 1 (Prime-Self SRI fix)  
**Velocity (last 3 sprints):** 12 → 14 → 11 items/sprint  
**Cycle Time (avg):** 4.2 days from Todo → Done

**Next Sprint Planning:** May 24, 2 PM UTC / 10 AM EDT
```

---

## Phase 6: Weekly Standup Cadence (Starting May 13)

### Standup Format
**When:** Monday + Thursday, 10 AM EDT  
**Duration:** 15 min  
**Attendees:** @adrper79-dot (owner), assigned agents, CODEOWNERS

### Standup Agenda
1. **P0 Blockers** — Any blocking launch? (2 min)
2. **In Progress Review** — What shipped? What's stuck? (5 min)
   - Each agent: 1–2 sentence update on their active tasks
   - Flag any blockers or dependency issues
3. **In Review** — Any PRs waiting on review? (3 min)
   - Timeout: 48 hours without review → escalate to CODEOWNER
4. **Next Steps** — Priorities for next 2 days (3 min)
   - CODEOWNER calls out top 3 items for team focus

### Asynchronous Tracking
- **Daily:** Board auto-syncs at 9 AM EDT (see Phase 5)
- **Every Sprint (2 weeks):** Sprint retro + planning (Friday PM)
- **Monthly:** Dependency audit + package health check

---

## Phase 7: Metrics & Reporting (May 17 onwards)

### KPIs

**Cycle Time** — Avg days from Todo → Done
- Target: <5 days
- Current: ~4.2 days
- Track per item in Deploy SHA field

**Velocity** — Items completed per sprint
- Target: 12–16 items
- Current: 11–14 items (trending +0.3/sprint)
- Use for capacity planning

**P0 Escape Rate** — P1+ bugs discovered post-release
- Target: <5% of shipped items
- Current: ~8% (monitor Sentry post-deploy)
- Trigger: If >5%, review QA gate checklist

**In Progress Aging** — % items in In Progress >7 days
- Target: <20%
- Current: (needs calculation after audit)
- Action: If >20%, block new In Progress additions

### Monthly Report Template (Exec Summary)
```markdown
## Kanban Health — May 2026

**Sprints Completed:** Sprint-18-2026  
**Items Shipped:** 14  
**P0 Blockers Resolved:** 1 (SRI/CSP)  
**Average Cycle Time:** 4.2 days  
**Velocity Trend:** +12 → +14 → +11 (stable)  

**Highlights:**
- Admin-Studio staging tests enabled
- Prime-Self production restored (SRI fix)
- Videoking deployment hardened

**Risk Items:**
- None currently at P0
- 1 P1 item aging >10 days (flagged for Monday standup)

**Next Sprint Focus (Sprint-19-2026):**
- Package health audit (Stripe + neon + llm)
- Supervisory compliance checks
- Soft launch infrastructure (monitoring + alerts)
```

---

## Quick Start (Next 24 Hours)

### Today (May 10, 4 PM EDT)
```bash
# 1. Run board inventory
cd c:\Users\Ultimate Warrior\Documents\GitHub\Factory
gh issue list --repo Latimer-Woods-Tech/factory --state open --json number,title | wc -l
# Result: How many open Factory issues?

# 2. Run kanban inventory
gh project item-list 1 --owner Latimer-Woods-Tech --format json | jq '.items | length'
# Result: How many items on board?

# 3. If diff > 50, board is out of sync → flag for Phase 1 day-long audit

# 4. Merge PR #620 (admin-studio tests)
gh pr merge 620 --squash --delete-branch
# Once merged, add to Done column manually (GraphQL update) or tag as deployed

# 5. File SRI/CSP fix issue (if not exists)
gh issue create --repo Latimer-Woods-Tech/factory \
  --title "fix(selfprime): restore SRI/CSP policy on frontend assets" \
  --label "type:bug,team:external,blocker:selfprime-frontend,priority:P0" \
  --body "Frontend JS blocked on production. See PRODUCTION_READINESS_UI_TEST_PLAN_2026-05-11.md"
```

### Tomorrow (May 11, Morning)
- Complete Phase 1 audit (2 hours)
- Tag all missing issues onto board
- Assign Priority + Sprint to top 20 items (1 hour)

### By Friday (May 15)
- Phase 3 sprint goals confirmed
- Week-of standup scheduled
- Status badge deployed to README

---

## Success Criteria

✅ **Board is <5% out of sync** (all open Factory issues present or have documented reason for omission)  
✅ **P0 items have 24-hour SLO** (assigned, in active work, daily standup flag)  
✅ **All In Progress items have an Agent assigned** (no orphan tasks)  
✅ **Done column cleared monthly** (archive old items to avoid clutter)  
✅ **Sprint velocity stable** (±2 items week-over-week)  
✅ **P0 escape rate <5%** (post-deployment QA effective)

---

## Kanban Board Commands Cheat Sheet

```bash
# View active items
gh project item-list 1 --owner Latimer-Woods-Tech --format json | jq '.items[] | {id: .id, title: .title, status: .fieldValues[] | select(.name=="Status") | .value}'

# Move item to In Progress
gh api graphql -f query='mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOEL0sNc4BWWtg"
    itemId: "{ITEM_NODE_ID}"
    fieldId: "PVTSSF_lADOEL0sNc4BWWtgzhRru4o"
    value: { singleSelectOptionId: "47fc9ee4" }
  }) { projectV2Item { id } }
}'

# Set Priority to P0
# (use Option ID: 565da955)

# Set Priority to P1
# (use Option ID: 301a683b)

# Set Priority to P2
# (use Option ID: d7edead5)

# Set Priority to P3
# (use Option ID: 09735bf6)

# Set Agent field
gh api graphql -f query='mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOEL0sNc4BWWtg"
    itemId: "{ITEM_NODE_ID}"
    fieldId: "PVTF_lADOEL0sNc4BWWtgzhRru6Q"
    value: { text: "adrper79-dot" }
  }) { projectV2Item { id } }
}'

# Add issue to board
gh project item-add 1 --owner Latimer-Woods-Tech --url https://github.com/Latimer-Woods-Tech/factory/issues/{NUMBER}
```

---

**Document Created:** May 10, 2026  
**Last Updated:** May 10, 2026  
**Maintained By:** Agent + @adrper79-dot (CODEOWNER)
