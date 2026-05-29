# Documentation Control Plane Deployment Plan

**Last Updated:** 2026-05-28
**Status:** Active deployment plan
**Owner:** Platform / Documentation Governance
**Fidelity:** Owner-reviewed plan; implementation must be verified by generated catalog and CI output.

This plan describes how to deploy a self-managed documentation control plane for Factory. The goal is not to make every document perfect. The goal is to make documentation truth, drift, ownership, and diagrams visible, reproducible, and hard to break silently.

## Purpose

Factory has a large documentation surface and an increasingly capable change-making system. The documentation layer must therefore answer:

- what docs exist
- which docs are canonical
- which docs are active, stale, archive, generated, or scratch
- what each canonical doc is allowed to claim
- what source files prove those claims
- what changed since verification
- which docs and diagrams are affected by source drift
- what humans and agents are allowed to trust

The control plane must remain repo-native first: Markdown, JSON, Node scripts, GitHub Actions, and generated reports. A dashboard can be added later over the same artifacts.

## Deployment Principles

1. Truth lives in code, config, workflows, registries, tests, and executed validation output.
2. The catalog is a generated mirror of truth, not a truth source by itself.
3. Canonical status is scarce and allowlisted.
4. Unknown or unverifiable state degrades trust automatically.
5. Generated files must be reproducible from the current commit.
6. Diagrams must declare their sources and generation method.
7. Agents must read the machine-readable truth map before relying on docs.
8. The first release must use mechanical checks before attempting semantic claim validation.
9. Rollout must be shadow-mode first for non-canonical docs.
10. New automation must follow existing Factory workflow conventions: pinned actions, `.nvmrc`, minimal permissions, timeouts, concurrency, and path-scoped triggers.

## Environment Cohesion

Build the control plane as part of the existing Factory automation environment instead of creating a parallel stack.

Use these local conventions:

- Node version comes from `.nvmrc`.
- GitHub Actions should set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'`.
- Actions should be pinned to commit SHAs, matching current workflow hardening.
- Workflows should default to `permissions: contents: read`.
- Any workflow that writes issues, PR comments, branches, or committed generated files must request only the exact additional permissions it needs.
- Use `npm install --no-audit --no-fund --ignore-scripts` unless a future lockfile strategy changes this repo convention.
- Keep all scripts offline and deterministic by default.
- Do not call external APIs from docs health checks except explicitly scoped live verification jobs.

Reuse these existing checks as inputs to the docs health engine:

- `npm run validate:service-registry`
- `npm run validate:docs -- --max-errors 0 --json`
- `npm run audit:docs-freshness`
- `node scripts/check-docs-registry-consistency.mjs`

Also connect to these existing workflow surfaces:

- `.github/workflows/validate-service-registry.yml`
- `.github/workflows/doc-freshness-audit.yml`
- `.github/workflows/coherence-check.yml`
- `.github/workflows/REGISTRY.md`
- `.github/workflows/COORDINATION.md`

## Target File Layout

```text
docs/
  CATALOG.md
  CANONICAL_DOCS.md
  STALE_DOCS.md
  OWNER_INDEX.md

  _catalog/
    docs-graph.json
    docs-health.json
    agent-truth-map.json
    drift.json
    drift-report.md
    link-report.json
    link-report.md
    debt-index.md
    freshness.json
    events.jsonl
    snapshots/

  _generated/
    service-map.md
    workflow-map.md
    deploy-flow.md

  _governance/
    canonical-docs.yml
    doc-overrides.yml
    frontmatter.schema.json
    doc-policy.md
    evidence-policy.md
    templates/

scripts/
  docs/
    catalog.mjs
    health.mjs
    drift.mjs
    validate-frontmatter.mjs
    diagrams.mjs
    self-check.mjs
    snapshot.mjs

.github/workflows/
  _docs-health.yml
  docs-health.yml
```

## Metadata Contract

Canonical and active documents should eventually carry frontmatter. During rollout, support both frontmatter and legacy `Last Updated` headings so existing docs do not need a risky mass rewrite.

