# 🎯 Kanban Quick Reference — Sprint-18-2026

## Get to Work (Copy/Paste Commands)

### Check Board Status
```bash
# How many items in each column?
gh project item-list 1 --owner Latimer-Woods-Tech --format json | \
  ConvertFrom-Json | Select-Object -ExpandProperty items | \
  Group-Object -Property status | Select-Object Name, @{n='Count'; e={$_.Count}}

# See all P0 items
gh issue list --repo Latimer-Woods-Tech/factory --state open --search "in:title P0" --json number,title
```

### Move Item to In Progress (Once Assigned)
1. Find your issue number (#526, #563, etc.)
2. Get item node ID: `gh project item-list 1 --owner Latimer-Woods-Tech --format json | jq '.items[] | select(.content.url | contains("/{ISSUE_NUM}")) | .id'`
3. Move to In Progress:
```bash
gh api graphql -f query='mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwDOEL0sNc4BWWtg"
    itemId: "{ITEM_NODE_ID}"
    fieldId: "PVTSSF_lADOEL0sNc4BWWtgzhRru4o"
    value: { singleSelectOptionId: "47fc9ee4" }
  }) { projectV2Item { id } }
}'
```

### Add New Issue to Board
```bash
# When you open a new issue, add it to the board right away:
gh project item-add 1 --owner Latimer-Woods-Tech \
  --url https://github.com/Latimer-Woods-Tech/factory/issues/{NUMBER}
```

---

## 🎮 Sprint Rules

✅ **DO:**
- Move your item to **In Progress** when you start work
- Update status column regularly (before standup)
- Tag critical blockers with `blocker:` label + P0 priority
- Comment with progress updates on issues you're tracking
- Mention blockers in standup (10 AM EDT, Mon + Thu)

❌ **DON'T:**
- Leave items in **In Progress** >3 days without update
- Merge PRs without moving the card to **Done**
- Open new issues without adding them to the board
- Claim more than 3 concurrent **In Progress** items
- Work on items without an **Agent** assigned (claim it first)

---

## 🔴 P0 Critical Items (May 10–24)

### #620 — admin-studio staging tests  
**Status:** 🔍 In Review (ready to merge)  
**Action:** Merge when approved, archive to Done  
**Link:** https://github.com/Latimer-Woods-Tech/factory/pull/620

### #526 — Prime Self smoke test failing  
**Status:** 📋 Todo (assign immediately)  
**Action:** Investigate SRI/CSP blocker; rebuild frontend; deploy  
**Timeline:** 2–4 hours to fix, 1–2 hours to verify  
**Link:** https://github.com/Latimer-Woods-Tech/factory/issues/526

### #585 — Wrangler config normalization  
**Status:** 📋 Todo (assign immediately)  
**Action:** Audit all .dev servers, normalize compat_date  
**Timeline:** 2–3 hours  
**Link:** https://github.com/Latimer-Woods-Tech/factory/issues/585

---

## 📱 Board Columns Explained

| Column | Meaning | Max Items | Max Age |
|--------|---------|-----------|---------|
| **📋 Todo** | Backlog; not started | unlimited | N/A |
| **🔄 In Progress** | Active work; assigned to someone | 5 per agent | 7 days (flag if > 7 days) |
| **🔍 In Review** | PR open; awaiting approval | unlimited | 3 days (escalate if > 3 days) |
| **✅ Done** | Merged/resolved/deployed | daily cleanup | archive after 30 days |

---

## 📞 Who to Contact

- **Kanban Issues:** @adrper79-dot (CODEOWNER)
- **Blockers:** @adrper79-dot (emergency line)
- **PR Reviews:** Tag in the PR comment thread
- **Standup:** Every Monday + Thursday, 10 AM EDT
- **Urgent:** File issue with `blocker:*` label + P0 priority

---

## 🎯 Key Metrics (We Track)

- **Cycle Time:** Avg days from Todo → Done (target: <5 days)
- **Velocity:** Items per sprint (target: 12–16 items)
- **P0 SLA:** 24 hours to resolution (target: 100%)
- **In Progress Aging:** % items >7 days (target: <20%)

---

## 🚀 Pre-Standup Checklist (Before 10 AM EDT, Mon/Thu)

- [ ] Your active item's status updated on board
- [ ] Any blockers written down as separate issue + added to board
- [ ] PR reviews flagged (if blocked >48h)
- [ ] One sentence: what shipped this sprint?
- [ ] One sentence: what's blocked?

---

**Questions?** Open issue + tag @adrper79-dot  
**Urgent?** Comment "blocker:*" on any Factory issue → CODEOWNER gets pinged  
**Lost?** Read `docs/KANBAN_EXECUTION_PLAN_2026_MAY.md` (full runbook)
