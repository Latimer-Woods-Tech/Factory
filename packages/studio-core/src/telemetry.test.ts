import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_ENDPOINTS,
  validateTelemetryHealth,
  validateTelemetryMetrics,
  validateTelemetryEvents,
  makeUnknownAppCoverage,
  deriveOverallCoverage,
  buildCoverageMatrix,
  type TelemetryHealthResponse,
  type TelemetryMetricsResponse,
  type TelemetryEventsResponse,
  type AppTelemetryCoverage,
} from './telemetry.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validHealth: TelemetryHealthResponse = {
  status: 'green',
  slo_status: 'green',
  error_budget_used_pct: 3.2,
  p99_latency_ms: 180,
  error_rate_pct: 0.05,
  uptime_pct: 99.98,
  last_incident_at: '2026-04-26T08:00:00Z',
  metric_details: {
    requests_1h: 45000,
    errors_1h: 22,
    latency: { p50: 50, p95: 140, p99: 180 },
    external_dependencies: { database: 'green', stripe: 'green', neon: 'green' },
  },
  timestamp: '2026-04-28T14:22:00Z',
};

const validMetrics: TelemetryMetricsResponse = {
  period: {
    start: '2026-04-21T00:00:00Z',
    end: '2026-04-28T23:59:59Z',
    label: 'This week (Apr 21–28)',
  },
  revenue: {
    total_usd: 125400.5,
    new_subscriptions_usd: 45000,
    recurring_revenue_usd: 80400.5,
    chargebacks_usd: 0,
    refunds_usd: 2300,
  },
  users: {
    total_count: 8923,
    new_this_period: 245,
    active_this_period: 5600,
    churn_rate_pct: 2.1,
    ltv_usd: 450.25,
  },
  engagement: {
    key_kpi_1_label: 'Videos watched',
    key_kpi_1_value: 150230,
  },
  top_issues: [],
  timestamp: '2026-04-28T14:22:00Z',
};

const validEvents: TelemetryEventsResponse = {
  events: [
    {
      type: 'new_user',
      label: 'New users (last hour)',
      count: 23,
      timestamp: '2026-04-28T14:00:00Z',
      severity: 'info',
      trend: 'up 15% vs avg',
    },
    {
      type: 'api_error',
      label: 'API errors (5xx)',
      count: 12,
      timestamp: '2026-04-28T13:30:00Z',
      severity: 'error',
      trend: 'spike detected',
      action_url: '/admin/errors',
    },
  ],
  timestamp: '2026-04-28T14:22:00Z',
};

// ---------------------------------------------------------------------------
// TELEMETRY_ENDPOINTS
// ---------------------------------------------------------------------------

describe('TELEMETRY_ENDPOINTS', () => {
  it('declares exactly three canonical paths', () => {
    expect(TELEMETRY_ENDPOINTS).toHaveLength(3);
    expect(TELEMETRY_ENDPOINTS).toContain('/api/admin/health');
    expect(TELEMETRY_ENDPOINTS).toContain('/api/admin/metrics');
    expect(TELEMETRY_ENDPOINTS).toContain('/api/admin/events');
  });
});

// ---------------------------------------------------------------------------
// validateTelemetryHealth
// ---------------------------------------------------------------------------

describe('validateTelemetryHealth', () => {
  it('accepts a valid health payload', () => {
    expect(validateTelemetryHealth(validHealth)).toBeNull();
  });

  it('rejects null', () => {
    expect(validateTelemetryHealth(null)).toMatch(/object/);
  });

  it('rejects an invalid status', () => {
    expect(validateTelemetryHealth({ ...validHealth, status: 'ok' })).toMatch(/status/);
  });

  it('rejects an invalid slo_status', () => {
    expect(validateTelemetryHealth({ ...validHealth, slo_status: 'unknown' })).toMatch(/slo_status/);
  });

  it('rejects non-numeric error_budget_used_pct', () => {
    expect(validateTelemetryHealth({ ...validHealth, error_budget_used_pct: 'high' })).toMatch(
      /error_budget_used_pct/,
    );
  });

  it('accepts null last_incident_at', () => {
    expect(validateTelemetryHealth({ ...validHealth, last_incident_at: null })).toBeNull();
  });

  it('rejects non-string last_incident_at', () => {
    expect(validateTelemetryHealth({ ...validHealth, last_incident_at: 123 })).toMatch(/last_incident_at/);
  });

  it('rejects missing metric_details', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { metric_details: _md, ...rest } = validHealth;
    expect(validateTelemetryHealth(rest)).toMatch(/metric_details/);
  });

  it('rejects missing latency p50', () => {
    const broken = {
      ...validHealth,
      metric_details: {
        ...validHealth.metric_details,
        latency: { p95: 140, p99: 180 },
      },
    };
    expect(validateTelemetryHealth(broken)).toMatch(/p50/);
  });

  it('rejects missing external_dependencies', () => {
    const broken = {
      ...validHealth,
      metric_details: {
        ...validHealth.metric_details,
        external_dependencies: undefined,
      },
    };
    expect(validateTelemetryHealth(broken)).toMatch(/external_dependencies/);
  });

  it('rejects missing timestamp', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { timestamp: _ts0, ...rest } = validHealth;
    expect(validateTelemetryHealth(rest)).toMatch(/timestamp/);
  });
});

