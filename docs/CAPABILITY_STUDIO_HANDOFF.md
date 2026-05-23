# Capability Design Studio Handoff

## Current state

- Admin Studio now has a mounted backend capability route surface:
  - `GET /capabilities`
  - `POST /capabilities/resolve`
  - `POST /capabilities/preview`
  - `POST /capabilities/handoff`
- The client UI now uses the audited backend handoff endpoint for scaffold handoff generation.
- Stale preview and handoff state are invalidated when concept inputs change.
- Admin Studio backend typecheck passes.
- Backend capability route tests pass (`apps/admin-studio/tests/capabilities.test.ts`).
- Admin Studio UI helper tests pass (`apps/admin-studio-ui/src/pages/tabs/CapabilitiesTab.test.ts`).

## Files changed

- `apps/admin-studio-ui/src/pages/Dashboard.tsx`
- `apps/admin-studio-ui/tsconfig.json`
- `apps/admin-studio-ui/src/pages/tabs/CapabilitiesTab.tsx`
- `apps/admin-studio-ui/src/pages/tabs/CapabilitiesTab.test.ts`
- `apps/admin-studio/src/index.ts`
- `apps/admin-studio/src/routes/manifest.ts`
- `apps/admin-studio/tsconfig.json`
- `apps/admin-studio/src/routes/capabilities.ts`
- `apps/admin-studio/src/lib/capability-data.ts`
- `apps/admin-studio/src/lib/capability-plan.ts`
- `apps/admin-studio/src/lib/capability-registry.ts`
- `apps/admin-studio/tests/capabilities.test.ts`
- `docs/CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md`
- `docs/CAPABILITY_FACTORY_BACKCASTING_PLAN.md`
- `docs/council/DECISIONS.md`
- `docs/council/INDEX.md`
- `docs/council/inquiries/002-capability-design-studio-golden-design.md`

## Validation performed

- `apps/admin-studio-ui` typecheck
- `npx vitest run src/pages/tabs/CapabilitiesTab.test.ts`
- `apps/admin-studio` typecheck
- `npx vitest run tests/capabilities.test.ts`

## Recommended next steps

1. Add an integration or UI-level test for the resolve → preview → handoff flow.
2. Add a staging provision request path behind explicit confirmation (Stage C of the golden design).
3. Keep the capability registry and plan contract as the single shared seam for design studio evolution.
