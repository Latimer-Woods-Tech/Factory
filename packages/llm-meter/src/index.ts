import {
  FactoryBaseError,
  InternalError,
  toErrorResponse,
  type FactoryResponse,
} from '@latimer-woods-tech/errors';
import type { Logger } from '@latimer-woods-tech/logger';
import {
  complete as llmComplete,
  type LLMEnv,
  type LLMMessage,
  type LLMOptions,
  type LLMProvider,
  type LLMResult,
} from '@latimer-woods-tech/llm';

/**
 * Minimal D1 binding shape we depend on. Real callers pass a Cloudflare
 * `D1Database` binding; tests pass a stub.
 */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<{ success: boolean; meta?: unknown }>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
  };
}

/**
 * Supported subscription tiers for per-tenant monthly budget enforcement.
 */
export type TenantTier = 'free' | 'individual' | 'practitioner' | 'agency';

/**
 * Monthly LLM budget caps per subscription tier, in US cents.
 *
 * - free:         $0.50 — allows 1 synthesis + 5 questions, hard-stops abuse
 * - individual:   $3.00 — 3× headroom over expected $0.43 COGS
 * - practitioner: $35.00 — 60% of $97/mo MRR floor
 * - agency:       $150.00 — $30/seat × 5 seats
 */
export const TIER_BUDGET_CENTS: Record<TenantTier, number> = {
  free:          50,   // $0.50
  individual:    300,  // $3.00
  practitioner:  3500, // $35.00
  agency:        15000, // $150.00
};

/**
 * Budget configuration for a metered call.
 */
export interface BudgetConfig {
  /** Per-run hard cap in US cents. Default 500 ($5). */
  perRunCapCents?: number;
  /** Optional per-project monthly cap in US cents. No default — opt-in. */
  perProjectMonthlyCapCents?: number;
  /** Tenant identifier for per-tenant monthly budget enforcement. */
  tenantId?: string;
  /** Subscription tier used to look up the monthly cap in {@link TIER_BUDGET_CENTS}. */
  tenantTier?: TenantTier;
  /**
   * Callback invoked when the tenant crosses the 80% threshold.
   * Callers can use this to send admin email/Slack alerts.
   * Errors thrown by this callback are swallowed — alerting must never block the request.
   */
  onBudgetAlert?: (ctx: BudgetAlertContext) => Promise<void> | void;
}

/**
 * Context passed to {@link BudgetConfig.onBudgetAlert}.
 */
export interface BudgetAlertContext {
  tenantId: string;
  tier: TenantTier;
  /** Current month spend in cents. */
  spentCents: number;
  /** Monthly cap in cents for this tier. */
  capCents: number;
  /** Percentage of the cap already consumed (0–100). */
  percentUsed: number;
  /** Calendar month, e.g. "2026-05". */
  yyyyMm: string;
}

/**
 * Provenance stamped on every ledger row.
 */
/** Known actor values for {@link LedgerContext.actor}. */
export const KNOWN_ACTORS = ['human', 'sauna', 'copilot', 'supervisor-future', 'worker'] as const;

/** Known workload values for {@link LedgerContext.workload}. */
export const KNOWN_WORKLOADS = ['synthesis', 'planner', 'verifier', 'small'] as const;

export interface LedgerContext {
  project: string;
  /** One of {@link KNOWN_ACTORS}, or any custom string. */
  actor: string;
  runId?: string;
  /** One of {@link KNOWN_WORKLOADS}, or any custom string. */
  workload?: string;
}

/**
 * Options passed to {@link meteredComplete}. Extends {@link LLMOptions} with
 * ledger + budget fields.
 */
export interface MeteredOptions extends LLMOptions, LedgerContext {
  /** Required: overrides the optional `actor` in LLMOptions. */
  actor: string;
  /** Required: overrides the optional `project` in LLMOptions. */
  project: string;
  /**
   * Tenant identifier. When provided together with `tenantTier`, a per-tenant
   * monthly budget check is performed before the LLM call.
   */
  tenantId?: string;
  /**
   * Subscription tier used to look up the monthly cap in {@link TIER_BUDGET_CENTS}.
   * Required when `tenantId` is set.
   */
  tenantTier?: TenantTier;
  budget?: BudgetConfig;
}

