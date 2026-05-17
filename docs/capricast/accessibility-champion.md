# Videoking Accessibility Champion Role & Training

**Established:** April 28, 2026  
**Champion:** [To be appointed]  
**Reporting:** Product Lead / VP Engineering  
**Allocation:** 0.1 FTE (5 hours/week)  

---

## Role Definition

### Responsibilities

**Primary (4 hours/week):**
1. **Monthly Team Sync** (1 hour) — Host 15-min accessibility sync; review recent issues; discuss patterns
2. **PR Review** (2 hours) — Review accessibility aspects of all PRs; provide feedback
3. **Metrics Tracking** (1 hour) — Update accessibility dashboard; track compliance trend

**Secondary (1 hour/week):**
4. **Escalation** — Unblock developers on A11y questions
5. **Incident Response** — If A11y regression detected in production, coordinate fix
6. **Learning** — Stay current on WCAG updates, new tools, best practices

### Who Should Be Champion?

Ideal candidate:
- Product manager, UX designer, or senior engineer
- Passionate about inclusive design
- Good communicator (can teach without condescension)
- Willing to invest 5–10 hours/week for 6 months (then 2–3 hours ongoing)

---

## Training Program

### Phase 1: Onboarding (Month 1)

**Week 1: Foundations (2 hours)**
- [ ] Read WCAG 2.2 AA spec (30 min) — https://www.w3.org/WAI/WCAG22/quickref/
- [ ] Watch a11ycasts playlist (45 min) — https://www.youtube.com/playlist?list=PLNYkxOF6rcICWx0C9Xc-RgEzwLvePng7V
- [ ] Review videoking accessibility audit (30 min) — This document
- [ ] Skim WebAIM color contrast guide (15 min) — https://webaim.org/articles/contrast/

**Week 2: Tools (2 hours)**
- [ ] Install NVDA and do a 30-min practice run
- [ ] Use Axe DevTools on 3 websites
- [ ] Review Lighthouse A11y audit
- [ ] Test a real colleague with screen reader

**Week 3: Videoking Deep Dive (2 hours)**
- [ ] Walk through each of 8 journeys with keyboard only
- [ ] Identify 5 issues from accessibility audit
- [ ] Propose fixes for 3 issues
- [ ] Review remediation plan (this document)

**Week 4: Sync Preparation (1.5 hours)**
- [ ] Prepare first monthly sync agenda (30 min)
- [ ] Draft accessibility champion wiki (1 hour)
- [ ] Set up metrics dashboard

### Phase 2: Ongoing Leadership (Months 2–6)

**Monthly Sync Meetings (1 hour each):**

**Structure:**
- 5 min: Accessibility metrics review (WCAG % compliance, issue trends)
- 5 min: Recent PRs — highlight best practices observed
- 3 min: Common mistakes — 1–2 patterns to avoid
- 2 min: Q&A — fielding questions from team

**Sample Agendas:**

**May Sync (Weeks 1–4):**
- Metrics: 68% → 72% (keyboard + focus fixes merged)
- Highlight: "New focus visible styles — check them out in PR #245"
- Common Mistake: "Placeholder-only form labels — explain why needed"
- Q&A: Where to put aria-label vs aria-describedby?

**June Sync (Weeks 5–8):**
- Metrics: 72% → 82% (contrast fixes complete)
- Highlight: "aria-live regions for error messages — great PRs"
- Common Mistake: "Color-only status indicators — need text/icon"
- Q&A: How to test dynamic content updates?

**July Sync (Weeks 9–12):**
- Metrics: 82% → 90% (90% complete!)
- Highlight: "Screen reader captions working — team effort"
- Common Mistake: "Keyboard traps — watch for FocusTrap edge cases"
- Q&A: Data table accessibility patterns

---

## Monthly Sync Agenda Template

**Time:** 2nd Friday, 2:00 PM PT (15 min)  
**Attendees:** Engineers, designers, product leads  
**Facilitator:** Accessibility Champion  

### Agenda (15 min)

```
2:00–2:05  Metric Snapshot (5 min)
  - Current WCAG AA % compliance
  - Issues closed this month (high/medium/low)
  - Blockers or risks

2:05–2:10  Best Practices (5 min)
  - Highlight 1–2 recent PRs
  - Show "before/after" examples
  - Explain why it matters

2:10–2:13  Common Mistakes (3 min)
  - 1–2 patterns observed in recent reviews
  - Explain why it's wrong
  - Show correct pattern

2:13–2:15  Q&A (2 min)
  - Open floor
  - Document questions in wiki
```

### Meeting Notes Template

```markdown
# Accessibility Sync — May 2026

**Date:** May 10, 2026  
**Attendees:** @alice, @bob, @charlie, @champion

## Metrics
- Compliance: 68% → 72% ✓
- High-priority issues: 26 → 18 (-8)
- Medium-priority: 34 → 28 (-6)
- PRs reviewed: 12
- Blockers: None

## Best Practice: Visible Focus Indicators
**PR:** #245 (video player refactor)
- Added 3px blue outline on focus
- Added 2px outline-offset for clarity
- Used `:focus-visible` to avoid mouse-click flash
**Take-away:** Always include focus indicators in CSS reset

## Common Mistake: Placeholder-Only Labels
**Seen In:** 3 recent PRs
**Problem:** Screen readers only see generic "edit text", not field purpose
**Pattern:**
```html
<!-- ❌ Wrong -->
<input placeholder="Enter email" />