```yaml
---
status: canonical
owner: platform
doc_type: runbook
fidelity: verified
quality: usable
last_updated: 2026-05-28
last_verified: 2026-05-28
truth_source:
  - service-registry
  - github-workflows
  - source-code
verified_by:
  - npm run validate:service-registry
scope: Deployment workflows, Worker registry, and deploy verification behavior.
---
```

Allowed statuses:

| Status | Meaning | Gate |
|---|---|---|
| `canonical` | Current trusted operating doc | hard fail on missing metadata, drift, broken links, or failed verification |
| `active` | Useful current reference | warn first, harden later |
| `stale` | Needs review before use | visible in catalog, not trusted by agents |
| `archive` | Historical record | exempt unless cited by canonical docs |
| `generated` | Produced from source files | fail if output is not reproducible |
| `scratch` | Draft or planning material | expires or graduates |

Allowed fidelity values:

| Fidelity | Meaning |
|---|---|
| `verified` | Proven by current validators, source hashes, or tests |
| `generated` | Produced directly from source-of-truth files |
| `owner-reviewed` | Manually reviewed by owner and date |
| `unverified` | Useful context only |
| `historical` | Preserved evidence, not current behavior |

## Generated Graph

The central artifact is `docs/_catalog/docs-graph.json`.

It should connect:

```text
doc -> status -> owner -> fidelity -> truth sources -> source hashes -> related diagrams -> errors -> last verified commit
```

Minimum node shape:

```json
{
  "path": "docs/runbooks/deployment.md",
  "status": "canonical",
  "owner": "platform",
  "doc_type": "runbook",
  "fidelity": "verified",
  "truth_sources": ["service-registry", "github-workflows"],
  "content_hash": "sha256:...",
  "last_git_commit": "...",
  "last_verified_commit": "...",
  "last_verified": "2026-05-28",
  "related_diagrams": ["docs/_generated/deploy-flow.md"],
  "errors": []
}
```

## Health Engine

Add one primary command:

```bash
npm run docs:health
```

It should run or orchestrate:

```bash
npm run validate:service-registry
npm run validate:docs -- --max-errors 0 --json
npm run audit:docs-freshness
npm run validate:docs-drift
npm run docs:catalog
npm run docs:self-check
```

Health output belongs in `docs/_catalog/docs-health.json` and should include structured events:

```json
{
  "id": "docs.workflow-ref.missing",
  "severity": "error",
  "doc": "docs/runbooks/deployment.md",
  "line": 42,
  "owner": "platform",
  "status": "canonical",
  "fidelity": "degraded",
  "truth_source": ".github/workflows",
  "message": "Doc references a workflow that does not exist.",
  "fix": "Update the workflow reference or restore the workflow.",
  "blocks": ["canonical-docs", "deploy-contracts"]
}
```

## Drift Detection

Start with mechanical drift checks:

- worker names and Workers URLs in docs must resolve to `docs/service-registry.yml`
- workflow file references must exist under `.github/workflows/`
- npm script references must exist in `package.json`
- generated diagrams must match current source hashes
- canonical docs must not link to archive docs as current truth
- canonical docs must not have broken internal links
- verified docs must degrade if a declared truth source changed after `last_verified_commit`

Do not start with AI-based semantic verification. Add that only after the mechanical graph is stable.

## Diagram Contract

Diagrams are views over the same graph, not separate hand-maintained artwork.

Generated diagrams should live in `docs/_generated/` and begin with:

```text
<!-- GENERATED FILE. Do not edit directly. Run npm run docs:diagrams. -->
```

Each diagram must declare:

```yaml
---
status: generated
owner: platform
doc_type: diagram
fidelity: generated
source:
  - docs/service-registry.yml
  - .github/workflows
generator: npm run docs:diagrams
last_generated: 2026-05-28
---
```

Initial diagrams:

- `docs/_generated/service-map.md`
- `docs/_generated/workflow-map.md`
- `docs/_generated/deploy-flow.md`

Use Mermaid first. Image rendering can come later if there is a real need.

## GitHub Deployment

Factory owns `.github/workflows/_docs-health.yml` as the reusable control-plane workflow. Each repo should have a thin `.github/workflows/docs-health.yml` caller.

Add `.github/workflows/docs-health.yml` with these triggers:

