# Validate Service Registry Runbook

## Purpose

`docs/service-registry.yml` is the deployment control-plane contract for the covered local services in Factory.

`scripts/validate-service-registry.mjs` exists to make that contract executable. It prevents three common drift classes before merge:

1. A deploy workflow verifies the wrong URL.
2. A workflow exists locally but is not represented in validator coverage.
3. A Worker's declared runtime contract in the registry no longer matches its deploy workflow or `wrangler.jsonc` file.

This validator is intentionally narrow. It is meant to catch real, local, high-signal drift without pretending to simulate Cloudflare infrastructure.

## When To Run It

Run the validator whenever you change any of the following:

- `docs/service-registry.yml`
- any local `.github/workflows/deploy-*.yml`
- `scripts/validate-service-registry.mjs`
- any covered Worker's `wrangler.jsonc`
- any deploy secret or runtime contract wiring for a covered Worker

CI also runs it automatically through `.github/workflows/validate-service-registry.yml` on relevant pushes and pull requests.

## Command

From the repository root:

```bash
npm run validate:service-registry
```

Expected success output looks like this:

```json
{
  "ok": true,
  "checkedWorkflows": 13,
  "checkedContracts": 9,
  "exemptedWorkflows": 5,
  "checkedAt": "2026-05-27T20:45:31.396Z"
}
```

## What The Validator Checks

### 1. Workflow Coverage

Every local `deploy-*.yml` workflow under `.github/workflows/` must be covered by the validator. If a workflow exists and the validator does not know about it, the validator fails.

This is how Factory avoids the common failure mode where a new deploy workflow exists but no one updates the control-plane checks that were supposed to govern it.

### 2. Verification URL Alignment

For every covered local deploy workflow, the validator compares the health-check target used in the workflow to the canonical verification target declared in `docs/service-registry.yml`.

This includes two patterns:

- exact URL matching
- base-URL matching for workflows that construct `/health` at runtime

If the workflow and registry disagree about what URL proves health, the validator fails.

### 3. Worker Contract Alignment

For every covered Worker contract, the validator compares:

- `required_secrets` in `docs/service-registry.yml`
- `required_vars` in `docs/service-registry.yml`
- `required_bindings` in `docs/service-registry.yml`

against:

- the text of the deploy workflow
- the Worker's `wrangler.jsonc`

The validator only checks declared names. It does not inspect secret values, query Cloudflare, or confirm remote runtime state.

## Current Scope

### Workflow verification coverage

All 9 local deploy workflows are covered:

- `deploy-admin-studio.yml`
- `deploy-admin-studio-ui.yml`
- `deploy-daily-brief.yml`
- `deploy-lead-gen.yml`
- `deploy-schedule-worker.yml`
- `deploy-supervisor.yml`
- `deploy-synthetic-monitor.yml`
- `deploy-video-cron.yml`
- `deploy-webhook-fanout.yml`

### Contract validation coverage

The following 9 local Worker contracts are enforced today:

- `admin-studio-staging`
- `admin-studio-production`
- `schedule-worker`
- `video-cron`
- `synthetic-monitor`
- `lead-gen`
- `webhook-fanout`
- `daily-brief`
- `factory-supervisor`

### Current explicit exemptions

As of 2026-05-27, five deploy workflows are explicitly exempted in `scripts/validate-service-registry.mjs`:

- `deploy-latwoodtech-web.yml`
- `deploy-inbound-oracle.yml`
- `deploy-linkedin-publisher.yml`
- `deploy-factory-events-replay.yml`
- `deploy-qa-tools-ui.yml`

The goal is still to keep exemptions rare and named. If a local deploy workflow is real, it should either be covered or carry an explicit exemption with a written reason and removal path.

## What The Validator Does Not Do

The validator is intentionally not a deployment simulator.

It does not:

- inspect live Worker state in Cloudflare
- verify that a GitHub secret exists remotely
- verify the value stored in a Wrangler secret
- verify DNS propagation
- confirm that a custom domain is currently resolving everywhere
- replace direct HTTP health checks after deploy

