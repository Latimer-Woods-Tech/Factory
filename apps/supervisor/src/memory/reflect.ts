/**
 * RFC-008 Phase 2 — REFLECT
 *
 * Queries factory-memory Vectorize with broad theme probes, groups the top
 * results into a context window, asks an LLM to synthesize structured insights,
 * and writes them to the supervisor_insights D1 table.
 *
 * Design decisions:
 *   - Two theme probes (problems, progress) × topK 10 → dedup → ≤20 context chunks.
 *   - LLM model: Claude Haiku 4.5 (cheapest Anthropic tier — shadow mode only).
 *   - Shadow mode: insights are written with surfaced_at = NULL (not shown to operator).
 *   - Each insight must carry ≥1 evidence_id (Vectorize vector ID). Insights with
 *     no evidence are dropped before writing (anti-hallucination gate).
 *   - REFLECT runs after MEMORIZE so the substrate is fresh on each cron tick.
 *
 * Called from handleScheduled() when REFLECTION_MODE ≠ 'off'.
 * Never throws — errors are tallied and returned.
 */

import type { Env } from '../index.js';
import { queryNearest, type NearestResult } from './vector.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_INSIGHTS = 5;
const CONTEXT_CHUNKS = 20;

interface RawInsight {
  kind: string;
  statement: string;
  evidence_ids: string[];
  confidence: number;
}

export interface ReflectResult {
  run_id: string;
  insights_written: number;
  insights_dropped: number;
  errors: number;
}

/** Format a list of Vectorize results into LLM context. */
function buildContext(chunks: NearestResult[]): string {
  return chunks
    .map((c, i) => {
      const meta = c.metadata ?? {};
      const type = meta['type'] ?? 'unknown';
      const source = meta['source'] ?? '';
      const title = meta['title'] ?? '';
      return `[${i + 1}] id=${c.id} type=${type} source=${source} score=${c.score.toFixed(3)}\n${title}`;
    })
    .join('\n\n');
}

const REFLECT_PROMPT = `You are a software engineering analyst reviewing recent activity in a monorepo.
Analyze the memory chunks below and produce ${MAX_INSIGHTS} or fewer structured insights.

Rules:
- Each insight must reference at least one evidence chunk ID from the list below (by "id=..." value).
- Be specific — cite what changed, what broke, or what pattern you see.
- Confidence should reflect how clearly the evidence supports the claim (0.0–1.0).
- kind must be one of: pattern, contradiction, root-cause, drift, risk, opportunity

Respond ONLY with a valid JSON array, no prose before or after. Example format:
[
  {
    "kind": "pattern",
    "statement": "PRs touching auth routes consistently add new environment variables without updating .dev.vars.example.",
    "evidence_ids": ["pr-1807", "pr-1795"],
    "confidence": 0.85
  }
]

Memory chunks:
`;

/** Call Anthropic Haiku and parse the JSON insight array. */
async function callLLM(apiKey: string, context: string): Promise<RawInsight[]> {
  const body = {
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${REFLECT_PROMPT}${context}`,
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => '(no body)')}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';

  // Strip markdown code fences if present.
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned) as RawInsight[];
}

const VALID_KINDS = new Set(['pattern', 'contradiction', 'root-cause', 'drift', 'risk', 'opportunity']);

function isValidInsight(r: unknown): r is RawInsight {
  if (!r || typeof r !== 'object') return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj['kind'] === 'string' && VALID_KINDS.has(obj['kind']) &&
    typeof obj['statement'] === 'string' && obj['statement'].length > 0 &&
    Array.isArray(obj['evidence_ids']) && (obj['evidence_ids'] as unknown[]).length > 0 &&
    typeof obj['confidence'] === 'number' && (obj['confidence'] as number) >= 0 && (obj['confidence'] as number) <= 1
  );
}

/**
 * Run the REFLECT phase: query factory-memory, synthesize insights, write to D1.
 * Never throws.
 */
export async function runReflect(env: Env, timeWindow: '24h' | '7d' = '24h'): Promise<ReflectResult> {
  const runId = `reflect-${Date.now()}`;
  const result: ReflectResult = { run_id: runId, insights_written: 0, insights_dropped: 0, errors: 0 };

  if (!env.AI || !env.VECTORIZE_MEMORY || !env.ANTHROPIC_API_KEY) {
    result.errors += 1;
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same cast as vector.ts (VectorizeIndex type mismatch)
  const index = env.VECTORIZE_MEMORY as any;

  // Two broad theme probes — dedup by vector ID.
  let chunks: NearestResult[];
  try {
    const [problems, progress] = await Promise.all([
      queryNearest(env.AI, index, 'problems failures errors incidents bugs blocked', Math.ceil(CONTEXT_CHUNKS / 2)),
      queryNearest(env.AI, index, 'decisions PRs merged shipped improvements features', Math.ceil(CONTEXT_CHUNKS / 2)),
    ]);
    const seen = new Set<string>();
    chunks = [...problems, ...progress].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  } catch (err) {
    console.error('[supervisor] REFLECT query failed:', err);
    result.errors += 1;
    return result;
  }

  if (chunks.length === 0) {
    // factory-memory is empty — nothing to reflect on yet.
    return result;
  }

  // Call LLM.
  let raw: RawInsight[];
  try {
    raw = await callLLM(env.ANTHROPIC_API_KEY, buildContext(chunks));
  } catch (err) {
    console.error('[supervisor] REFLECT LLM call failed:', err);
    result.errors += 1;
    return result;
  }

  if (!Array.isArray(raw)) {
    result.errors += 1;
    return result;
  }

  // Validate, gate on evidence, write to D1.
  for (const r of raw) {
    if (!isValidInsight(r)) {
      result.insights_dropped += 1;
      continue;
    }

    // Verify every evidence_id exists in the chunk set (anti-hallucination).
    const chunkIds = new Set(chunks.map((c) => c.id));
    const validEvidence = (r.evidence_ids as string[]).filter((id) => chunkIds.has(id));
    if (validEvidence.length === 0) {
      result.insights_dropped += 1;
      continue;
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    try {
      await env.MEMORY
        .prepare(
          `INSERT OR IGNORE INTO supervisor_insights
           (id, created_at, time_window, kind, statement, evidence_ids, confidence, reflect_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          now,
          timeWindow,
          r.kind,
          r.statement,
          JSON.stringify(validEvidence),
          r.confidence,
          runId,
        )
        .run();
      result.insights_written += 1;
    } catch (err) {
      console.error('[supervisor] REFLECT D1 write failed:', err);
      result.errors += 1;
    }
  }

  return result;
}