- pull requests touching `docs/**`
- pull requests touching `.github/workflows/**`
- pull requests touching `package.json`
- pull requests touching `scripts/**`
- pull requests touching registry/config files
- scheduled weekly full audit
- manual dispatch

Initial gate behavior:

| Tier | PR behavior |
|---|---|
| canonical docs | hard fail on missing metadata, broken links, drift, stale generated output |
| active docs | warning summary |
| stale/archive docs | no hard fail unless linked as canonical truth |
| generated docs | hard fail if generator output is stale |

Use GitHub Actions artifacts for bulky JSON reports if needed. Keep committed generated artifacts limited to files that are useful for humans and agents browsing the repo.

Recommended workflow shape:

```yaml
name: Docs Health

on:
  pull_request:
    paths:
      - 'docs/**'
      - '.github/workflows/**'
      - 'scripts/**'
      - 'package.json'
      - '.nvmrc'
  workflow_dispatch:
  schedule:
    - cron: '17 9 * * 1'

concurrency:
  group: docs-health-${{ github.ref }}
  cancel-in-progress: true

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'

permissions:
  contents: read

jobs:
  docs-health:
    uses: Latimer-Woods-Tech/Factory/.github/workflows/_docs-health.yml@main
    with:
      repo_profile: app
      tools_ref: main
      enforce_generated: true
```

If PR comments are added later, put them in a separate job with `pull-requests: write` and keep the core validation job read-only.

Repo profiles:

| Profile | Use |
|---|---|
| `factory` | Full Factory checks, including service registry, endpoint consistency, docs quality, freshness, drift, diagrams, metadata, and generated-output enforcement |
| `app` | Portable docs graph, metadata, drift, diagrams, and docs quality checks for app repos |
| `package` | Same as `app`, reserved for package-specific routing later |
| `docs-lite` | Catalog, metadata, drift, and link checks without generated diagrams |

To seed another repo, run:

```bash
npm run docs:bootstrap -- --target ../capricast --profile app
```

Then review the generated `docs/_governance/canonical-docs.yml`, `docs/_governance/doc-overrides.yml`, `docs/_catalog/agent-truth-map.json`, and `.github/workflows/docs-health.yml` in that repo before committing.

## Rollout Modes

Use explicit modes so the system can become stricter without surprising engineers.

| Mode | Scope | Behavior |
|---|---|---|
| `observe` | all docs | generate catalog and health reports; never fail CI |
| `warn` | active docs | write GitHub step summary and optional PR comment |
| `enforce-canonical` | canonical allowlist | fail CI for canonical drift, broken links, missing metadata, or stale generated output |
| `enforce-generated` | generated docs | fail CI when generated files are not reproducible |
| `enforce-active` | selected active docs | opt-in after canonical gate is quiet |

V1 should ship with `observe` for the full corpus and `enforce-canonical` only for the small allowlist.

## Integration Points

The docs control plane should not replace existing workflow/reporting surfaces. It should ingest them and make them easier to reason about.

| Existing surface | Control-plane use |
|---|---|
| `docs/DOCS_TRUTH_AND_GUARDRAILS.md` | top-level policy and source-of-truth order |
| `docs/DOCUMENT_STATUS_INDEX.md` | bootstrap source for canonical/active/archive classification |
| `docs/service-registry.yml` | service, Worker, URL, binding, and deploy evidence |
| `.github/workflows/REGISTRY.md` | workflow lifecycle and tiering evidence |
| `.github/workflows/COORDINATION.md` | deployment coordination context |
| `scripts/validate-service-registry.mjs` | executable deploy contract validation |
| `scripts/validate-docs-quality.mjs` | internal link report source |
| `scripts/doc-freshness-audit.js` | initial freshness report source |
| `scripts/check-docs-registry-consistency.mjs` | docs-to-worker endpoint drift source |
| `docs/STATE.md` | current-state narrative; should eventually consume catalog output rather than duplicate it |

Generated catalog artifacts should include `generated_by`, `generated_at`, `generated_at_commit`, and source hashes so other workflows can consume them safely.

## Agent Access Contract

Agents must read `docs/_catalog/agent-truth-map.json` before using repository docs as evidence.

Agent rules:

