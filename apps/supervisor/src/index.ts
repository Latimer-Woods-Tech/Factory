export { SupervisorDO } from './supervisor.do';
export { LockDO } from './lock.do';
import { handleSlackEvents } from './tools/slack.js';

export interface Env {
  SUPERVISOR: DurableObjectNamespace;
  LOCK: DurableObjectNamespace;
  MEMORY: D1Database;
  LLM_LEDGER: D1Database;
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  GROK_API_KEY?: string;
  VERTEX_ACCESS_TOKEN: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;
  PER_RUN_CAP_CENTS?: string;
  JWT_SECRET: string;
  /** GitHub App numeric ID. Set via `wrangler secret put FACTORY_APP_ID`. */
  FACTORY_APP_ID: string;
  /** GitHub App RSA private key PEM. Set via `wrangler secret put FACTORY_APP_PRIVATE_KEY`. */
  FACTORY_APP_PRIVATE_KEY: string;
  /** GitHub App installation ID for Latimer-Woods-Tech/factory. Set via `wrangler secret put FACTORY_APP_INSTALLATION_ID`. */
  FACTORY_APP_INSTALLATION_ID: string;
  /** Pushover application token. Set via `wrangler secret put PUSHOVER_TOKEN`. */
  PUSHOVER_TOKEN: string;
  /** Pushover user key. Set via `wrangler secret put PUSHOVER_USER_KEY`. */
  PUSHOVER_USER_KEY: string;
  /** Slack signing secret for /slack/events verification. Set via `wrangler secret put SLACK_SIGNING_SECRET`. */
  SLACK_SIGNING_SECRET: string;
  /** Slack user ID of the workspace owner — only DMs from this user create GitHub issues. */
  SLACK_OWNER_USER_ID: string;
  /** factory-cross-repo worker base URL (e.g., https://factory-cross-repo-worker.example.com). Set via `wrangler secret put FACTORY_CROSS_REPO_URL`. */
  FACTORY_CROSS_REPO_URL?: string;
  /** factory-cross-repo Bearer token for authentication. Set via `wrangler secret put FACTORY_CROSS_REPO_TOKEN`. */
  FACTORY_CROSS_REPO_TOKEN?: string;
  /** factory-core-api base URL for push-on-write run mirroring (P1.9). Set via `wrangler secret put FACTORY_CORE_API_URL`. */
  FACTORY_CORE_API_URL?: string;
  /** Service key for POST /v1/runs/mirror on factory-core-api. Set via `wrangler secret put SUPERVISOR_PUSH_KEY`. */
  SUPERVISOR_PUSH_KEY?: string;
  /** Service key guarding privileged HTTP routes (/run, /plan, /scheduled, /state, /aos/status, /capabilities). Set via `wrangler secret put SUPERVISOR_API_KEY`. */
  SUPERVISOR_API_KEY?: string;
  /** RFC-007: Workers AI binding for embeddings. Declared in wrangler.jsonc `ai` block. */
  AI?: Ai;
  /** RFC-007: Vectorize index for template similarity recall. Provisioned: wrangler vectorize create supervisor-templates --dimensions=768 --metric=cosine */
  VECTORIZE_TEMPLATES?: VectorizeIndex;
  /** RFC-007: Vectorize index for episodic incident recall. Provisioned: wrangler vectorize create supervisor-incidents --dimensions=768 --metric=cosine */
  VECTORIZE_INCIDENTS?: VectorizeIndex;
  /** RFC-007: Semantic memory mode. off = disabled (default); shadow = log only; live = Signal 4 active. Set via wrangler.jsonc vars. */
  SUPERVISOR_SEMANTIC_MODE?: 'off' | 'shadow' | 'live';
  /** RFC-008 Phase 0: Unified memory substrate. Provisioned 2026-06-22: factory-memory, 768d cosine. */
  VECTORIZE_MEMORY?: VectorizeIndex;
  /** RFC-008: Reflection loop mode. off = disabled (default); shadow = compute but do not surface; live = full loop active. Set via wrangler.jsonc vars. */
  REFLECTION_MODE?: 'off' | 'shadow' | 'live';
  /** RFC-007 Phase 3: producer binding for the incident write lane. */
  INCIDENT_QUEUE?: Queue<IncidentMessage>;
}

/** Message shape produced by handleRun on every terminal supervisor run. */
export interface IncidentMessage {
  /** Supervisor run ID — FK to supervisor_runs.run_id. */
  run_id: string;
  /** GitHub issue reference, e.g. "Latimer-Woods-Tech/Factory#1234". */
  issue_ref?: string;
  /** Template ID matched during planning (undefined if no template matched). */
  template_id?: string;
  /** Terminal outcome of the run. */
  outcome: 'succeeded' | 'failed' | 'canceled';
  /** Unix epoch ms when the run reached terminal state. */
  occurred_at: number;
}

