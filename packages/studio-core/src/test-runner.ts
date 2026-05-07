/**
 * Phase C — Test runner types.
 *
 * The test runner has three actors:
 *   1. Studio Worker  — accepts dispatch, persists run state, streams events
 *   2. GitHub Actions — actually runs vitest, uploads JUnit + console output
 *   3. Webhook back   — POST /tests/webhook with HMAC-signed payloads
 *
 * Run lifecycle:
 *   queued → dispatched → running → (passed | failed | cancelled | timed-out)
 *
 * Events emitted on the SSE channel mirror these state transitions plus
 * per-test results so the UI can build a tree incrementally.
 */

export type TestRunStatus =
  | 'queued'        // accepted by Studio, GH dispatch in flight
  | 'dispatched'    // GH workflow_dispatch returned 204
  | 'running'       // first runner-started webhook received
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'timed-out';

/** Outcome of an individual test case. */
export type TestOutcome = 'passed' | 'failed' | 'skipped' | 'todo';

/**
 * Single test case result. `name` is the leaf test name, `suite` is the
 * describe-block path joined with " > ".
 */
export interface TestResult {
  /** Full test id, e.g. `packages/auth::AuthService > validates token`. */
  id: string;
  suite: string;
  name: string;
  outcome: TestOutcome;
  durationMs: number;
  /** Failure message + stack, only populated when outcome === 'failed'. */
  failure?: {
    message: string;
    stack?: string;
    /** Diff snippet if the assertion produced one (vitest `expected/received`). */
    diff?: string;
    file?: string;
    line?: number;
  };
}

/**
 * Aggregate row for a test run. Persisted in `studio_test_runs`.
 */
export interface TestRun {
  id: string;
  /** Env at dispatch time — runs always execute against staging in CI. */
  dispatchedFromEnv: string;
  /** GH Actions run id, populated after the first webhook. */
  ghRunId?: string;
  /** GH Actions run url, populated after the first webhook. */
  ghRunUrl?: string;
  /** Suites the operator picked, or `["*"]` for everything. */
  suites: readonly string[];
  /** Optional vitest --testNamePattern. */
  filter?: string;
  status: TestRunStatus;
  startedAt: string;
  finishedAt?: string;
  /** Aggregate counts; updated as results stream in. */
  totals: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** User who dispatched the run. */
  dispatchedBy: string;
}

/**
 * Server-sent event emitted on /tests/runs/:id/events.
 *
 * The first event is always `snapshot` so a late subscriber gets full state.
 * After that, only deltas are emitted to keep the wire small.
 */
export type TestEvent =
  | { type: 'snapshot'; run: TestRun; results: readonly TestResult[] }
  | { type: 'status'; status: TestRunStatus; ghRunId?: string; ghRunUrl?: string }
  | { type: 'result'; result: TestResult }
  | { type: 'totals'; totals: TestRun['totals'] }
  | { type: 'finished'; run: TestRun };

/**
 * Webhook body posted by the GitHub Action back to the Studio Worker.
 *
 * The action signs the body with `STUDIO_WEBHOOK_SECRET` (HMAC-SHA256) and
 * sends the hex digest in the `X-Studio-Signature` header. The Worker
 * rejects unsigned or mis-signed requests.
 */
export interface TestWebhookPayload {
  runId: string;
  /** GH Actions run id (numeric). */
  ghRunId: string;
  ghRunUrl: string;
  status: TestRunStatus;
  totals?: TestRun['totals'];
  /** Optional incremental results; for `finished` events the full set. */
  results?: readonly TestResult[];
  /** ISO timestamp of this webhook emission. */
  emittedAt: string;
}

/**
 * Request body for AI Failure Analyst.
 */
export interface FailureAnalystRequest {
  /** Single failing test. */
  failure: TestResult;
  /** Recent commits (provided by GH workflow) that may have caused the regression. */
  recentCommits?: ReadonlyArray<{ sha: string; message: string; author: string }>;
}

/**
 * AI analyst suggestion — kept tight so it renders in a small UI card.
 */
export interface FailureAnalystSuggestion {
  /** One-sentence root cause hypothesis. */
  hypothesis: string;
  /** 1–4 concrete suggested next steps. */
  steps: readonly string[];
  /** Confidence on 0..1 scale. UI renders <0.4 in amber. */
  confidence: number;
  /** Optional commit sha the analyst thinks is the most likely culprit. */
  suspectedCommit?: string;
}