- may update `active`, `stale`, `archive`, and `scratch` docs
- may propose canonical changes
- must not mark a doc `verified` unless validators pass
- must not treat archive docs as current behavior
- must prefer service registry, workflows, source code, and executed validation output over prose
- must mark unknown state as `unknown`, `unverified`, or `planned`

Minimum truth map:

```json
{
  "truth_order": [
    "executed-validation-output",
    "service-registry",
    "github-workflows",
    "source-code",
    "canonical-docs",
    "active-docs",
    "archive-docs"
  ],
  "default_trust": {
    "canonical": "trusted-if-verified",
    "active": "use-with-checks",
    "stale": "context-only",
    "archive": "historical-only",
    "generated": "trusted-if-reproducible"
  }
}
```

## Self-Check

The documentation system is broken if it cannot prove its own freshness.

`npm run docs:self-check` should verify:

- catalog was generated from the current commit
- generated files are reproducible
- canonical allowlist and document metadata agree
- no doc has impossible states, such as `status: canonical` and `fidelity: historical`
- verified docs are not older than declared truth sources
- generated diagrams contain current source hashes
- all expected validators ran and reported results
- `docs/_catalog/docs-health.json` was generated by the current run
- generated artifacts include the current commit SHA or explicitly state that the checkout is dirty/local
- generated artifacts are not hand-edited outside their generator

If a self-check is inconclusive, canonical docs should degrade rather than pass.

## Security And Privacy

Documentation health checks must be safe to run on pull requests.

- Never print secrets, token values, account IDs marked sensitive, or full environment dumps.
- Redact values matching common token/key patterns before writing reports.
- Treat public URLs, service names, workflow names, package names, and file paths as reportable unless separately classified.
- Do not run live Cloudflare, Stripe, Sentry, GitHub admin, or billing API calls in baseline docs health.
- Put live verification behind manual dispatch or a separately approved scheduled workflow.
- Keep generated reports small and text-first.
- Use short artifact retention for bulky reports.

## Developer Experience

The system should help engineers fix problems quickly.

Every structured error should include:

- file path
- line number when available
- owner
- severity
- status tier
- affected truth source
- exact validator
- suggested fix
- whether it blocks CI

The GitHub step summary should group issues by owner and by blocking status. PR comments should be optional and deduplicated so they do not create noise.

## Rollout Plan

### Phase 0: Prepare the Contract

- Add `docs/_governance/canonical-docs.yml`.
- Add `docs/_governance/frontmatter.schema.json`.
- Define initial canonical allowlist from `docs/DOCUMENT_STATUS_INDEX.md`.
- Add `docs/_catalog/agent-truth-map.json`.
- Add generated artifact headers and source hash conventions.
- Do not require every doc to have frontmatter yet.

Exit criteria:

- canonical docs are explicitly allowlisted
- agents have a machine-readable truth map
- governance files are committed
- local generated artifacts can identify their generator and source commit

### Phase 1: Catalog MVP

- Implement `scripts/docs/catalog.mjs`.
- Scan `docs/**/*.md`, `docs/**/*.mdx`, root Markdown, and selected app READMEs.
- Extract frontmatter or legacy status hints.
- Generate `docs/_catalog/docs-graph.json`.
- Generate `docs/CATALOG.md`, `docs/CANONICAL_DOCS.md`, `docs/STALE_DOCS.md`, and `docs/OWNER_INDEX.md`.

Exit criteria:

- catalog generation is deterministic
- catalog can run locally without network access
- generated catalog makes archive/stale/canonical distinctions visible
- repeated catalog runs produce no diff when inputs have not changed

### Phase 2: Health MVP

- Implement `scripts/docs/health.mjs`.
- Normalize outputs from existing validators.
- Write `docs/_catalog/docs-health.json`.
- Add `npm run docs:health`.
- Add `npm run docs:self-check`.
- Emit a GitHub step-summary-friendly Markdown report.

Exit criteria:

- health output has structured errors
- canonical failures are machine-readable
- self-check catches stale generated output
- existing validator failures are preserved with their original command and exit status

### Phase 3: Drift MVP