/** Constant-time string comparison — guards against timing side-channels. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Factory Supervisor — entrypoint.
 *
 * Routes every request to the singleton SupervisorDO. The DO is the single
 * source of truth for run state; this worker is a thin HTTP/cron/queue
 * fan-in that forwards to the DO.
 *
 * Phase 1 (SUP-3.4): scaffold only — DO stubs, tool registry stub, memory
 * stub, planner stubs. Phase 2 (SUP-3.5): scheduled Sauna runs wired through.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health probes stay public — CI post-deploy checks and the synthetic
    // monitor curl /health with no credentials.
    if (url.pathname === '/health') {
      const stub = env.SUPERVISOR.get(env.SUPERVISOR.idFromName('singleton'));
      return stub.fetch(request);
    }

    // Slack carries its own request-signature verification.
    if (url.pathname === '/slack/events' && request.method === 'POST') {
      return handleSlackEvents(request, env);
    }

    // Every other route (/run, /plan, /scheduled, /state, /aos/status, /capabilities) is
    // privileged — runs spend LLM budget and can open PRs — so require the
    // supervisor service key. Fail closed (503) when it is not configured.
    if (!env.SUPERVISOR_API_KEY) {
      return Response.json({ error: 'supervisor api auth not configured' }, { status: 503 });
    }
    const auth = request.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token || !timingSafeEqual(token, env.SUPERVISOR_API_KEY)) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const stub = env.SUPERVISOR.get(env.SUPERVISOR.idFromName('singleton'));
    return stub.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const id = env.SUPERVISOR.idFromName('singleton');
    const stub = env.SUPERVISOR.get(id);
    ctx.waitUntil(
      stub.fetch(new Request('https://supervisor/scheduled', { method: 'POST' })).then(() => undefined),
    );
  },

  // RFC-007 Phase 3: queue consumer — embed terminal runs into supervisor-incidents.
  // Guarded by SUPERVISOR_SEMANTIC_MODE; skips silently when 'off' so the consumer
  // can be deployed before the mode is flipped to 'shadow'/'live'.
  async queue(batch: MessageBatch<IncidentMessage>, env: Env): Promise<void> {
    const mode = env.SUPERVISOR_SEMANTIC_MODE ?? 'off';
    if (mode === 'off') {
      // Acknowledge all messages — do not let them expire into the DLQ while mode is off.
      batch.ackAll();
      return;
    }

    if (!env.AI || !env.VECTORIZE_INCIDENTS) {
      // Bindings absent in local dev — ack and skip rather than retrying forever.
      batch.ackAll();
      return;
    }

    const { embedAndUpsert } = await import('./memory/vector.js');

    for (const msg of batch.messages) {
      const m = msg.body;

      // Idempotency check: skip if already embedded.
      try {
        const existing = await env.MEMORY
          .prepare('SELECT 1 FROM incident_embeddings WHERE run_id = ?')
          .bind(m.run_id)
          .first();
        if (existing) { msg.ack(); continue; }
      } catch {
        // Table may not exist in staging yet — let retry handle it.
        msg.retry();
        continue;
      }

      // Fetch run summary from MEMORY D1 for embedding text.
      let runRow: { description: string; status: string; error_message: string | null } | null = null;
      try {
        runRow = await env.MEMORY
          .prepare('SELECT description, status, error_message FROM runs WHERE run_id = ?')
          .bind(m.run_id)
          .first<{ description: string; status: string; error_message: string | null }>();
      } catch { /* best-effort */ }

      const text = [
        `outcome:${m.outcome}`,
        m.issue_ref ? `issue:${m.issue_ref}` : '',
        m.template_id ? `template:${m.template_id}` : '',
        runRow?.description ?? '',
        runRow?.error_message ?? '',
      ].filter(Boolean).join(' ');

      const ok = await embedAndUpsert(
        env.AI,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VectorizeVectorMetadata vs Record<string,unknown> mismatch; resolved once @latimer-woods-tech/llm exports typed embed()
        env.VECTORIZE_INCIDENTS as any,
        m.run_id,
        text,
        {
          type: 'incident',
          outcome: m.outcome,
          issue_ref: m.issue_ref ?? '',
          template_id: m.template_id ?? '',
          occurred_at: m.occurred_at,
        },
      );

      if (!ok) { msg.retry(); continue; }

      // Write provenance row — idempotent on conflict.
      try {
        await env.MEMORY
          .prepare(
            'INSERT OR IGNORE INTO incident_embeddings (run_id, model_version, dims, embedded_at) VALUES (?, ?, ?, ?)',
          )
          .bind(m.run_id, '@cf/baai/bge-base-en-v1.5', 768, Date.now())
          .run();
      } catch { /* non-fatal — vector is already upserted */ }

      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, IncidentMessage>;
