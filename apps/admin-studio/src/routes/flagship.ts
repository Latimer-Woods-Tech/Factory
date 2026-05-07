/**
 * Flagship Ops Panel — FLG-3
 *
 * 5 endpoints for browsing, toggling, and monitoring feature flags.
 *
 * Routes (all require envContextMiddleware upstream):
 *   GET  /api/flags           — list all flags from registry + 24h eval stats
 *   GET  /api/flags/activity  — last 50 evaluations (most recent first)
 *   GET  /api/flags/:key      — single flag detail + recent evaluations
 *   POST /api/flags/:key/toggle   — flip enabled/disabled (admin/owner only)
 *   POST /api/flags/:key/rollout  — set rollout percentage (admin/owner only)
 *
 * NOTE: Route order matters — /activity must be declared before /:key so
 * Hono does not match "activity" as a :key param.
 */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';

const flagship = new Hono<AppEnv>();

// ── D1 query helpers ──────────────────────────────────────────────────────────

/**
 * Wraps a D1 query promise with a wall-clock timeout.
 *
 * **Why not AbortController?** Cloudflare D1's prepared-statement API (`.run()`,
 * `.all()`, `.first()`) does not accept an `AbortSignal` — passing one silently
 * has no effect and the underlying Worker sub-request cannot be cancelled at the
 * network level. `Promise.race` is the only reliable timeout mechanism available
 * for D1 in the Workers runtime. The D1 request will still complete (or fail)
 * independently; we simply stop waiting for it and return `fallback` so the
 * caller can degrade gracefully without blocking the HTTP response.
 */
async function queryWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error('D1 query timeout')), timeoutMs),
  );
  return Promise.race([promise, timeout]).catch((e) => {
    console.warn('[flagship] D1 timeout or error:', e instanceof Error ? e.message : String(e));
    return fallback;
  });
}

// ── Registry (inlined from flags/registry.yml at build time via static import) ──────────────
// We inline as JSON rather than parsing YAML at runtime to keep the Worker
// free of a YAML parser dependency. The registry structure mirrors registry.yml.

interface FlagEntry {
  type: 'kill_switch' | 'rollout' | 'experiment' | 'ops' | 'config';
  description: string;
  apps: string[];
  owner: string;
  status: 'active' | 'draft' | 'archived';
  default: boolean | string | number;
  variations?: string[];
  created_at: string;
  cleanup_policy: string;
}

interface FlagRegistryRecord {
  key: string;
  entry: FlagEntry;
}

/**
 * Inline representation of flags/registry.yml.
 * Keep this in sync when new flags are added to the YAML.
 * CI enforces the YAML source-of-truth; this copy serves the Ops Panel.
 */
