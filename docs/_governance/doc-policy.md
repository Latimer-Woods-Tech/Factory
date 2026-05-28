# Documentation Governance Policy

**Last Updated:** 2026-05-28
**Status:** Active reference

Factory docs are managed by status and fidelity, not by location alone.

- `canonical` docs are trusted only when they are allowlisted, verified, and free of blocking health errors.
- `active` docs are useful references but must be checked against canonical docs and executable evidence before operational use.
- `stale` docs are context only.
- `archive` docs are historical evidence only.
- `generated` docs must be reproducible from declared sources.
- `scratch` docs are temporary and must either graduate or expire.

The catalog generator owns generated index files. Do not hand-edit generated catalog outputs.

See `docs/runbooks/docs-control-plane-deployment.md` for the rollout plan and `docs/DOCS_TRUTH_AND_GUARDRAILS.md` for source-of-truth order.
