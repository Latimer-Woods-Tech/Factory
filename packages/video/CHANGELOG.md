# Changelog — `@latimer-woods-tech/video`

All notable changes to this package will be documented in this file.

## [0.3.0] — 2026-05-30

### Added
- `uploadPrivateFromUrl` — copies a remote video into Cloudflare Stream as a
  private asset (`requireSignedURLs: true`) for private-by-default personal
  renders (I1 decision D1).
- `getStreamSignedToken` + `getSignedStreamPlaybackUrl` — mint a short-lived
  signed playback token for a private Stream video and build its HLS manifest
  URL. `StreamSignedTokenOptions` documents `expiresInSeconds` / `downloadable`
  / `accessRules`; signing is server-side via the Stream API, so no extra
  binding beyond `VideoEnv` is required.

## [0.2.0] — 2025-01-01

### Added
- Initial implementation: Cloudflare Stream REST API wrappers (`uploadFromUrl`, `getStreamVideo`, `listStreamVideos`, `deleteStreamVideo`, `getStreamEmbedUrl`, `getStreamThumbnailUrl`)
- R2 bucket helpers (`putR2Object`, `getR2Object`, `deleteR2Object`)
- `VideoEnv`, `R2BucketLike`, `StreamVideo`, `RenderJob`, `FetchFn` types
- 100% injected `fetch` dependency for deterministic unit tests
