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

export { sql, eq, and } from 'drizzle-orm';

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
 * Sets `app.tenant_id` via `SET LOCAL` inside an explicit transaction so that
 * RLS policies keyed on `current_setting('app.tenant_id', TRUE)` filter
 * correctly.
 *
 * `SET LOCAL` only takes effect for the duration of the surrounding transaction.
 * Without an explicit transaction, `set_config(..., is_local := true)` falls
 * back to session scope, which leaks the tenant value across requests on the
 * same pooled connection.  Wrapping the callback in `db.transaction()` ensures
 * the setting is scoped to a single transaction and automatically cleared when
 * the transaction commits or rolls back.
 *
 * @param db - Drizzle client returned by {@link createDb}.
 * @param tenantId - Tenant identifier injected into the RLS policy.
 * @param fn - Callback invoked with the transaction-scoped client.
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

  return (db as unknown as PostgresJsDatabase<Record<string, never>>).transaction(async (tx) => {
    const txDb = tx as unknown as FactoryDb;
    await txDb.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
    return fn(txDb);
  });
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

/**
 * Factory read-layer schema — Admin Build Plan P1.2.
 *
 * Drizzle table definitions for `factory_events_ingest`, `factory_gates`,
 * and `factory_artifacts`. SQL migration: migrations/0101_factory_read_layer.sql.
 */
export * from './factory/schema.js';