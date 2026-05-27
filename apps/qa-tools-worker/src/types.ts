/**
 * Shared domain types for qa-tools-worker.
 *
 * These mirror the database schema in migrations/001_phase1.sql and the
 * API contract documented in docs/architecture/QA_TOOLS_ARCHITECTURE.md.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid app IDs known to the QA Tools platform. */
export const VALID_APP_IDS = ['selfprime', 'capricast', 'cipherofhealing', 'xicocity'] as const;
export type AppId = (typeof VALID_APP_IDS)[number];

/** Canonical front-end URLs per app + environment.
 *  Used when testConfig does not supply a customUrl.  */
export const APP_URLS: Record<AppId, { production: string; staging: string }> = {
  selfprime: {
    production: 'https://selfprime.net',
    staging: 'https://staging.selfprime.net',
  },
  capricast: {
    production: 'https://capricast.com',
    staging: 'https://staging.capricast.com',
  },
  cipherofhealing: {
    production: 'https://cypherofhealing.com',
    staging: 'https://staging.cypherofhealing.com',
  },
  xicocity: {
    production: 'https://xicocity.com',
    staging: 'https://staging.xicocity.com',
  },
};

/** Audit profiles with associated defaults. */
export const PROFILE_DEFAULTS = {
  fast:        { timeoutMs: 15_000, maxAttempts: 1, estimatedMs: 10_000 },
  a11y:        { timeoutMs: 30_000, maxAttempts: 2, estimatedMs: 20_000 },
  performance: { timeoutMs: 45_000, maxAttempts: 1, estimatedMs: 25_000 },
  full:        { timeoutMs: 90_000, maxAttempts: 2, estimatedMs: 45_000 },
  scenario:    { timeoutMs: 120_000, maxAttempts: 2, estimatedMs: 60_000 },
  custom:      { timeoutMs: 120_000, maxAttempts: 1, estimatedMs: 60_000 },
} as const;

export type Profile = keyof typeof PROFILE_DEFAULTS;
export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'flaky';
export type Environment = 'staging' | 'production' | 'custom';
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | 'pass';
export type ResultStatus = 'open' | 'acknowledged' | 'fixed' | 'false-positive';

/** RBAC roles carried in JWT claims. */
export type QaRole = 'qa_viewer' | 'qa_runner' | 'qa_admin';

// ---------------------------------------------------------------------------
// JWT claims
// ---------------------------------------------------------------------------

export interface QaJwtClaims {
  sub: string;
  email?: string;
  role: QaRole;
  /** App IDs this token is authorized for. Ignored when role is qa_admin. */
  app_ids?: AppId[];
  /** Token audience — must contain 'qa-tools' or 'qa-tools-ci'. */
  aud?: string | string[];
  exp: number;
  iat?: number;
}

// ---------------------------------------------------------------------------
// DB row shapes (snake_case, matching Postgres columns)
// ---------------------------------------------------------------------------

export interface QaRunRow {
  id: string;
  app_id: string;
  environment: string;
  custom_url: string | null;
  test_type: string;
  profile: string;
  test_config: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  attempt_number: number;
  max_attempts: number;
  flake_score: string | null;
  parent_run_id: string | null;
  status: string;
  violations_count: number;
  passes_count: number;
  warnings_count: number;
  error_message: string | null;
  ci_context: Record<string, unknown> | null;
  created_by: string | null;
  template_id: string | null;
  tags: string[];
  r2_prefix: string | null;
  sentry_issue_id: string | null;
  github_issue_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface QaResultRow {
  id: string;
  run_id: string;
  category: string;
  violation_id: string | null;
  severity: string;
  title: string;
  description: string | null;
  remediation_hint: string | null;
  html_snippet: string | null;
  selector: string | null;
  url: string | null;
  affected_nodes: number;
  screenshot_key: string | null;
  screenshot_diff_key: string | null;
  is_regression: boolean;
  baseline_id: string | null;
  similarity_score: string | null;
  diff_pixel_count: number | null;
  assertion_name: string | null;
  assertion_passed: boolean | null;
  assertion_actual: string | null;
  assertion_expected: string | null;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API request shapes
// ---------------------------------------------------------------------------

export interface TestConfig {
  checks?: string[];
  includeAuthentication?: boolean;
  credentialId?: string;
  scenario?: { steps: ScenarioStep[] };
  customAssertions?: CustomAssertion[];
  retryPolicy?: { maxAttempts: number; retryOn?: string[]; backoffMs?: number };
  thresholds?: { lcpMaxMs?: number; clsMax?: number; fidMaxMs?: number; violationsMax?: number };
  compareAgainstBaseline?: boolean;
  setAsNewBaseline?: boolean;
  notifyOnComplete?: string[];
  tags?: string[];
  templateId?: string | null;
}

export interface ScenarioStep {
  action: 'goto' | 'fill' | 'click' | 'wait' | 'waitForSelector' | 'waitForUrl' | 'screenshot' | 'assertVisible' | 'assertText';
  url?: string;
  selector?: string;
  value?: string;
  ms?: number;
  timeout?: number;
  name?: string;
  pattern?: string;
  contains?: string;
}

export interface CustomAssertion {
  name: string;
  type: 'assertVisible' | 'assertText' | 'assertUrl' | 'assertConsoleErrors' | 'assertHttpStatus';
  selector?: string;
  contains?: string;
  url?: string;
  expectedStatus?: number;
  maxErrors?: number;
}

export interface CreateRunRequest {
  appId: AppId;
  environment: Environment;
  customUrl?: string | null;
  testType: string;
  profile: Profile;
  testConfig?: TestConfig;
  ciContext?: {
    prNumber?: number;
    sha?: string;
    workflow?: string;
    repo?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// browser-agent VisualReview response shapes (relevant subset)
// ---------------------------------------------------------------------------

export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodeCount: number;
  exampleSelectors: string[];
  viewport: string;
}

export interface VisualReviewResult {
  url: string;
  reviewedAt: string;
  viewports: Array<{ viewport: string; width: number; height: number; screenshotBase64: string }>;
  consoleErrors: Array<{ type: string; text: string; location: string }>;
  pageErrors: Array<{ message: string; stack: string }>;
  failedRequests: Array<{ url: string; method: string; status: number }>;
  review: object | null;
  axeViolations: AxeViolation[] | null;
}
