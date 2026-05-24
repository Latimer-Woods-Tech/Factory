# Capability Design Studio Handoff

## Current state (2026-05-23)

The Capability Design Studio is now closed through **Stage C** of the
council-approved Golden Design (`docs/CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md`,
C-002, approved 2026-05-23).

### What's real

- **On-disk registry** under [`capabilities/`](../capabilities/) — primitives,
  recipes, concepts, and rules are JSON descriptors, validated by JSON Schema
  and cross-reference checks in CI. The compiled catalog
  ([`capabilities/dist/catalog.json`](../capabilities/dist/catalog.json) +
  [`apps/admin-studio/src/lib/capability-data.generated.ts`](../apps/admin-studio/src/lib/capability-data.generated.ts))
  is deterministic and CI fails if it drifts from the registry.

- **Backend route surface** on `apps/admin-studio`:

  | Method | Path                              | Stage | Reversibility |
  |--------|-----------------------------------|-------|----------------|
  | GET    | `/capabilities`                   | A     | n/a            |
  | POST   | `/capabilities/resolve`           | A     | reversible     |
  | POST   | `/capabilities/preview`           | A     | reversible     |
  | POST   | `/capabilities/handoff`           | B     | reversible (audited; content-hashed; persisted in `capability_handoffs`) |
  | POST   | `/capabilities/provision-staging` | C     | manual-rollback (audited; proof-gated; persisted in `capability_provision_requests`) |

- **Content-addressable handoff** — every handoff is a `{ schemaVersion: "1.0.0", kind: "scaffold-handoff", … }` document with a SHA-256 hex digest over a canonical-JSON serialization. Identical inputs → identical hash; any change in concept/params/plan changes the hash.

- **Stage C proof gate** — provision-staging requires every required gate
  (`reviewedPlan`, `reviewedEnvContract`, `reviewedSmokeChecks`,
  `acknowledgedStagingFirst`, `acknowledgedCustomDomain`) to be true before
  recording a `capability_provision_requests` row. The endpoint does NOT
  mutate Cloudflare or Neon directly — downstream automation polls
  `status='requested'` and dispatches the actual scaffold + deploy.

- **Scaffold wiring** — `packages/deploy/scripts/scaffold.mjs` now accepts
  `--handoff <path>`. When supplied, the handoff package's compiled plan
  augments the scaffolded app's `package.json` dependencies, `.dev.vars.example`
  secrets, and is persisted as `factory/handoff.json` + `factory/SMOKE.md` in
  the new repo. This makes the compiled plan the same seam used by CLI,
  Studio, and provisioning.

- **Studio operator surface** — the Capabilities tab now renders the
  Golden Design four-region staged workspace plus a 6-step workflow
  indicator, a persistent staging-first badge, markdown-rendered preview,
  copy/download of the handoff JSON, proof-gate checklist panel, and a
  double-confirmation staging-provision request flow.

### Database

A new migration ([`apps/admin-studio/migrations/0006_capability_handoffs.sql`](../apps/admin-studio/migrations/0006_capability_handoffs.sql))
adds:

- `capability_handoffs` — id, hash (unique), schema_version, concept/recipe ids,
  parameters, plan, preview, next_action, created_at, created_by, env.
- `capability_provision_requests` — id, handoff_id FK, status, proof_gates,
  requested_by, requested_at, env, notes.

Both tables are also created lazily by `handoff-store.ts` (CREATE IF NOT EXISTS)
so fresh deploys don't 500 before the migration runs.

### CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) gained two new steps:

- **FRH-CAP-001** — `node scripts/capabilities/validate.mjs` (JSON Schema +
  cross-reference)
- **FRH-CAP-002** — `node scripts/capabilities/compile.mjs && git diff
  --exit-code` (deterministic regeneration guard)

### Tests

- `apps/admin-studio` — 60 tests pass, including:
  - `tests/capabilities.test.ts` (9): catalog, rule routing, resolve, preview,
    handoff, hash determinism, hash divergence, provision-staging auth gate,
    missing-conceptId error
  - `tests/handoff-hash.test.ts` (6): canonical JSON ordering, SHA-256 digest,
    hash equality/divergence
  - `tests/handoff-store.test.ts` (3): proof-gate validation paths
- `apps/admin-studio-ui` — 8 helper tests including the new
  `staging-provision-requested` workflow stage and proof-gate helpers.

## Files changed (this pass)

### New

- `capabilities/README.md`
- `capabilities/schema/{primitive,recipe,concept,rule,plan,handoff}.schema.json`
- `capabilities/primitives/{analytics,compliance,crm,telephony}.json`
- `capabilities/recipes/{outbound-dialer,outbound-dialer-importer}.json`
- `capabilities/concepts/outbound-dialer-campaign.json`
- `capabilities/rules/telephony.json`
- `capabilities/dist/catalog.json` (generated)
- `scripts/capabilities/validate.mjs`
- `scripts/capabilities/compile.mjs`
- `scripts/capabilities/lib/schema-validator.mjs`
- `apps/admin-studio/migrations/0006_capability_handoffs.sql`
- `apps/admin-studio/src/lib/capability-types.ts`
- `apps/admin-studio/src/lib/capability-data.generated.ts`
- `apps/admin-studio/src/lib/handoff-hash.ts`
- `apps/admin-studio/src/lib/handoff-store.ts`
- `apps/admin-studio/tests/handoff-hash.test.ts`
- `apps/admin-studio/tests/handoff-store.test.ts`

