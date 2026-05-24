# Open-Source Publishing Runbook

> Generic checklist for moving a `@latimer-woods-tech/*` package from internal-only (GitHub Packages) to public npm (npmjs.org). Use this for every first public release.

**Audience:** repo maintainer with npm org-owner permissions on `latimer-woods-tech` and write access to the `Factory` GitHub repo.

## Package readiness checklist

Run through this in order. Do not skip — every box is something that broke a real publish at some point.

### Source hygiene

- [ ] No hard-coded internal URLs, domain names, or `*.workers.dev` hosts in `src/**`.
- [ ] No relative imports outside the package boundary (`../../other-package`).
- [ ] No `TODO` / `FIXME` / `HACK` comments. No comments addressed at internal teammates ("ask alice", "see Slack #foo").
- [ ] No operational details: server names, internal ticket IDs, GCP project IDs.
- [ ] No `process.env`, no Node built-ins (`fs`, `path`, `crypto`, `Buffer`) — the package must remain Workers-compatible (see [CLAUDE.md](../../CLAUDE.md) Hard Constraints).

### `package.json` fields

- [ ] `"version"` follows [SemVer](https://semver.org/). First public release is typically `0.1.0` (not `1.0.0` — see "When to cut 1.0.0" below).
- [ ] `"private"` is **absent** or `false`. (Leaving it `true` is the #1 reason `npm publish` silently no-ops.)
- [ ] `"publishConfig": { "access": "public" }`. Scoped packages default to private; this flag is required to publish to public npmjs.org.
- [ ] `"repository"` points at the canonical GitHub URL with `directory` set to `packages/<name>`. **Casing of `Latimer-Woods-Tech/Factory` is load-bearing** — npm's OIDC trusted-publisher verifier compares it byte-exact against the GitHub repo's `full_name`.
- [ ] `"homepage"` and `"bugs.url"` are set.
- [ ] `"author"` includes a real email.
- [ ] `"license": "MIT"` (or whichever) matches the `LICENSE` file in the package.
- [ ] `"keywords"` are populated (5–10 specific terms — drives npm search).
- [ ] `"description"` is one sentence that explains what the package is.
- [ ] `"main"`, `"module"`, `"types"`, `"exports"` all point at files inside `dist/`.
- [ ] `"files"` includes only `dist`, `LICENSE`, `README.md`, `CHANGELOG.md`. No source, no tests, no internal docs.

### Required files

- [ ] `LICENSE` — MIT text, current year, correct copyright holder.
- [ ] `README.md` — elevator pitch, install, quick start, full API reference, patterns, Workers-compat note, license, contributing link.
- [ ] `CHANGELOG.md` — [Keep a Changelog](https://keepachangelog.com/) format, with a dated `## [x.y.z]` entry for the release.

### Quality gates (run from the package directory)

```bash
cd packages/<name>
npm install
npm run lint        # ESLint, --max-warnings 0
npm run typecheck   # tsc --noEmit, zero errors
npm test            # vitest, all pass, ≥90% lines/funcs, ≥85% branches
npm run build       # tsup → dist/, zero errors
```

### Dry-run the publish

```bash
npm pack --dry-run
```

Review the file list. It should contain **only** `dist/*`, `LICENSE`, `README.md`, `CHANGELOG.md`, and `package.json`. If you see `src/`, `*.test.ts`, `node_modules`, `coverage`, or anything else — fix `files` in `package.json` and re-run.

## Publishing

The repo already has the npm trusted-publisher workflow wired (`.github/workflows/bootstrap-publish.yml`). See [npm-oidc-publishing.md](./npm-oidc-publishing.md) for the OIDC setup details. Two ways to publish:

### Option A — via GitHub Actions (preferred)

1. Bump `version` in `packages/<name>/package.json`, commit, merge to `main`.
2. Trigger the `bootstrap-publish` workflow (push to `main` or run manually from the Actions tab).
3. The workflow runs `npm publish --provenance --access public` from CI with OIDC; no `NPM_TOKEN` needed.
4. **Before** the first OIDC publish ever lands, you must register the trusted publisher in the npm UI for **existing** packages. For brand-new public packages there is nothing to pre-register — the first OIDC publish creates the binding via the `--provenance` claim. (See [npm-oidc-publishing.md](./npm-oidc-publishing.md) for the one-time-per-package setup form.)

### Option B — local publish (only if Option A is blocked)

Requires npm ≥11.5.1 and an interactive 2FA prompt:

```bash
cd packages/<name>
npm login                 # if not already logged in
npm publish --access public
```

This will *not* attach provenance. Prefer Option A whenever possible.

## Post-publish verification

Run these in order. Don't skip — silently broken publishes happen.

```bash
# 1. Did npm accept it?
npm view @latimer-woods-tech/<name> versions

# 2. Does the latest version match what you intended?
npm view @latimer-woods-tech/<name>@latest version

# 3. Does the tarball install cleanly into a fresh project?
mkdir /tmp/verify && cd /tmp/verify
npm init -y
npm install @latimer-woods-tech/<name>@<version>
node --input-type=module -e "import('@latimer-woods-tech/<name>').then(m => console.log(Object.keys(m)))"

# 4. Open npmjs.com in a browser:
open https://www.npmjs.com/package/@latimer-woods-tech/<name>
```

On the npmjs.com page, confirm:
- README renders correctly (no broken links, no raw markdown showing).
- "Provenance" badge appears next to the version (only if published via Option A).
- License, repository link, and homepage are all populated.
- "Total Files" and "Unpacked Size" match what `npm pack --dry-run` showed.

## What to do if a publish fails

| Error | Cause | Fix |
| --- | --- | --- |
| `403 Forbidden – You do not have permission to publish` | Trusted publisher not registered, or `publishConfig.access` missing | Register publisher in npm UI; ensure `"publishConfig": { "access": "public" }` |
| `402 Payment Required` | Scoped package without `--access public` | Set `publishConfig.access` or pass `--access public` |
| `EOTP` (one-time password required) | Local publish on an org with 2FA, no OTP supplied | Use Option A (OIDC) instead. Classic tokens can't carry OTPs. |
| `404 Not Found` from `npm view` after a successful publish | npm CDN propagation lag | Wait 60–90 seconds, retry |
| `EUNSUPPORTEDPROTOCOL` or stale registry URL | Old `publishConfig.registry` pointing at GitHub Packages | Remove `registry` from `publishConfig`; keep only `access: public` |
| Provenance badge missing despite OIDC publish | `--provenance` flag not passed, or npm < 11.5.1 in CI | Update `bootstrap-publish.yml`; install npm@latest before publishing |
| README looks wrong on npmjs.com | Relative image links, GitHub-only markdown | Use absolute URLs for images; preview locally with `npx markdown-preview` |

If you publish a broken version, **do not delete it**. Publish a patch release that supersedes it. (npm allows unpublish only within 72 hours and only if no other package depends on the version — neither is reliable.) Add a deprecation notice instead:

```bash
npm deprecate @latimer-woods-tech/<name>@<bad-version> "Use <good-version> instead — <reason>"
```

## When to bump from 0.x to 1.0.0

Stay on `0.x` while any of these are true:

- The public API is still evolving in non-backward-compatible ways.
- Real consumers are limited to internal apps you control.
- You haven't run the package through a full quarter of production use.

Cut `1.0.0` when **all** of:

- Public API is stable; you're confident any future breaks deserve a major bump.
- At least one external (non-LWT) consumer depends on the package.
- The package has been live in production for ≥90 days without an API-breaking change.
- You've decided on a deprecation policy (e.g. "deprecated APIs supported for one major version").

Document the `1.0.0` decision in `CHANGELOG.md` under the `## [1.0.0]` entry — be explicit that the API is now considered stable.

## Related runbooks

- [npm-oidc-publishing.md](./npm-oidc-publishing.md) — OIDC trusted-publisher setup, per-package npmjs.com form.
- [secret-rotation.md](./secret-rotation.md) — if you ever need to fall back to classic `NPM_TOKEN`.
- [lessons-learned.md](./lessons-learned.md) — collected publish failures and their root causes.
