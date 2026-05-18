/**
 * Phase E — Function catalog persistence.
 *
 * Upserts one row per (app, env, method, path) on every successful crawl
 * of an app's `/manifest`. `first_seen_at` is preserved on conflict so we
 * keep the historical "this endpoint has existed since X" datapoint;
 * `last_seen_at` rolls forward.
 *
 * Best-effort like audit-store — DB outage must not 5xx the crawl
 * response; the route surfaces a soft warning instead.
 */
import { createDb, sql, type FactoryDb, type HyperdriveBinding } from '@latimer-woods-tech/neon';
import type {
  FunctionCatalogRow,
  FunctionManifest,
  ManifestEntry,
  SmokeProbe,
  AuthRequirement,
  Reversibility,
} from '@latimer-woods-tech/studio-core';

const dbCache = new WeakMap<HyperdriveBinding, FactoryDb>();

function getDb(hyperdrive: HyperdriveBinding): FactoryDb {
  let db = dbCache.get(hyperdrive);
  if (!db) {
    db = createDb(hyperdrive);
    dbCache.set(hyperdrive, db);
  }
  return db;
}

export interface UpsertResult {
  upserted: number;
  failed: number;
}

/**
 * Upsert every entry in a manifest. Each row uses a deterministic UUID v5
 * substitute (sha-256 of `app|env|method|path`) so retries do not generate
 * stale duplicates if `ON CONFLICT` is missing on some replicas.
 */
export async function upsertManifest(
  hyperdrive: HyperdriveBinding,
  manifest: FunctionManifest,
): Promise<UpsertResult> {
  const db = getDb(hyperdrive);
  let upserted = 0;
  let failed = 0;
  for (const e of manifest.entries) {
    try {
      const id = await stableId(manifest.app, manifest.env, e.method, e.path);
      await db.execute(sql`
        INSERT INTO function_catalog (
          id, app, env, method, path, auth, summary, owner, reversibility,
          slo_p95_ms, slo_error_rate, tags, smoke, build_sha,
          first_seen_at, last_seen_at
        ) VALUES (
          ${id},
          ${manifest.app},
          ${manifest.env},
          ${e.method},
          ${e.path},
          ${e.auth},
          ${e.summary},
          ${e.owner ?? null},
          ${e.reversibility ?? null},
          ${e.slo?.p95Ms ?? null},
          ${e.slo?.errorRate ?? null},
          ${JSON.stringify(e.tags ?? [])}::jsonb,
          ${JSON.stringify(e.smoke ?? [])}::jsonb,
          ${manifest.buildSha ?? null},
          now(),
          now()
        )
        ON CONFLICT (app, env, method, path) DO UPDATE SET
          auth = EXCLUDED.auth,
          summary = EXCLUDED.summary,
          owner = EXCLUDED.owner,
          reversibility = EXCLUDED.reversibility,
          slo_p95_ms = EXCLUDED.slo_p95_ms,
          slo_error_rate = EXCLUDED.slo_error_rate,
          tags = EXCLUDED.tags,
          smoke = EXCLUDED.smoke,
          build_sha = EXCLUDED.build_sha,
          last_seen_at = now()
      `);
      upserted += 1;
    } catch (err) {
      console.error('[catalog-store] upsert failed:', (err as Error).message);
      failed += 1;
    }
  }
  return { upserted, failed };
}

/**
 * Sha-256 of "app|env|method|path" → UUID v4-shaped string.
 * Deterministic so re-crawls hit the same row. Web Crypto only.
 */
async function stableId(app: string, env: string, method: string, path: string): Promise<string> {
  const data = new TextEncoder().encode(`${app}|${env}|${method.toUpperCase()}|${path}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buf);
  // Force RFC4122 v4 layout so Postgres uuid type accepts it.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

interface DbRow extends Record<string, unknown> {
  id: string;
  app: string;
  env: string;
  method: string;
  path: string;
  auth: string;
  summary: string;
  owner: string | null;
  reversibility: string | null;
  slo_p95_ms: number | null;
  slo_error_rate: number | null;
  tags: unknown;
  smoke: unknown;
  build_sha: string | null;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
}

function toIso(v: string | Date): string {
  return typeof v === 'string' ? v : v.toISOString();
}

function toRow(r: DbRow): FunctionCatalogRow {
  return {
    id: r.id,
    app: r.app,
    env: r.env,
    method: r.method,
    path: r.path,
    auth: r.auth as AuthRequirement,
    summary: r.summary,
    owner: r.owner,
    reversibility: r.reversibility as Reversibility | null,
    sloP95Ms: r.slo_p95_ms,
    sloErrorRate: r.slo_error_rate,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    smoke: Array.isArray(r.smoke) ? (r.smoke as SmokeProbe[]) : [],
    buildSha: r.build_sha,
    firstSeenAt: toIso(r.first_seen_at),
    lastSeenAt: toIso(r.last_seen_at),
  };
}

export async function listCatalog(
  hyperdrive: HyperdriveBinding,
  app?: string,
  env?: string,
): Promise<FunctionCatalogRow[]> {
  const db = getDb(hyperdrive);
  // FactoryDb.execute returns { rows, rowCount }; the previous code cast
  // the whole result as the rows array, which is why /catalog 500'd with
  // "rows.map is not a function" in production.
  const result = await db.execute<DbRow>(sql`
    SELECT id, app, env, method, path, auth, summary, owner, reversibility,
           slo_p95_ms, slo_error_rate, tags, smoke, build_sha,
           first_seen_at, last_seen_at
      FROM function_catalog
     WHERE (${app ?? null}::text IS NULL OR app = ${app ?? null})
       AND (${env ?? null}::text IS NULL OR env = ${env ?? null})
     ORDER BY app, env, path, method
  `);
  return result.rows.map(toRow);
}

export interface CatalogSummary {
  app: string;
  env: string;
  endpoints: number;
  lastSeenAt: string;
}

export async function summariseCatalog(
  hyperdrive: HyperdriveBinding,
): Promise<CatalogSummary[]> {
  const db = getDb(hyperdrive);
  const result = await db.execute<{
    app: string;
    env: string;
    endpoints: number;
    last_seen_at: string | Date;
  }>(sql`
    SELECT app, env, COUNT(*)::int AS endpoints, MAX(last_seen_at) AS last_seen_at
      FROM function_catalog
     GROUP BY app, env
     ORDER BY app, env
  `);
  return result.rows.map((r) => ({
    app: r.app,
    env: r.env,
    endpoints: Number(r.endpoints),
    lastSeenAt: toIso(r.last_seen_at),
  }));
}

/** Convenience used by smoke runner — load smoke probes for an app/env. */
export async function listSmokeProbes(
  hyperdrive: HyperdriveBinding,
  app: string,
  env: string,
): Promise<Array<{ method: string; path: string; auth: AuthRequirement; probes: SmokeProbe[] }>> {
  const rows = await listCatalog(hyperdrive, app, env);
  return rows
    .filter((r) => r.smoke.length > 0)
    .map((r) => ({ method: r.method, path: r.path, auth: r.auth, probes: [...r.smoke] }));
}

// Re-export for symmetry with audit-store.
export type { ManifestEntry };
