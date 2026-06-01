# Voices

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative spec · **Code:** [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts)

> Voice is product × ICP, not just product. The same product talks to a chart-curious consumer in a different register than to a working practitioner. This file specifies the matrix and the registration rules.

> **Today's state:** [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) registers 5 voices keyed only by product (`cypher_healing`, `prime_self`, `ijustus`, `the_calling`, `default`). The migration to product × ICP keys lands in [PR 3c — voice matrix](./pr3-briefs/3c-voice-matrix.md).

---

## 1. Key shape

After PR 3c lands:

```ts
// Today
voiceProfiles['prime_self']

// After PR 3c
voiceProfiles['prime_self:practitioner']
voiceProfiles['prime_self:consumer']
voiceProfiles['prime_self:power']
```

Key format: `{product_slug}:{icp_archetype}`. Archetypes are the 5 columns of [`ICP_MATRIX.md`](./ICP_MATRIX.md) plus `default` and `internal`.

Existing single-key voices are aliased to `{product_slug}:default` for backwards compatibility; deprecation warning at registration. Full deprecation in PR 3c+1.

---

## 2. The voice matrix

One row per filled `ICP_MATRIX.md` cell. Empty cells have no voice (publication on that cell blocks at the gate).

### Selfprime (`prime_self`)

| ICP key | Tone | Vocabulary | Avoid | Register | Example |
|---|---|---|---|---|---|
| `prime_self:consumer` | curious, encouraging, modern | chart, gateway, signature, design, decision | "spiritual," "vibes," "frequency" (without context), "manifestation" | conversational | *"Your chart is a decision-making manual. Most people just don't know how to read theirs yet."* |
| `prime_self:practitioner` | direct, respectful, peer-to-peer | client, reading, prep, chart synthesis, your practice, your standard | "newbie," "casual," "amateur," "we know better" | professional | *"Cut your client prep from 90 minutes to 20 — same depth, your voice in every line."* |
| `prime_self:power` | technically rich, generous, opinionated | aspects, transits, ephemeris, declination, dispositorship | over-simplification, "for beginners" | conversational | *"If you've been reading charts for three years and still don't trust your own delineations under client pressure, this is for you."* |

### Cypher of Healing (`cypher_healing`)

| ICP key | Tone | Vocabulary | Avoid | Register | Example |
|---|---|---|---|---|---|
| `cypher_seeker` (was `cypher_healing`) | warm, honest, grounded, hopeful | healing, journey, community, wholeness, transformation | "hustle," "grind," "toxic positivity," "quick fix" | conversational | *"Healing is not linear — and that is exactly why we walk together."* |
| `cypher_practitioner` | respectful, collegial, practical | clients, practice, container, modality, ethics | "guru," "expert," anything that breaks therapeutic frame | professional | *"Tools that hold your container, not replace it."* |

### Xico City (`xicocity`)

| ICP key | Tone | Vocabulary | Avoid | Register | Example |
|---|---|---|---|---|---|
| `xicocity_creator` | bold, kinetic, culturally rooted, irreverent | creator, run, drop, scene, city, sound, story | "content," "monetize," anything that flattens culture to commerce | conversational | *"Build your scene before the platforms decide what your scene is."* |
| `xicocity_collective` *(queued)* | collective-minded, practical | crew, collective, partnership, share | TBD | TBD | *(operator drafts)* |

### Factory (`factory`)

| ICP key | Tone | Vocabulary | Avoid | Register | Example |
|---|---|---|---|---|---|
| `factory_internal` | precise, low-ceremony, peer-engineer | binding, contract, ADR, shadow, scorecard, gate | hype, marketing language, generic dev-rel tone | professional | *"This package owns the brand-voice gate. If a campaign ships copy that breaks the gate, it's a constitution violation, not a feature request."* |

### Capricast — queued

No registered voices yet. Per [`project_capricast_rename.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_capricast_rename.md), product positioning is in flux.

---

## 3. Registration rules

A new voice can be registered when:

1. There's an `ICP_MATRIX.md` cell at `discovery` or above with matching key
2. The ICP file lists the voice's tone + vocabulary + avoid in §1 (positioning section)
3. The voice has ≥1 example sentence
4. Brand voice rules (`BRAND_PROFILES` in [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts)) are extended with the new key's `requiredTerms` + `blockedTerms`

The registration PR must touch both [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) and [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) — otherwise the brand-voice gate runs the wrong rules.

---

## 4. Cross-voice rules (apply to every key)

- Honesty per [`CONSTITUTION.md §9`](./CONSTITUTION.md#9-honesty--truth)
- Reading level: 8th–10th grade for consumer voices, 11th–12th for practitioner/power voices
- Sentence length: median ≤22 words; no run-ons over 35 words
- Exclamation points: ≤1 per 500 words (zero in practitioner/power voices)
- Em-dashes: encouraged for the practitioner/power register; discouraged in seeker register
- Emojis: zero, anywhere, ever (org-wide per the operator's preference — confirmed via copy-tone guidance for every published voice)
- "We" vs "you": consumer voices prefer "you"; practitioner voices prefer "we" (peer framing)
- Acronyms: spell out on first use in any artefact > 200 words

These cross-voice rules go into a `globalVoiceRules` constant in [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) per PR 3c.

---

## 5. Voice drift detection

The brand-voice gate catches *per-artefact* violations. Drift detection catches *systematic* drift across artefacts over time.

**Implementation** (per [PR 3m brief](./pr3-briefs/3m-brand-safety-tripwire.md)):
- Weekly aggregation of `validateAiOutput()` results per voice key
- Flag any voice where `minor` issue rate > 8% over rolling 14 days
- Flag any voice where the same `minor` issue (same `rule` field) appears in > 30% of artefacts — that's a missing rule, not a one-off
- Auto-open a PR draft against `packages/crm/src/index.ts` proposing the missing rule

---

## 6. Voice example bank

Each voice maintains a corpus of `n` example sentences ranked by `validateAiOutput()` confidence + reply-engagement signal. The corpus is used to few-shot the LLM at generation time.

- Bank lives at `packages/copy/src/voice-corpus/{key}.json`
- Top 10 examples by ranked score get included in the system prompt per generation
- New artefacts auto-considered for the bank if (gate-clean) AND (above-median engagement)
- Operator can pin or veto any corpus entry

---

## 7. Cross-references

- [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) — current registration
- [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) `BRAND_PROFILES` — current gate rules
- [`packages/validation/`](../../packages/validation/) — `validateAiOutput()`
- [`CONSTITUTION.md §2`](./CONSTITUTION.md#2-brand-voice-gate) — gate is non-negotiable
- [`ICP_MATRIX.md`](./ICP_MATRIX.md) — cells that need voices
- [PR 3c brief](./pr3-briefs/3c-voice-matrix.md) — migration plan

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — voice matrix spec; product × ICP key shape; cross-voice rules; drift detection |
