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

## Commands

Compile a recipe into a deterministic provisioning plan:

```bash
npm run compile:capability -- --recipe outbound-dialer
```

Or write the compiled plan to a file:

```bash
npm run compile:capability -- --recipe outbound-dialer --output capabilities/compiled/outbound-dialer.plan.json
```

Generate the golden-path implementation artifact for a recipe:

```bash
npm run build:capability-golden-path -- --recipe outbound-dialer --output capabilities/compiled/outbound-dialer.golden-path.json
```

The golden-path artifact includes the compiled plan contract, required secrets/vars/bindings, expected surfaces, smoke checks, and proof-gate conditions.

Generate a human-readable preview for a compiled plan:

```bash
npm run preview:capability-plan -- --recipe outbound-dialer --output capabilities/compiled/outbound-dialer.preview.md
```

If you already have a compiled plan file, you can render it directly:

```bash
npm run preview:capability-plan -- --plan capabilities/compiled/outbound-dialer.plan.json
```


This outputs `capabilities/compiled/outbound-dialer.preview.md` and can be used to validate the proposed golden-path contract before provisioning.

Generate a scaffolded app from a compiled capability recipe:

```bash
node packages/deploy/scripts/scaffold.mjs outbound-dialer-app --recipe outbound-dialer --no-install --no-secrets --no-deploy --no-prereq --hyperdrive-id REPLACE_WITH_HYPERDRIVE_ID
```

This creates a minimal Factory app with recipe-derived dependencies, environment contract, and placeholder routes for the expected surfaces.


## Scope

This is the first thin slice of the capability-factory registry.

Current scope:

1. primitive descriptors for the `outbound-dialer` slice
2. one experimental recipe: `outbound-dialer`
3. one composition rule: telephony-backed outbound recipes require compliance

Future phases can extend this registry with graph schemas, compiled plan schemas, lineage records, and Studio-facing catalog views.
