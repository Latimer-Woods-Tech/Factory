# Atmosphere Art Direction — Oracle / Indigenous-Inspired Re-skin

> **What this governs:** the *frozen-AI atmosphere layer* of every Prime Self video —
> the six `forge-backgrounds/*.png` images in R2 that `ForgeAtmosphere.tsx` composites
> behind the procedural data layer (the real bodygraph, transits, particle systems).
>
> **Why frozen:** generation happens **once**, off the render hot path. The render
> pipeline only *composites* these fixed assets, deterministically. That is how the
> aesthetic is delivered 100% of the time, every time — the look cannot drift because
> the look is a fixed asset, not a per-frame generation.

## The visual language (locked)

A single coherent style across all six forges. The *forge* changes the palette and
motif; the *language* never does.

- **Hand-drawn / hand-painted**, not photographic, not 3D-render, not flat-vector.
  Visible mark-making: ink line, brush texture, paper/hide grain.
- **Oracle / sage**: mythic, contemplative, reverent. Feels like an illuminated
  manuscript or a divination card, not a SaaS explainer.
- **Indigenous-inspired with integrity**: geometric/cosmological motif vocabulary
  (concentric cosmology, woven line, star-map, earth-and-sky axis) — drawn from a
  *respectful, non-appropriative* register. **No sacred/ceremonial regalia, no
  specific living culture's closed iconography.** Universal cosmological geometry only.
  (See "Authenticity guardrails" — this is a truth/ethics gate, not just taste.)
- **Iconographic**: every background reads as a *symbol field*, legible at a glance,
  composed for a focal void in the centre where the bodygraph/data layer sits.
- **Background, not foreground**: these sit at `opacity: 0.55`, `mixBlendMode: luminosity`
  under the data layer (see `ForgeAtmosphere.tsx`). Compose dark, low-contrast, with the
  energy at the edges and a calm centre. Text and chart render on top.

## Per-forge briefs (the six frozen images)

Each is 1920×1080, dark-grounded (`FORGE_BG` base colours in `ForgeAtmosphere.tsx`),
centre kept quiet. `self` uses **no image** (pure deep space) — do not generate one.

| Forge | Register | Palette anchor | Motif brief |
|---|---|---|---|
| `chronos` | time, depth, slow grind | deep indigo `#07091f` + aged gold `#c9a84c` | Concentric time-rings / a hand-drawn cosmological wheel; faint horizontal strata like sediment or star-drift. Stillness and depth. |
| `eros` | intimacy, connection | near-black ember `#100808` + warm ochre/rust | Two interweaving woven lines meeting; soft ember field at the lower edge. Warmth, magnetism, never literal. |
| `aether` | openness, breath | deep night-blue `#050d1a` + pale mist `#b8d4e8` | An open star-map / breath-threads drifting across a vast sky; airy, unbounded, exhaled. |
| `lux` | illumination, revelation | midnight `#060a1c` + warm white `#fff8e0` | Dawn light breaking from above through a drawn aperture; radiant lines descending into the dark. The moment something lands. |
| `phoenix` | transformation, fire | dark teal-black `#050f10` + aged gold | Rising sparks / a drawn flame-glyph at the base; upward motion, rebirth, earthbound fire. |
| `self` | deep space, silence | `#05091a` | **No image.** Pure void — the procedural starfield carries it. |

## Generation recipe (frozen-once)

1. Generate each image with the locked style preamble + the per-forge motif brief.
   Recommended preamble (image model of record — Grok, per current pipeline):

   > *"Hand-painted illustration in the style of an illuminated oracle manuscript.
   > Mythic, contemplative, reverent. Visible ink line and brush/paper-grain texture.
   > Universal cosmological geometry — concentric rings, woven lines, star-maps,
   > earth-and-sky axis. Dark-grounded, low contrast, energy at the edges, a calm
   > quiet void in the centre. No text, no faces, no people, no specific cultural
   > regalia. 1920×1080."*

2. Curate: generate several, **freeze the chosen one** to
   `r2://video-assets/forge-backgrounds/{forge}.png` (the path `ForgeAtmosphere.tsx`
   already reads). Replacing the asset re-skins every video at once — no code change.
3. Bump a `forge-backgrounds` asset version so the acceptance gate can detect a re-skin.

## Authenticity guardrails (truth/ethics gate — non-negotiable)

- **No closed or sacred iconography** of any living/specific culture (no medicine
  wheels presented as such, no totemic regalia, no ceremonial dress, no script systems).
- Stay in the register of **universal cosmology** (sky, star, ring, line, light, fire,
  earth/sky axis) that no single culture owns.
- Brief the image model **explicitly negatively** ("no specific cultural regalia, no
  faces, no people") — this is part of the recipe above, not optional.
- If a candidate image reads as a specific culture's sacred object, **reject it.** This
  belongs in the acceptance gate's manual-review checklist before any asset is frozen.

## How this delivers the vision

| Vision word | Delivered by |
|---|---|
| Hand-drawn oracle/sage | This frozen atmosphere layer (the style preamble) |
| Indigenous-inspired (with integrity) | The universal-cosmology motif vocabulary + the authenticity guardrails |
| Iconographic | Symbol-field composition + the procedural `BodyGraph`/`StarField` data layer on top |
| Self-mutating | Same six frozen atmospheres × every viewer's real chart data → a unique deterministic composite per person |
| Truth-based | Content rails come from `generate-video-briefs.mjs` (data layer); atmosphere carries *mood only*, asserts no claims |
| 100% every time | Frozen assets + deterministic Remotion composite + the acceptance gate |
