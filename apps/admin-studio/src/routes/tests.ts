/**
 * Phase C — Test runner routes.
 *
 *   GET    /tests                     → list available suites
 *   POST   /tests/runs                → dispatch GH workflow, persist run
 *   GET    /tests/runs                → list recent runs
 *   GET    /tests/runs/:id            → full run + results (snapshot)
 *   GET    /tests/runs/:id/events     → SSE stream of state + result deltas
 *   POST   /tests/runs/:id/analyze    → AI failure analyst (stub for Phase C)
 *   POST   /tests/webhook             → HMAC-verified ingestion from GH Actions
 *
 * The webhook handler is the SOLE writer for run state after dispatch; the
 * SSE stream polls the DB to emit deltas. A future iteration may swap the
 * polling for a Durable Object pub-sub.
 */
import { Hono } from 'hono';
import type {
  FailureAnalystRequest,
  FailureAnalystSuggestion,
  TestEvent,
  TestResult,
  TestRun,
  TestRunStatus,
} from '@latimer-woods-tech/studio-core';
import type { AppEnv } from '../types.js';
import { requireConfirmation } from '../middleware/require-confirmation.js';
import { dispatchTestWorkflow, DispatchError } from '../lib/github-dispatch.js';
import { getGithubToken, hasGithubAuth } from '../lib/github-app.js';
import {
  getTestRun,
  insertTestRun,
  listTestResults,
  listTestRuns,
  updateTestRunStatus,
} from '../lib/test-store.js';

const tests = new Hono<AppEnv>();

const KNOWN_SUITES = [
  { id: 'studio-core', name: '@latimer-woods-tech/studio-core', path: 'packages/studio-core' },
  { id: 'auth',        name: '@latimer-woods-tech/auth',        path: 'packages/auth' },
  { id: 'errors',      name: '@latimer-woods-tech/errors',      path: 'packages/errors' },
  { id: 'llm',         name: '@latimer-woods-tech/llm',         path: 'packages/llm' },
  { id: 'neon',        name: '@latimer-woods-tech/neon',        path: 'packages/neon' },
  { id: 'monitoring',  name: '@latimer-woods-tech/monitoring',  path: 'packages/monitoring' },
] as const;

tests.get('/', (c) => c.json({ suites: KNOWN_SUITES }));

/**
 * Dispatch a new run.
 *
 * Required body: { suites: string[], filter?: string }
 * Returns:       { runId, status, ghRunUrl? }
 */
