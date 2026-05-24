# Prime Self Smoke — RC-4 CSP/SRI Investigation (2026-05-23)

This memo accompanies the smoke fixes in PR `fix/scheduled-workflow-triage`.
Test A (hero CTA) is fixed in this PR. Test B (CSP/SRI on `/`) requires a
production-side change in the **prime-self deploy repo** (the static site
served from `selfprime.net`); the source for that site is **not** in this
Factory monorepo.

## What was verified live against `https://selfprime.net/`

1. **`js/runtime-globals.js` SRI hash matches.** The integrity attribute on
   the homepage is
   `sha384-pB0mJ5N4j6PkkUVJKa1rQvwNTTY1A931Otw7Oja858Soft99Fxw7DtPg5MYIKcv8`
   and the live file SHA-384 base64 digest is identical. **Not the cause.**

2. **CSP `script-src` allowlist is intact for third-party origins:**
   `'self' https://js.stripe.com https://static.cloudflareinsights.com`
   `https://plausible.io https://browser.sentry-cdn.com` — Plausible,
   Cloudflare Insights, Sentry, and Stripe are all permitted.

3. **Eight `sha256-…` inline-script hashes** are present in `script-src`.
   The homepage now ships at least two inline `<script>` IIFEs past the
   JSON-LD: the hero video play/pause toggle and the login modal handler.

   Most likely failure mode for Test B: one of those inline scripts was
   edited (or a new inline `<script>` was added) without a matching
   `sha256-…` hash being added to the `Content-Security-Policy` header.
   The browser blocks it, the smoke `console.error` listener captures the
   CSP violation, and `assertNoViolations` fails.

## Recommended fix (production / prime-self deploy repo)

For each inline `<script>` rendered on `/`:

1. Compute its sha256 digest as base64 of the raw script body (matching
   the existing `sha256-` entries in the policy).
2. Add the missing hash(es) to the `script-src` directive on the response
   header from whichever layer emits CSP for `selfprime.net` (Cloudflare
   Worker / Pages function / origin server).
3. Re-run the smoke locally against production:

   ```bash
   cd apps/prime-self-smoke
   BASE_URL=https://selfprime.net npx playwright test \
     tests/public-funnel.spec.ts -g "no CSP/SRI blocked-script"
   ```

If the change came from an externally-hosted script being added to the
homepage, add its origin to `script-src` rather than a hash.

## Why this is not patched in Factory

`apps/prime-self-smoke/` here is the **smoke harness**, not the site
itself. There is no `apps/prime-self/` (the only related directory is
`apps/prime-self-reference/`, which is a component reference library, not
the production site source). The CSP header is set by whatever serves
`selfprime.net` and that config lives outside this repo.

The Test A change in this PR removes the false positive (auth-overlay
expectation) so future CSP regressions surface cleanly without being
masked by the broken hero-CTA assertion.