const REGISTRY: FlagRegistryRecord[] = [
  {
    key: 'global:ks:supervisor_automerge',
    entry: {
      type: 'kill_switch',
      description: 'Halt supervisor auto-merge org-wide.',
      apps: ['*'],
      owner: 'factory',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'global:ks:maintenance_mode',
    entry: {
      type: 'kill_switch',
      description: 'Org-wide maintenance banner across all apps.',
      apps: ['*'],
      owner: 'factory',
      status: 'active',
      default: false,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'humandesign:ks:profile_generate',
    entry: {
      type: 'kill_switch',
      description: 'Disable /api/profile/generate instantly.',
      apps: ['humandesign'],
      owner: 'humandesign',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'humandesign:ks:billing_portal',
    entry: {
      type: 'kill_switch',
      description: 'Disable Stripe billing portal if 400s surface.',
      apps: ['humandesign'],
      owner: 'humandesign',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'humandesign:ops:llm_tier',
    entry: {
      type: 'ops',
      description: 'Override LLM tier. Variations fast|balanced|smart.',
      apps: ['humandesign'],
      owner: 'humandesign',
      status: 'active',
      default: 'balanced',
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'humandesign:ro:post_purchase_flow_v2',
    entry: {
      type: 'rollout',
      description: 'New post-purchase flow handling missing chart state.',
      apps: ['humandesign'],
      owner: 'humandesign',
      status: 'draft',
      default: false,
      created_at: '2026-05-07',
      cleanup_policy: 'remove_when_fully_rolled_out',
    },
  },
  {
    key: 'humandesign:ex:annual_pricing_copy',
    entry: {
      type: 'experiment',
      description: 'save_percent vs save_dollars. PostHog measures conversion.',
      apps: ['humandesign'],
      owner: 'factory',
      status: 'draft',
      default: 'save_percent',
      variations: ['save_percent', 'save_dollars'],
      created_at: '2026-05-07',
      cleanup_policy: 'remove_when_winner_declared',
    },
  },
  {
    key: 'videoking:ks:stream_ingest',
    entry: {
      type: 'kill_switch',
      description: 'Kill video ingest pipeline.',
      apps: ['videoking'],
      owner: 'videoking',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'videoking:ks:payout_pipeline',
    entry: {
      type: 'kill_switch',
      description: 'Emergency halt on Stripe payout cron.',
      apps: ['videoking'],
      owner: 'videoking',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'videoking:cfg:moderation_thresholds',
    entry: {
      type: 'config',
      description: 'JSON — toxicity/spam/nsfw thresholds for moderation.',
      apps: ['videoking'],
      owner: 'videoking',
      status: 'active',
      default: '{}',
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'videoking:ro:dm_inbox',
    entry: {
      type: 'rollout',
      description: 'DM inbox UI Sprint 2. Roll to % of creators.',
      apps: ['videoking'],
      owner: 'videoking',
      status: 'draft',
      default: false,
      created_at: '2026-05-07',
      cleanup_policy: 'remove_when_fully_rolled_out',
    },
  },
  {
    key: 'xico-city:ks:profile_api',
    entry: {
      type: 'kill_switch',
      description: 'Kill /api/profile/* if auth issues surface.',
      apps: ['xico-city'],
      owner: 'xico-city',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'factory:ks:pr_generation',
    entry: {
      type: 'kill_switch',
      description: 'Halt supervisor PR generation org-wide.',
      apps: ['factory'],
      owner: 'factory',
      status: 'active',
      default: true,
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
  {
    key: 'factory-admin:ro:flagship_ops_panel',
    entry: {
      type: 'rollout',
      description: 'Flagship management panel in admin console.',
      apps: ['factory-admin'],
      owner: 'factory',
      status: 'draft',
      default: false,
      created_at: '2026-05-07',
      cleanup_policy: 'remove_when_fully_rolled_out',
    },
  },
  {
    key: 'factory-admin:cfg:trial_overrides',
    entry: {
      type: 'config',
      description: 'Per-userId trial length overrides. JSON userId->days.',
      apps: ['factory-admin', 'humandesign', 'videoking'],
      owner: 'factory',
      status: 'active',
      default: '{}',
      created_at: '2026-05-07',
      cleanup_policy: 'permanent',
    },
  },
];

// ── Middleware helpers ────────────────────────────────────────────────────────

/** Require admin or owner role. Reads envContext set by envContextMiddleware. */
const adminOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ctx = c.var.envContext;
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
    return c.json({ error: 'Forbidden — admin or owner role required' }, 403);
  }
  return next();
};

// ── Stat helpers ─────────────────────────────────────────────────────────────

interface FlagStat {
  flag_key: string;
  evals: number;
  fallback_rate: number;
}

/** Pull 24h aggregated stats from FLAG_TELEMETRY D1. Returns empty on missing binding. */
async function fetchStats(db: D1Database | undefined): Promise<Map<string, FlagStat>> {
  const map = new Map<string, FlagStat>();
  if (!db) return map;

  try {
    const since = Date.now() - 86_400_000;
    // Workers share no state; D1 SQLite serializes writes. Concurrent read aggregations
    // are safe — each Worker reads a consistent snapshot independently.
    const { results } = await queryWithTimeout(
      db
        .prepare(
          'SELECT flag_key, COUNT(*) as evals, AVG(default_hit) as fallback_rate ' +
            'FROM flag_evaluations WHERE ts > ? ' +
            'GROUP BY flag_key ORDER BY evals DESC LIMIT 100',
        )
        .bind(since)
        .all<{ flag_key: string; evals: number; fallback_rate: number }>(),
      5_000,
      ({ results: [] } as unknown) as D1Result<{ flag_key: string; evals: number; fallback_rate: number }>,
    );

    for (const row of results) {
      map.set(row.flag_key, {
        flag_key: row.flag_key,
        evals: row.evals,
        fallback_rate: row.fallback_rate,
      });
    }
  } catch (e) {
    console.warn('[flagship] fetchStats failed:', e instanceof Error ? e.message : String(e));
  }

  return map;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/flags
 *
 * Returns the full registry merged with 24h eval stats from FLAG_TELEMETRY D1.
 */
flagship.get('/', async (c) => {
  const stats = await fetchStats(c.env.FLAG_TELEMETRY);

  const flags = REGISTRY.map(({ key, entry }) => {
    const s = stats.get(key);
    return {
      key,
      type: entry.type,
      description: entry.description,
      apps: entry.apps,
      owner: entry.owner,
      status: entry.status,
      default: entry.default,
      variations: entry.variations,
      created_at: entry.created_at,
      cleanup_policy: entry.cleanup_policy,
      stats: s
        ? { evals_24h: s.evals, fallback_rate: s.fallback_rate }
        : { evals_24h: 0, fallback_rate: 0 },
    };
  });

  return c.json({ flags, total: flags.length, generated_at: new Date().toISOString() });
});

/**
 * GET /api/flags/activity
 *
 * Returns the last 50 flag evaluations from FLAG_TELEMETRY, most recent first.
 * Must be declared BEFORE /:key so Hono does not match "activity" as a param.
 */
flagship.get('/activity', async (c) => {
  const db = c.env.FLAG_TELEMETRY;
  if (!db) {
    return c.json({
      degraded: true,
      error: 'FLAG_TELEMETRY binding not configured',
      evaluations: [],
    });
  }

  let results: {
    id: string;
    flag_key: string;
    app: string;
    user_id: string | null;
    plan: string | null;
    env: string;
    result: string;
    default_hit: number;
    ts: number;
  }[] = [];

  try {
    const queryResult = await queryWithTimeout(
      db
        .prepare(
          'SELECT id, flag_key, app, user_id, plan, env, result, default_hit, ts ' +
            'FROM flag_evaluations ORDER BY ts DESC LIMIT 50',
        )
        .all<{
          id: string;
          flag_key: string;
          app: string;
          user_id: string | null;
          plan: string | null;
          env: string;
          result: string;
          default_hit: number;
          ts: number;
        }>(),
      5_000,
      ({ results: [] } as unknown) as D1Result<(typeof results)[number]>,
    );
    results = queryResult.results;
  } catch (e) {
    console.warn('[flagship] activity query failed, returning empty:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'Internal error', evaluations: [] }, 500);
  }

  return c.json({
    evaluations: results,
    count: results.length,
    generated_at: new Date().toISOString(),
  });
});

/**
 * GET /api/flags/:key
 *
 * Returns a single flag's registry entry merged with its recent evaluations.
 * The key contains colons (e.g. humandesign:ks:billing_portal) so the client
 * must URL-encode it (encodeURIComponent) when building the URL.
 */
flagship.get('/:key', async (c) => {
  const rawKey = c.req.param('key');
  const key = decodeURIComponent(rawKey);

  const found = REGISTRY.find((r) => r.key === key);
  if (!found) {
    return c.json({ error: `Flag '${key}' not found in registry` }, 404);
  }

  const db = c.env.FLAG_TELEMETRY;
  let recentEvals: unknown[] = [];
  let evalStats: { evals_24h: number; fallback_rate: number } = { evals_24h: 0, fallback_rate: 0 };

  if (db) {
    try {
      const since = Date.now() - 86_400_000;
      const [statsResult, evalsResult] = await Promise.all([
        queryWithTimeout(
          db
            .prepare(
              'SELECT COUNT(*) as evals, AVG(default_hit) as fallback_rate ' +
                'FROM flag_evaluations WHERE flag_key = ? AND ts > ?',
            )
            .bind(key, since)
            .first<{ evals: number; fallback_rate: number }>(),
          5_000,
          null,
        ),
        queryWithTimeout(
          db
            .prepare(
              'SELECT id, app, user_id, plan, env, result, default_hit, ts ' +
                'FROM flag_evaluations WHERE flag_key = ? ORDER BY ts DESC LIMIT 20',
            )
            .bind(key)
            .all<{
              id: string;
              app: string;
              user_id: string | null;
              plan: string | null;
              env: string;
              result: string;
              default_hit: number;
              ts: number;
            }>(),
          5_000,
          ({ results: [] } as unknown) as D1Result<{ id: string; app: string; user_id: string | null; plan: string | null; env: string; result: string; default_hit: number; ts: number }>,
        ),
      ]);

      if (statsResult) {
        evalStats = {
          evals_24h: statsResult.evals ?? 0,
          fallback_rate: statsResult.fallback_rate ?? 0,
        };
      }
      recentEvals = evalsResult.results;
    } catch (e) {
      console.warn('[flagship] flag detail query failed, degrading gracefully:', e instanceof Error ? e.message : String(e));
      // degrade gracefully — evalStats and recentEvals stay at their empty defaults
    }
  }

  return c.json({
    key,
    type: found.entry.type,
    description: found.entry.description,
    apps: found.entry.apps,
    owner: found.entry.owner,
    status: found.entry.status,
    default: found.entry.default,
    variations: found.entry.variations,
    created_at: found.entry.created_at,
    cleanup_policy: found.entry.cleanup_policy,
    stats: evalStats,
    recent_evaluations: recentEvals,
  });
});

/**
 * POST /api/flags/:key/toggle
 *
 * Flip a flag's status between active and draft.
 * Requires admin/owner role. Write is recorded in the audit trail by
 * auditMiddleware (upstream) because the route is mounted under /api/flags/*.
 *
 * Note: Cloudflare Flagship doesn't expose a management API binding on Workers;
 * the toggle is a logical state tracked in FLAG_TELEMETRY. A real flip would
 * go through the Flagship Dashboard API or a cron job reading this table.
 * This endpoint records the operator intent as a canonical audit event.
 *
 * **Concurrency safety:** each call performs a single INSERT with a freshly
 * generated UUID (`randomblob(8)`). There is no read-then-write sequence on a
 * shared row, so concurrent toggle calls cannot overwrite each other. The D1
 * table is an append-only audit log; the authoritative flag state lives in the
 * Cloudflare Flagship Dashboard, not in this table.
 */
flagship.post('/:key/toggle', adminOnly, async (c) => {
  const rawKey = c.req.param('key');
  const key = decodeURIComponent(rawKey);

  const found = REGISTRY.find((r) => r.key === key);
  if (!found) {
    return c.json({ error: `Flag '${key}' not found in registry` }, 404);
  }

  const db = c.env.FLAG_TELEMETRY;
  if (!db) {
    return c.json({ error: 'FLAG_TELEMETRY binding not configured' }, 503);
  }

  const newStatus = found.entry.status === 'active' ? 'draft' : 'active';
  const actor = c.var.envContext?.userEmail ?? 'unknown';

  try {
    // Record the toggle intent as a synthetic evaluation row for auditability.
    await queryWithTimeout(
      db
        .prepare(
          'INSERT INTO flag_evaluations (id, flag_key, app, user_id, env, result, default_hit, ts) ' +
            "VALUES (lower(hex(randomblob(8))), ?, 'admin-studio', ?, ?, ?, 0, ?)",
        )
        .bind(
          key,
          actor,
          c.env.STUDIO_ENV,
          JSON.stringify({ admin_action: 'toggle', from: found.entry.status, to: newStatus }),
          Date.now(),
        )
        .run(),
      5_000,
      ({ results: [] } as unknown) as D1Result<Record<string, unknown>>,
    );

    return c.json({
      key,
      previous_status: found.entry.status,
      new_status: newStatus,
      actor,
      note: 'Toggle intent recorded. Apply change in Cloudflare Flagship Dashboard to take effect.',
      toggled_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[flagship] toggle insert failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'Internal error' }, 500);
  }
});

/**
 * POST /api/flags/:key/rollout
 *
 * Set a rollout percentage (0–100) for rollout-type flags.
 * Body: { percentage: number }
 * Requires admin/owner role.
 *
 * **Concurrency safety:** identical to the toggle endpoint — each call is a
 * single INSERT with a new UUID. Concurrent rollout calls produce independent
 * audit rows; no shared row is updated, so there is no overwrite hazard.
 */
flagship.post('/:key/rollout', adminOnly, async (c) => {
  const rawKey = c.req.param('key');
  const key = decodeURIComponent(rawKey);

  const found = REGISTRY.find((r) => r.key === key);
  if (!found) {
    return c.json({ error: `Flag '${key}' not found in registry` }, 404);
  }

  if (found.entry.type !== 'rollout') {
    return c.json(
      { error: `Flag '${key}' is type '${found.entry.type}', not 'rollout'. Only rollout flags support percentage control.` },
      400,
    );
  }

  let body: { percentage?: unknown };
  try {
    body = await c.req.json<{ percentage?: unknown }>();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  const percentage = body.percentage;
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return c.json({ error: 'percentage must be a number between 0 and 100' }, 400);
  }

  const db = c.env.FLAG_TELEMETRY;
  if (!db) {
    return c.json({ error: 'FLAG_TELEMETRY binding not configured' }, 503);
  }

  const actor = c.var.envContext?.userEmail ?? 'unknown';

  try {
    await queryWithTimeout(
      db
        .prepare(
          'INSERT INTO flag_evaluations (id, flag_key, app, user_id, env, result, default_hit, ts) ' +
            "VALUES (lower(hex(randomblob(8))), ?, 'admin-studio', ?, ?, ?, 0, ?)",
        )
        .bind(
          key,
          actor,
          c.env.STUDIO_ENV,
          JSON.stringify({ admin_action: 'rollout_set', percentage }),
          Date.now(),
        )
        .run(),
      5_000,
      ({ results: [] } as unknown) as D1Result<Record<string, unknown>>,
    );

    return c.json({
      key,
      percentage,
      actor,
      note: 'Rollout percentage recorded. Apply change in Cloudflare Flagship Dashboard to take effect.',
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[flagship] rollout insert failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: 'Internal error' }, 500);
  }
});

export { flagship };