Those concerns stay in deploy workflows, smoke checks, and manual/live verification.

## Common Failure Modes

### Failure: workflow not covered

Example shape:

```text
[validate-service-registry] .github/workflows/deploy-foo.yml: local deploy workflow is not covered by validate-service-registry.mjs
```

Meaning:

- a local deploy workflow exists
- the validator does not yet include it in `WORKFLOW_RULES`

Fix:

1. Add the workflow to `WORKFLOW_RULES`.
2. Add the corresponding registry entry or verification target if needed.
3. Re-run the validator.

### Failure: expected verification URL missing

Example shape:

```text
[validate-service-registry] .github/workflows/deploy-foo.yml: expected verification URL for foo (default) is https://example.com/health
```

Meaning:

- the deploy workflow is checking one URL
- the registry declares a different canonical verification target

Fix:

1. Decide which target is truly canonical.
2. Update either the workflow or `docs/service-registry.yml`.
3. Keep the registry as the source of truth for future edits.

### Failure: missing required secret entry

Example shape:

```text
[validate-service-registry] .github/workflows/deploy-foo.yml: foo is missing required_secrets entry JWT_SECRET
```

Meaning:

- the registry says the Worker requires that secret
- the deploy workflow text no longer provisions it or mention it

Fix:

1. Confirm whether the secret is truly required at runtime.
2. If it is required, explicitly provision it in the deploy workflow.
3. If it is no longer required, remove it from the registry only after confirming runtime code and deploy behavior both agree.

### Failure: missing required binding entry

Example shape:

```text
[validate-service-registry] apps/foo/wrangler.jsonc: foo is missing required_bindings entry BAR
```

Meaning:

- the registry says that binding is required
- the binding name was removed, renamed, or never declared in `wrangler.jsonc`

Fix:

1. Confirm the actual binding name in code and Wrangler config.
2. Restore the binding or update the registry to the real contract.

### Durable Object gotcha

Wrangler does not declare Durable Object bindings with `binding`.
It declares them with `name` and `class_name`.

The validator already handles this, but if you expand the script later, do not regress that logic.

## How To Add A New Worker To Contract Validation

Only add a Worker when its contract is explicit enough to stay high-signal.

Use this sequence:

1. Confirm the Worker already has a stable entry in `docs/service-registry.yml`.
2. Make sure its `required_secrets`, `required_vars`, and `required_bindings` are declared accurately.
3. Confirm the deploy workflow provisions required secrets explicitly and is not relying on hidden prior Worker state.
4. Add the Worker to `CONTRACT_RULES` in `scripts/validate-service-registry.mjs`.
5. Run `npm run validate:service-registry`.
6. If it fails, fix the underlying contract drift rather than weakening the validator.

## How To Decide Whether Something Belongs In The Registry Contract

A name belongs in `required_*` only if all of the following are true:

- the runtime actually depends on it for core behavior
- the deploy workflow is expected to provision or pass it intentionally
- drift would be operationally important

Do not put every optional knob into the required contract just because it exists in code.
The validator is supposed to stay useful, not exhaustive for its own sake.

## Operator Workflow For Registry Changes

When you change a covered service:

1. Update runtime code or `wrangler.jsonc`.
2. Update the deploy workflow if secret or verification behavior changed.
3. Update `docs/service-registry.yml` so the contract reflects the new truth.
4. Run `npm run validate:service-registry` locally.
5. Only then treat the control-plane change as complete.

## Related Files

- `docs/service-registry.yml`
- `scripts/validate-service-registry.mjs`
- `.github/workflows/validate-service-registry.yml`
- `.github/workflows/COORDINATION.md`

## Current Outcome

As of the current hardening pass, Factory has:

- 13 checked local deploy workflows
- 9 checked local Worker contracts
- 5 explicit exemptions

That is enough to materially reduce workflow/registry/Wrangler drift without turning the validator into a fake infrastructure simulator.
