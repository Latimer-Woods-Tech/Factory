# Per-Track Training Video — Templatization Handoff

Date: 2026-06-30
Branch: `feat/learning-construct-tokens`

Hands off the per-track training video templatization. The **denotation standard is
done and shared**; the Remotion pieces are built and type-clean but still need
promoting into the shared package + registering.

## What's done (and where)

### The standard — `@latimer-woods-tech/design-tokens` ✅
`packages/design-tokens/src/learning-construct.ts` is the single source of truth for
the Learning Construct's visual language (mirrors the app's `client/data/curriculum.js`):

- `trackTokens` / `trackToken(id)` — the **3 tracks**, the only axis that carries
  colour (wayfinding): app-mastery (teal), interpretive-literacy (gold),
  practitioner-formation (violet). Each has `color`, `accent`, `onColor`, `label`.
- `disciplineLabels` / `disciplineLabel(id)` — the **9 lenses**, denoted by LABEL
  only (equal dignity, never their own colour).
- `levelTokens` / `levelToken(id)` — the **4 levels**, a quiet 1-4 pip progression.

Exported from the package index + the `tokens` object. 33 tests pass, coverage green.
The in-app Learning Hub should also adopt these (it currently has a local
`DISCIPLINE_LABEL`/accent in `client/components/learning-hub.*` — repoint it for
cross-surface consistency).

### Remotion pieces — built, type-clean, app-local (need promoting)
Currently in `apps/video-studio/src` (they import a **local copy** `lib/trackTokens.ts`
— that copy is now superseded by the design-tokens standard):

- `components/TrackLowerThird.tsx` — the denotation chip:
  `▌[ TRACK ]  Discipline  ●●●○ Level` (track-coloured pill + left bar; self-animating).
- `components/TrackBumper.tsx` — track-coloured intro open (eyebrow = Track · Discipline).
- `compositions/PerTrackTraining.tsx` — assembles bumper → stepped body → persistent
  lower-third, with a Zod schema (`track`/`discipline`/`level`/`topic`/`steps`/…).

## Remaining steps (yours)

1. **Repoint to the standard.** Delete `apps/video-studio/src/lib/trackTokens.ts` and
   change the three files to import from `@latimer-woods-tech/design-tokens`
   (`trackToken`, `disciplineLabel`, `levelToken`, `levelSteps`, `TrackToken`). Add the
   dep to `apps/video-studio/package.json` if missing.
2. **Promote** `TrackLowerThird`/`TrackBumper`/`PerTrackTraining` into the shared
   `packages/video-studio` package (alongside `EnergyBlueprintVideo`) and export from
   its `index.ts`, so other apps reuse them. The package's coverage `include` is a
   whitelist (`chartToScenes`, `blueprintSegment`), so `.tsx` is coverage-safe there.
3. **Register** in `apps/video-studio/src/Root.tsx` (snippet is in `PerTrackTraining.tsx`'s
   header). NOTE: `Root.tsx`/`TrainingScreencast.tsx` were under active edit by another
   agent — rebase onto their latest before touching `Root.tsx`.
4. **Manifest fields.** Add `track`/`discipline`/`level` to
   `content-briefs/prime-self/training-library.json` modules + the `TrainingLibraryModule`
   type in `src/lib/trainingLibrary.ts`, so each module declares its matrix place and
   the lower-third can be populated from data.
5. **Render a preview** frame/clip to eyeball the three track colours + denotation.

## Design rule (locked — keep it)
Equal *dignity*, not equal *volume*. Colour is for the 3 tracks only. Disciplines are
labels. Levels are a 4-pip progression. Calm, never childish — no streaks/badges.
