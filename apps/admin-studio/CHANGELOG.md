# Changelog — factory-admin-studio

All notable changes to the admin-studio Worker and admin-studio-ui frontend are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- `PII_INVENTORY.md` documenting all personal data fields, flows, retention schedules, and DSR procedures
- `session.test.ts` — 9 unit tests covering login, logout, hydrate, isAuthed, and JWT decode edge cases
- `activeFile.test.ts` — 7 unit tests covering open, edit, saved, close, and dirty state transitions

### Changed
- `LoginPage`: added email validation, toast notifications, loading spinner, WCAG 2.2 AA accessibility improvements (fieldset/legend, focus rings, aria-describedby, ARIA labels)

### Fixed
- CI workflow paths now include `scripts/platform_conformance.py` in trigger paths

---

## [0.4.0] — 2026-05-18

### Added
- Google OAuth support: `POST /auth/google` endpoint validates Google ID token against JWKS, issues Factory JWT
- `EnvironmentBanner` component for explicit staging/production indicator
- `ConfirmDialog` component for destructive-action confirmation flow
- `DeployVersionsTable` — live deploy version comparison across environments
- `SyntheticJourneyPanel` — shows synthetic monitor results inline in Overview tab

### Changed
- `LoginPage` env picker redesigned to card-based layout with clear staging/production colour coding
- Dashboard sidebar navigation replaced with accessible `Tabs` component

---

## [0.3.0] — 2026-05-10

### Added
- `FlagsTab` — feature flag management UI backed by `/flags` Worker routes
- `TrainingLibraryTab` — browse and manage AI training prompts
- `AiTab` — streaming AI chat with active-file context injection
- `CodeTab` — GitHub file browser and editor with AI apply-proposal flow
- `AuditTab` — paginated audit log viewer

### Changed
- Auth middleware now enforces environment matching between JWT `env` claim and request environment
- `apiFetch` auto-logs-out on 401 and environment-mismatch 403

---

## [0.2.0] — 2026-04-28

### Added
- `OverviewTab` with `AppHealthGrid` — live polling of `/apps/health` across all Workers
- `TestsTab` — CI test results surfaced from GitHub Actions
- `TimelineTab` — event timeline from `factory_events` table
- `FunctionsTab` — live function listing and deploy trigger UI

### Changed
- Sessions now use `sessionStorage` (not `localStorage`) — cleared on tab close
- JWT `expiresAt` enforced on every render cycle via `isAuthed()`

---

## [0.1.0] — 2026-04-14

### Added
- Initial admin-studio Worker scaffold (Hono + Cloudflare Workers)
- Login endpoint (`POST /auth/login`) with email/password → JWT flow
- `useSession` Zustand store with login, logout, hydrate
- Environment picker on login (local / staging / production)
- Dashboard shell with sidebar navigation
- `ThemeToggle` with system/light/dark support

[Unreleased]: https://github.com/Latimer-Woods-Tech/Factory/compare/admin-studio-v0.4.0...HEAD
[0.4.0]: https://github.com/Latimer-Woods-Tech/Factory/compare/admin-studio-v0.3.0...admin-studio-v0.4.0
[0.3.0]: https://github.com/Latimer-Woods-Tech/Factory/compare/admin-studio-v0.2.0...admin-studio-v0.3.0
[0.2.0]: https://github.com/Latimer-Woods-Tech/Factory/compare/admin-studio-v0.1.0...admin-studio-v0.2.0
[0.1.0]: https://github.com/Latimer-Woods-Tech/Factory/releases/tag/admin-studio-v0.1.0
