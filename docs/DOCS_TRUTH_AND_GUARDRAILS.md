# Documentation Truth Map and Hallucination Guardrails

**Last Updated:** 2026-05-27
**Status:** Canonical operating policy for documentation claims

This repo has a large historical documentation surface. Some files are active contracts; many are planning artifacts, completion reports, or archived evidence. Treating every Markdown file as current is unsafe.

Use this page before making claims about Factory architecture, deployment state, service names, package counts, workflow behavior, or diagrams.

## Current Audit Snapshot

Verified locally on 2026-05-27:

| Check | Result | Evidence |
|---|---:|---|
| Service registry validator | Pass | `npm run validate:service-registry` |
| Covered workflow rules | 13 | validator output |
| Covered Worker contracts | 9 | validator output |
| Explicit deploy-workflow exemptions | 5 | validator output |
| Markdown files scanned by docs quality gate | 396 | `npm run validate:docs -- --max-errors 0 --json` |
| Broken internal doc links | 389 | `docs-quality-report.json` |
| Docs freshness audit | 15 fresh, 27 missing `Last Updated` | `npm run audit:docs-freshness` |
| Local workflow files | 120 | `.github/workflows/*.yml` |
| Local app directories | 26 | `apps/*` |
| Local Worker wrangler files | 18 | `apps/**/wrangler.jsonc` |
| Local package directories | 36 | `packages/*` |
| Registry package entries | 23 | `docs/service-registry.yml` |

Conclusion: the service/deploy contract is actively guarded and currently passing. The general documentation corpus is not clean enough to treat unverified cross-links as authoritative.

## Source-Of-Truth Order

When sources conflict, use this order:

| Rank | Source | Why |
|---:|---|---|
| 1 | Executed validation output, tests, workflow logs, direct file inventory | Freshest observable evidence |
| 2 | `docs/service-registry.yml` plus `scripts/validate-service-registry.mjs` | Executable service, URL, binding, secret, and verification contract |
| 3 | `CLAUDE.md`, `docs/supervisor/FRIDGE.md`, `.github/CODEOWNERS` | Safety and operating constraints |
| 4 | `docs/decisions/2026-05-25-factory-alignment.md` | Current strategic alignment and explicit non-goals |
| 5 | `docs/architecture/FACTORY_V1.md` | Architecture baseline, but dated 2026-05-02; verify mutable counts/status |
| 6 | `.github/workflows/REGISTRY.md` and workflow files | Automation tiering and actual automation surface |
| 7 | Current runbooks under `docs/runbooks/` | Procedures; verify commands before execution |
| 8 | Historical phase, completion, dashboard, and archive docs | Evidence only; never the sole basis for a current claim |

## Diagram Policy

Diagrams are current only when every node and edge can be traced to one of:

- `docs/service-registry.yml`
- an app `wrangler.jsonc`
- a deploy workflow under `.github/workflows/`
- a package `package.json`
- a migration file or schema file
- a route or API implementation in `apps/**/src`

Every architecture diagram should include one of these labels:

- `Generated from source`: produced from registry/code inventory.
- `Verified manually on YYYY-MM-DD`: checked against the files named above.
- `Conceptual`: useful for thinking; not a source of operational truth.
- `Historical`: preserved as evidence only.

Do not use diagrams from phase docs or completion reports for current operations unless they have been re-verified.

## Claim Discipline

Before publishing or acting on a statement:

| Claim type | Required evidence |
|---|---|
| Service name, URL, domain, health endpoint | `docs/service-registry.yml` and validator pass |
| Worker binding, required secret, required var | service registry, `wrangler.jsonc`, deploy workflow |
| Workflow count, tier, trigger, or concurrency | `.github/workflows/REGISTRY.md` and file inventory |
| Package count or package status | `packages/*/package.json` and registry/package docs |
| App deployment status | deploy workflow output, live health check, or explicit dated registry note |
| Cost/budget status | dated decision doc plus current billing/API evidence |
| Product/revenue claims | app repo evidence, Stripe/test receipts, or dated business decision |
| Roadmap status | current operations dashboard or issue state, not old phase summaries |

If the evidence is not available, write `unknown`, `unverified`, or `planned`. Do not fill gaps with plausible architecture.

## Maintenance Rules

1. New canonical docs must link to this file and declare their evidence base.
2. New diagrams must carry a status label from the diagram policy above.
3. New deploy workflows must either be covered by `scripts/validate-service-registry.mjs` or have an explicit exemption with a removal path.
4. `docs-quality-report.json` is a generated audit artifact. Do not treat it as hand-authored documentation.
5. Fix broken links in active/canonical docs before archive docs. Historical link rot is lower risk than active false confidence.

## Local Verification Commands

```bash
npm run docs:health
npm run docs:catalog
npm run validate:service-registry
npm run validate:docs -- --max-errors 0 --json
npm run audit:docs-freshness
rg --files apps | rg "wrangler\\.jsonc$"
```

## Current Priority Fixes

1. Keep `validate-service-registry` green as deploy workflows change.
2. Reduce broken links in canonical and active-reference docs first.
3. Keep this truth map aligned when package/app/workflow counts materially change.
4. Prefer generated inventories over manually maintained counts where possible.
