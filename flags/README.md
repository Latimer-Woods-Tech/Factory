# Feature Flag Governance

Every flag key used in any Worker must appear in `flags/registry.yml` before the PR merges. CI blocks anything else.

## Naming: `{scope}:{ks|ro|ex|cfg|ops}:{feature}`

See full docs: `docs/architecture/FLAGSHIP_ARCHITECTURE.md`
