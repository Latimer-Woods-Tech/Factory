/**
 * Factory Admin Studio — Worker entrypoint.
 *
 * @see docs/admin-studio/00-MASTER-PLAN.md
 */
import { Hono } from 'hono';
import type { AppEnv } from './types.js';
import type { Env } from './env.js';
import { corsMiddleware } from './middleware/cors.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { envContextMiddleware } from './middleware/env-context.js';
import { auditMiddleware } from './middleware/audit.js';

import auth from './routes/auth.js';
import { runAnalysisCycle } from './routes/ai.js';
import me from './routes/me.js';
import tests from './routes/tests.js';
import deploy from './routes/deploy.js';
import ai from './routes/ai.js';
import audit from './routes/audit.js';
import timeline from './routes/timeline.js';
import apps from './routes/apps.js';
import observability from './routes/observability.js';
import repo from './routes/repo.js';
import manifest from './routes/manifest.js';
import catalog from './routes/catalog.js';
import smoke from './routes/smoke.js';
import creatorOnboarding from './routes/creator-onboarding.js';
import creators from './routes/creators.js';
import payouts from './routes/payouts.js';
import stripeConnectWebhooks from './routes/webhooks-stripe-connect.js';
import studioTestsWebhook from './routes/webhooks-studio-tests.js';
import studioSubscriptionsWebhook from './routes/webhooks-studio-subscriptions.js';

const app = new Hono<AppEnv>();

// ── Global middleware (order matters) ─────────────────────────────────────────────────────
app.use('*', requestIdMiddleware());
app.use('*', corsMiddleware());

// ── Public routes ────────────────────────────────────────────────────────────────────────────────────

/**
 * GET /health — unauthenticated. Returns env so operators can curl-verify
 * which worker they're hitting (matches the CLAUDE.md verification protocol).
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    env: c.env.STUDIO_ENV,
    service: 'admin-studio',
    timestamp: new Date().toISOString(),
  });
});

app.route('/auth', auth);

// ── Public manifest (Phase E) ────────────────────────────────────────────────────────────────────────────────
// Crawlable function catalog — no auth so external monitors can scrape.
app.route('/manifest', manifest);

// ── Webhooks (public, Stripe-signed) ────────────────────────────────────────────────────────────────────────
app.route('/webhooks/stripe-connect', stripeConnectWebhooks);
app.route('/webhooks/studio-tests', studioTestsWebhook);
app.route('/webhooks/studio-subscriptions', studioSubscriptionsWebhook);

// ── Authenticated routes (env context required) ─────────────────────────────────────────────────────────
app.use('/me/*', envContextMiddleware());
app.use('/tests/*', envContextMiddleware(), auditMiddleware());
app.use('/deploys/*', envContextMiddleware(), auditMiddleware());
app.use('/ai/*', envContextMiddleware(), auditMiddleware());
app.use('/audit/*', envContextMiddleware());
app.use('/timeline/*', envContextMiddleware());
app.use('/apps/*', envContextMiddleware());
app.use('/observability/*', envContextMiddleware());
// Audit middleware skips GET/HEAD/OPTIONS, so reads stay cheap and
// writes (commit, create-branch, open-PR) are recorded.
app.use('/repo/*', envContextMiddleware(), auditMiddleware());
// Catalog GETs are read-only; refresh POST is audited automatically.
app.use('/catalog/*', envContextMiddleware(), auditMiddleware());
// Smoke tests are auditable but not critical
app.use('/smoke/*', envContextMiddleware(), auditMiddleware());
app.use('/api/creator/*', envContextMiddleware());
app.use('/api/admin/*', envContextMiddleware(), auditMiddleware());

app.route('/me', me);
app.route('/tests', tests);
app.route('/deploys', deploy);
app.route('/ai', ai);
app.route('/audit', audit);
app.route('/timeline', timeline);
app.route('/apps', apps);
app.route('/observability', observability);
app.route('/repo', repo);
app.route('/catalog', catalog);
app.route('/smoke', smoke);
app.route('/api/creator/onboarding', creatorOnboarding);
app.route('/api/admin/creators', creators);
app.route('/api/admin/payouts', payouts);

// ── Error handler ─────────────────────────────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[admin-studio] error:', err);
  return c.json(
    {
      error: 'Internal server error',
      requestId: c.var.requestId,
      // Only echo error message in non-prod to avoid leaking internals.
      ...(c.env.STUDIO_ENV !== 'production' ? { detail: err.message } : {}),
    },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: 'Not found', path: c.req.path, requestId: c.var.requestId }, 404),
);

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runAnalysisCycle(env));
  },
} satisfies ExportedHandler<Env>;
