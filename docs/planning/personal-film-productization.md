# Roadmap — Personal Film Productization

**Owner:** video-studio · **Created:** 2026-06-30 · **Status:** scoped, ready to execute
**Goal:** make the per-user film that production actually renders be the **directed v10 HeroBlueprint** (identity card, rack focus, signature-gate cards, synthesis circuit, cosmic sky, weighted looks, word-synced narration) — not the legacy scene-arc film users get today.

---

## The core finding (why this matters)

The personal-film pipeline is **fully wired end-to-end and working** — but it renders the **old film**, so every visual improvement from weeks of HeroBlueprint work currently reaches **zero** production users.

`HeroBlueprint` has two modes, gated at [`EnergyBlueprintVideo.tsx:507`](../../packages/video-studio/src/compositions/EnergyBlueprintVideo.tsx#L507):
```ts
if (identity && cues) {   // → directed v10 hero film
  ...
}                          // else → legacy scene-arc film (arrival/revelation/concept/breath/triad/invitation)
```
The production path supplies **neither `identity` nor `cues`**, so it always falls to the legacy branch.

### The wire that exists today (confirmed, both repos)
1. **selfprime** (`HumanDesign` repo): film-panel → `POST /api/profile/:id/video` → `handleGenerateVideo()` (`workers/src/handlers/video.js:107-386`) builds a `blueprint` via `chartToBlueprintSegment()` (`workers/src/lib/blueprintSegment.js:174-204`), authors narration, HMAC-signs a `RenderRequest`, POSTs to `env.RENDER_SERVICE_URL/render`.
2. **render service** (Factory `apps/video-render-service`): verifies HMAC → `pipeline.ts:281-299` → `buildBlueprintProps()` → `chartToScenes()` → renders `EnergyBlueprintVideo` → ffmpeg → Cloudflare Stream (private) → signed callback.
3. **selfprime callback**: stores `stream_uid` in `video_object` (mig097), mints signed playback, film-panel shows the iframe.

### Where it falls short
[`buildBlueprintProps()`](../../packages/video-studio/src/blueprintSegment.ts#L77) emits only: `scenes` (via `chartToScenes`), `forgeTheme`, `hdType`, `signatureGates`. It emits **none** of the hero fields: `identity`, `name`, `profile`, `heroDefinedCenters`, `definedCenterLabels`, `signatureGateData`, `cues`, `lookName`/`lookSeed`, `skySeed`. And the service TTS ([`tts.ts:97`](../../apps/video-render-service/src/tts.ts#L97)) calls the **plain** `/v1/text-to-speech/{voice}` endpoint, so there's no character alignment to build `cues` from.

---

## Workstream A — Hero-props upgrade (THE unlock)

Make the render service emit hero-film props so `identity && cues` is satisfied. Mostly Factory-side; one small selfprime change.

- **A1 — `chartToHeroProps(blueprint, profile)`** (new, in `packages/video-studio`, alongside `chartToScenes`). Emit:
  - `identity { type, authority, strategy }` — `type` from `hdType`; `authority` from `blueprint.authority`; `strategy` derived per type (Generator→Respond, MG→Respond, Projector→Wait for the invitation, Manifestor→Inform then act, Reflector→Wait a lunar cycle).
  - `name` (displayName), `profile` (e.g. "5/1 Heretic-Investigator").
  - `heroDefinedCenters` / `definedCenterLabels` — from `definedCenters`.
  - `signatureGateData[]` — `{ gate, name, hex, center, archetype, shadow, gift, siddhi, x, y }`, assembled from `signatureGates` + the **Atom Registry** gate catalog (in video-studio) + bodygraph `gatePosition()` for `x,y`. selfprime already sends `gateToCenter` + `gateInsights`; the shadow/gift/siddhi/archetype/hexagram come from the registry.
  - `lookSeed`/`skySeed` — deterministic from `userId`/chart hash → `pickLook(seed, hdType)` (weighted pool already shipped) picks the look. No hand-selection.
- **A2 — `cues` from with-timestamps TTS.** Change [`tts.ts`](../../apps/video-render-service/src/tts.ts) to call `/v1/text-to-speech/{voice}/with-timestamps`, return `{ mp3, cues }`. Map the character alignment → the `cues` record HeroBlueprint expects (`type`, `authority`, `centersIntro`, `c{Throat,G,Heart,Solar}`, `gatesIntro`, `g{n}{shadow,gift,siddhi}`, `synthesis`, `close`, `totalFrames`). This mirrors the local `build-props` cue derivation; lift that logic into the service.
- **A3 — `buildBlueprintProps`**: when hero data is resolvable, spread the A1 hero fields + A2 `cues` into the props (keep legacy `scenes` as a fallback so old requests still render).
- **A4 — selfprime (`HumanDesign`)**: have `chartToBlueprintSegment()` also send `authority` and `profile` lines (today it omits `authority`). Small cross-repo PR (origin=adrper79-dot, same-repo PR on Latimer-Woods-Tech).
- **A5 — adopt the hardened render harness** (Workstream C) in `apps/video-render-service/src/render.ts` so production renders can't GPU-deadlock and ship deliverable file sizes.

**Verification (curl-with-your-own-eyes):** trigger one real `POST /api/profile/:id/video` for a known chart → poll `video_object` → confirm the Stream asset plays the **v10** film (identity card + rack focus + gate cards + synthesis circuit visible), narration word-synced.

## Workstream B — Delivery weight

- **B1 — crf.** Films are undeliverable at 170–183MB (Remotion default crf 18). The hardened harness defaults to **crf 23** (≈half size, near-lossless). Adopt in `render.ts`. Validate size on a full cut.
- **B2 — teaser cut.** The `RenderRequest.spec.format` enum already has `short_clip` / `narrated_stills` — wire `format: short_clip` to a trimmed ~30–45s arc (title → identity → one gate → close) for a shareable/email asset. (Activation lever: a short film a seeker can actually open and share.)

## Workstream C — Render harness + ops  ✅ shipped this session

- `apps/video-studio/_render-lib.mjs` — `renderSafe()`: `swiftshader`+`concurrency:1` default for heavy comps, **stall watchdog** that aborts via `makeCancelSignal()`, `crf` delivery knob. Smoke-validated. Adopt across all render scripts + the service render path (A5/B1).
- **Ops note:** orphan headless Chrome from a killed render blocks the next browser launch (`Timed out … connecting to the browser`). Sweep before launching: kill `chrome.exe` whose command line lacks `User Data` (those are render instances, not the user's browser).

---

## Sequencing
1. **C** (done) → **B1** (trivial, big win) → **A2** (cues; unblocks the whole hero mode) → **A1** (hero props) → **A3** (wire) → **A4** (selfprime authority/profile) → verify end-to-end → **B2** (teaser).
2. A is the bulk and is best done as its own focused thread/PR (cross-repo, touches the service + a new mapper + TTS). Do **not** run it as a parallel write-agent in a shared worktree — use `isolation:"worktree"` (a screencast agent is currently live in this tree).

## Honest caveat (the bigger constraint)
Per repeated data in memory: selfprime's binding constraint is **activation + practitioner supply (GTM)**, not craft — 0/35 free users have made a chart, ~0 approved practitioners. This roadmap is worth doing because it makes the film an **activation asset** (the beautiful thing a seeker gets and shares), but it will not by itself fix cold-start. Pair it with the activation/GTM work, don't substitute for it.

## References
- Mode switch: `packages/video-studio/src/compositions/EnergyBlueprintVideo.tsx:507`
- Props builder: `packages/video-studio/src/blueprintSegment.ts:77`
- Scene mapper: `packages/video-studio/src/chartToScenes.ts:236`
- Service pipeline: `apps/video-render-service/src/pipeline.ts:281`
- Service TTS: `apps/video-render-service/src/tts.ts`
- selfprime dispatch: `HumanDesign/workers/src/handlers/video.js:107`, `workers/src/lib/blueprintSegment.js:174`
- Data model: `HumanDesign/workers/src/db/migrations/097_video_engine_slice0.sql`
- Render harness: `apps/video-studio/_render-lib.mjs`
- Film identity to match: `packages/video-studio/src/components/HeroBlueprint.tsx`, `looks.ts`
