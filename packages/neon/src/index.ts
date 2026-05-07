import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { SQLWrapper } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { InternalError, ErrorCodes } from '@latimer-woods-tech/errors';

/**
 * Query result shape consumed by Factory data packages.
 */
export interface FactoryQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> {
  /** Rows returned by the SQL statement. */
  rows: TRow[];
  /** Number of rows affected or returned, when reported by the driver. */
  rowCount: number;
}

type HyperdriveDrizzleDb = PostgresJsDatabase<Record<string, never>> & {
  $client: postgres.Sql;
};

/**
 * Drizzle client bound to a Hyperdrive-routed Postgres connection.
 *
 * The `execute` method only accepts {@link SQLWrapper} (i.e. values produced
 * by the `sql` template tag or drizzle query builders).  Raw `string` is
 * intentionally excluded to prevent accidental SQL injection — always use
 * the `sql` tagged-template literal to compose queries.
 */
export type FactoryDb = Omit<HyperdriveDrizzleDb, 'execute'> & {
  execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
    query: SQLWrapper,
  ): Promise<FactoryQueryResult<TRow>>;
};

export { sql } from 'drizzle-orm';

/**
 * Minimal Cloudflare Hyperdrive-compatible binding shape.
 * Only `connectionString` is consumed.
 */
export interface HyperdriveBinding {
  readonly connectionString: string;
}

/**
 * Options accepted by {@link runMigrations}.
 */
export interface RunMigrationsOptions {
  /** Path to the folder containing Drizzle-generated SQL migration files. */
  migrationsFolder: string;
}

interface PostgresJsMigratorModule {
  migrate(db: PostgresJsDatabase<Record<string, never>>, config: RunMigrationsOptions): Promise<void>;
}

/**
 * Creates a Drizzle client bound to a Cloudflare Hyperdrive connection.
 *
 * @param hyperdrive - Hyperdrive binding (typically `env.DB`).
 * @returns A Drizzle client wrapping the Neon HTTP driver.
 */
export function createDb(hyperdrive: HyperdriveBinding): FactoryDb {
  if (!hyperdrive?.connectionString) {
    throw new InternalError('Hyperdrive connectionString is required', {
      code: ErrorCodes.DB_CONNECTION_FAILED,
    });
  }

  const client = postgres(hyperdrive.connectionString, { prepare: false });
  const db = drizzle(client);
  const execute = db.execute.bind(db);

  return Object.assign(db, {
    async execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
      query: SQLWrapper,
    ): Promise<FactoryQueryResult<TRow>> {
      const result = await execute<TRow>(query);
      const rows = Array.from(result) as TRow[];
      return { rows, rowCount: result.count ?? rows.length };
    },
  }) as FactoryDb;
}

/**
 * Sets `app.tenant_id` for RLS policies and runs the supplied callback.
 *
 * @param db - Drizzle client returned by {@link createDb}.
 * @param tenantId - Tenant identifier injected into the RLS policy.
 * @param fn - Callback invoked with the configured client.
 * @returns The resolved value of `fn`.
 */
export async function withTenant<T>(
  db: FactoryDb,
  tenantId: string,
  fn: (db: FactoryDb) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new InternalError('tenantId is required for withTenant', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
  return fn(db);
}

/**
 * Applies pending Drizzle migrations to the database.
 *
 * Intended for build/deploy scripts only — the underlying migrator
 * reads SQL files from disk and is not Workers-runtime safe.
 *
 * @param db - Drizzle client returned by {@link createDb}.
 * @param options - Migration options including the migrations folder.
 */
export async function runMigrations(
  db: FactoryDb,
  options: RunMigrationsOptions,
): Promise<void> {
  const migratorModule = 'drizzle-orm/postgres-js/migrator';
  const migrator = await import(migratorModule) as PostgresJsMigratorModule;
  await migrator.migrate(db as unknown as PostgresJsDatabase<Record<string, never>>, { migrationsFolder: options.migrationsFolder });
}

/**
 * W360-005: Practitioner Studio Entitlements Module
 *
 * Revenue model for self-serve video generation product.
 * Exports schema, service layer, and webhook handler.
 */
export * from './entitlements/index.js';