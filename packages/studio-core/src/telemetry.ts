/**
 * Factory Admin Telemetry Contract — types, validators, and coverage matrix.
 *
 * Every Factory app MUST expose three endpoints under `/api/admin/`:
 *   GET /api/admin/health   — SLO status and operational health
 *   GET /api/admin/metrics  — Financial and user-growth metrics
 *   GET /api/admin/events   — Recent significant events and anomalies
 *
 * This module provides:
 *  1. TypeScript types for each endpoint's response payload.
 *  2. Structural validators that return a human-readable reason on failure.
 *  3. Coverage matrix types so Studio can surface which apps comply.
 *
 * @see docs/packages/factory-admin-telemetry-contract.mdx — full contract spec
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Traffic-light status used by both health and dependency checks. */
export type TelemetryStatus = 'green' | 'yellow' | 'red';

/** The three canonical telemetry endpoint paths every Factory app must serve. */
export const TELEMETRY_ENDPOINTS = [
  '/api/admin/health',
  '/api/admin/metrics',
  '/api/admin/events',
] as const;

export type TelemetryEndpointPath = (typeof TELEMETRY_ENDPOINTS)[number];

// ---------------------------------------------------------------------------
// /api/admin/health
// ---------------------------------------------------------------------------

export interface TelemetryLatency {
  p50: number;
  p95: number;
  p99: number;
}

export interface TelemetryHealthMetricDetails {
  requests_1h: number;
  errors_1h: number;
  latency: TelemetryLatency;
  /** Dependency status: 'green'/'yellow'/'red' from SLO, or 'unknown' when unreachable. */
  external_dependencies: Record<string, TelemetryStatus | 'unknown'>;
}

/**
 * Response schema for `GET /api/admin/health`.
 *
 * Rules for `status` derivation:
 *   - **green**: SLO on track AND error budget >10% remaining AND no degraded deps
 *   - **yellow**: SLO at risk (budget ≤10%) OR one dep degraded
 *   - **red**: SLO violated OR budget exhausted OR critical dep down
 */
export interface TelemetryHealthResponse {
  status: TelemetryStatus;
  slo_status: TelemetryStatus;
  /** % of monthly error budget consumed, 0–100. */
  error_budget_used_pct: number;
  /** p99 API latency in milliseconds. */
  p99_latency_ms: number;
  /** % of requests returning 5xx or timeout in the last hour. */
  error_rate_pct: number;
  /** % uptime this calendar month. */
  uptime_pct: number;
  /** ISO 8601 timestamp of the most recent P1/P2 incident, or null. */
  last_incident_at: string | null;
  metric_details: TelemetryHealthMetricDetails;
  /** ISO 8601 timestamp when this snapshot was generated. */
  timestamp: string;
}

/**
 * Validate a health endpoint response payload.
 * Returns `null` on success or a human-readable reason string on failure.
 */
export function validateTelemetryHealth(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'response must be an object';
  const r = raw as Record<string, unknown>;

  for (const field of ['status', 'slo_status'] as const) {
    if (r[field] !== 'green' && r[field] !== 'yellow' && r[field] !== 'red') {
      return `${field} must be "green", "yellow", or "red"`;
    }
  }
  for (const field of ['error_budget_used_pct', 'p99_latency_ms', 'error_rate_pct', 'uptime_pct'] as const) {
    if (typeof r[field] !== 'number') return `${field} must be a number`;
  }
  if (r.last_incident_at !== null && typeof r.last_incident_at !== 'string') {
    return 'last_incident_at must be an ISO 8601 string or null';
  }
  if (!r.metric_details || typeof r.metric_details !== 'object') {
    return 'metric_details must be an object';
  }
  const md = r.metric_details as Record<string, unknown>;
  if (typeof md.requests_1h !== 'number') return 'metric_details.requests_1h must be a number';
  if (typeof md.errors_1h !== 'number') return 'metric_details.errors_1h must be a number';
  if (!md.latency || typeof md.latency !== 'object') return 'metric_details.latency must be an object';
  const lat = md.latency as Record<string, unknown>;
  for (const p of ['p50', 'p95', 'p99'] as const) {
    if (typeof lat[p] !== 'number') return `metric_details.latency.${p} must be a number`;
  }
  if (!md.external_dependencies || typeof md.external_dependencies !== 'object') {
    return 'metric_details.external_dependencies must be an object';
  }
  if (typeof r.timestamp !== 'string') return 'timestamp must be an ISO 8601 string';
  return null;
}

// ---------------------------------------------------------------------------
// /api/admin/metrics
// ---------------------------------------------------------------------------

export interface TelemetryPeriod {
  /** ISO 8601 start of the reporting period. */
  start: string;
  /** ISO 8601 end of the reporting period. */
  end: string;
  /** Human-readable label, e.g. "This week (Apr 21–28)". */
  label: string;
}

export interface TelemetryRevenue {
  total_usd: number;
  new_subscriptions_usd: number;
  recurring_revenue_usd: number;
  chargebacks_usd: number;
  refunds_usd: number;
}

