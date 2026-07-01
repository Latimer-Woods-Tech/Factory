# Personalized Video Engine — Roadmap

Turn the billing-proof Cloud Run render pipeline into a **personalized, chart-accurate,
synthesised, cinematic video engine** — the activation magnet, the practitioner deliverable,
the retention loop, and reusable Factory infra.

_Spec v2 (maturity + cohesion pass), 2026-06-24. Status: ✅ done · 🟡 partial · ⬜ net-new._

---

## 1. North star
The same engine that renders a generic "Gate 20" clip renders **your Gate 20, in your chart,
synthesised across systems, in your practitioner's voice, narrated, scored, symbol-marked, and
privately delivered** — for pennies. Nobody in Human Design ships that. It attacks the activation
cliff (the WOW *before* the paywall) and gives practitioners a deliverable no PDF can match.

## 2. Core principle — a data pipeline, not a video factory
The durable asset is the **insight graph**, not the videos. Video is the last-mile render of a
*validated insight*:

> chart × systems → **grounded insight object** → script → **EVAL gate** → render → deliver

1. **Quality is gated at the script stage, not the video stage.** Scripts are ~free to generate
   and evaluate; rendering is the expensive last mile. Eval before you spend.
2. **Render atoms, compose on demand.** Never pre-render the cross-product (384 gate-lines ×
   types × transits × systems × users = ∞). Render atomic units; the chart selects + assembles
   them. Same chart → same set → cacheable.

## 3. The Atom Registry — the spine everything reads from
One module. Every content **atom** (gate→center, planet, element, type) resolves to a single record:

```
atom → { glyphs[], hexagram, color, musicalMode, forge, kbKeys[], characterKeyword }
```

This is the single source of truth for the brand's entire sensory + symbolic language; four
surfaces consume it, none duplicate it:
- **mood-ring** (existing `vibe-tokens` / `resolveTone`) — UI tone & color.
- **video essence** — forge atmosphere + body-graph glow color.
- **music** — the ElevenLabs Music prompt is built *from the atom's musical mode*.
- **symbology** — the glyphs/hexagram/convergence marks the video composes.

**Facet A — Essence (color-wheel psychology × musical-mode theory).** Color + mode + character
per center; modes carry meaning so music *means* something per frequency:

| Center | Color | Mode | Character | Forge |
|---|---|---|---|---|
| Head | violet | Lydian | wonder | aether |
| Ajna | indigo | Dorian | contemplation | chronos |
| Throat | blue | Mixolydian | expression | lux |
| G / Self | green-gold | Ionian | direction | self |
| Heart | red | Ionian (bold) | will | phoenix |
| Solar Plexus | amber | Aeolian | the wave | eros |
| Sacral | orange | Dorian (groove) | life-force | eros |
| Spleen | teal | Phrygian | instinct | chronos |
| Root | crimson | Phrygian (driving) | drive | phoenix |

**Facet B — Symbology (standardized esoteric iconography), 3 tiers:**
1. **Universal (Unicode — free, legible):** astrological glyphs (planets/signs/aspects; seeded by
   the constellation catalog `☉☽☿♀♂♃♄♅…`) + the 64 **I-Ching hexagrams** (`䷀–䷿`; every HD gate *is*
   its hexagram) + the four elements. The esoteric lingua franca.
2. **Structural (built):** bodygraph — 9 center shapes + Essence colors, gate numbers, channels.
3. **Signature (brand-owned IP):** Gene Keys **Shadow/Gift/Siddhi** marks + a **convergence /
   resonance glyph** — the visual of "combogeneticize," firing when systems agree on a point.
   The one symbol that makes a Self:Prime frame recognisable in a second.

**Facet C — KB keys.** Each atom links to its **Prime Self KB** entries (`HumanDesign/src/
knowledgebase/library` + `library-keys`), the corpus that is both the **truth source** (grounding)
and the **deterministic variety source** (randomized framings, seeded → reproducible).

⬜ **Phase-0 deliverable:** `atom-registry` (one data module) consumed by the derive-script,
the music-prompt builder, the symbology layer, and the mood-ring.

## 4. Council conditions (binding law)
Ruling (Obama / Vanzant / Oprah / Angelou / Badu): **approved with five conditions.** A feature
is not "done" if it violates one.
1. **Recognition first (Oprah).** Every personalized video opens with the recognition moment
   (`recognitionLine`) — the "how did it know" aha — before any teaching or CTA.
2. **Consent is sacred (Vanzant).** Birth data + voice clones + diary → explicit, **revocable**
   consent, never assumed. Transit loops framed as **empowerment, not prophecy**, never engineered
   for dependency. The practitioner stays in the loop.
3. **Dignity, not just accuracy (Angelou).** See the Charter (§6). Hollow-but-accurate fails.
4. **Anti-sameness / keep the soul (Badu).** Meaningful aesthetic + sonic variety per atom (driven
   by the Atom Registry), warmth over polish. Protect the art from the funnel.