### Updated

- `apps/admin-studio/src/lib/capability-data.ts` — now a thin facade over the
  generated bundle
- `apps/admin-studio/src/routes/capabilities.ts` — adds content hash,
  persistence, and the Stage C `/provision-staging` route
- `apps/admin-studio/src/routes/manifest.ts` — declares the new route
- `apps/admin-studio/tests/capabilities.test.ts` — covers hash + provision-staging
- `apps/admin-studio-ui/src/pages/tabs/CapabilitiesTab.tsx` — adds workflow step
  indicator, persistent staging-first badge, markdown render, copy/download,
  proof-gate panel + double-confirm staging-provision request
- `apps/admin-studio-ui/src/pages/tabs/CapabilitiesTab.test.ts` — covers the
  new workflow stage + proof-gate helpers
- `packages/deploy/scripts/scaffold.mjs` — `--handoff <path>` consumes a
  persisted handoff package
- `.github/workflows/ci.yml` — registry validation + compile-determinism

## Second pass additions (gap-fill + improvements)

The original Stage A→C landing left three gaps + one polish opportunity flagged.
This second pass closes all four:

| Gap / opportunity | Resolution |
|---|---|
| Staging-provision dispatcher | `.github/workflows/dispatch-capability-provision.yml` workflow_dispatch that fetches a handoff, transitions the request to dispatched, runs `scaffold.mjs --handoff`, uploads the workspace artifact, and transitions to succeeded/failed. |
| Second recipe family | Added `voice-intake-agent` recipe (telephony+crm+analytics+llm; optional compliance+email) + `voice-intake-bot` concept + two new primitives (`email`, `llm`). The `telephony-requires-crm` rule still passes. |
| UI-level e2e | `apps/admin-studio-ui/e2e/capabilities.spec.ts` — Playwright spec that mocks the backend and drives login → resolve → preview → handoff → proof gates → staging-provision. Added `desktop-chrome` Playwright project + new `capabilities-e2e` job in `factory-admin-ui-ci.yml`. |
| Concept rail sort | `compareConceptsByOperatorRelevance` — approval tier (golden > supported > experimental) → maturity (stable > beta > experimental > draft > deprecated > retired) → alphabetical. |
| Lineage endpoints | `GET /capabilities/handoffs`, `GET /capabilities/provision-requests`, `POST /capabilities/provision-requests/:id/transition`. All auth-gated and audited (transitions to succeeded/failed are `irreversible`; the rest are `manual-rollback`). |
| Browser-agent helper | `scripts/test-site.sh` — wraps the `supervisor-sa` impersonation + scrape / screenshot / audit invocations. |

### Updated counts

- Registry: 6 primitives, 3 recipes, 2 concepts, 1 rule bundle
- Backend tests: 64 (was 60) — added catalog ordering, voice-intake-bot resolution, compare helper, lineage auth gates
- UI helper tests: 8
- UI e2e: 1 new desktop spec
- New CI jobs: `capabilities-e2e` (Playwright desktop-chrome)

## Validation performed

- `node scripts/capabilities/validate.mjs` — passes (6 primitives / 3 recipes / 2 concepts / 1 rule)
- `node scripts/capabilities/compile.mjs` — emits stable `dist/catalog.json` and the generated TS bundle
- `apps/admin-studio` `npm run typecheck` — clean
- `apps/admin-studio-ui` `npx tsc --noEmit` — clean
- `apps/admin-studio` full Vitest run — 64/64 pass
- `apps/admin-studio-ui` `CapabilitiesTab.test.ts` — 8/8 pass
- `node --check packages/deploy/scripts/scaffold.mjs` — parses
- `bash -n scripts/test-site.sh` — parses

## What is intentionally NOT done

Stage D items per C-002, gated until council reopens:

- freeform visual node composer / graph canvas
- arbitrary primitive mixing by operators
- prompt-only service generation
- production-first provisioning
- scheduled auto-poll of `status='requested'` rows (the dispatcher workflow is
  manual `workflow_dispatch`)

## Recommended next steps

1. **Scheduled dispatcher** — convert the manual `workflow_dispatch` into a
   `schedule:` cron + a `STUDIO_DISPATCH_TOKEN` rotation routine, once an
   operator-on-call signal is wired.
2. **Lineage view in Studio** — surface the new `GET /capabilities/handoffs`
   and `GET /capabilities/provision-requests` endpoints inside the
   Capabilities tab so operators can see history per concept/recipe.
3. **Browser-agent integration test** — wire `scripts/test-site.sh` audit
   results into a scheduled smoke or post-deploy gate against the deployed
   `/capabilities` surface.
