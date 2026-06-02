# Documentation Evidence Policy

**Last Updated:** 2026-05-28
**Status:** Active reference

Operational claims need evidence. Prefer evidence in this order:

1. Executed validation output, tests, workflow logs, and direct file inventory.
2. `docs/service-registry.yml` validated by `npm run validate:service-registry`.
3. Current workflow files under `.github/workflows/`.
4. Source code, app config, package manifests, and `wrangler.jsonc`.
5. Canonical docs with current verification.
6. Active docs with owner review.
7. Archive docs as historical evidence only.

If a claim cannot be proven, use `unknown`, `unverified`, or `planned`.
