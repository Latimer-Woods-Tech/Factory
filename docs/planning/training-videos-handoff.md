# Handoff — Training Videos (classy screencast track)

**For:** the agent picking up training-video work · **Tracking issue:** [#1846](https://github.com/Latimer-Woods-Tech/Factory/issues/1846) (OPEN)
**Author:** prior video-studio session · **Repo paths below are relative to repo root unless noted.**

> TL;DR: Training/how-to content must be **classy product screencasts** — real captured UI in a branded frame with an animated cursor, zoom-to-focus, gold-on-dark lower-thirds, and a clean VO over a music bed. It is **NOT** the abstract motion-graphics treatment. The existing `TrainingVideo.tsx` composition is the wrong treatment and should be superseded, not extended.

---

## 1. What to build (and what to avoid)

**Build:** a new `TrainingScreencast` composition + a capture pipeline that drives real flows on selfprime.net, records them, and composites the capture into a branded frame.

| Layer | Direction |
|---|---|
| Footage | Real captured UI (Playwright / browser-agent), **not** screenshots or abstract shapes |
| Frame | Branded bezel/frame around the capture; soft drop shadow; the living/identity background can sit behind the bezel |
| Focus | Animated cursor + **zoom-to-focus** on the element being explained (interpolated, see §4) |
| Callouts | Gold-on-dark **lower-thirds** using the *current* film identity system (§3), not the old blue sidebar |
| Audio | Clean VO (ElevenLabs) + low music bed under it |

**Do NOT:**
- ❌ Reuse `apps/video-studio/src/compositions/TrainingVideo.tsx` as-is — it's a blue-sidebar + step-list **motion-graphics** treatment, which is exactly what #1846 rejects. Keep it only as a reference for the audio/step-timing plumbing.
- ❌ Use the old brand defaults (`#0066FF` blue / `#c9a84c` gold) that the legacy compositions hardcode. selfprime's current identity is the **moonlight divine-feminine** system (§3).
- ❌ Say "AI" anywhere in copy/VO/UI — use "synthesis", "the Oracle", "your reading", "Energy Blueprint". (Absolute brand law across LWT.)
- ❌ Add marketing fluff (testimonials, social proof). Training copy is navigational/instructional only.

---

## 2. What already exists (start here, don't rebuild)

- **Content backlog** — `apps/video-studio/content-briefs/prime-self/training-library.json` (11 modules; `apps/video-studio/content-briefs/prime-self/BRIEF_INDEX.md`). The training/walkthrough briefs:

  | status | briefKey | audience / area |
  |---|---|---|
  | ready | `getting-started-first-week` | new_user / onboarding |
  | ready | `energy-type-overview` | new_user / chart |
  | ready | `blueprint-reading-guide` | new_user / chart |
  | ready | `synthesis-walkthrough` | new_user / synthesis |
  | ready | `daily-transits-guide` | returning_user / transits |
  | planned | `dashboard-saved-blueprints` | returning_user / dashboard |
  | planned | `sharing-and-exporting-readings` | practitioner / exports |
  | planned | `session-prep-workflow` | practitioner / sessions |
  | planned | `practitioner-billing-and-upgrade` | practitioner / billing |

  (Practitioner-audience modules matter most — selfprime is a practitioner lead-gen/referral network; the customer is the practitioner. Training that makes practitioners effective is the highest-value cut.)

- **Plumbing already wired:** `scripts/check-video-briefs.mjs` (validates briefs), `scripts/dispatch-training-library.mjs` (dispatch path), `src/lib/trainingLibrary.ts`, `scripts/generate-script.mjs` (LLM script), `scripts/generate-music.mjs` (music bed). Reuse these.
- **Capture service:** the `browser-agent` Playwright service on Cloud Run (project `factory-495015`); helper `scripts/test-site.sh`. This is the recording substrate — extend it to capture clean flows, not just test.
- **Identity components to reuse:** `packages/video-studio/src/components/` — `effects.tsx` (filmic primitives: `GodRays`, `Particles`, `Constellation`, `cameraFloat`), `CosmicSky.tsx` (10 procedural backgrounds), and the lower-third / serif type treatment in `HeroBlueprint.tsx`.

---

## 3. The current identity to match (moonlight divine-feminine)

selfprime's film identity was re-skinned (HeroBlueprint v8+). Match it so screencasts feel native:
- **Palette anchors:** LAV `#cdbcef`, PEARL `#f5eefb`, ROSE `#e8c4de`, STAR `#bcd2ec` over deep plum-violet VEIL `#0e0a1c`. (Warm accents available: rose-gold GOLD `#f0c69a`, AQUA `#8fd0d8`, SILVER `#c8ccd8`.)
- **Type:** display = Palatino family (`'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif` — a Windows system serif, no web-font load flake); labels/eyebrows = tracked-caps Inter.
- **Lower-thirds:** gold-on-dark callouts in this system (see the gate cards + synthesis block in `HeroBlueprint.tsx` for the exact treatment).
- The 10-look preset system (`packages/video-studio/src/looks.ts`) can supply a coherent background/grade if you want the bezel to float over a living sky.

---

## 4. Remotion mechanics — the load-bearing gotchas (these cost hours)

> Read this before your first render. Every item below was learned the expensive way.

1. **Animations must be `interpolate()`-driven.** Remotion renders each frame as a static snapshot — CSS transitions/animations have **zero** effect. Cursor moves, zoom, fades: all via `interpolate(frame, [...], [...], { extrapolateLeft:'clamp', extrapolateRight:'clamp' })`.
2. **Use system Chrome, not chrome-headless-shell.** Pass `browserExecutable: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`. headless-shell flakes with connect-timeouts on this Windows box.
3. **Kill the webpack cache or edits silently no-op.** `bundle({ entryPoint, webpackOverride: (c) => ({ ...c, cache: false }) })` **and** `rm -rf node_modules/.cache`. A stale module cache served old code for ~1hr once — every edit looked like it did nothing.
4. **Build + relink the package atomically.** Background automation wipes `dist/` between shell calls. Do it in ONE command:
   ```bash
   cd packages/video-studio && npm run build && \
   DEST=../../apps/video-studio/node_modules/@latimer-woods-tech/video-studio && \
   cp -r dist $DEST/dist.new && rm -rf $DEST/dist && mv $DEST/dist.new $DEST/dist
   ```
5. **Heavy frames GPU-deadlock under parallelism.** *(Discovered 2026-06-30 on the look-reel render.)* `renderMedia` with `concurrency: 2` + `chromiumOptions: { gl: 'angle' }` **hangs forever** (no error, no progress) on heavy frames (many SVG particles + constellation lines + circuit overlays at once). The same frames render fine as **stills**. Fixes, in order of preference for heavy comps:
   - `concurrency: 1` + `chromiumOptions: { gl: 'swiftshader' }` (software raster — slower but **cannot** GPU-deadlock). This is the safe default for filmic/particle-heavy comps. Screencaps over flat UI are lighter and may tolerate `angle`, but if a render stalls, this is the first knob.
   - Always render long jobs in the **background** with a **stall watchdog** on log mtime — a hung render gives no completion signal, so a naive "wait for notification" waits forever. (e.g. break if log idle > 300s.)
6. **No system `ffmpeg` on PATH here.** Remotion bundles its own: `npx remotion ffmpeg ...`. ⚠️ That build has `drawtext` **disabled** (can't burn text overlays) but `concat`/`scale` are enabled — bake any text inside the Remotion render, not via ffmpeg.
7. fps is **30**, canvas **1920×1080** (`apps/video-studio/src/Root.tsx`).

Fast local iteration helpers already in `apps/video-studio/`: `_render-still.mjs` (single frame), `_render-video.mjs` (full clip), `_render-pool.mjs` / `_render-reel.mjs` (multi-variant contact sheets — good templates for a per-brief batch).

---

## 5. VO + sync (reuse the film's pipeline)

- VO via ElevenLabs `/v1/text-to-speech/{voice}/with-timestamps` → character cues; reveals/zooms fire on the spoken word. The voice rotation pool + `pickVoice(seed)` already exists; the standard narrator is **Vivie** (`z7U1SjrEq4fDDDriOQEN`). For instructional VO a calm/clear voice may read better than the dramatic film narrator — audition.
- `scripts/generate-script.mjs` shims `withSystem` locally (the `@latimer-woods-tech/llm` package doesn't export it). LLM script gen routes through a per-app CF AI Gateway — only `prime-self`'s gateway exists; a non-existent gateway 401s silently and falls back. Don't blame "a stale key".
- Music bed: `scripts/generate-music.mjs` (ElevenLabs Music). Keep it **low** under the VO (`musicVolume ≈ 0.12–0.16`), fade in/out with a volume envelope, and use a track **longer than the clip** so it never loops (a looping bed replays its head-glitch on each loop — a real bug we hit).

---

## 6. Deliver + verify (R2)

Upload to the `factory-videos` R2 bucket; public domain `pub-a39c3cff53fd406383c8ccbe9c1ddf02.r2.dev`. Secrets in GCP Secret Manager (project `factory-495015`) — **BOM-strip every secret** with `tr -d '\r\n\357\273\277'`:
```bash
P=factory-495015
ACCT=$(gcloud secrets versions access latest --secret=CF_ACCOUNT_ID --project=$P | tr -d '\r\n\357\273\277')
export AWS_ACCESS_KEY_ID=$(gcloud secrets versions access latest --secret=R2_ACCESS_KEY_ID --project=$P | tr -d '\r\n\357\273\277')
export AWS_SECRET_ACCESS_KEY=$(gcloud secrets versions access latest --secret=R2_SECRET_ACCESS_KEY --project=$P | tr -d '\r\n\357\273\277')
aws s3 cp out.mp4 s3://factory-videos/training/<brief-key>.mp4 \
  --endpoint-url https://${ACCT}.r2.cloudflarestorage.com --content-type video/mp4
# verify-with-your-own-eyes: expect HTTP 206 video/mp4
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -r 0-1 \
  https://pub-a39c3cff53fd406383c8ccbe9c1ddf02.r2.dev/training/<brief-key>.mp4
```

---

## 7. Suggested milestones

1. **Capture spike** — drive ONE `ready` flow (`getting-started-first-week`) end-to-end on selfprime.net via browser-agent, record a clean MP4/WebM, store to R2. (Live-authed capture: `?signin=workspace` + `ps_session_hint` + a real browser UA past the WAF; test creds `adrper79@gmail.com`, password in GCP SM `SELFPRIME_TEST_USER_PASSWORD`.)
2. **`TrainingScreencast` composition** — branded bezel + `OffthreadVideo` of the capture + interpolated cursor/zoom + gold lower-thirds (identity §3). Render one brief locally, eyeball it.
3. **VO + music** — generate script (§5), narrate, sync zoom/cursor beats to word cues, lay the music bed.
4. **Batch** — extend `dispatch-training-library.mjs` to run the 5 `ready` briefs, then the `planned` practitioner ones.
5. **Park** anything not needed for the launchable minimum on a labeled roadmap (zero-user stage — build the minimum, don't over-scale).

## Cross-references
- Operational runbook for the automated film pipeline (secret matrix, gotchas): `docs/runbooks/video-pipeline.md`
- Lessons learned (BOM trap, AI-gateway ghosts, Neon access): `docs/runbooks/lessons-learned.md`
- The hero-film identity to match: `packages/video-studio/src/components/HeroBlueprint.tsx`, `looks.ts`, `CosmicSky.tsx`
- Roadmap context: `docs/planning/VIDEO_ENGINE_ROADMAP.md`