- Implement workflow reference checks.
- Reuse or wrap `scripts/check-docs-registry-consistency.mjs`.
- Add npm script reference checks.
- Add source hash tracking for generated files.
- Track last verified commit for canonical docs.

Exit criteria:

- docs referencing missing workflows fail if canonical
- docs referencing unregistered Workers fail if canonical
- generated diagrams degrade when source hashes change
- verified canonical docs degrade when declared truth sources change after verification

### Phase 4: Diagrams

- Implement `scripts/docs/diagrams.mjs`.
- Generate Mermaid service and workflow diagrams from the graph.
- Link diagrams back to source files and health errors.
- Keep diagrams Markdown/Mermaid for V1.

Exit criteria:

- diagrams are generated from `docs-graph.json` and source files
- generated diagrams have source hashes
- CI can detect stale diagrams
- diagram nodes link back to source docs or registry/workflow files where practical

### Phase 5: GitHub Workflow

- Add `.github/workflows/docs-health.yml`.
- Add `.github/workflows/_docs-health.yml`.
- Run hard gates for canonical docs.
- Publish warnings for active docs.
- Upload health artifacts.
- Optionally comment PR summaries when docs health degrades.
- Add the workflow to `.github/workflows/REGISTRY.md`.
- Add the reusable workflow to `.github/workflows/REGISTRY.md`.
- Add the workflow to `.github/workflows/COORDINATION.md` if it becomes part of deploy/change governance.

Exit criteria:

- PRs cannot silently break canonical docs
- active doc drift is visible without blocking early rollout
- full audit runs on schedule
- workflow follows Factory conventions for pinned actions, `.nvmrc`, minimal permissions, concurrency, and timeout

## Initial NPM Scripts

```json
{
  "docs:catalog": "node scripts/docs/catalog.mjs",
  "docs:check-generated": "node scripts/docs/check-generated-current.mjs",
  "docs:health": "node scripts/docs/health.mjs",
  "docs:diagrams": "node scripts/docs/diagrams.mjs",
  "docs:drift": "node scripts/docs/drift.mjs",
  "docs:metadata": "node scripts/docs/validate-metadata.mjs",
  "docs:self-check": "node scripts/docs/self-check.mjs",
  "validate:docs-frontmatter": "node scripts/docs/validate-frontmatter.mjs",
  "validate:docs-drift": "node scripts/docs/drift.mjs"
}
```

## First Build Slice

Build the smallest useful version:

1. `docs/_governance/canonical-docs.yml`
2. `docs/_catalog/agent-truth-map.json`
3. `scripts/docs/catalog.mjs`
4. `docs/_catalog/docs-graph.json`
5. generated `docs/CATALOG.md`
6. `scripts/docs/self-check.mjs`
7. `npm run docs:catalog`

This gives the repo a living inventory before adding harder gates.

## Non-Goals For V1

- no external database
- no hosted dashboard
- no AI claim verification
- no mandatory frontmatter on every historical document
- no image rendering pipeline
- no automatic rewriting of all existing docs

## Cost Guardrails

- Use standard Linux GitHub-hosted runners only.
- Run full checks only on relevant PR paths, weekly schedule, and manual dispatch.
- Keep artifacts short-lived.
- Prefer committed Markdown/JSON only when useful to humans or agents.
- Avoid paid AI/API calls in CI unless separately approved.

## Definition Of Done

The documentation control plane is deployed when:

- `npm run docs:health` runs locally
- `docs/_catalog/docs-graph.json` is generated deterministically
- `docs/_catalog/agent-truth-map.json` exists and is referenced by docs policy
- canonical docs are allowlisted
- generated catalog files exist
- at least one drift class is enforced for canonical docs
- generated diagrams either exist or are explicitly deferred
- GitHub Actions runs docs health on relevant PRs
- the system fails closed for canonical unknowns
- `.github/workflows/REGISTRY.md` knows about the docs health workflow
- docs health reports are readable from the GitHub step summary
- a local engineer can run the same commands CI runs

## Operational Rule

The control plane must never be trusted more than the evidence it can re-derive. If source evidence, validator output, and catalog state disagree, follow the source-of-truth order in `docs/DOCS_TRUTH_AND_GUARDRAILS.md` and mark affected docs degraded until verified.
