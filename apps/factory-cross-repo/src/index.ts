import { Hono } from 'hono';
import { getInstallationToken } from './github-auth';
import { createAuditPRs } from './github-pr';
import type { CreatePRPayload } from './github-pr';

export interface Env {
  /** Bearer token supervisor uses to authenticate requests here. */
  FACTORY_CROSS_REPO_TOKEN: string;
  /** GitHub App numeric ID. Set via `wrangler secret put FACTORY_APP_ID`. */
  FACTORY_APP_ID: string;
  /** GitHub App RSA private key PEM. Set via `wrangler secret put FACTORY_APP_PRIVATE_KEY`. */
  FACTORY_APP_PRIVATE_KEY: string;
  /** GitHub App installation ID. Set via `wrangler secret put FACTORY_APP_INSTALLATION_ID`. */
  FACTORY_APP_INSTALLATION_ID: string;
  /** Deployment environment — set via wrangler.jsonc vars. */
  ENVIRONMENT?: string;
  /** Worker name — set via wrangler.jsonc vars. */
  WORKER_NAME?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'factory-cross-repo',
    env: c.env.ENVIRONMENT ?? 'unknown',
    ts: new Date().toISOString(),
  }),
);

app.post('/api/supervisor/create-pr', async (c) => {
  // Verify Bearer token
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.FACTORY_CROSS_REPO_TOKEN}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  // Parse request body
  let payload: CreatePRPayload;
  try {
    payload = await c.req.json<CreatePRPayload>();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (
    !payload.template_id ||
    !payload.run_id ||
    !Array.isArray(payload.affected_repos) ||
    payload.affected_repos.length === 0
  ) {
    return c.json({ ok: false, error: 'Missing required fields: template_id, run_id, affected_repos' }, 400);
  }

  // Get GitHub App installation token
  let installationToken: string;
  try {
    installationToken = await getInstallationToken(
      c.env.FACTORY_APP_ID,
      c.env.FACTORY_APP_PRIVATE_KEY,
      c.env.FACTORY_APP_INSTALLATION_ID,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[factory-cross-repo] Failed to get installation token: ${msg}`);
    return c.json({ ok: false, error: `GitHub App auth failed: ${msg}` }, 500);
  }

  // Create audit PRs in all affected repos
  const result = await createAuditPRs(payload, installationToken);

  return c.json(result, result.ok ? 201 : 500);
});

// 404 fallback
app.all('*', (c) => c.json({ ok: false, error: 'Not found' }, 404));

export default app;
