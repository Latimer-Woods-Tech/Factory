# The Grand Video Registry

One record per **atomic video asset** (`briefKey × variant`) — the single source of truth for **tracking** every video (state, destination, quality, where it's surfaced) and **rebuilding** it deterministically (the full input recipe + a drift fingerprint).

Replaces the three old half-trackers: `VIDEO_MATRIX.json` (family intent), `render-manifest.json` (render bookkeeping), and the hand-maintained `client/data/video-manifest.js` (now a *generated projection* of this).

## Files
- `video-registry.json` — the registry (generated/maintained; commit it).
- `video-registry.schema.json` — record shape (validate in CI).
- `../scripts/video-registry/`
  - `build.mjs` — seed/upsert from briefs × variants; compute input hashes + fingerprint; import existing streamUids; flag drift.
  - `verify.mjs` — CI gate: fails on integrity errors or stale assets; prints the rebuild list.
  - `report.mjs` — coverage dashboard (by family/status/track) + holes (stale, un-surfaced, unverified).
  - `gen-manifest.mjs` — regenerate `client/data/video-manifest.js` from the registry.
  - `sync.mjs` — render-completion write-back (stamps streamUid/r2Key + marks live + baselines the fingerprint).
  - `patch.mjs` — shared write helper (also used by `scripts/render-brief.mjs` on dispatch).

## Lifecycle
```
brief  →  (render-brief.mjs dispatch → status:rendering)  →  render-video.yml (cloud)
       →  (sync.mjs --stream/--r2 → status:live, renderedFingerprint stamped)
build.mjs (re-seed any time)  →  verify.mjs (CI)  →  gen-manifest.mjs (app manifest)
```

## The rebuild guarantee (drift)
Every asset stores hashes of all inputs (`truthHash`, `briefHash`, `scriptHash`, composition version) combined into `inputsFingerprint`. At render, `sync.mjs` copies it to `renderedFingerprint`.
- `inputsFingerprint === renderedFingerprint` → **fresh**.
- They differ (a brief/truth/script/composition changed) → `build.mjs` marks the asset **`stale`**, `verify.mjs` fails CI, and `report.mjs`/`verify.mjs` print the exact `rebuildCommand`.

So "rebuildable when required" is automatic: change an input, the matrix tells you precisely which videos are now out of date and how to regenerate them. The more inputs we track, the sharper the drift detection.

## Common commands
```bash
# from apps/video-studio/
node scripts/video-registry/build.mjs --manifest "<path>/client/data/video-manifest.js"
node scripts/video-registry/report.mjs
node scripts/video-registry/verify.mjs
node scripts/video-registry/sync.mjs <brief-key> --stream <uid>      # after a cloud render
node scripts/video-registry/gen-manifest.mjs --out "<path>/client/data/video-manifest.js"
```
