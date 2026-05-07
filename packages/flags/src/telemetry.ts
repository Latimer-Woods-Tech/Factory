/**
 * @latimer-woods-tech/flags — Telemetry
 *
 * Logging of every flag evaluation to D1 (flag_evaluations).
 * Non-fatal: if D1 is unavailable or the write fails, the evaluation still succeeds.
 * Pass executionCtx to guarantee the write completes before Worker exit.
 */

import type { FlagContext } from './types.js';
import { withTimeout } from './timeout.js';

/** Milliseconds before a D1 telemetry write is abandoned. */
const TELEMETRY_TIMEOUT_MS = 3_000;

/** Row shape for a single flag evaluation persisted to D1 `flag_evaluations`. */
export interface EvaluationRecord {
  flag_key: string;
  app: string;
  user_id: string | null;
  plan: string | null;
  env: string;
  result: string; // JSON-serialized variation value
  default_hit: 0 | 1; // 1 if the fallback/default was returned
  ts: number; // epoch ms
}

/**
 * Writes a flag evaluation record to D1 asynchronously.
 * Non-fatal: failures are logged but never surface to callers.
 * Pass `executionCtx` to guarantee the write completes before Worker exit.
 */
export function recordEvaluation(
  db: D1Database | undefined,
  key: string,
  context: FlagContext,
  result: unknown,
  defaultHit: boolean,
  executionCtx?: Pick<ExecutionContext, 'waitUntil'>,
): void {
  if (!db) return;
  const record: EvaluationRecord = {
    flag_key: key,
    app: context.app,
    user_id: context.userId ?? null,
    plan: context.plan ?? null,
    env: context.env,
    result: JSON.stringify(result),
    default_hit: defaultHit ? 1 : 0,
    ts: Date.now(),
  };
  const write = withTimeout(
    db.prepare(
      'INSERT INTO flag_evaluations (flag_key, app, user_id, plan, env, result, default_hit, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      record.flag_key,
      record.app,
      record.user_id,
      record.plan,
      record.env,
      record.result,
      record.default_hit,
      record.ts,
    ).run(),
    TELEMETRY_TIMEOUT_MS,
  ).catch((e: unknown) => {
    // Non-fatal: telemetry must never break the hot path, but failures should be observable.
    console.warn('[flags] telemetry write failed:', e instanceof Error ? e.message : String(e));
  });
  // Use waitUntil when ExecutionContext is available to guarantee the write
  // completes before the Worker exits, preventing silent telemetry loss.
  if (executionCtx) {
    executionCtx.waitUntil(write);
  }
}
