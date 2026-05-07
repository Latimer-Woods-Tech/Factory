# Canonical Library Promotion Plan

**Date:** 2026-05-04  
**Owner:** Platform Docs / Product Architecture  
**Status:** Draft for execution

## Purpose

Move high-value reference material from scattered app/audit locations into the canonical Factory docs library so contributors have a single source of truth.

## Current State

- Canonical docs navigation is defined in `docs/docs.json`.
- Canonical architecture exists in `docs/architecture/FACTORY_V1.md` but is not surfaced in the docs nav.
- Supervisor architecture and operating rules exist in `docs/supervisor/ARCHITECTURE.md` and `docs/supervisor/FRIDGE.md` but are not surfaced in docs nav.
- HumanDesign language guidance exists in `_external_reviews/humandesign/client/public/llms.txt` and is validated by audit docs, but no canonical library policy page exists under `docs/`.
- Feature/capabilities matrix has split sources:
  - `docs/FACTORY_PACKAGE_MATRIX.md`
  - `docs/packages/factory-capabilities-matrix.mdx`

## Promotion Priorities

### P0 — Must Promote Now

1. **HumanDesign Language Compliance Policy**
- Canonical target: `docs/policies/humandesign-language-guidance.mdx`
- Source material:
  - `_external_reviews/humandesign/client/public/llms.txt`
  - `_external_reviews/humandesign/audits/FULL_AUDIT_2026-04-22.md`
  - `_external_reviews/humandesign/audits/WORLD_CLASS_COMPLETE_2026-04-22.md`
- Required content:
  - Canonical terms (Energy Blueprint, Energy Chart)
  - Allowed SEO exceptions for guide content
  - Prohibited product-surface terminology list
  - Compliance check guidance

2. **Architecture Visibility in Canonical Nav**
- Surface these docs directly in `docs/docs.json` navigation:
  - `docs/architecture/FACTORY_V1.md`
  - `docs/supervisor/ARCHITECTURE.md`
  - `docs/supervisor/FRIDGE.md`

3. **Matrix Consolidation Decision**
- Choose one canonical matrix source:
  - `docs/FACTORY_PACKAGE_MATRIX.md` (business-readable)
  - `docs/packages/factory-capabilities-matrix.mdx` (Mintlify-native)
- Mark the non-canonical file as derived/superseded.

### P1 — Promote Next

4. **Governance Registry Visibility**
- Promote references to:
  - `docs/APP_SCOPE_REGISTRY.md`
  - `docs/service-registry.yml`
  - `docs/DOCUMENTATION_HIERARCHY.md`
- Goal: remove ambiguity on ownership, boundaries, and source-of-truth rules.

5. **Canonical Documentation Index Alignment**
- Ensure `docs/DOCUMENTATION_INDEX.md` exists and reflects active canonical references.
- Ensure root-level historical docs clearly indicate superseded status where applicable.

### P2 — Operational Hardening

6. **Doc Compliance Lint for Vocabulary**
- Add a docs-quality check that flags prohibited product-surface terminology in designated paths.
- Allowlist SEO guide paths where field terms are intentionally used.

7. **Canonical Promotion Playbook**
- Add a short runbook section defining how app-local docs become canonical.

## Implementation Backlog (Ready-to-Execute)

| ID | Priority | Task | Owner | Output | Exit Criteria |
|---|---|---|---|---|---|
| CL-01 | P0 | Create canonical HumanDesign language policy page | Product + Docs | `docs/policies/humandesign-language-guidance.mdx` | Policy merged + linked in nav |
| CL-02 | P0 | Add architecture/supervisor docs to Mintlify nav | Platform Docs | `docs/docs.json` update | Architecture pages visible in published docs |
| CL-03 | P0 | Consolidate package/capabilities matrix to one canonical source | Platform Lead | One matrix doc marked canonical | Duplicate source marked derived/superseded |
| CL-04 | P1 | Add governance registry group to docs nav | Platform Docs | `docs/docs.json` update | Registry docs discoverable from docs home |
| CL-05 | P1 | Publish documentation hierarchy + source-of-truth policy in nav | Platform Docs | nav + cross-links | Contributors can find canonical policy in 1 click |
| CL-06 | P2 | Add vocabulary compliance check (policy-aware) | DevEx | workflow/script | CI fails on prohibited terms outside allowlist |

## Sign-off Criteria

Canonical library promotion is complete when:

- HumanDesign language policy is canonical under `docs/`.
- Architecture and supervisor guidance are top-level discoverable in docs nav.
- Matrix source duplication is resolved with one canonical file.
- Governance references are visible from canonical docs.
- Documentation hierarchy/source-of-truth policy is visible in canonical docs.

## Notes

- Keep app-specific audit files in app repos (`_external_reviews/...`) as evidence, not policy.
- Canonical policy should be stable, concise, and maintained by named owners.
- Historical root docs should remain, but with clear superseded notices and links to canonical sources.
