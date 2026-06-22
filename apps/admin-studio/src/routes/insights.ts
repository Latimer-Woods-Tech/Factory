/**
 * RFC-008 Phase 3 — EXPRESS
 *
 * GET  /api/insights         — proxy supervisor /insights (operator digest)
 * GET  /api/insights/summary — counts by kind + latest statement per kind
 *
 * Requires admin JWT (enforced by caller via auditMiddleware).
 * Proxies to factory-supervisor GET /insights with the supervisor API key.
 * Returns 200 with empty array when supervisor is unconfigured (graceful
 * degradation — EXPRESS is optional infra).
 */

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const insightsRouter = new Hono<{ Bindings: Env }>();

interface SupervisorInsight {
  id: string;
  created_at: number;
  time_window: string;
  kind: string;
  statement: string;
  evidence_ids: string;
  confidence: number;
  surfaced_at: number | null;
  feedback: string | null;
  reflect_run_id: string;
}

interface SupervisorInsightsResponse {
  ok: boolean;
  insights: SupervisorInsight[];
  total: number;
}

async function fetchFromSupervisor(
  supervisorUrl: string,
  supervisorKey: string,
  path: string,
): Promise<SupervisorInsightsResponse> {
  const url = `${supervisorUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${supervisorKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`supervisor ${res.status}`);
  return (await res.json()) as SupervisorInsightsResponse;
}

insightsRouter.get('/', async (c) => {
  const { SUPERVISOR_URL, SUPERVISOR_API_KEY } = c.env;
  if (!SUPERVISOR_URL || !SUPERVISOR_API_KEY) {
    return c.json({ ok: true, insights: [], total: 0, note: 'supervisor not configured' });
  }

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const kind = c.req.query('kind') ?? '';
  const qs = `?limit=${limit}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`;

  try {
    const data = await fetchFromSupervisor(SUPERVISOR_URL, SUPERVISOR_API_KEY, `/insights${qs}`);
    return c.json(data);
  } catch (err) {
    return c.json({ ok: false, error: String(err), insights: [], total: 0 }, 502);
  }
});

// RFC-008 Phase 4 — LEARN: POST /api/insights/:id/feedback
insightsRouter.post('/:id/feedback', async (c) => {
  const { SUPERVISOR_URL, SUPERVISOR_API_KEY } = c.env;
  if (!SUPERVISOR_URL || !SUPERVISOR_API_KEY) {
    return c.json({ error: 'supervisor not configured' }, 503);
  }

  const id = c.req.param('id');
  let body: { feedback?: string };
  try {
    body = await c.req.json<{ feedback?: string }>();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const VALID = new Set(['useful', 'noise', 'wrong']);
  if (!body.feedback || !VALID.has(body.feedback)) {
    return c.json({ error: 'feedback must be useful | noise | wrong' }, 422);
  }

  try {
    const url = `${SUPERVISOR_URL.replace(/\/$/, '')}/insights?id=${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SUPERVISOR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedback: body.feedback }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return c.json({ error: `supervisor ${res.status}: ${text.slice(0, 200)}` }, res.status as 404 | 422 | 500);
    }
    return c.json(await res.json());
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

insightsRouter.get('/summary', async (c) => {
  const { SUPERVISOR_URL, SUPERVISOR_API_KEY } = c.env;
  if (!SUPERVISOR_URL || !SUPERVISOR_API_KEY) {
    return c.json({ ok: true, by_kind: {}, latest: [] });
  }

  try {
    const data = await fetchFromSupervisor(SUPERVISOR_URL, SUPERVISOR_API_KEY, '/insights?limit=100');
    const byKind: Record<string, { count: number; latest_statement: string; avg_confidence: number }> = {};
    for (const insight of data.insights) {
      const k = insight.kind;
      if (!byKind[k]) byKind[k] = { count: 0, latest_statement: '', avg_confidence: 0 };
      byKind[k]!.count += 1;
      byKind[k]!.avg_confidence += insight.confidence;
      if (!byKind[k]!.latest_statement) byKind[k]!.latest_statement = insight.statement;
    }
    for (const k of Object.keys(byKind)) {
      byKind[k]!.avg_confidence = parseFloat((byKind[k]!.avg_confidence / byKind[k]!.count).toFixed(3));
    }
    const latest = data.insights.slice(0, 5).map((i) => ({
      kind: i.kind,
      statement: i.statement,
      confidence: i.confidence,
      created_at: i.created_at,
    }));
    return c.json({ ok: true, total: data.total, by_kind: byKind, latest });
  } catch (err) {
    return c.json({ ok: false, error: String(err), by_kind: {}, latest: [] }, 502);
  }
});
