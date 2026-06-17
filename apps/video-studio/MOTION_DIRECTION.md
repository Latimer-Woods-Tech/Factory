# Motion Direction — Animated, Cinematic, Pick-a-Pile

> Governs the *motion* layer of every Prime Self video: how the bodygraph moves,
> how the camera cuts in and out, how type renders. Pairs with
> [ATMOSPHERE_ART_DIRECTION.md](./ATMOSPHERE_ART_DIRECTION.md) (the look) and
> `generate-video-briefs.mjs` (the truth). Grounded in 2026 short-form retention
> research — every rule below traces to an observed engagement driver, not taste.

## 1. Animated gates & channels (the bodygraph is alive)

The `BodyGraph` component (`packages/video-studio/src/components/BodyGraph.tsx`)
renders the real chart. It must **move**, deterministically (Remotion `interpolate`
+ the existing LCG seed — never CSS transitions, which Remotion ignores per-frame):

- **Channels draw on** — a defined channel strokes from one gate to the other over
  ~12–18 frames (path-length `interpolate`), like a current completing a circuit.
- **Gates pulse** — an activated gate breathes: radius/opacity sine on the frame,
  phase-offset per gate (seed-stable) so the graph shimmers, never marches in lockstep.
- **Energy flows** — for a defined channel, a travelling highlight runs gate→gate on
  a loop (the "motor current"). Undefined centres stay still and open — the contrast
  *is* the teaching.
- **Reveal order follows meaning** — centres settle first, then channels draw, then
  the focal gate ignites. Structure before detail (scaffolding).

## 2. Scale-cut cinematics — "into" and "out to"

The director's note: *cut **into** internal pieces, cut **out to** larger pieces.*
Research names this exact move a retention technique ("words expand and snap into
frame… a final zoom-out reveals the full composition"). Implement as a deterministic
camera (a scaled/translated `AbsoluteFill` wrapper, frame-driven):

- **Push-in (into):** from the whole bodygraph → one centre → one gate glyph. Each
  push lands on a single idea as the narration names it. Ease-in, settle, hold.
- **Pull-out (out to):** from the gate → the channel it completes → the whole graph →
  the sky (StarField). The pull-out is the "you are part of something larger" beat —
  use it on the closing line, every time.
- **One scale move per scene beat.** Never zoom while talking through a list. Motion
  matches meaning: snap for emphasis, slow-track for clarity (research: "fast entrances
  signal urgency; smooth tracking signals confidence").
- **The signature cut:** open pushed-IN on a single glyph (hook), close pulled-OUT to
  the full sky (resolution). In → out is the film's spine.

## 3. Kinetic typography (silent-viewing legibility)

Most viewers watch muted; text carries the message.

- **3–7 words per beat.** One idea on screen at a time. Never a paragraph.
- **Bold entrance** — pop / zoom / snap in on the stressed word, synced to the
  narration beat (audio-sync materially lifts retention).
- **First 2 seconds state the benefit.** The brief's per-variant `hook` is the opening
  card — it must earn the next second. (Drop-off is front-loaded.)
- **No visual noise** — one type family, no bouncy motion on the sage register. If it
  isn't instantly readable, it isn't helping.

## 4. Pick-a-pile structure (the carousel)

Every concept ships 4 variants — *gift · shadow · practice · mirror* (in each brief's
`variants[]`). This is the "pick a card" format the research identifies as the dominant
viral driver (viewer agency + projection).

- **Surface as a variable carousel** — the viewer self-selects the pile that resonates.
- **Each variant**: opens on its `hook`, runs its angle, closes on its
  `participationPrompt` (comment/duet — research: participation prompts keep content
  circulating).
- **Same truth rails across all four** (`keyPoints` / `forbiddenClaims` shared) — only
  the framing, forge, and motion emphasis change. Variety without ever lying.

## 5. The 30-second spine (assembled from the above)

```
0:00  PUSH-IN on a single glyph + hook card (kinetic, bold)        ← stop the scroll
0:03  Gate ignites / channel draws on, narration names the gift    ← recognition
0:10  Pull to the channel → the practice (action, motion-forward)  ← "today's move"
0:20  Pull-OUT to full bodygraph → the sky                         ← "something larger"
0:27  Participation prompt card (kinetic)                          ← circulation
```

Action-oriented, motion-forward, high production value — and structurally identical
every time, which is exactly why it renders reliably 100% of the time.

---

_Sources informing this direction: 2026 short-form retention research on pick-a-pile
formats, zoom/scale transitions, and kinetic typography (see PR description)._