// ---------------------------------------------------------------------------
// validateTelemetryMetrics
// ---------------------------------------------------------------------------

describe('validateTelemetryMetrics', () => {
  it('accepts a valid metrics payload', () => {
    expect(validateTelemetryMetrics(validMetrics)).toBeNull();
  });

  it('rejects null', () => {
    expect(validateTelemetryMetrics(null)).toMatch(/object/);
  });

  it('rejects missing period', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { period: _p, ...rest } = validMetrics;
    expect(validateTelemetryMetrics(rest)).toMatch(/period/);
  });

  it('rejects non-string period.label', () => {
    expect(
      validateTelemetryMetrics({ ...validMetrics, period: { ...validMetrics.period, label: 42 } }),
    ).toMatch(/period.label/);
  });

  it('rejects non-numeric revenue.total_usd', () => {
    expect(
      validateTelemetryMetrics({
        ...validMetrics,
        revenue: { ...validMetrics.revenue, total_usd: 'lots' },
      }),
    ).toMatch(/revenue.total_usd/);
  });

  it('rejects non-numeric users.churn_rate_pct', () => {
    expect(
      validateTelemetryMetrics({
        ...validMetrics,
        users: { ...validMetrics.users, churn_rate_pct: null },
      }),
    ).toMatch(/users.churn_rate_pct/);
  });

  it('rejects missing engagement.key_kpi_1_label', () => {
    const broken = {
      ...validMetrics,
      engagement: { key_kpi_1_value: 100 },
    };
    expect(validateTelemetryMetrics(broken)).toMatch(/key_kpi_1_label/);
  });

  it('rejects top_issues that is not an array', () => {
    expect(validateTelemetryMetrics({ ...validMetrics, top_issues: 'none' })).toMatch(/top_issues/);
  });

  it('rejects missing timestamp', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { timestamp: _ts1, ...rest } = validMetrics;
    expect(validateTelemetryMetrics(rest)).toMatch(/timestamp/);
  });
});

// ---------------------------------------------------------------------------
// validateTelemetryEvents
// ---------------------------------------------------------------------------

describe('validateTelemetryEvents', () => {
  it('accepts a valid events payload', () => {
    expect(validateTelemetryEvents(validEvents)).toBeNull();
  });

  it('accepts an empty events array', () => {
    expect(validateTelemetryEvents({ events: [], timestamp: '2026-04-28T14:22:00Z' })).toBeNull();
  });

  it('rejects null', () => {
    expect(validateTelemetryEvents(null)).toMatch(/object/);
  });

  it('rejects non-array events', () => {
    expect(validateTelemetryEvents({ events: 'none', timestamp: '2026-04-28T14:22:00Z' })).toMatch(/events/);
  });

  it('rejects event with empty type', () => {
    const broken = {
      ...validEvents,
      events: [{ ...validEvents.events[0], type: '' }],
    };
    expect(validateTelemetryEvents(broken)).toMatch(/events\[0\].type/);
  });

  it('rejects event with invalid severity', () => {
    const broken = {
      ...validEvents,
      events: [{ ...validEvents.events[0], severity: 'critical' }],
    };
    expect(validateTelemetryEvents(broken)).toMatch(/severity/);
  });

  it('rejects event with non-numeric count', () => {
    const broken = {
      ...validEvents,
      events: [{ ...validEvents.events[0], count: 'many' }],
    };
    expect(validateTelemetryEvents(broken)).toMatch(/count/);
  });

  it('rejects event with missing trend', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { trend: _tr, ...noTrend } = validEvents.events[0]!;
    const broken = { ...validEvents, events: [noTrend] };
    expect(validateTelemetryEvents(broken)).toMatch(/trend/);
  });

  it('rejects missing timestamp', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { timestamp: _ts2, ...rest } = validEvents;
    expect(validateTelemetryEvents(rest)).toMatch(/timestamp/);
  });
});