5. **Service before funnel (Obama).** Every video true + useful on its own first. Measure **reach +
   help** (incl. people who'll never pay), not just conversion. The quality gate is character.

## 5. The keystone (build once, everything reuses it)
**`render-runner` takes a real chart + a validated insight → that person's video.** 7 of 8
features are "keystone + a trigger + a destination."

Already in place:
- ✅ Cloud Run render-runner (GCP-billed, billing-proof), music beds (`sybil-music/forge`), Inter font.
- ✅ `EnergyBlueprintVideo`: forge atmosphere + body graph + kinetic + per-scene `definedCenters`/`spotlightCenter`/`signatureGates`/`hdType`.
- ✅ `chartToScenes(blueprint)` — scenes from a real chart.
- ✅ `GATE_TO_CENTER` / `CENTER_GATES` (`@latimer-woods-tech/bodygraph`); constellation Sky engine (Body⟷Sky-bridged in-app).
- ✅ Chart API (`/api/chart/calculate`), transits in profile, ElevenLabs (narration + **Music API live** + **voice cloning** confirmed on `creator`), Capricast + YouTube.
- ✅ Grounding-eval muscle: HumanDesign WOW gate (`gradeGrounding`, `eval-gate.mjs`) — REUSE.
- 🟡 Generic thematic derivation (`derive-blueprint-props.mjs`) — built, needs rebuild + verify.

## 6. Voice & Dignity Charter (binding — Council #3)
The voice — *written and spoken* — must embrace the dignity of **the person** and **the intent**.
- **Person:** second person, respectful; **name their gifts**, hold shadows gently (never "Not-Self");
  no false flattery; no fear/dependency; reflection not verdict ("what your design *says*", not "what you *are*").
- **Intent:** honest + kind + empowering; never manipulative/salesy even in funnel videos; register
  adapts to intent (invite / intimate deliverable / daily attunement) while holding the floor.
- **Delivery:** ElevenLabs tuned for warmth + gravitas, pacing that breathes; practitioner's
  **cloned voice** for client deliverables.
- ⬜ Enforced as a **dignity rubric** the script-eval scores against, extending the existing mood-ring
  `dignity-floor` (one floor governs UI tone AND narration). Below floor → does not render.

---

## Phase 0 — Keystone + Synthesis/Quality foundation + guardrails ⬜ (unblocks everything)
- ⬜ **Per-chart render:** render-runner accepts `{userId|chartId}` → auth-scoped chart → `chartToScenes` → render.
- ⬜ **Atom Registry** (§3) + **atomic insight-object model** keyed by `(gate, line, center, system)`; chart selects atoms → assembled reading (render-once-recombine).
- ⬜ **Truth-source grounding** via the Prime Self KB (multiplier + seeded randomizer); every line traces to a `truthSource`; enforce `forbiddenClaims`.
- ⬜ **Script-first EVAL gate:** grounding + accuracy + no medical/predictive/AI claims (`validation`) + coherence + **dignity/resonance rubric**; reuse `gradeGrounding`/`eval-gate`. Assert recognition-first. Human-approve first N. Only passers render.
- ⬜ **Efficiency:** idempotency/cache on `(content-version, chart-hash)`; version briefs/truth-sources/prompts.
- ⬜ **Guardrails:** private signed delivery (R2 + Stream), explicit/revocable consent (SYS-019); per-render budget + daily cap + cost telemetry.

_Done when:_ one real account → a grounded, eval-passed, correctly-lit, private video, reproducibly.

## Phase 1 — The two that move the business
- **(2) 64 gate funnel videos** 🟡→⬜ — finish `derive-blueprint-props.mjs` (gate→its center lit) + **"see this in your chart" → `/?start=1`** end-card + Capricast/YouTube + per-gate SEO pages. Each delivers a real aha on its own (#5), per-gate variety from the Registry (#4).
- **(1) Personalized deliverable** ⬜ — practitioner "Send video" in deliver/Artifact-Theatre → Phase-0 per-chart render → private client link, consent-gated, opens with recognition (#1). The activation magnet + moat.

_Done when:_ gate videos live + indexed; a practitioner sends a client a real chart video.

## Phase 2 — Recurring / retention + synthesis synergies
- **(3) Daily personalized transit video** ⬜ — "a transit lights your Gate X" on the user's chart; per-user schedule. Empowerment, not prophecy (#2).
- **(5) Living "chart this week"** ⬜ — weekly transit re-render; opt-in subscription hook.
- **(SYN-A) Sky engine in video** ⬜ — constellation **alongside the body graph** (built + bridged). The literal visual of "combogeneticize."
- **(SYN-B) Life Diary as a PRIVATE LENS — not a script** ⬜ — **never quoted/shown/spoken, never practitioner-facing**; entries → a private signal that quietly tunes *which* content surfaces. Opt-in, default OFF, revocable, user-only. Reflect, don't surveil.

_Done when:_ opted-in users get automatic daily/weekly transit videos; sky in renders.

## Phase 3 — Differentiation / virality
- **(7) Practitioner's cloned voice** ⬜ — ElevenLabs clone per practitioner (consent + ToS), selected at render. _(`can_use_instant_voice_cloning: true` confirmed.)_
- **(6) Relationship / composite videos** ⬜ — two charts overlaid (electromagnetic / companionship / dominance); new compositing. Shareable, viral-shaped.

_Done when:_ a practitioner ships a voice-branded video; a two-chart composite renders.

## Phase 4 — Intelligence + platform leverage
- **(8) Engagement-driven content** ⬜ — RFC-008 second brain: PostHog watch signals → priority → queue; replaces the static brief list.
- **(4) render-runner as Factory infra** 🟡→⬜ — formal "data → branded video" contract + per-tenant theming for other apps/Capricast creators.

_Done when:_ the queue self-prioritizes; a second app renders through render-runner.

---

## 7. Synergy stack (the compounding — keep these golden)
- **The funnel chain:** SEO gate video → free chart → personalized video → practitioner deliverable → engagement signal → next video. Each phase is a link; connected, they compound.
- **Body + Sky + Transit in one frame** (SYN-A) — the synthesis made visible.
- **Voice × Transit × Diary** — practitioner's cloned voice narrating a client's living weekly video, quietly tuned by the client's own (private) history. No competitor can assemble this.
- **One registry, every surface** — UI mood-ring, video, music, symbology speak the same language.
- **Reuse over rebuild** — chartToScenes, constellation, grounding-eval, recognitionLine, the KB all exist; the work is *connecting* them.

## 8. Cross-cutting (every phase)
- **Consent & privacy:** birth data + voice + diary → explicit/revocable consent, private signed delivery.
- **Cost:** budget caps + telemetry; pay-per-render economics keep personalization viable.
- **Quality:** script-stage eval before any spend; human-approve first batch per type.
- **Observability:** render success rate, cost/video, time-to-deliver, watch-through, gate→signup conversion, **reach/help served**, eval-gate pass rate, dignity scores.

## 9. Risks & failure modes
| Risk | Severity | Mitigation |
|---|---|---|
| **Content inaccuracy / hallucination** (brand-killer in esoterica) | High | KB truth-source grounding + script-stage eval gate + human-approve first N. |
| **ElevenLabs Music commercial license unclear** (Creator tier) | High (blocks publish) | Confirm license before monetized publish; `sybil-music/forge` beds are the working fallback. |
| **Cost runaway** (per-render spend × volume) | Med | Budget caps, daily limits, cache `(content-version, chart-hash)`, atoms-not-cross-product. |
| **Consent/privacy breach** (birth data, diary, voice) | High | Private-by-default, explicit/revocable consent, diary never spoken/practitioner-facing. |
| **Sameness / soulless at scale** (Badu) | Med | Atom Registry drives meaningful per-atom variety; anti-sameness is a "done" criterion. |
| **Vendor lock-in (ElevenLabs single point)** | Med | Keep the music/voice layer behind an interface; Suno/forge beds remain a swap-in. |
| **Quality bar drift as volume grows** | Med | Eval-gate pass-rate + dignity scores tracked; gate stays binding, not advisory. |
| **Latency per render** (music/voice/render chain) | Low | Cache atoms + music; pre-warm common essences; async queue. |

## 10. Open decisions / dependencies (resolve before the phase that needs them)
- **ElevenLabs Music commercial license** on Creator tier → before Phase 1 publish.
- **Target cost/video** (sets cache aggressiveness + bespoke-vs-cached music policy) → Phase 0.
- **Per-user chart-data access** for render-runner (token/scope to pull a user's chart) → Phase 0.
- **Consent UX** (where/how users opt in to personalized + diary + voice) → before Phase 1 (1) / Phase 2 (SYN-B).
- **Music quality** A/B (ElevenLabs vs Suno/forge) → Phase 0/1.

## 11. Success metrics
- **North star:** personalized-video → activation rate (free → engaged/paying after receiving a video).
- **Phase 1:** gate-video → signup conversion; deliverable → client activation.
- **Phase 2:** daily/weekly retention lift among opted-in users.
- **Quality (all phases):** eval-gate pass rate ≥ target; dignity score ≥ floor; cost/video ≤ target.
- **Service (Council #5):** people *helped* (videos watched to value) incl. non-payers.

## 12. Sequencing + immediate next steps
Phase 0 is the fork in the river — keystone + Atom Registry + eval gate are foundational to all 8.
Phase 1 ships the business movers; Phases 2-4 add retention, the synthesis synergies, differentiation,
and self-correcting intelligence.

1. Finish + verify the generic thematic gate render (`derive-blueprint-props.mjs`) — one rebuild away; proves per-gate lighting.
2. Build the **Atom Registry** (the spine) — Essence + Symbology + KB-keys in one module.
3. Stand up the **Phase-0 keystone** against one real account: per-chart render + insight-object/eval scaffold + private delivery.