export interface TelemetryUsers {
  total_count: number;
  new_this_period: number;
  active_this_period: number;
  churn_rate_pct: number;
  ltv_usd: number;
}

/** App-specific engagement KPIs (up to 3). */
export interface TelemetryEngagement {
  key_kpi_1_label: string;
  key_kpi_1_value: number;
  key_kpi_2_label?: string;
  key_kpi_2_value?: number;
  key_kpi_3_label?: string;
  key_kpi_3_value?: number;
}

export interface TelemetryTopIssue {
  category: string;
  count: number;
  impact: string;
  status: 'investigating' | 'mitigating' | 'resolved' | 'monitoring';
  action_url?: string;
}

/**
 * Response schema for `GET /api/admin/metrics`.
 */
export interface TelemetryMetricsResponse {
  period: TelemetryPeriod;
  revenue: TelemetryRevenue;
  users: TelemetryUsers;
  engagement: TelemetryEngagement;
  top_issues: TelemetryTopIssue[];
  /** ISO 8601 timestamp when this snapshot was generated. */
  timestamp: string;
}

/**
 * Validate a metrics endpoint response payload.
 * Returns `null` on success or a human-readable reason string on failure.
 */
export function validateTelemetryMetrics(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'response must be an object';
  const r = raw as Record<string, unknown>;

  if (!r.period || typeof r.period !== 'object') return 'period must be an object';
  const period = r.period as Record<string, unknown>;
  for (const f of ['start', 'end', 'label'] as const) {
    if (typeof period[f] !== 'string') return `period.${f} must be a string`;
  }

  if (!r.revenue || typeof r.revenue !== 'object') return 'revenue must be an object';
  const rev = r.revenue as Record<string, unknown>;
  for (const f of ['total_usd', 'new_subscriptions_usd', 'recurring_revenue_usd', 'chargebacks_usd', 'refunds_usd'] as const) {
    if (typeof rev[f] !== 'number') return `revenue.${f} must be a number`;
  }

  if (!r.users || typeof r.users !== 'object') return 'users must be an object';
  const users = r.users as Record<string, unknown>;
  for (const f of ['total_count', 'new_this_period', 'active_this_period', 'churn_rate_pct', 'ltv_usd'] as const) {
    if (typeof users[f] !== 'number') return `users.${f} must be a number`;
  }

  if (!r.engagement || typeof r.engagement !== 'object') return 'engagement must be an object';
  const eng = r.engagement as Record<string, unknown>;
  if (typeof eng.key_kpi_1_label !== 'string') return 'engagement.key_kpi_1_label must be a string';
  if (typeof eng.key_kpi_1_value !== 'number') return 'engagement.key_kpi_1_value must be a number';

  if (!Array.isArray(r.top_issues)) return 'top_issues must be an array';

  if (typeof r.timestamp !== 'string') return 'timestamp must be an ISO 8601 string';
  return null;
}

// ---------------------------------------------------------------------------
// /api/admin/events
// ---------------------------------------------------------------------------

/** Standard event type identifiers for the telemetry events endpoint. */
export type TelemetryEventType =
  | 'new_user'
  | 'subscription_started'
  | 'transaction_succeeded'
  | 'transaction_failed'
  | 'chargeback'
  | 'refund'
  | 'payout_issued'
  | 'payout_failed'
  | 'api_error'
  | 'high_latency'
  | 'external_api_failure'
  | 'abuse_detected'
  | 'data_anomaly'
  | 'feature_error';

export type TelemetryEventSeverity = 'info' | 'warning' | 'error';

export interface TelemetryEvent {
  /** Standard type identifier or an app-specific string. */
  type: string;
  label: string;
  count: number;
  timestamp: string;
  severity: TelemetryEventSeverity;
  trend: string;
  action_url?: string;
}

/**
 * Response schema for `GET /api/admin/events`.
 */
export interface TelemetryEventsResponse {
  events: TelemetryEvent[];
  /** ISO 8601 timestamp when this snapshot was generated. */
  timestamp: string;
}

/**
 * Validate an events endpoint response payload.
 * Returns `null` on success or a human-readable reason string on failure.
 */
export function validateTelemetryEvents(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'response must be an object';
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.events)) return 'events must be an array';
  // Cast the array items through unknown to avoid implicit-any spreading
  const events = r.events as unknown[];
  for (let i = 0; i < events.length; i++) {
    const raw_ev = events[i];
    if (!raw_ev || typeof raw_ev !== 'object') return `events[${i}] must be an object`;
    const ev = raw_ev as Record<string, unknown>;
    if (typeof ev.type !== 'string' || !ev.type) return `events[${i}].type must be a non-empty string`;
    if (typeof ev.label !== 'string') return `events[${i}].label must be a string`;
    if (typeof ev.count !== 'number') return `events[${i}].count must be a number`;
    if (typeof ev.timestamp !== 'string') return `events[${i}].timestamp must be a string`;
    if (ev.severity !== 'info' && ev.severity !== 'warning' && ev.severity !== 'error') {
      return `events[${i}].severity must be "info", "warning", or "error"`;
    }
    if (typeof ev.trend !== 'string') return `events[${i}].trend must be a string`;
  }

  if (typeof r.timestamp !== 'string') return 'timestamp must be an ISO 8601 string';
  return null;
}

