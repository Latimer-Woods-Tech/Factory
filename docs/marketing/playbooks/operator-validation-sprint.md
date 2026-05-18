# Operator Validation Sprint — 5-Day Playbook

**Version:** v1 · **Date:** 2026-05-18 · **Owner:** @adrper79-dot · **Closes:** review item B1 (validate the flywheel before scaling on it)

> The autonomous marketing loop's strategy rests on assumptions no one has validated with a real practitioner. This playbook is the operator's tool for converting **5 hours of focused human work** into the validation data the loop needs to graduate from speculative to grounded.
>
> If the sprint succeeds: matrix cells advance from `discovery` → `earned_active` and PR 3 plumbing gets re-scoped from validated assumptions. If it fails: the ICP / positioning / pricing / channel choice gets revised via ADR before any code ships.

---

## 1. Why this exists

Per [`icp/selfprime-practitioner.md §2.5`](../icp/selfprime-practitioner.md) the bootstrap requires 5 design-partner Zoom calls. Until those happen, every other doc in `docs/marketing/` is hypothesis. Per the grand review:

> *"The strategy needs validation more than the plan needs more docs. Each PR option is real work, but they're papering over the fact that nobody has talked to a single practitioner yet."*

This sprint is the validation. It is **the highest-leverage 5 hours** an operator can spend on this entire portfolio of work.

---

## 2. Pre-conditions (operator does these before Day 1)

| # | Action | Time |
|---|---|---|
| 1 | Read [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md) start to finish | 15 min |
| 2 | Verify the `prime_self:practitioner` voice profile in [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) still feels right | 5 min |
| 3 | Edit [`first-domino-candidates.md`](./first-domino-candidates.md) — remove names that don't fit, replace TBDs from your network (10 confirmed minimum) | 30 min |
| 4 | Verify public business email for Tier-1 (10 candidates) | 30 min |
| 5 | Stand up a Calendly link with 30-min slots (8 spots Mon–Fri afternoons) | 10 min |
| 6 | Block Mon–Fri 14:00–17:00 local on the calendar for "validation sprint — do not schedule over" | 5 min |

**Total pre-conditions time:** ~95 minutes, done in advance of Sprint Day 1.

The autonomous outreach (PR 3a sequencer + PR 3e supervisor) is NOT live yet. The operator sends the first 10 outreach emails **by hand** during pre-conditions. The voice is `prime_self:practitioner`; the template is below in §3.

---

## 3. Outreach template (hand-sent during pre-conditions)

