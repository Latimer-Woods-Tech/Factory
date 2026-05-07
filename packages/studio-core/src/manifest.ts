/**
 * Phase E — Function manifest.
 *
 * Each Factory app advertises its public surface via a JSON document served
 * at `GET /manifest`. Admin Studio crawls these manifests into a central
 * `function_catalog` so the test runner, observability tab, and audit log
 * can group activity by app + path.
 *
 * Apps remain the source of truth — Studio is an observer. This preserves
 * the transferability requirement (see `docs/runbooks/transfer.md`): an app
 * can leave the Factory orbit without breaking Studio's own boot.
 *
 * Versioning: bump `manifestVersion` whenever the schema breaks. Studio's
 * crawler refuses unknown major versions instead of silently dropping
 * fields.
 */

/** Wire-format version. Increment on breaking schema change. */
export const MANIFEST_VERSION = 1;

/** Auth gating level — determines token handling in smoke tests and admin UI. */
export type AuthRequirement = 'public' | 'session' | 'admin' | 'webhook';

/**
 * Reversibility tag — mirrors `AuditEntry.reversibility` so audit log lines
 * can be enriched server-side without each route declaring it twice.
 */
export type Reversibility = 'reversible' | 'irreversible' | 'destructive';

/**
 * SLO target for an individual endpoint. Studio uses these to colour the
 * Functions tab and to drive the "below SLO" Sentry alert routing.
 */
export interface EndpointSlo {
  /** p95 latency budget in ms */
  readonly p95Ms: number;
  /** Acceptable error-rate ceiling, 0..1 (e.g. 0.001 = 99.9%) */
  readonly errorRate: number;
}

/**
 * A single smoke probe the test runner can execute against the deployed
 * endpoint. Keep these idempotent — they will run on production.
 */
export interface SmokeProbe {
  /** Optional human-readable label (e.g. "rejects bad creds") */
  readonly label?: string;
  /** Body to POST/PUT/PATCH; ignored for GET/DELETE */
  readonly body?: unknown;
  /** Query string fragment, e.g. "?id=1" */
  readonly query?: string;
  /** Expected HTTP status (defaults to 200/204 if omitted) */
  readonly expectedStatus?: number;
  /** If set, response JSON must contain this substring (after JSON.stringify) */
  readonly expectContains?: string;
}

/** One entry in the function manifest describing a single HTTP endpoint. */
export interface ManifestEntry {
  /** HTTP method, e.g. 'GET', 'POST' */
  readonly method: string;
  /** Route pattern as registered in Hono (e.g. '/auth/login', '/users/:id') */
  readonly path: string;
  /** Auth gating — used to decide whether to attach a token in smoke tests */
  readonly auth: AuthRequirement;
  /** One-line description for the Functions tab list */
  readonly summary: string;
  /** Optional GitHub team or human owner */
  readonly owner?: string;
  /** Optional reversibility hint for the audit log */
  readonly reversibility?: Reversibility;
  /** Optional SLO target */
  readonly slo?: EndpointSlo;
  /** Optional smoke probes (idempotent only) */
  readonly smoke?: ReadonlyArray<SmokeProbe>;
  /** Optional tags for grouping in UI (e.g. ['billing', 'webhooks']) */
  readonly tags?: ReadonlyArray<string>;
}

/** Full function manifest document served at GET /manifest by each Factory app. */
export interface FunctionManifest {
  /** Schema version */
  readonly manifestVersion: typeof MANIFEST_VERSION;
  /** Logical app name (matches docs/service-registry.yml key) */
  readonly app: string;
  /** Deployed environment, e.g. 'production', 'staging' */
  readonly env: string;
  /** Build SHA for drift detection */
  readonly buildSha?: string;
  /** ISO timestamp of when the manifest was generated */
  readonly generatedAt: string;
  /** Endpoints */
  readonly entries: ReadonlyArray<ManifestEntry>;
}

/**
 * Catalog row — one per (app, env, method, path). Studio stores these
 * after each crawl so historic diffs and ownership lookups stay cheap.
 */
export interface FunctionCatalogRow {
  readonly id: string;
  readonly app: string;
  readonly env: string;
  readonly method: string;
  readonly path: string;
  readonly auth: AuthRequirement;
  readonly summary: string;
  readonly owner: string | null;
  readonly reversibility: Reversibility | null;
  readonly sloP95Ms: number | null;
  readonly sloErrorRate: number | null;
  readonly tags: ReadonlyArray<string>;
  readonly smoke: ReadonlyArray<SmokeProbe>;
  readonly buildSha: string | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

/**
 * Validate a manifest payload received from an app. Returns null on success,
 * or a human-readable reason string on failure. Cheap structural checks only;
 * the crawler can run additional liveness probes once it accepts the shape.
 */
export function validateManifest(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'manifest must be an object';
  const m = raw as Record<string, unknown>;
  if (m.manifestVersion !== MANIFEST_VERSION) {
    return `unsupported manifestVersion ${String(m.manifestVersion)}`;
  }
  if (typeof m.app !== 'string' || !m.app) return 'app required';
  if (typeof m.env !== 'string' || !m.env) return 'env required';
  if (typeof m.generatedAt !== 'string') return 'generatedAt required';
  if (!Array.isArray(m.entries)) return 'entries must be an array';
  for (let i = 0; i < m.entries.length; i += 1) {
    const e = m.entries[i] as Record<string, unknown>;
    if (typeof e.method !== 'string' || !e.method) return `entries[${i}].method required`;
    if (typeof e.path !== 'string' || !e.path.startsWith('/')) {
      return `entries[${i}].path must start with /`;
    }
    if (typeof e.auth !== 'string') return `entries[${i}].auth required`;
    if (typeof e.summary !== 'string') return `entries[${i}].summary required`;
  }
  return null;
}