// ---------------------------------------------------------------------------
// Coverage matrix
// ---------------------------------------------------------------------------

/**
 * Compliance status for a single telemetry endpoint on one app.
 *
 *  - `compliant`   — endpoint responds with a contract-valid schema
 *  - `schema_drift` — endpoint responds but schema deviates from contract
 *  - `missing`     — endpoint returns 404 or is not declared
 *  - `error`       — endpoint returns 5xx or network failure
 *  - `unknown`     — not yet checked
 */
export type TelemetryCoverageStatus =
  | 'compliant'
  | 'schema_drift'
  | 'missing'
  | 'error'
  | 'unknown';

/**
 * Per-endpoint check result for one app.
 */
export interface TelemetryEndpointCoverage {
  path: TelemetryEndpointPath;
  status: TelemetryCoverageStatus;
  /** HTTP status code returned (0 when not reachable). */
  httpStatus?: number;
  /** Round-trip latency in ms. */
  latencyMs?: number;
  /** Human-readable reason when status is not 'compliant'. */
  reason?: string;
  /** ISO 8601 timestamp when the check was last run. */
  checkedAt?: string;
}

/**
 * Full telemetry coverage row for one Factory app.
 */
export interface AppTelemetryCoverage {
  /** Stable app id matching docs/service-registry.yml. */
  appId: string;
  /** Human-readable label. */
  label: string;
  /** Base URL used to probe the telemetry endpoints. */
  baseUrl: string;
  /** Per-endpoint results (always three entries, one per TELEMETRY_ENDPOINTS). */
  endpoints: [
    TelemetryEndpointCoverage, // /api/admin/health
    TelemetryEndpointCoverage, // /api/admin/metrics
    TelemetryEndpointCoverage, // /api/admin/events
  ];
  /**
   * Rolled-up compliance flag:
   *   - `compliant`    all three endpoints pass
   *   - `partial`      one or two pass
   *   - `non_compliant` none pass
   *   - `unknown`      no checks run yet
   */
  overall: 'compliant' | 'partial' | 'non_compliant' | 'unknown';
  /** ISO 8601 timestamp of the most recent check. */
  lastCheckedAt?: string;
}

/**
 * Portfolio-level coverage matrix — one row per Factory app.
 * Used by Studio's Observability tab to surface non-compliant apps.
 */
export interface TelemetryCoverageMatrix {
  /** ISO 8601 when the matrix was built. */
  generatedAt: string;
  rows: AppTelemetryCoverage[];
  /** Total count of apps that are fully compliant. */
  compliantCount: number;
  /** Total count of apps that are partially or fully non-compliant. */
  nonCompliantCount: number;
  /** Total count of apps that have not been checked yet. */
  unknownCount: number;
}

/**
 * Build an `AppTelemetryCoverage` stub with all endpoints set to `'unknown'`.
 *
 * Use this to seed the coverage matrix before running live probes.
 */
export function makeUnknownAppCoverage(appId: string, label: string, baseUrl: string): AppTelemetryCoverage {
  const [health, metrics, events] = TELEMETRY_ENDPOINTS.map<TelemetryEndpointCoverage>((path) => ({
    path,
    status: 'unknown' as const,
  }));
  return {
    appId,
    label,
    baseUrl,
    endpoints: [health!, metrics!, events!],
    overall: 'unknown',
  };
}

/**
 * Derive the rolled-up `overall` compliance status from per-endpoint results.
 */
export function deriveOverallCoverage(
  endpoints: AppTelemetryCoverage['endpoints'],
): AppTelemetryCoverage['overall'] {
  const statuses = endpoints.map((e) => e.status);
  if (statuses.every((s) => s === 'unknown')) return 'unknown';
  const compliantCount = statuses.filter((s) => s === 'compliant').length;
  if (compliantCount === TELEMETRY_ENDPOINTS.length) return 'compliant';
  if (compliantCount === 0) return 'non_compliant';
  return 'partial';
}

/**
 * Build a `TelemetryCoverageMatrix` from an array of per-app coverage rows.
 */
export function buildCoverageMatrix(rows: AppTelemetryCoverage[]): TelemetryCoverageMatrix {
  let compliantCount = 0;
  let nonCompliantCount = 0;
  let unknownCount = 0;
  for (const row of rows) {
    if (row.overall === 'compliant') compliantCount++;
    else if (row.overall === 'unknown') unknownCount++;
    else nonCompliantCount++;
  }
  return {
    generatedAt: new Date().toISOString(),
    rows,
    compliantCount,
    nonCompliantCount,
    unknownCount,
  };
}
