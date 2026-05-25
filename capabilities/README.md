# Capability Registry

This is the canonical, on-disk source of truth for the Factory Capability Factory.

It contains:

- `schema/` — JSON Schema definitions for every descriptor type
- `primitives/` — one JSON file per technical primitive
- `recipes/` — one JSON file per approved primitive composition
- `concepts/` — one JSON file per operator-facing concept
- `rules/` — rule bundles enforcing compatibility constraints between primitives
- `dist/catalog.json` — generated, machine-readable compiled catalog (DO NOT EDIT)

> Implementation governance: see [`docs/CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md`](../docs/CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md) and [`docs/CAPABILITY_FACTORY_BACKCASTING_PLAN.md`](../docs/CAPABILITY_FACTORY_BACKCASTING_PLAN.md).

## Workflow

1. Edit JSON descriptors in `primitives/`, `recipes/`, `concepts/`, or `rules/`.
2. Run `node scripts/capabilities/validate.mjs` to validate against schemas and cross-references.
3. Run `node scripts/capabilities/compile.mjs` to regenerate `capabilities/dist/catalog.json` and the TypeScript catalog bundle consumed by admin-studio.
4. Commit the JSON sources AND the regenerated `dist/` artifacts together.

CI fails if validation fails or if the regenerated artifacts diverge from the committed copy.

## Determinism

The compile step is fully deterministic:

- arrays of strings are stable-sorted
- maps are emitted in sorted key order
- timestamps are derived from `git` HEAD (committed) or omitted (local dev)

This means two clones of the repo at the same commit produce byte-identical catalogs.