<!-- ✅ Right -->
<label>Email Address</label>
<input placeholder="Enter email" aria-label="Email Address" />
```
**Discussion:** Placeholders disappear when user types; labels stay visible

## Q&A
Q: How do I test with NVDA on Mac?  
A: VoiceOver built-in; NVDA is Windows-only. Use for testing on Linux VM or Boot Camp.

## Blockers
None — on track for 90% by end of June

## Next Sync
June 14, 2026 — Focus on aria-live regions for form validation
```

---

## Champion Wiki (Shared Space)

### Create a Wiki Page in GitHub

**Location:** `docs/knowledge-base/accessibility-champion.md`

**Contents:**

```markdown
# Accessibility Champion Wiki

## Quick Reference

### WCAG 2.2 AA Checklist (25 criteria)
[Link to /wcag-checklist.md]

### Common Mistakes & Fixes
- **Placeholder-only labels** — Always pair with <label>
- **Color-only status** — Add icon/text + color
- **Keyboard traps** — Use FocusTrap component
- **Missing alt text** — Describe image for screen readers
- **No focus indicator** — Add outline or custom style

### Tools
- Axe DevTools: Browser extension for automated testing
- NVDA: Free Windows screen reader
- Lighthouse: Chrome DevTools A11y audit
- Web AIM Contrast Checker: https://webaim.org/resources/contrastchecker/

### Resources
- WCAG 2.2 AA Spec: https://www.w3.org/WAI/WCAG22/quickref/
- WebAIM Articles: https://webaim.org/articles/
- a11ycasts: YouTube playlist by Google Chrome team

### Escalation
- A11y question? @accessibility-champion on Slack
- Production regression? Page @champion immediately
- Need to defer? Discuss in next monthly sync

### Champion Rotation
- Current: [Name] (until [Date])
- Next: [Interested?]
- Timeline: Every 6–12 months
```

---

## Developer Training Checklist

**Every developer must complete before merging accessibility-related PRs:**

- [ ] **Read:** WCAG 2.2 AA Quick Reference (15 min) — Focus on Perceivable, Operable, Understandable
- [ ] **Watch:** 1–2 videos from a11ycasts (20 min)
- [ ] **Test:** Run 1 keyboard navigation test (20 min) — Use testing guide
- [ ] **Review:** Accessibility audit report (15 min) — Understand what's been fixed
- [ ] **Practice:** Install Axe DevTools; scan 3 websites (20 min)

---

## Monthly Metrics Dashboard

### Track These 5 KPIs

| KPI | Current | Target | Trend |
|-----|---------|--------|-------|
| WCAG 2.2 AA Compliance % | 68% | 90% | ↑ |
| High-Priority Issues | 26 | 0 | ↓ |
| Medium-Priority Issues | 34 | 0 | ↓ |
| Keyboard Navigation Issues | 8 | 0 | ↓ |
| Color Contrast Issues | 22 | 0 | ↓ |

**Calculation:**
- Compliance % = (Criteria Passing / 25) × 100
- Issues = Count of unique issues per priority level
- Trend = Month-over-month change

---

## Resources & References

### WCAG 2.2 AA (Essential Reading)

1. **Specification** (30 min) — https://www.w3.org/WAI/WCAG22/quickref/
2. **Understanding Docs** (reference) — https://www.w3.org/WAI/WCAG22/Understanding/
3. **How to Meet** — https://www.w3.org/WAI/WCAG22/quickref/

### WebAIM (Practical Guides)

- [Keyboard Accessibility](https://webaim.org/articles/keyboard/) — 10 min
- [Color Contrast](https://webaim.org/articles/contrast/) — 15 min
- [Screen Readers](https://webaim.org/articles/screenreader/) — 15 min
- [ARIA](https://webaim.org/articles/aria/) — 20 min

### Google a11ycasts (Video Series)

- [Playlist](https://www.youtube.com/playlist?list=PLNYkxOF6rcICWx0C9Xc-RgEzwLvePng7V)
- Recommended: #1, #2, #3, #7, #10, #11, #13, #15, #20

### Tools Documentation

- **Axe** — https://github.com/dequelabs/axe-core
- **NVDA** — https://www.nvaccess.org/download/
- **JAWS Trial** — https://www.freedomscientific.com/products/software/jaws/
- **Lighthouse** — Built into Chrome DevTools

---

## Rotation & Succession Planning

### Champion Tenure
- **Typical Duration:** 6–12 months
- **Renewal:** Assess interest; consider rotating to spread knowledge
- **Transition:** 2-week handoff period with new champion

### Finding the Next Champion
- Nominate someone who:
  - Is interested in accessibility
  - Has some A11y experience or training
  - Can commit 5 hours/week
  - Is respected by teammates

---

## Monthly Check-In Template

**Schedule:** 1st Friday of month, 30 min with VP Engineering

```markdown
# Accessibility Champion Check-In — [Month]

## Metrics This Month
- Compliance: [%] (target: 75% → 90%)
- PRs reviewed: [count]
- Issues closed: [count]
- Blockers: [list or "None"]

## Team Engagement
- Monthly sync attendance: [X]/[Y]
- Team questions: ~[N] per week
- Best practices adopted: [examples]

## Personal Observations
- What's working well?
- What's challenging?
- Do you need support?

## Next Month Focus
- Key deliverable(s)
- Training needs
- Resource requests
```

---

## Feedback Loop

**How to Improve This Program:**

1. **Monthly Sync Feedback** — Ask team: "What would make this more useful?"
2. **Champion Retrospective** — Every 3 months, champion + PM review program
3. **Update Resources** — As new tools/specs emerge, update this guide
4. **Share Wins** — Document what worked; publish patterns in wiki

---

**Program Established:** April 28, 2026  
**Next Champion Selection:** October 2026  
**Quarterly Review:** July 1, 2026
