/**
 * Database access layer for qa-tools-worker.
 *
 * Uses @neondatabase/serverless for raw SQL queries (no Drizzle — the
 * qa_tools_* tables are app-specific and not in the shared neon package).
 * All queries are parameterized to prevent SQL injection.
 */

import { neon } from '@neondatabase/serverless';
import type { QaRunRow, QaResultRow, RunStatus, Profile, Environment, TestConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertRunParams {
  appId: string;
  environment: Environment;
  customUrl?: string | null;
  testType: string;
  profile: Profile;
  testConfig: TestConfig;
  maxAttempts: number;
  parentRunId?: string | null;
  attemptNumber?: number;
  createdBy?: string | null;
  tags?: string[];
  ciContext?: Record<string, unknown> | null;
  templateId?: string | null;
}

export interface UpdateRunParams {
  id: string;
  status: RunStatus;
  completedAt?: Date | null;
  durationMs?: number | null;
  violationsCount?: number;
  passesCount?: number;
  warningsCount?: number;
  errorMessage?: string | null;
  r2Prefix?: string | null;
  githubIssueUrl?: string | null;
}

export interface InsertResultParams {
  runId: string;
  category: string;
  violationId?: string | null;
  severity: string;
  title: string;
  description?: string | null;
  remediationHint?: string | null;
  htmlSnippet?: string | null;
  selector?: string | null;
  url?: string | null;
  affectedNodes?: number;
  screenshotKey?: string | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Creates a DB client from a Hyperdrive connection string. */
function createSql(connectionString: string) {
  return neon(connectionString);
}

// ---------------------------------------------------------------------------
// Run operations
// ---------------------------------------------------------------------------

/**
 * Inserts a new qa_tools_runs row and returns its UUID.
 * Status starts as 'pending'.
 */
export async function insertRun(connectionString: string, params: InsertRunParams): Promise<string> {
  const sql = createSql(connectionString);
  const rows = await sql`
    INSERT INTO qa_tools_runs (
      app_id, environment, custom_url,
      test_type, profile, test_config,
      attempt_number, max_attempts, parent_run_id,
      status, created_by, tags, ci_context, template_id
    ) VALUES (
      ${params.appId}, ${params.environment}, ${params.customUrl ?? null},
      ${params.testType}, ${params.profile}, ${JSON.stringify(params.testConfig)},
      ${params.attemptNumber ?? 1}, ${params.maxAttempts}, ${params.parentRunId ?? null},
      'pending',
      ${params.createdBy ?? null},
      ${params.tags ?? []},
      ${params.ciContext ? JSON.stringify(params.ciContext) : null},
      ${params.templateId ?? null}
    )
    RETURNING id
  `;
  const row = rows[0] as { id: string } | undefined;
  if (!row?.id) throw new Error('insertRun returned no id');
  return row.id;
}

/**
 * Updates a run row after audit completes (or fails).
 * Called from the async dispatch via ctx.waitUntil().
 */
export async function updateRun(connectionString: string, params: UpdateRunParams): Promise<void> {
  const sql = createSql(connectionString);
  await sql`
    UPDATE qa_tools_runs SET
      status           = ${params.status},
      completed_at     = ${params.completedAt ?? null},
      duration_ms      = ${params.durationMs ?? null},
      violations_count = ${params.violationsCount ?? 0},
      passes_count     = ${params.passesCount ?? 0},
      warnings_count   = ${params.warningsCount ?? 0},
      error_message    = ${params.errorMessage ?? null},
      r2_prefix        = ${params.r2Prefix ?? null},
      github_issue_url = ${params.githubIssueUrl ?? null}
    WHERE id = ${params.id}
  `;
}

/** Sets a run status to 'running' at dispatch start. */
export async function markRunStarted(connectionString: string, runId: string): Promise<void> {
  const sql = createSql(connectionString);
  await sql`UPDATE qa_tools_runs SET status = 'running' WHERE id = ${runId}`;
}

/** Fetches a single run row by id. Returns null if not found. */
export async function getRunById(
  connectionString: string,
  runId: string,
): Promise<QaRunRow | null> {
  const sql = createSql(connectionString);
  const rows = await sql`
    SELECT * FROM qa_tools_runs WHERE id = ${runId} LIMIT 1
  `;
  return (rows[0] as QaRunRow) ?? null;
}

/** Lists runs with optional app_id filter. Phase 1: supports appId + environment + status filters. */
export async function listRuns(
  connectionString: string,
  opts: { appId?: string; environment?: string; status?: string; limit: number; offset: number },
): Promise<{ runs: QaRunRow[]; total: number }> {
  const sql = createSql(connectionString);
  const { appId, environment, status, limit, offset } = opts;

  // Phase 1: build concrete filter branches to avoid .unsafe() calls.
  // The neon tagged template only supports static parameterized queries, not
  // dynamic WHERE clause composition. We cover the most common combinations.
  let runs: unknown[];
  let countRows: unknown[];

  if (appId && environment && status) {
    countRows = await sql`SELECT COUNT(*)::int AS total FROM qa_tools_runs WHERE app_id = ${appId} AND environment = ${environment} AND status = ${status}`;
    runs = await sql`SELECT * FROM qa_tools_runs WHERE app_id = ${appId} AND environment = ${environment} AND status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (appId && environment) {
    countRows = await sql`SELECT COUNT(*)::int AS total FROM qa_tools_runs WHERE app_id = ${appId} AND environment = ${environment}`;
    runs = await sql`SELECT * FROM qa_tools_runs WHERE app_id = ${appId} AND environment = ${environment} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (appId && status) {
    countRows = await sql`SELECT COUNT(*)::int AS total FROM qa_tools_runs WHERE app_id = ${appId} AND status = ${status}`;
    runs = await sql`SELECT * FROM qa_tools_runs WHERE app_id = ${appId} AND status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (appId) {
    countRows = await sql`SELECT COUNT(*)::int AS total FROM qa_tools_runs WHERE app_id = ${appId}`;
    runs = await sql`SELECT * FROM qa_tools_runs WHERE app_id = ${appId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (status) {
    countRows = await sql`SELECT COUNT(*)::int AS total FROM qa_tools_runs WHERE status = ${status}`;
    runs = await sql`SELECT * FROM qa_tools_runs WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else {
    countRows = await sql`SELECT COUNT(*)::int AS total FROM qa_tools_runs`;
    runs = await sql`SELECT * FROM qa_tools_runs ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  }

  const total = (countRows[0] as { total: number } | undefined)?.total ?? 0;
  return { runs: runs as QaRunRow[], total };
}

/** Gets the most recent run for a given app + environment. */
export async function getLatestRun(
  connectionString: string,
  appId: string,
  environment: string,
): Promise<QaRunRow | null> {
  const sql = createSql(connectionString);
  const rows = await sql`
    SELECT * FROM qa_tools_runs
    WHERE app_id = ${appId} AND environment = ${environment}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as QaRunRow) ?? null;
}

/** Counts open violations (non-pass, non-acknowledged) for an app. */
export async function countOpenViolations(
  connectionString: string,
  appId: string,
): Promise<{ critical: number; serious: number; moderate: number; total: number }> {
  const sql = createSql(connectionString);
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE r.severity = 'critical')::int AS critical,
      COUNT(*) FILTER (WHERE r.severity = 'serious')::int AS serious,
      COUNT(*) FILTER (WHERE r.severity = 'moderate')::int AS moderate,
      COUNT(*)::int AS total
    FROM qa_tools_results r
    JOIN qa_tools_runs rn ON rn.id = r.run_id
    WHERE rn.app_id = ${appId}
      AND r.status = 'open'
      AND r.severity NOT IN ('pass', 'info')
      AND rn.created_at > now() - interval '7 days'
  `;
  const row = rows[0] as { critical: number; serious: number; moderate: number; total: number } | undefined;
  return row ?? { critical: 0, serious: 0, moderate: 0, total: 0 };
}

// ---------------------------------------------------------------------------
// Result operations
// ---------------------------------------------------------------------------

/**
 * Bulk-inserts qa_tools_results rows for a completed run.
 * Batched to avoid massive single INSERT statements.
 */
export async function insertResults(
  connectionString: string,
  results: InsertResultParams[],
): Promise<void> {
  if (results.length === 0) return;
  const sql = createSql(connectionString);

  // Insert in batches of 50 to avoid exceeding Neon's statement size limits
  const BATCH = 50;
  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    for (const r of batch) {
      await sql`
        INSERT INTO qa_tools_results (
          run_id, category, violation_id, severity, title,
          description, remediation_hint, html_snippet,
          selector, url, affected_nodes, screenshot_key
        ) VALUES (
          ${r.runId}, ${r.category}, ${r.violationId ?? null}, ${r.severity}, ${r.title},
          ${r.description ?? null}, ${r.remediationHint ?? null}, ${r.htmlSnippet ?? null},
          ${r.selector ?? null}, ${r.url ?? null}, ${r.affectedNodes ?? 1}, ${r.screenshotKey ?? null}
        )
      `;
    }
  }
}

/** Fetches all results for a run, ordered by severity then creation time. */
export async function getResultsByRunId(
  connectionString: string,
  runId: string,
): Promise<QaResultRow[]> {
  const sql = createSql(connectionString);
  // Severity ordering is a static CASE expression — safe to embed in the template
  // (no user input, only the runId is parameterized).
  const rows = await sql`
    SELECT * FROM qa_tools_results
    WHERE run_id = ${runId}
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'serious'  THEN 2
        WHEN 'moderate' THEN 3
        WHEN 'minor'    THEN 4
        WHEN 'info'     THEN 5
        ELSE 6
      END,
      created_at
  `;
  return rows as QaResultRow[];
}

/** Updates a result's status (acknowledge, fix, false-positive). */
export async function updateResultStatus(
  connectionString: string,
  resultId: string,
  status: string,
  acknowledgedBy?: string,
): Promise<void> {
  const sql = createSql(connectionString);
  await sql`
    UPDATE qa_tools_results SET
      status          = ${status},
      acknowledged_by = ${acknowledgedBy ?? null},
      acknowledged_at = ${status === 'acknowledged' ? new Date().toISOString() : null}
    WHERE id = ${resultId}
  `;
}
