# Suno Music Prompts — Prime Self video score library

Instrumental underscore beds for the Capricast/Prime Self videos. One track per
**forge theme** (the atmosphere the render already uses), so music and visuals
share a mood. These sit *under* the ElevenLabs narration, so every prompt is
written for a **non-distracting bed**: instrumental, minimal melody, slow
evolution, no vocal hooks or busy drums that fight the voice.

## How to use Suno for this
- Turn **Instrumental ON** (no lyrics). If your Suno version has no toggle, put `[Instrumental]` in the lyrics box.
- Paste the **Style** string below into the style/genre box. Keep it as-is — Suno responds best to concise, comma-separated descriptors.
- Generate, then keep the take with the **calmest intro** (the video opens immediately, so you want an ambient swell, not a hard downbeat).
- Videos are **75–90s**; Suno tracks run ~2 min. That's fine — the render loops/trims. Aim for a take that can fade gracefully.
- **Name + upload** each take to R2 so the pipeline can reference it (see "Wiring" at the bottom).

> Rule of thumb that keeps them under the voice: **low–mid energy, no lead melody, no lyrics, no four-on-the-floor drums.** Texture and motion, not songs.

---

## The six forge beds

### `self` — grounded, centered, intimate (default theme)
**Style:**
```
ambient cinematic underscore, warm analog synth pad, intimate and grounded, slow 60 bpm, soft sub-bass, gentle felt piano, no drums, no vocals, minimal melody, calm and reassuring, for voiceover background, evolving texture, loopable
```

### `chronos` — time, structure, contemplation
**Style:**
```
minimalist neoclassical, Max Richter style, steady soft pulse, contemplative piano and strings, slow arpeggio like clockwork, 70 bpm, restrained, spacious, instrumental, no vocals, low energy underscore for narration
```

### `eros` — warmth, relationship, tenderness
**Style:**
```
warm romantic ambient, solo cello and soft string ensemble, tender and intimate, slow 62 bpm, lush reverb, gentle, instrumental, no vocals, emotional but understated, background score for voiceover
```

### `aether` — airy, expansive, weightless
**Style:**
```
ethereal ambient, airy shimmering pads, weightless and spacious, glassy bell textures, very slow, dreamlike, instrumental, no vocals, no drums, floating drone with subtle movement, cinematic underscore for narration
```

### `lux` — light, hope, gentle lift
**Style:**
```
luminous cinematic ambient, hopeful and radiant, slowly rising warm strings, soft glockenspiel accents, 72 bpm, uplifting but calm, instrumental, no vocals, gentle build, score under voiceover, bright and clear
```

### `phoenix` — transformation, anthemic, rebirth (use for the hero/landing video)
**Style:**
```
epic cinematic build, anthemic and reverent, swelling strings and low brass, slow crescendo from quiet to triumphant, 75 bpm, sense of rebirth and awakening, instrumental, no vocals, minimal in the first half then rising, trailer underscore
```

---

## Category overrides (when a brief isn't an EnergyBlueprint render)
Most briefs default to the `self` bed. Use these when the moment calls for it:

| Category | Use bed | Why |
|---|---|---|
| Landing / Welcome (homepage-welcome) | **phoenix** | anthemic hook, the "Begin" crescendo |
| User-Guide series | **self** or **aether** | calm, unobtrusive, stays out of the way of instruction |
| Core Philosophy series | **chronos** | structural, reverent, the overtone arc |
| Synthesis moments | **aether** then **lux** | convergence → awe |
| Type-specific onboarding | **self** / **eros** | warm, personal welcome |
| Temporal / cyclical | **aether** / **chronos** | cosmic, the wheel turning |

---

## Optional: a few one-off "feature" tracks
If you want a couple of richer pieces (e.g. a longer hero cut or a synthesis "reveal" sting):

**Hero cut (90s, full arc):**
```
cinematic trailer underscore, instrumental, begins as a single warm piano note over ambient pad, strings enter at 30s, slow anthemic build to a reverent peak around 60s, gentle resolve, no vocals, no heavy percussion, gold and reverent, 75 bpm
```

**Synthesis reveal sting (15–20s):**
```
short cinematic reveal, instrumental, shimmering rising swell into a single bright resonant chord, awe and convergence, no vocals, no drums, ethereal, ends on sustained glow
```

---

## Wiring (so the pipeline can play them)
Once you have takes you like:
1. Name them by forge theme: `music-self.mp3`, `music-chronos.mp3`, … `music-phoenix.mp3` (plus `music-hero.mp3` if used).
2. Upload to R2 under a `music/` prefix (same bucket as narrations/videos).
3. The render reads a **music manifest** (forge theme → R2 URL) and plays the matching bed, ducked under the narration. I'll add that manifest + the ducking when I wire music support into the compositions — drop the files in and they play automatically.

**Ducking target:** music ~ -18 to -22 dB under the voice (the composition handles this; you just supply clean instrumental beds).