/**
 * Row shape matching the D1 schema.
 */
export interface LedgerRow {
  project: string;
  actor: string;
  /** Tenant identifier for per-tenant monthly budget enforcement. */
  tenantId?: string;
  runId?: string;
  workload?: string;
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  costCents: number;
  latencyMs: number;
}

export interface RunTotals {
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

const DEFAULT_RUN_CAP_CENTS = 500;

// Pricing in micro-dollars per 1M tokens (USD × 10_000 to keep ints).
// Keep in sync with provider pricing pages; update on price changes.
// Sources (2026-05): anthropic.com/pricing, cloud.google.com/vertex-ai/pricing, groq.com/pricing
const PRICING_UCENTS_PER_MTOK: Record<string, { input: number; output: number; cachedInput?: number }> = {
  // Anthropic
  'claude-haiku-4-20250514':   { input: 80,    output: 400,   cachedInput: 8 },
  'claude-sonnet-4-20250514':  { input: 300,   output: 1500,  cachedInput: 30 },
  'claude-opus-4-20250514':    { input: 1500,  output: 7500,  cachedInput: 150 },
  // Google
  'gemini-2.5-pro':            { input: 125,   output: 500 },
  'gemini-1.5-flash':          { input: 8,     output: 30 },
  // Groq
  'llama-3.3-70b-versatile':   { input: 59,    output: 79 },
};

/**
 * Compute cost in US cents from tokens. `cached_input_tokens` bill at a
 * discounted rate when the provider exposes one.
 */
export function computeCostCents(
  model: string,
  input: number,
  output: number,
  cachedInput = 0,
): number {
  const p = PRICING_UCENTS_PER_MTOK[model];
  if (!p) return 0; // unknown model — record 0 and log a warning upstream
  const billableInput = Math.max(0, input - cachedInput);
  const inputUcents = (billableInput / 1_000_000) * p.input;
  const cachedUcents = p.cachedInput ? (cachedInput / 1_000_000) * p.cachedInput : 0;
  const outputUcents = (output / 1_000_000) * p.output;
  const totalUcents = inputUcents + cachedUcents + outputUcents;
  return Math.ceil(totalUcents / 100); // 1 cent = 100 ucents
}

function currentYyyyMm(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Write one ledger row. Swallows D1 errors and logs — metering must never
 * block a successful LLM call from returning.
 */
export async function recordCall(
  db: D1Like,
  row: LedgerRow,
  deps: { logger?: Logger; now?: () => number } = {},
): Promise<void> {
  const now = deps.now?.() ?? Date.now();
  try {
    await db
      .prepare(
        `INSERT INTO llm_ledger
         (project, actor, tenant_id, run_id, workload, provider, model,
          input_tokens, cached_input_tokens, output_tokens,
          cost_cents, latency_ms, at, yyyy_mm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.project,
        row.actor,
        row.tenantId ?? null,
        row.runId ?? null,
        row.workload ?? null,
        row.provider,
        row.model,
        row.inputTokens,
        row.cachedInputTokens ?? 0,
        row.outputTokens,
        row.costCents,
        row.latencyMs,
        now,
        currentYyyyMm(new Date(now)),
      )
      .run();
  } catch (e) {
    deps.logger?.error?.('llm-meter.record.failed', {
      error: e instanceof Error ? e.message : String(e),
      row,
    });
  }
}

/**
 * Get cost + token totals for a run so far.
 */
export async function getRunTotal(db: D1Like, runId: string): Promise<RunTotals> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_cents), 0) AS cost_cents,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COUNT(*) AS call_count
       FROM llm_ledger WHERE run_id = ?`,
    )
    .bind(runId)
    .first<{ cost_cents: number; input_tokens: number; output_tokens: number; call_count: number }>();
  return {
    costCents: Number(row?.cost_cents ?? 0),
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    callCount: Number(row?.call_count ?? 0),
  };
}

/**
 * Get cost total for a (project, yyyy-mm) bucket.
 */
export async function getProjectMonthTotal(
  db: D1Like,
  project: string,
  yyyyMm: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_cents), 0) AS cost_cents
       FROM llm_ledger WHERE project = ? AND yyyy_mm = ?`,
    )
    .bind(project, yyyyMm)
    .first<{ cost_cents: number }>();
  return Number(row?.cost_cents ?? 0);
}

/**
 * Get cost total for a (tenant_id, yyyy-mm) bucket.
 * Uses the `tenant_id` column added by migration 0002.
 */
export async function getTenantMonthTotal(
  db: D1Like,
  tenantId: string,
  yyyyMm: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_cents), 0) AS cost_cents
       FROM llm_ledger WHERE tenant_id = ? AND yyyy_mm = ?`,
    )
    .bind(tenantId, yyyyMm)
    .first<{ cost_cents: number }>();
  return Number(row?.cost_cents ?? 0);
}

