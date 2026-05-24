# Video Studio

Automated video render engine for Factory applications — powered by [Remotion](https://remotion.dev).

## Compositions

| ID                 | Duration | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| `MarketingVideo`   | 15s      | Brand-voice headline + script + animated CTA badge       |
| `TrainingVideo`    | 30s      | Step-by-step training module with sidebar navigation     |
| `WalkthroughVideo` | 40s      | Product walkthrough driven by ordered screenshot URLs    |

All compositions are parameterised by brand tokens (`brandColor`, `brandAccent`, `logoUrl`) resolved at render time.

## Brief-driven renders

The GitHub Actions workflow now accepts an optional `brief_key` input. When provided, it loads
`apps/video-studio/content-briefs/{app-id}/{brief_key}.json` and uses that brief to resolve the
render topic, brand tokens, narration guidance, and optional `screenshotUrls` for walkthroughs.

If the brief also includes a top-level `script` field, the workflow skips the LLM generation step
and renders that exact narration deterministically. This is useful for homepage or launch assets
where wording must be approved and repeatable.

Example Prime Self homepage replacement brief:

```bash
gh workflow run render-video.yml \
  --repo Latimer-Woods-Tech/Factory \
  -f job_id=manual-homepage-welcome \
  -f composition_id=MarketingVideo \
  -f app_id=prime_self \
  -f topic="placeholder" \
  -f brief_key=homepage-welcome \
  -f brand_color=#8B5CF6 \
  -f brand_accent=#10B981 \
  -f logo_url=https://selfprime.net/icons/icon-72.png
```

`topic` remains required by the workflow contract for backward compatibility, but when
`brief_key` is set the brief's `topic` becomes the actual rendered topic.

## Feature guidance library pattern

The same brief-driven flow can be used to build a feature training library instead of
isolated one-off videos.

Recommended structure:

- Keep one manifest per app at `apps/video-studio/content-briefs/{app-id}/training-library.json`
- Keep one brief per module in the same folder using a stable `briefKey`
- Use `TrainingVideo` for task or concept modules and `WalkthroughVideo` when screenshots
  are required
- Track audience, product area, and current publishing status in the manifest so admin
  tooling can schedule, filter, and publish the library later

Prime Self now includes a starter manifest with feature guidance modules covering onboarding,
chart interpretation, dashboard usage, transits, exports, sessions, and billing.

Example training-library render:

```bash
gh workflow run render-video.yml \
  --repo Latimer-Woods-Tech/Factory \
  -f job_id=manual-training-energy-type \
  -f composition_id=TrainingVideo \
  -f app_id=prime_self \
  -f topic="placeholder" \
  -f brief_key=energy-type-overview \
  -f brand_color=#8B5CF6 \
  -f brand_accent=#10B981 \
  -f logo_url=https://selfprime.net/icons/icon-72.png
```

The next layer should read the manifest and expose it through an admin scheduler plus a
Practitioner-facing training library UI, matching the Phase 2 plan in
`docs/SELFPRIME_VIDEOKING_SYNERGY_DEVELOPMENT_PLAN.md`.
+
+### Training library admin surface
+
+The schedule-worker now exposes two manifest-aware endpoints:
+
+* `GET /training-library?appId=prime_self` — returns the Prime Self training library manifest
+* `POST /jobs/from-brief` — schedules a render job by `appId` and `briefKey`
+
+This allows external admin tooling to build a training library scheduler without manually
+copying topics or composition IDs.
+
+### Render the first training modules
+
+Use the helper script to inspect the manifest and generate GH CLI commands for the first
+ready training modules:
+
+```bash
+node apps/video-studio/scripts/dispatch-training-library.mjs --count=3
+```
+
+Add `--dispatch` to actually execute the dispatch commands from the current repository's
+GitHub CLI configuration.
```bash
# Install dependencies
npm install

# Open the Remotion Studio (visual editor)
npm run studio

# Type-check
npm run typecheck
```

## Render (used by GitHub Actions)

```bash
COMPOSITION_ID=MarketingVideo \
PROPS_JSON='{"appId":"prime_self","topic":"Q4 launch","script":"Raise your standard.","narrationUrl":"https://r2.example.com/narration.mp3","brandColor":"#0066FF","brandAccent":"#FF6600","logoUrl":"https://r2.example.com/logo.png"}' \
OUTPUT_PATH=/tmp/output.mp4 \
node -r ts-node/register src/render.ts
```

Or using CLI flags:

```bash
node -r ts-node/register src/render.ts \
  --composition MarketingVideo \
  --props '{"appId":"prime_self",...}' \
  --output /tmp/output.mp4
```

## Pipeline integration

The full automated pipeline:

```
PostHog signals
  → @latimer-woods-tech/schedule: scheduleVideo()
  → cron Worker: getPendingJobs() → dispatch to GitHub Actions
  → render-video.yml workflow:
      1. Generate narration (ElevenLabs)
      2. Render MP4 (Remotion → ffmpeg)
      3. Upload to Cloudflare R2
      4. Register with Cloudflare Stream
      5. Update video_calendar: updateJobStatus('done', { streamUid, videoUrl })
  → Landing page updated with new embed URL
  → PostHog tracks engagement → loop
```

## Constraints

- Runs in **GitHub Actions** only (not Cloudflare Workers — needs real Chromium + ffmpeg)
- No `process.env` for secrets — all passed as `PROPS_JSON` or workflow inputs
- Composition IDs must match `RenderJobType`: `marketing` → `MarketingVideo`, etc.
