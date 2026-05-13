# npm OIDC Trusted Publishers — Operator Runbook

**Audience:** repo maintainer with `latimer-woods-tech` org owner permissions on npmjs.com.
**Goal:** publish all `@latimer-woods-tech/*` packages from GitHub Actions without an `NPM_TOKEN` secret, using OIDC trusted publishers and build provenance.

## Why

The legacy `NPM_TOKEN` workflow is blocked by `EOTP` errors: classic npm tokens require 2FA OTP codes that CI cannot supply. Trusted Publishers exchanges a short-lived GitHub OIDC token for a per-publish npm credential — no long-lived secret, no OTP, and `--provenance` metadata is attached automatically so consumers can verify the package was built from this exact repo + workflow.

## Workflow changes already merged

`.github/workflows/bootstrap-publish.yml`:

- `jobs.publish.permissions: { id-token: write, contents: read }` — required for GitHub to mint the OIDC token.
- `actions/setup-node@v6` pinned to Node `24` with `registry-url: https://registry.npmjs.org`.
- An explicit `npm install -g npm@latest` step ensures npm ≥ `11.5.1` (Node 24 currently ships npm 10.x, which predates trusted-publisher support).
- `npm publish` now passes `--provenance`. npm 11.5.1+ auto-detects `ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and prefers OIDC over `NODE_AUTH_TOKEN`.
- `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` is **kept** during transition as a fallback for any package not yet configured. Schedule a follow-up cleanup PR to remove it after every package is verified on OIDC.

Every `packages/*/package.json` now includes:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/Latimer-Woods-Tech/Factory.git",
  "directory": "packages/<name>"
}
```

The casing of `Latimer-Woods-Tech/Factory` is **load-bearing** — npm's OIDC verifier compares this string against the GitHub repo `full_name` exactly.

## One-time per-package setup on npmjs.com

Required for every already-published package. The 12 not-yet-published packages will get a one-click "Add trusted publisher" suggestion in the npm UI **after** their first OIDC-published version exists.

For each package:

1. Open: `https://www.npmjs.com/package/@latimer-woods-tech/<NAME>/access`
2. Scroll to **Trusted Publisher**, click **Add publisher**.
3. Provider: **GitHub Actions**.
4. Fill in (case-sensitive — copy/paste, do not retype):
   - **Organization or user:** `Latimer-Woods-Tech`
   - **Repository:** `Factory`
   - **Workflow filename:** `bootstrap-publish.yml`
   - **Environment name:** _(leave empty — the workflow does not use a GitHub Environment)_
5. Save.

### Checklist — 19 currently-published packages

- [ ] `@latimer-woods-tech/errors`
- [ ] `@latimer-woods-tech/monitoring`
- [ ] `@latimer-woods-tech/logger`
- [ ] `@latimer-woods-tech/auth`
- [ ] `@latimer-woods-tech/neon`
- [ ] `@latimer-woods-tech/stripe`
- [ ] `@latimer-woods-tech/llm`
- [ ] `@latimer-woods-tech/telephony`
- [ ] `@latimer-woods-tech/analytics`
- [ ] `@latimer-woods-tech/deploy`
- [ ] `@latimer-woods-tech/testing`
- [ ] `@latimer-woods-tech/email`
- [ ] `@latimer-woods-tech/copy`
- [ ] `@latimer-woods-tech/content`
- [ ] `@latimer-woods-tech/social`
- [ ] `@latimer-woods-tech/seo`
- [ ] `@latimer-woods-tech/crm`
- [ ] `@latimer-woods-tech/compliance`
- [ ] `@latimer-woods-tech/admin`

### 12 not-yet-published packages — first-publish flow

These have no npmjs.com page yet, so there is nothing to attach a publisher to. On the first successful OIDC publish from this workflow, npm will provision the package **and** offer a banner in the package's UI to "Add the GitHub Actions workflow that just published this as a trusted publisher" — accept it, then subsequent publishes are also OIDC.

- `realtime`, `llm-meter`, `entitlements`, `protocol`, `creator`, `studio-core`, `design-tokens`, `design-system`, `ui`, `validation`, `video`, `schedule`

If the very first publish for a brand-new package fails because no token + no trusted publisher exists, the `NPM_TOKEN` fallback in the workflow env will take over. Once published, follow the npm UI prompt to add the trusted publisher.

## Verification

1. Configure trusted publisher for **`errors`** only (smallest, no internal deps).
2. Trigger the `Bootstrap Publish All Packages` workflow via Actions → Run workflow.
3. In the workflow logs for the `errors` step, expect to see something like:
   ```
   npm notice Publishing to https://registry.npmjs.org/ via GitHub Actions OIDC trusted publisher
   npm notice Provenance statement: ...
   + @latimer-woods-tech/errors@<version>
   ```
   The exact phrasing varies by npm version; the key indicator is **no `EOTP` error** and a successful publish with a provenance line.
4. On `https://www.npmjs.com/package/@latimer-woods-tech/errors`, confirm the new version shows the green **"Built and signed on GitHub Actions"** provenance badge.
5. Other packages will fail with a "no trusted publisher configured" style error — that is **expected** and proves the OIDC path is wired.
6. Configure the remaining 18 packages, re-run the workflow, expect a clean run.

## Rollback

If OIDC publishing fails everywhere despite correctly configured trusted publishers:

1. Confirm `NPM_TOKEN` is still in `Settings → Secrets and variables → Actions` — the workflow env block still references it as a fallback.
2. The fallback is automatic: if OIDC auth cannot be obtained, npm falls back to `NODE_AUTH_TOKEN`. No code change required.
3. If even the fallback is broken (e.g. token expired), regenerate a granular access token on npmjs.com with publish scope for `@latimer-woods-tech/*` and update the secret.

**Do not delete `NPM_TOKEN`** until every one of the 19 packages has been verified to publish via OIDC at least once.

## Common gotchas

- **Case sensitivity:** `latimer-woods-tech` (lowercase) on npm vs `Latimer-Woods-Tech` (mixed case) on GitHub. The npm trusted-publisher form expects the **GitHub** casing — `Latimer-Woods-Tech/Factory`. Wrong casing = silent OIDC rejection.
- **Workflow filename:** must be the basename only (`bootstrap-publish.yml`), not a path.
- **GitHub Environment field:** leave **empty**. If filled in but the workflow job has no `environment:` key, OIDC will reject the publish.
- **Forks / branches:** OIDC tokens carry the source ref. Trusted publishers can optionally restrict to a branch — leave unrestricted unless you have a reason to lock it.
- **`repository.url` mismatch:** if a package's `package.json` `repository.url` doesn't match `https://github.com/Latimer-Woods-Tech/Factory.git` (case-sensitive), `--provenance` will refuse to publish. All 31 packages were normalized in the same PR that introduced this runbook.
