# Changelog

## 0.2.0 — 2026-05-05

Per-tenant monthly budget guardrails (closes factory#issue — "Add per-tenant LLM budget guardrails before Practitioner-tier scale").

### Added

- `TenantTier` type (`'free' | 'individual' | 'practitioner' | 'agency'`).
- `TIER_BUDGET_CENTS` constant — monthly LLM caps per tier in US cents:
  - free: $0.50, individual: $3.00, practitioner: $35.00, agency: $150.00.
- `getTenantMonthTotal(db, tenantId, yyyyMm)` — queries `SUM(cost_cents)` partitioned by `tenant_id + yyyy_mm`.
- `assertTenantBudget(db, tenantId, tier, opts, deps)` — three-level enforcement:
  - ≥ 80 %: calls `opts.onBudgetAlert` callback (admin email/Slack); errors in the callback are swallowed.
  - ≥ 90 %: emits `BUDGET_WARNING` log event via `deps.logger`.
  - ≥ 100 %: throws `BUDGET_EXCEEDED` (HTTP 429).
- `BudgetAlertContext` interface — passed to the `onBudgetAlert` callback.
- `tenantId` and `tenantTier` fields on `MeteredOptions` — when both are provided, `meteredComplete` runs the per-tenant check before the LLM call.
- `tenantId` field on `LedgerRow` — stored in the `tenant_id` column for aggregation queries.
- `onBudgetAlert` callback on `BudgetConfig` — fire-and-forget hook for threshold notifications.
- Migration `migrations/0002_tenant_budget.sql`:
  - `ALTER TABLE llm_ledger ADD COLUMN tenant_id TEXT` + index.
  - New `tenant_budget_warnings` table for admin dashboard queries.

### Design notes

- **Alert/warning callbacks never block the request.** `onBudgetAlert` errors are caught and logged.
- **Tenant check is opt-in.** Calls without `tenantId` + `tenantTier` skip the per-tenant SELECT entirely.
- **Budget tiers live in-repo.** Rate changes → bump `TIER_BUDGET_CENTS` → publish a minor release.

---

## 0.1.1 — 2026-05-03

Patch: added `PRICING_UCENTS_PER_MTOK` and `DEFAULT_RUN_CAP_CENTS` to public exports.

## 0.1.0 — 2026-05-02

Initial release. Implements **SUP-2.2** per `docs/architecture/FACTORY_V1.md § LLM substrate`
and factory#102.

### Added

- `meteredComplete()` — wrapper around `@latimer-woods-tech/llm@^0.3.0`'s `complete()` that
  enforces per-run budget before the call and records one D1 ledger row after success.
- `recordCall()`, `getRunTotal()`, `getProjectMonthTotal()`, `assertRunBudget()` — low-level
  ledger primitives for consumers that need custom flows.
- `computeCostCents()` — pure function mapping `(model, input, output, cachedInput)` to cents,
  with a `PRICING_UCENTS_PER_MTOK` catalogue covering every model the `llm` package routes to.
- `BUDGET_EXCEEDED` error code (FactoryBaseError subclass carrying `{ runId, maxCents, actual, callCount }`).
- D1 migration `migrations/0001_init.sql` — `llm_ledger` table + 3 indexes
  (`project+yyyy_mm`, `run_id`, `actor+yyyy_mm`).

### Design notes

- **Metering is never blocking on output.** If the D1 insert fails, we log `llm-meter.record.failed`
  and return the LLM response anyway. Losing a ledger row is strictly preferable to losing a completion.
- **No ledger row on LLM failure.** We only bill for work that produced content.
- **Budget check is opt-out.** Calls without `runId` skip the pre-call SELECT; callers that want
  strict project-level enforcement can `assertRunBudget` themselves.
- **Pricing rate card lives in-repo.** Provider price moves → bump the catalogue → publish a
  patch release. No runtime fetch.
