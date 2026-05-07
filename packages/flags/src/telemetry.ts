/**
 * @latimer-woods-tech/flags — Telemetry
 *
 * Fire-and-forget logging of every flag evaluation to D1 (flag_evaluations).
 * Non-fatal: if D1 is unavailable or the write fails, the evaluation still succeeds.
 */

import type { FlagContext } from './types.js';

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

export function recordEvaluation(
  db: D1Database | undefined,
  key: string,
  context: FlagContext,
  result: unknown,
  defaultHit: boolean,
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
  // Intentionally NOT awaited — fire-and-forget
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
  ).run().catch(() => {
    // Swallow — telemetry must never break the hot path
  });
}