// ---------------------------------------------------------------------------
// makeUnknownAppCoverage
// ---------------------------------------------------------------------------

describe('makeUnknownAppCoverage', () => {
  it('returns a row with all endpoints in unknown state', () => {
    const row = makeUnknownAppCoverage('prime-self', 'Prime Self', 'https://prime-self.adrper79.workers.dev');
    expect(row.appId).toBe('prime-self');
    expect(row.overall).toBe('unknown');
    expect(row.endpoints).toHaveLength(3);
    for (const ep of row.endpoints) {
      expect(ep.status).toBe('unknown');
    }
    expect(row.endpoints[0].path).toBe('/api/admin/health');
    expect(row.endpoints[1].path).toBe('/api/admin/metrics');
    expect(row.endpoints[2].path).toBe('/api/admin/events');
  });
});

// ---------------------------------------------------------------------------
// deriveOverallCoverage
// ---------------------------------------------------------------------------

describe('deriveOverallCoverage', () => {
  function makeRow(statuses: [string, string, string]): AppTelemetryCoverage['endpoints'] {
    return TELEMETRY_ENDPOINTS.map((path, i) => ({
      path,
      status: statuses[i] as AppTelemetryCoverage['endpoints'][number]['status'],
    })) as AppTelemetryCoverage['endpoints'];
  }

  it('returns compliant when all three pass', () => {
    expect(deriveOverallCoverage(makeRow(['compliant', 'compliant', 'compliant']))).toBe('compliant');
  });

  it('returns partial when one passes', () => {
    expect(deriveOverallCoverage(makeRow(['compliant', 'missing', 'missing']))).toBe('partial');
  });

  it('returns partial when two pass', () => {
    expect(deriveOverallCoverage(makeRow(['compliant', 'compliant', 'schema_drift']))).toBe('partial');
  });

  it('returns non_compliant when none pass', () => {
    expect(deriveOverallCoverage(makeRow(['missing', 'error', 'missing']))).toBe('non_compliant');
  });

  it('returns unknown when all are unknown', () => {
    expect(deriveOverallCoverage(makeRow(['unknown', 'unknown', 'unknown']))).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// buildCoverageMatrix
// ---------------------------------------------------------------------------

describe('buildCoverageMatrix', () => {
  it('counts compliant, non-compliant, and unknown apps correctly', () => {
    const r1 = makeUnknownAppCoverage('app-a', 'App A', 'https://a.dev');
    const r2 = makeUnknownAppCoverage('app-b', 'App B', 'https://b.dev');
    const r3 = makeUnknownAppCoverage('app-c', 'App C', 'https://c.dev');

    // Mark r1 as fully compliant
    r1.endpoints.forEach((e) => {
      e.status = 'compliant';
    });
    r1.overall = 'compliant';

    // Mark r2 as partial
    r2.endpoints[0].status = 'compliant';
    r2.endpoints[1].status = 'missing';
    r2.endpoints[2].status = 'missing';
    r2.overall = 'partial';

    const matrix = buildCoverageMatrix([r1, r2, r3]);
    expect(matrix.compliantCount).toBe(1);
    expect(matrix.nonCompliantCount).toBe(1);
    expect(matrix.unknownCount).toBe(1);
    expect(matrix.rows).toHaveLength(3);
    expect(typeof matrix.generatedAt).toBe('string');
  });

  it('returns an empty matrix when no rows are provided', () => {
    const matrix = buildCoverageMatrix([]);
    expect(matrix.rows).toHaveLength(0);
    expect(matrix.compliantCount).toBe(0);
    expect(matrix.nonCompliantCount).toBe(0);
    expect(matrix.unknownCount).toBe(0);
  });
});