/**
 * Assert that the tenant has not exceeded their monthly tier budget.
 *
 * Thresholds:
 * - ≥ 80 %: calls `opts.onBudgetAlert` (fire-and-forget; never throws) **and**
 *   writes a `BUDGET_ALERT` row to `tenant_budget_warnings`.
 * - ≥ 90 %: logs a `BUDGET_WARNING` event via `deps.logger` **and**
 *   writes a `BUDGET_WARNING` row to `tenant_budget_warnings`.
 * - ≥ 100 %: throws `BUDGET_EXCEEDED` (HTTP 429).
 *
 * Warning rows in `tenant_budget_warnings` are best-effort; write failures are
 * swallowed so that metering never blocks a valid request.
 */
export async function assertTenantBudget(
  db: D1Like,
  tenantId: string,
  tier: TenantTier,
  opts: {
    yyyyMm?: string;
    onBudgetAlert?: (ctx: BudgetAlertContext) => Promise<void> | void;
  } = {},
  deps: { logger?: Logger; now?: () => number } = {},
): Promise<void> {
  const nowMs = deps.now?.() ?? Date.now();
  const now = new Date(nowMs);
  const yyyyMm = opts.yyyyMm ?? currentYyyyMm(now);
  const capCents = TIER_BUDGET_CENTS[tier];
  const spentCents = await getTenantMonthTotal(db, tenantId, yyyyMm);
  const percentUsed = capCents > 0 ? (spentCents / capCents) * 100 : 0;

  if (percentUsed >= 80) {
    const alertCtx: BudgetAlertContext = {
      tenantId,
      tier,
      spentCents,
      capCents,
      percentUsed,
      yyyyMm,
    };

    // Persist warning row for admin dashboards (best-effort)
    const event = percentUsed >= 90 ? 'BUDGET_WARNING' : 'BUDGET_ALERT';
    db.prepare(
      `INSERT INTO tenant_budget_warnings
       (tenant_id, tier, event, spent_cents, cap_cents, percent_used, yyyy_mm, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(tenantId, tier, event, spentCents, capCents, Math.round(percentUsed), yyyyMm, nowMs)
      .run()
      .catch((e: unknown) => {
        deps.logger?.error?.('llm-meter.budget.warning.insert.failed', {
          error: e instanceof Error ? e.message : String(e),
          tenantId,
        });
      });

    // Fire alert callback (fire-and-forget — never blocks the request path)
    if (opts.onBudgetAlert) {
      Promise.resolve(opts.onBudgetAlert(alertCtx)).catch((e: unknown) => {
        deps.logger?.error?.('llm-meter.budget.alert.failed', {
          error: e instanceof Error ? e.message : String(e),
          tenantId,
        });
      });
    }
  }

  if (percentUsed >= 90) {
    deps.logger?.warn?.('llm-meter.budget.warning', {
      event: 'BUDGET_WARNING',
      tenantId,
      tier,
      spentCents,
      capCents,
      percentUsed: Math.round(percentUsed),
      yyyyMm,
    });
  }

  if (spentCents >= capCents) {
    throw new FactoryBaseError(
      'BUDGET_EXCEEDED',
      `tenant ${tenantId} (${tier}) hit $${(capCents / 100).toFixed(2)} monthly cap (spent $${(spentCents / 100).toFixed(2)})`,
      429,
      false,
      { tenantId, tier, capCents, spentCents, yyyyMm },
    );
  }
}

/**
 * Throws `BUDGET_EXCEEDED` if the run's running total already equals or
 * exceeds the cap. Called before executing an LLM call.
 */
export async function assertRunBudget(
  db: D1Like,
  runId: string,
  maxCents = DEFAULT_RUN_CAP_CENTS,
): Promise<void> {
  const totals = await getRunTotal(db, runId);
  if (totals.costCents >= maxCents) {
    throw new FactoryBaseError(
      'BUDGET_EXCEEDED',
      `run ${runId} hit $${(maxCents / 100).toFixed(2)} cap (spent $${(totals.costCents / 100).toFixed(2)} across ${String(totals.callCount)} calls)`,
      429,
      false,
      { runId, maxCents, actual: totals.costCents, callCount: totals.callCount },
    );
  }
}

/**
 * Metered wrapper around `@latimer-woods-tech/llm`'s `complete`. Checks the
 * per-run budget before the call (short-circuits with `BUDGET_EXCEEDED` if
 * exceeded), then records one ledger row after success.
 *
 * When `opts.tenantId` and `opts.tenantTier` are provided, a per-tenant
 * monthly budget check is also performed. At 80% the `onBudgetAlert` callback
 * fires (admin email/Slack); at 90% a `BUDGET_WARNING` log event is emitted;
 * at 100% the call short-circuits with `BUDGET_EXCEEDED` (HTTP 429).
 *
 * On LLM failure, no ledger row is written — we only bill for completed work.
 */
export async function meteredComplete(
  db: D1Like,
  messages: LLMMessage[],
  env: LLMEnv,
  opts: MeteredOptions,
  deps: { fetch?: typeof fetch; logger?: Logger; now?: () => number } = {},
): Promise<FactoryResponse<LLMResult>> {
  const cap = opts.budget?.perRunCapCents ?? DEFAULT_RUN_CAP_CENTS;

  // Per-run budget check
  if (opts.runId) {
    try {
      await assertRunBudget(db, opts.runId, cap);
    } catch (e) {
      if (e instanceof FactoryBaseError) return toErrorResponse(e);
      return toErrorResponse(
        new InternalError('budget check failed', { error: e instanceof Error ? e.message : String(e) }),
      );
    }
  }

  // Per-tenant monthly budget check
  const tenantId = opts.tenantId ?? opts.budget?.tenantId;
  const tenantTier = opts.tenantTier ?? opts.budget?.tenantTier;
  if (tenantId && tenantTier) {
    try {
      await assertTenantBudget(
        db,
        tenantId,
        tenantTier,
        { onBudgetAlert: opts.budget?.onBudgetAlert },
        deps,
      );
    } catch (e) {
      if (e instanceof FactoryBaseError) return toErrorResponse(e);
      return toErrorResponse(
        new InternalError('tenant budget check failed', { error: e instanceof Error ? e.message : String(e) }),
      );
    }
  }

  const llmResp = await llmComplete(messages, env, opts, deps);
  if (llmResp.error || !llmResp.data) return llmResp;

  const d = llmResp.data;
  const cost = computeCostCents(d.model, d.tokens.input, d.tokens.output, d.tokens.cacheRead ?? 0);
  await recordCall(
    db,
    {
      project: opts.project,
      actor: opts.actor,
      tenantId: tenantId ?? undefined,
      runId: opts.runId,
      workload: opts.workload,
      provider: d.provider,
      model: d.model,
      inputTokens: d.tokens.input,
      cachedInputTokens: d.tokens.cacheRead ?? 0,
      outputTokens: d.tokens.output,
      costCents: cost,
      latencyMs: d.latency,
    },
    { logger: deps.logger, now: deps.now },
  );

  return llmResp;
}

export {
  PRICING_UCENTS_PER_MTOK,
  DEFAULT_RUN_CAP_CENTS,
};
