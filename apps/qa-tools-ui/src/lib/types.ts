/**
 * Shared types for QA Tools UI.
 *
 * These mirror the server-side types from qa-tools-worker/src/types.ts
 * but are kept separate to avoid cross-package imports from a UI bundle.
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §3
 */

export type AppId = 'selfprime' | 'capricast' | 'cipherofhealing' | 'xicocity';

export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'flaky';

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | 'pass';

export type Profile = 'fast' | 'a11y' | 'performance' | 'full' | 'scenario' | 'custom';

export type Environment = 'staging' | 'production' | 'custom';

/** Summary row as returned by GET /runs */
export interface RunSummary {
  id: string;
  appId: AppId;
  environment: Environment;
  profile: Profile;
  testType: string;
  status: RunStatus;
  violationsCount: number;
  passesCount: number;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
  tags: string[];
}

/** Full run detail from GET /runs/:id/status */
export interface RunDetail {
  runId: string;
  appId: AppId;
  environment: Environment;
  profile: Profile;
  testType: string;
  status: RunStatus;
  attemptNumber: number;
  maxAttempts: number;
  durationMs: number | null;
  completedAt: string | null;
  errorMessage: string | null;
  violationsCount: number;
  passesCount: number;
  tags: string[];
  githubIssueUrl: string | null;
}

/** Grouped results from GET /runs/:id/results */
export interface RunResultGroup {
  category: string;
  findings: RunFinding[];
}

export interface RunFinding {
  id: string;
  violationId: string | null;
  severity: Severity;
  title: string;
  description: string | null;
  remediationHint: string | null;
  selector: string | null;
  url: string | null;
  affectedNodes: number;
  status: 'open' | 'acknowledged' | 'fixed' | 'false-positive';
  screenshotKey: string | null;
}

/** Health summary from GET /apps/:appId/health */
export interface AppHealth {
  appId: AppId;
  environment: Environment;
  statusLabel: 'healthy' | 'degraded' | 'critical' | 'unknown' | 'checking';
  statusColor: 'green' | 'yellow' | 'red' | 'gray' | 'blue';
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  openViolationsCount: number;
}

/** Request body for POST /runs */
export interface CreateRunRequest {
  appId: AppId;
  environment: Environment;
  testType: string;
  profile: Profile;
  customUrl?: string;
  testConfig?: {
    thresholds?: { violationsMax?: number };
    notifyOnComplete?: Array<'slack'>;
    tags?: string[];
  };
}

/** Response from POST /runs */
export interface CreateRunResponse {
  runId: string;
  status: string;
  profile: Profile;
  estimatedDurationMs: number;
  createdAt: string;
  pollUrl: string;
  resultsUrl: string;
}

/** Response from GET /runs */
export interface ListRunsResponse {
  runs: RunSummary[];
  total: number;
  limit: number;
  offset: number;
}

export const APP_IDS: AppId[] = ['selfprime', 'capricast', 'cipherofhealing', 'xicocity'];

export const APP_LABELS: Record<AppId, string> = {
  selfprime: 'Selfprime',
  capricast: 'Capricast',
  cipherofhealing: 'Cipher of Healing',
  xicocity: 'Xico City',
};

export const STATUS_COLORS: Record<RunStatus, string> = {
  pending:  'bg-gray-100 text-gray-600',
  running:  'bg-blue-100 text-blue-700',
  passed:   'bg-green-100 text-green-700',
  failed:   'bg-red-100 text-red-700',
  error:    'bg-orange-100 text-orange-700',
  flaky:    'bg-yellow-100 text-yellow-700',
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  serious:  'bg-orange-100 text-orange-800 border-orange-200',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  minor:    'bg-blue-100 text-blue-800 border-blue-200',
  info:     'bg-gray-100 text-gray-700 border-gray-200',
  pass:     'bg-green-100 text-green-800 border-green-200',
};

export const HEALTH_COLORS: Record<AppHealth['statusLabel'], string> = {
  healthy:  'bg-green-50  border-green-200  text-green-700',
  degraded: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  critical: 'bg-red-50    border-red-200    text-red-800',
  unknown:  'bg-gray-50   border-gray-200   text-gray-500',
  checking: 'bg-blue-50   border-blue-200   text-blue-600',
};
