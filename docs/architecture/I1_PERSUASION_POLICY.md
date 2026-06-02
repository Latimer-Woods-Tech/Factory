# I1 — Narration Persuasion Policy (DRAFT — for red-line)

> Source of truth for the Energy Blueprint video narration: it governs **both**
> the generation prompt (intent) **and** the deterministic `validateAiOutput`
> gate (enforcement). The prompt aims; the gate guarantees. Dynamic content at
> hundreds/day with no human in the loop means we trust the gate, not the prompt.
>
> Status: DRAFT. Operator calibrates the dial + the allow/forbid lists.

## North star
**Seen, not sold.** The most persuasive thing we can do for a low-trust,
meaning-seeking ICP is make them feel *authentically and specifically seen*.
That recognition ("how did it know that?") is the win. Manipulation is the
weaker play here — this audience detects it, and it torches retention and
word-of-mouth. Ethical persuasion is not a compromise; it is the optimal
long-game strategy. Every rule below serves the win **and** the trust.

## Calibration (operator-decided 2026-05-31)
1. **Dial: randomize 3↔4 per render** (vary Compelling/Persuasive; A/B which lands).
2. **Groundedness: interpretive allowed** — synthesize richer prose from grounded
   facts; block only *invented specifics* (gates/centers/type/authority not in
   their chart), not interpretation.
3. **Regenerate attempts: N = 5**, then fail closed (no render, no debit).
4. **Closing CTA may reach level 4** even when the body sits at 3.

## The intensity dial (operator-tunable; default = randomize 3↔4)
| # | Level | Feel | Use |
|---|---|---|---|
| 1 | Informative | A report of the chart | too flat — not this |
| 2 | Resonant | "That's me" | floor |
| 3 | **Compelling** | "I feel seen; tell me more" | **default** |
| 4 | Persuasive | "I want to act on this" | promos / CTAs |
| 5 | — HARD CEILING — | manipulative | **forbidden** |

The dial moves intensity of *emotional arc, aspiration, and open-loop pull*.
It never unlocks a forbidden tactic. 5 is a wall, not a setting.

## Allowed tactics (lean in)
- **The "seen" effect** — state something true + specific they rarely hear
  articulated. Drawn only from their real chart/synthesis.
- **Specificity over horoscope-vagueness** — their gates, centers, authority by
  name. Specificity is what converts skeptics.
- **Emotional arc** — tension → recognition → *permission* to be who they are.
- **Open loops** — close on a genuine thread that pulls to the next reading/video.
- **Aspiration + belonging** — who they're becoming; that others like them exist.
- **Ritual + authority framing** — "the Oracle," "your reading" as a rite, not a
  report. Warmth and reverence, never hype.

## Forbidden tactics (hard-blocked by the gate)
| # | Forbidden | Why |
|---|---|---|
| F1 | **Ungrounded claims** — any specific not traceable to their chart/synthesis (invented gates, fabricated "facts") | quality, trust, legal — the #1 risk of dynamic generation |
| F2 | **Fear / doom / determinism** — "you'll never…", "this means you can't…", fate-locking | predatory; removes agency |
| F3 | **Fabricated scarcity / urgency** — false deadlines, "only now" | manipulative; ICP detects it |
| F4 | **Dependence-fostering** — "you need this to function/decide" | empower, don't hook |
| F5 | **Unsafe advice** — medical, financial, psychological, legal directives | safety + liability |
| F6 | **The word "AI"** (and A.I. variants) in any form | absolute brand rule |
| F7 | **Prompt leak / unresolved placeholders** — system text, `{{var}}`, "as a model…" | quality + integrity |

## Enforcement mapping (one policy → two layers)
**Layer 1 — prompt (intent):** the allowed tactics + dial + the forbidden list
go into the narration system prompt. Sets the target; can drift.

**Layer 2 — `validateAiOutput` (the backstop we trust):** compiles the forbidden
list into deterministic rules, run on every narration **before** the
`video_object` is created and **before the credit is spent / render fires.**

| Rule | Maps to | Severity | Action |
|---|---|---|---|
| groundedness check (claims ⊆ source chart/synthesis) | F1 | critical | block + regenerate |
| fear/doom/determinism lexicon + patterns | F2 | critical | block + regenerate |
| scarcity/urgency patterns | F3 | major | block + regenerate |
| dependence patterns | F4 | major | block + regenerate |
| `hasUnsafeAdvice` (exists) | F5 | critical | block + regenerate |
| "AI" scrub (exists) | F6 | critical | block + regenerate |
| `hasPromptLeak` / `hasUnresolvedPlaceholder` (exist) | F7 | critical | block + regenerate |

Regenerate up to N attempts; if still failing → fail closed (no render, no
debit, surface a soft retry). **A bad generation never ships and never costs the
user a credit.**

## Calibration & audit
- **Log every generation + every catch** (which rule, severity, the offending
  span) → the audit trail proves governance and feeds tuning.
- **Sample-review** a slice of passing narrations to tune the dial + lexicons.
- This is precisely what the Slice 6 **exception console** surfaces:
  flag-rate-by-rule, dial controls, and a takedown/retry queue.

## Calibration: DECIDED (see top). Build target.
All four questions resolved 2026-05-31. This doc is now the implementation spec
for the narration prompt (Layer 1) and the deterministic gate (Layer 2).