Per [`sequences/practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml). When the supervisor ships this gets automated; for the sprint, the operator pastes from this template, fills in the `{{...}}` placeholders, and sends from their normal email.

```
Subject: {{first_name}} — a tool I'd want a working astrologer to break

{{first_name}} — I'm building Selfprime, a chart-prep co-pilot for working
astrologers. The promise: cut prep from 90 minutes to 20, in your voice,
shipped to the client.

I'm in a "find the people who'll break this first" stage. 5 working
practitioners using it for real client work this quarter would change
everything. The way you frame {{specific_observation_from_their_public_work}}
is exactly the pressure-test it needs.

30-minute call this month. If it's not a fit you'll tell me in five minutes.
If it is, you get 12 months free and your edits become the product.

Calendar: {{calendly_link}}

— Adrian
{{signature_block}}
```

**Two rules at this step:**

1. **Personalize the `{{specific_observation_from_their_public_work}}`.** This is the ONE thing the autonomous system can't yet do in a way that feels real. Read one of their podcast episodes / Substack posts / IG captions and reference something specific they actually said. ~5 min per recipient.
2. **Send from your operator email, not a marketing alias.** Same rationale — peer-to-peer per the voice profile. `marketing@selfprime.net` would tank reply rate.

---

## 4. The sprint week — day-by-day

### Day 1 (Monday)

| Time | Action |
|---|---|
| 09:00 | Send the 10 personalized outreach emails (if not already sent during pre-conditions) |
| 09:30 | Set a focused 90-min block to draft the v1 demo script (§5 below) |
| 14:00–17:00 | First Calendly slots open — operator available for any same-week respondent |
| Throughout day | Reply to incoming questions within 4 hours (only fast practical answers — "yes that's how it works", "yes you'd own the data", etc.) |

Expected outcomes:
- 2–3 replies by end of day (typical 20–30% same-day reply rate for warm peer outreach)
- 0–2 meetings booked for later in the week
- 1–2 polite declines (note the reason verbatim — that's data)

### Day 2 (Tuesday)

| Time | Action |
|---|---|
| 09:00 | Re-read the demo script; sharpen with overnight thinking |
| 09:30 | Send the step-1 follow-up to non-responders (3 days early per `practitioner_design_partner_v1.yaml` — but for a 5-day sprint we compress to 1 day; document this compression as a sprint-specific deviation) |
| 14:00–17:00 | Calendly slots open |
| End of day | Tally: replies / declines / meetings-booked / no-response |

### Day 3 (Wednesday)

| Time | Action |
|---|---|
| 14:00–17:00 | 3 Calendly slots used (target — these are the meat of the sprint) |
| Between meetings | 10-min decompression + scoring (see §7) before the next call |
| End of day | Sprint check: am I getting the *kind* of conversation I expected? If two of three calls go nothing-like-expected, the framing might be wrong — flag for end-of-week review |

### Day 4 (Thursday)

| Time | Action |
|---|---|
| 14:00–17:00 | 2 more Calendly slots (target) |
| Late afternoon | Reply to anyone still on the fence — "this week or never" close |

### Day 5 (Friday)

| Time | Action |
|---|---|
| 09:00–11:00 | Synthesis: across the 5 calls, what's invariant? What surprised? Use the scoring template (§7) |
| 14:00 | If at 4-or-fewer-by-Friday, hold the 14:00–17:00 block open for last-minute respondents |
| 17:00 | Make the call: continue OR pivot OR kill. Decision tree in §8 |

---

## 5. The 30-minute demo script

Built off [`first-domino-bootstrap.md §5`](./first-domino-bootstrap.md) but fleshed out. Memorize the structure; don't read from it on the call.

### 0:00–5:00 — Their workflow today

**Opening question (let them talk; don't pitch yet):**

> "Before I show you anything — walk me through prepping a real chart reading. The one you're prepping this week. What does the actual hour look like?"

What you're listening for:
- Where their time goes (reading natal vs reading transits vs writing the report vs synthesizing patterns)
- What they hate about the current workflow
- What software they already use (Astro.com, TimePassages, Solar Fire, etc.)
- Whether they currently use AI in any form (ChatGPT for brainstorming? Anything?)

What you're listening AGAINST:
- "I love every part of it" — possible but rare; if you hear this, this practitioner may not be your ICP
- "I'd never use AI" — listen for the *reason*. "Won't replace my voice" is workable; "AI is fundamentally wrong" is a hard no

### 5:00–15:00 — Demo the chart-prep workflow

Pre-loaded: a chart belonging to a fake client you've prepared in Selfprime. Walk through:

1. **Chart calculation in <10 seconds** — show the speed
2. **AI draft of natal section** — show the draft AND show one place you'd edit it. The edit is the demo. *"This is fine but it's not what I'd say. I change this here to..."* — practitioners need to see that the AI doesn't lock them in
3. **Voice profile picker** — *"Your voice goes here. The AI never overrides it. Every draft gets gated against the rules you set."* 
4. **Practitioner-branded export** — show the shareable URL with the practitioner's name

The 5 minutes after the demo: just shut up and watch them react. Their unprompted first sentence is the data point that matters.

### 15:00–25:00 — Friction probes

Direct questions, one at a time, with silence after each:

| Probe | What you're listening for |
|---|---|
| "What would have to be true for you to use this with a real client tomorrow?" | The list of objections that aren't dealbreakers — those become your sprint priorities |
| "What do you charge per reading? What would the unit economics need to be for $99/mo to make sense?" | Pricing-tier validation |
| "Imagine three of your friends in the field. Who's most likely to find this useful? Who's most likely to reject it?" | Sub-segment refinement + referral hint |
| "If we showed up at UAC, NCGR, or a podcast — which one would actually reach your tribe?" | Channel validation |
| "What's the part of your business you're worst at?" | Possible feature expansion direction |

### 25:00–30:00 — The close

> "Here's where I am. I want 5 people using this in their real practice this quarter to make sure I'm building the right thing. 12 months free, your name on the changelog, your edits become the product. If you're a yes, I'd give you a setup link before we hang up. If you're a no, I'd like to know the real reason — not the polite one."

The "real reason — not the polite one" is the closing test. Most polite no-thanks contain useful data; the trick is asking for it.

---

## 6. Each call has 3 artefacts (record in real time)

Captured during the call OR within 10 minutes after, before the next one:

1. **Verbatim quotes** — at least 3 sentences in their words. Future copy gets anchored to real practitioner language, not your guess (per [`VOICES.md §6`](../VOICES.md) voice corpus).
2. **Friction list** — every objection they raised, even if you addressed it. Ranked by their tone.
3. **Score (per §7)** — quantitative.

These go in `docs/marketing/playbooks/sprint-2026-05/{call_N}_{practitioner_first_name}.md`.

---

## 7. Per-call scoring rubric

Score each call 0–5 across 6 dimensions, immediately after. Resist the urge to round up — the call you barely got through is a real data point.

| Dimension | 0 | 3 | 5 |
|---|---|---|---|
| **ICP fit** | Wrong audience entirely | Plausible — adjacent to ICP | Textbook ICP — they could be a case study |
| **Demo reaction** | Visible discomfort | Engaged questioning | Asked when they could use it themselves |
| **Pricing fit** | Sticker shock at $99 | Equivalent of "yeah that's fair" | "Cheap for what it does" |
| **Channel signal** | Couldn't name a channel where peers hang | Named ≥1 plausible channel | Named ≥2 channels + offered to introduce someone |
| **Workflow integration** | "Don't see where it fits" | Could imagine using it monthly | Already mentally using it for next week's client |
| **Honesty** | Hedged every answer | Direct on most | Said the real reason — not the polite one |

**Score interpretation:**

- **Total 27–30:** Strong design-partner candidate. Set them up immediately.
- **Total 21–26:** Soft yes; follow up in 7 days with one specific concrete answer to their biggest objection.
- **Total 15–20:** Not a partner. Maybe a future customer. Add to a low-touch nurture (post-supervisor ship).
- **Total <15:** Not the right person. Honest no. Send a thoughtful follow-up that closes the loop; don't ghost.

The scoring is **per call**. The decision rule (§8) is on cohort signal.

---

## 8. End-of-sprint decision tree

Friday 17:00. Open all 5 scoring sheets. Tally:

| Cohort outcome | Decision |
|---|---|
| ≥3 calls scored 27+ AND ≥4 picked up the demo with enthusiasm | **Continue.** The ICP is right. Set up the 3 high-scorers as design partners. Advance the `selfprime-practitioner` cell from `discovery` → `earned_active`. Plumbing (PR 3) re-opens with revised scope. |
| 3–4 calls scored 21–26 with strong signal on a NARROWER subset (e.g. only Hellenistic-lineage practitioners loved it) | **Narrow.** The ICP needs to be tightened. Revise [`icp/selfprime-practitioner.md §2.1`](../icp/selfprime-practitioner.md) sub-segments to reflect the narrower audience. Plumbing waits for second sprint. |
| Mixed scores with consistent objection to ONE thing (e.g. all 5 said "I'd never give up my voice") | **Reframe.** The positioning is wrong. Revise [`MARKETING_PLAN.md §2`](../MARKETING_PLAN.md) and the ICP file. Re-run the sprint in 2 weeks with new framing. |
| 0–1 calls scored ≥21 across the board | **Pivot or kill.** The strategy is wrong. Either revise the ICP fundamentally (different practitioner archetype, different price tier) and re-sprint, or sunset the practitioner cell and reallocate to consumer-only. ADR required for either path per [`CONSTITUTION.md §11`](../CONSTITUTION.md#11-amendment-process). |

**The decision is the operator's, not Claude's.** This playbook gives the data; the decider is the human reading it on Friday afternoon.

---

## 9. After the sprint — what changes

### If "Continue"

1. Send each of the 3 design-partners a welcome email with setup link (1 hour total)
2. Open ADR `docs/decisions/{date}-selfprime-practitioner-validated.md` declaring the cell `earned_active` and locking the assumptions the sprint confirmed
3. Re-open PR 3 redesign — the briefs in the closed PR can be revised with confidence
4. Update [`ICP_MATRIX.md`](../ICP_MATRIX.md) `selfprime:practitioner` from 🟡 `discovery` → 🟢 `earned_active`
5. Feed the verbatim quotes from §6 into the voice corpus seed (`packages/copy/src/voice-corpus/prime_self_practitioner.json`)

### If "Narrow" / "Reframe" / "Pivot or kill"

1. Open ADR explaining the revision
2. Update [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md) with new sub-segment / positioning / price
3. Re-run pre-conditions in §2 with a refreshed candidate list
4. PR 3 stays closed until the next sprint validates

---

## 10. What this sprint is NOT

- **Not market research.** You're not building a survey instrument. You're talking to 5 people deeply.
- **Not selling.** Conversions happen later. The Zoom is about disconfirmation — actively trying to learn what's wrong.
- **Not a one-shot.** If the cohort is mixed, you re-sprint in 2 weeks. Sprints can chain.
- **Not for any other cell.** This is `selfprime:practitioner` only. The other cells get their own sprint when their priority comes up.
- **Not optional.** Per the grand review, without this the autonomous loop is hill-climbing on synthetic data.

---

## 11. Sprint artefacts (what gets committed to git after)

| Artefact | Path | When |
|---|---|---|
| Per-call notes (5 files) | `docs/marketing/playbooks/sprint-2026-05/call_{N}_{name}.md` | Within 10 min of each call |
| Sprint summary | `docs/marketing/playbooks/sprint-2026-05/SUMMARY.md` | End of Friday |
| ADR for the decision (continue / narrow / reframe / pivot) | `docs/decisions/{date}-selfprime-practitioner-{decision}.md` | Within 48h of sprint end |
| Voice corpus seed (if continue) | `packages/copy/src/voice-corpus/prime_self_practitioner.json` | Within 7 days |
| Matrix update | [`ICP_MATRIX.md`](../ICP_MATRIX.md) | Within 48h |

---

## 12. Cross-references

- [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md) — the ICP being validated
- [`first-domino-bootstrap.md`](./first-domino-bootstrap.md) — the operator-workflow doc this fleshes out
- [`first-domino-candidates.md`](./first-domino-candidates.md) — the candidate list to fill before Day 1
- [`sequences/practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml) — the autonomous version of this outreach (post-PR 3a)
- [`VOICES.md`](../VOICES.md) — `prime_self:practitioner` voice profile + voice corpus rules
- [`CONSTITUTION.md §11`](../CONSTITUTION.md#11-amendment-process) — amendment process if the sprint forces a revision

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — 5-day playbook; pre-conditions; demo script; scoring rubric; decision tree; sprint artefact map |
