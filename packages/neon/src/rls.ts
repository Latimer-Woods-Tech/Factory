/**
 * PostgreSQL Row-Level Security (RLS) template helpers for Factory apps.
 *
 * All functions return SQL strings ready to embed in Drizzle migration files.
 * Run `rlsEnable()` first, then one of the role policy generators, in the
 * same migration file.
 *
 * Roles and their access patterns:
 *   viewer   — SELECT only, filtered to the calling tenant
 *   creator  — SELECT + INSERT, filtered to the calling tenant
 *   admin    — full CRUD (SELECT/INSERT/UPDATE/DELETE), filtered to the calling tenant
 *   operator — unrestricted access for service accounts (no tenant filter)
 *
 * Tenant isolation is enforced via `current_setting('app.tenant_id', TRUE)`,
 * which must be set by the application layer before executing queries
 * (see `withTenant()` in this package).
 */

export type RlsRole = 'viewer' | 'creator' | 'admin' | 'operator';

export interface RlsPolicyOptions {
  /** Table name (unquoted identifier). */
  table: string;
  /** Schema name; defaults to `public`. */
  schema?: string;
  /** Column that stores the tenant identifier; defaults to `tenant_id`. */
  tenantColumn?: string;
  /** SQL cast for the `current_setting` result; defaults to `uuid`. */
  tenantIdType?: string;
}

function qualified(table: string, schema: string): string {
  return `"${schema}"."${table}"`;
}

function tenantCheck(col: string, type: string): string {
  return `${col} = current_setting('app.tenant_id', TRUE)::${type}`;
}

/**
 * Generates SQL that enables and forces RLS on a table.
 * Must be run before any `CREATE POLICY` statements.
 */
export function rlsEnable(opts: RlsPolicyOptions): string {
  const schema = opts.schema ?? 'public';
  const tbl = qualified(opts.table, schema);
  return [
    `ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY;`,
  ].join('\n');
}

/**
 * Viewer policy — SELECT access restricted to the calling tenant's rows.
 */
export function rlsViewerPolicy(opts: RlsPolicyOptions): string {
  const schema = opts.schema ?? 'public';
  const col = opts.tenantColumn ?? 'tenant_id';
  const type = opts.tenantIdType ?? 'uuid';
  const tbl = qualified(opts.table, schema);
  const name = `${opts.table}_tenant_select`;
  const check = tenantCheck(col, type);
  return `CREATE POLICY "${name}" ON ${tbl}\n  FOR SELECT\n  USING (${check});`;
}

/**
 * Creator policy — SELECT + INSERT access restricted to the calling tenant's rows.
 */
export function rlsCreatorPolicy(opts: RlsPolicyOptions): string {
  const schema = opts.schema ?? 'public';
  const col = opts.tenantColumn ?? 'tenant_id';
  const type = opts.tenantIdType ?? 'uuid';
  const tbl = qualified(opts.table, schema);
  const check = tenantCheck(col, type);
  return [
    `CREATE POLICY "${opts.table}_tenant_select" ON ${tbl}\n  FOR SELECT\n  USING (${check});`,
    `CREATE POLICY "${opts.table}_tenant_insert" ON ${tbl}\n  FOR INSERT\n  WITH CHECK (${check});`,
  ].join('\n');
}

/**
 * Admin policy — full CRUD access restricted to the calling tenant's rows.
 */
export function rlsAdminPolicy(opts: RlsPolicyOptions): string {
  const schema = opts.schema ?? 'public';
  const col = opts.tenantColumn ?? 'tenant_id';
  const type = opts.tenantIdType ?? 'uuid';
  const tbl = qualified(opts.table, schema);
  const check = tenantCheck(col, type);
  return `CREATE POLICY "${opts.table}_tenant_all" ON ${tbl}\n  FOR ALL\n  USING (${check})\n  WITH CHECK (${check});`;
}

/**
 * Operator policy — unrestricted access for service accounts.
 * Designed for migrations or admin tooling that must bypass tenant isolation.
 */
export function rlsOperatorPolicy(opts: RlsPolicyOptions): string {
  const schema = opts.schema ?? 'public';
  const tbl = qualified(opts.table, schema);
  return `CREATE POLICY "${opts.table}_operator_all" ON ${tbl}\n  FOR ALL\n  USING (true)\n  WITH CHECK (true);`;
}

/**
 * Generates complete RLS SQL for a table at the given role level.
 * Includes `rlsEnable()` followed by the appropriate `CREATE POLICY` statements.
 *
 * Role levels are cumulative in terms of access:
 *   viewer   → SELECT
 *   creator  → SELECT + INSERT
 *   admin    → SELECT + INSERT + UPDATE + DELETE
 *   operator → all operations, no tenant filter
 */
export function rlsPolicies(role: RlsRole, opts: RlsPolicyOptions): string {
  const enable = rlsEnable(opts);
  let policies: string;
  switch (role) {
    case 'viewer':
      policies = rlsViewerPolicy(opts);
      break;
    case 'creator':
      policies = rlsCreatorPolicy(opts);
      break;
    case 'admin':
      policies = rlsAdminPolicy(opts);
      break;
    case 'operator':
      policies = rlsOperatorPolicy(opts);
      break;
  }
  return `${enable}\n${policies}`;
}