tests.post(
  '/runs',
  requireConfirmation({
    action: 'tests.dispatch',
    reversibility: 'reversible',
    minRole: 'editor',
    allowDryRun: true,
  }),
  async (c) => {
    const body = await c.req
      .json<{ suites?: string[]; filter?: string }>()
      .catch((): { suites?: string[]; filter?: string } => ({}));
    const suites = body.suites && body.suites.length > 0 ? body.suites : ['*'];
    const filter = body.filter?.trim() || undefined;

    if (c.req.query('dryRun') === 'true' || c.req.header('X-Dry-Run') === 'true') {
      return c.json({
        dryRun: true,
        plan: { workflow: 'studio-test-dispatch.yml', suites, filter: filter ?? null },
      });
    }

    const ctx = c.var.envContext;
    const env = c.env;
    if (!hasGithubAuth(env)) {
      return c.json({ error: 'GitHub auth not configured' }, 503);
    }
    if (!env.STUDIO_WEBHOOK_SECRET) {
      return c.json({ error: 'STUDIO_WEBHOOK_SECRET not configured' }, 503);
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const run: TestRun = {
      id: runId,
      dispatchedFromEnv: ctx.env,
      suites,
      filter,
      status: 'queued',
      startedAt,
      totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
      dispatchedBy: ctx.userId,
    };

    try {
      await insertTestRun(env.DB, run);
    } catch (err) {
      console.error('[tests] insertTestRun failed:', (err as Error).message);
      return c.json({ error: 'Failed to record run' }, 500);
    }

    const callbackUrl =
      (env.STUDIO_PUBLIC_URL ?? new URL(c.req.url).origin) + '/webhooks/studio-tests';

    try {
      await dispatchTestWorkflow(await getGithubToken(env), {
        runId,
        suites,
        filter,
        callbackUrl,
      });
      await updateTestRunStatus(env.DB, runId, { status: 'dispatched' });
    } catch (err) {
      const detail = err instanceof DispatchError ? err.body : (err as Error).message;
      await updateTestRunStatus(env.DB, runId, { status: 'failed' }).catch(() => {});
      return c.json({ runId, status: 'failed', error: 'GH dispatch failed', detail }, 502);
    }

    return c.json({
      runId,
      status: 'dispatched' satisfies TestRunStatus,
      ghRunUrl: null,
    });
  },
);

tests.get('/runs', async (c) => {
  const ctx = c.var.envContext;
  const onlyMine = c.req.query('mine') === 'true';
  const limit = Number(c.req.query('limit') ?? 50);
  const runs = await listTestRuns(c.env.DB, {
    dispatchedBy: onlyMine ? ctx.userId : undefined,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return c.json({ runs });
});

tests.get('/runs/:id', async (c) => {
  const id = c.req.param('id');
  const run = await getTestRun(c.env.DB, id);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  const results = await listTestResults(c.env.DB, id);
  return c.json({ run, results });
});

/**
 * SSE stream. Polls the run row + new results every `POLL_MS` and emits
 * deltas. Closes on terminal status or after `MAX_DURATION_MS`.
 */
tests.get('/runs/:id/events', async (c) => {
  const id = c.req.param('id');
  const initial = await getTestRun(c.env.DB, id);
  if (!initial) return c.json({ error: 'Run not found' }, 404);

  const POLL_MS = 1500;
  const KEEPALIVE_MS = 15_000;
  const MAX_DURATION_MS = 5 * 60_000;
  const db = c.env.DB;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TestEvent): void => {
        const line = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };
      const comment = (msg: string): void => {
        controller.enqueue(encoder.encode(`: ${msg}\n\n`));
      };

      const initialResults = await listTestResults(db, id);
      const seen = new Map<string, TestResult>(initialResults.map((r) => [r.id, r]));
      send({ type: 'snapshot', run: initial, results: initialResults });

      let lastStatus: TestRunStatus = initial.status;
      let lastTotalsJson = JSON.stringify(initial.totals);
      const startedAt = Date.now();
      let lastKeepalive = startedAt;

      while (Date.now() - startedAt < MAX_DURATION_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));

        const run = await getTestRun(db, id).catch(() => null);
        if (!run) break;

        if (run.status !== lastStatus) {
          lastStatus = run.status;
          send({
            type: 'status',
            status: run.status,
            ghRunId: run.ghRunId,
            ghRunUrl: run.ghRunUrl,
          });
        }

        const totalsJson = JSON.stringify(run.totals);
        if (totalsJson !== lastTotalsJson) {
          lastTotalsJson = totalsJson;
          send({ type: 'totals', totals: run.totals });
        }

        const fresh = await listTestResults(db, id).catch(() => [] as TestResult[]);
        for (const r of fresh) {
          const prev = seen.get(r.id);
          if (!prev || prev.outcome !== r.outcome || prev.durationMs !== r.durationMs) {
            seen.set(r.id, r);
            send({ type: 'result', result: r });
          }
        }

        if (
          run.status === 'passed' ||
          run.status === 'failed' ||
          run.status === 'cancelled' ||
          run.status === 'timed-out'
        ) {
          send({ type: 'finished', run });
          break;
        }

        if (Date.now() - lastKeepalive > KEEPALIVE_MS) {
          comment('keepalive');
          lastKeepalive = Date.now();
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

/**
 * AI Failure Analyst — Phase C ships a heuristic stub.
 *
 * Returns a structured suggestion derived from the failure shape.
 * Phase E swaps this for a real LLM call via @latimer-woods-tech/llm.
 */
tests.post('/runs/:id/analyze', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ testId?: string; failure?: TestResult }>()
    .catch((): { testId?: string; failure?: TestResult } => ({}));

  const results = await listTestResults(c.env.DB, id);
  const target =
    body.failure ??
    results.find((r) => r.id === body.testId) ??
    results.find((r) => r.outcome === 'failed');

  if (!target || target.outcome !== 'failed' || !target.failure) {
    return c.json({ error: 'No failing test to analyse' }, 404);
  }

  const req: FailureAnalystRequest = { failure: target };
  const suggestion = heuristicAnalyse(req);
  return c.json({ suggestion, source: 'heuristic-stub' });
});

function heuristicAnalyse(req: FailureAnalystRequest): FailureAnalystSuggestion {
  const msg = req.failure.failure?.message ?? '';
  const stack = req.failure.failure?.stack ?? '';
  const blob = `${msg}\n${stack}`.toLowerCase();

  const steps: string[] = [];
  let hypothesis = 'Assertion failure — review the diff and the test setup.';
  let confidence = 0.35;

  if (blob.includes('timeout') || blob.includes('timed out')) {
    hypothesis = 'A network or async operation exceeded its timeout.';
    steps.push('Inspect any awaited fetch/DB calls in the failing test for missing mocks.');
    steps.push('Increase the test timeout only after confirming the underlying op is sound.');
    confidence = 0.55;
  } else if (blob.includes('econnrefused') || blob.includes('fetch failed')) {
    hypothesis = 'External dependency was unreachable from the runner.';
    steps.push('Check that all outbound calls are mocked in unit tests.');
    steps.push('If integration test, verify staging credentials and network egress.');
    confidence = 0.7;
  } else if (blob.includes('typeerror') || blob.includes('cannot read')) {
    hypothesis = 'A required field is `undefined` at runtime.';
    steps.push('Re-check noUncheckedIndexedAccess assumptions on the failing line.');
    steps.push('Trace the input shape — likely an upstream contract change.');
    confidence = 0.6;
  } else if (req.failure.failure?.diff) {
    hypothesis = 'Output drifted from the expected snapshot/value.';
    steps.push('Compare the diff carefully — small whitespace / trailing-comma drift is common.');
    steps.push('If intentional, update the expected value and add a CHANGELOG note.');
    confidence = 0.5;
  } else {
    steps.push('Open the test file and check recent commits touching it.');
    steps.push('Re-run locally with `npm test -- ' + req.failure.suite + '`.');
  }

  return { hypothesis, steps, confidence };
}

export default tests;
