import { describe, expect, it } from 'vitest';
import {
  rlsAdminPolicy,
  rlsCreatorPolicy,
  rlsEnable,
  rlsOperatorPolicy,
  rlsPolicies,
  rlsViewerPolicy,
} from './rls.js';

// ---------------------------------------------------------------------------
// rlsEnable
// ---------------------------------------------------------------------------

describe('rlsEnable', () => {
  it('generates ENABLE and FORCE statements for default schema', () => {
    const sql = rlsEnable({ table: 'bookings' });
    expect(sql).toContain('ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE "public"."bookings" FORCE ROW LEVEL SECURITY;');
  });

  it('respects custom schema', () => {
    const sql = rlsEnable({ table: 'sessions', schema: 'app' });
    expect(sql).toContain('"app"."sessions"');
  });
});

// ---------------------------------------------------------------------------
// rlsViewerPolicy
// ---------------------------------------------------------------------------

describe('rlsViewerPolicy', () => {
  it('generates a SELECT-only policy using app.tenant_id', () => {
    const sql = rlsViewerPolicy({ table: 'bookings' });
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain("current_setting('app.tenant_id', TRUE)::uuid");
    expect(sql).toContain('tenant_id');
    expect(sql).not.toContain('INSERT');
    expect(sql).not.toContain('UPDATE');
    expect(sql).not.toContain('DELETE');
  });

  it('uses custom tenantColumn', () => {
    const sql = rlsViewerPolicy({ table: 'items', tenantColumn: 'org_id' });
    expect(sql).toContain('org_id');
  });

  it('uses custom tenantIdType', () => {
    const sql = rlsViewerPolicy({ table: 'items', tenantIdType: 'text' });
    expect(sql).toContain('::text');
  });

  it('names the policy with table prefix', () => {
    const sql = rlsViewerPolicy({ table: 'bookings' });
    expect(sql).toContain('"bookings_tenant_select"');
  });
});

// ---------------------------------------------------------------------------
// rlsCreatorPolicy
// ---------------------------------------------------------------------------

describe('rlsCreatorPolicy', () => {
  it('generates SELECT and INSERT policies', () => {
    const sql = rlsCreatorPolicy({ table: 'posts' });
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('FOR INSERT');
    expect(sql).toContain('WITH CHECK');
    expect(sql).not.toContain('UPDATE');
    expect(sql).not.toContain('DELETE');
  });

  it('includes both policy names', () => {
    const sql = rlsCreatorPolicy({ table: 'posts' });
    expect(sql).toContain('"posts_tenant_select"');
    expect(sql).toContain('"posts_tenant_insert"');
  });

  it('uses correct tenant filter in both policies', () => {
    const sql = rlsCreatorPolicy({ table: 'posts' });
    const occurrences = (sql.match(/current_setting\('app\.tenant_id'/g) ?? []).length;
    expect(occurrences).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// rlsAdminPolicy
// ---------------------------------------------------------------------------

describe('rlsAdminPolicy', () => {
  it('generates a single FOR ALL policy with USING and WITH CHECK', () => {
    const sql = rlsAdminPolicy({ table: 'subscriptions' });
    expect(sql).toContain('FOR ALL');
    expect(sql).toContain('USING');
    expect(sql).toContain('WITH CHECK');
    expect(sql).toContain('"subscriptions_tenant_all"');
  });

  it('scopes both clauses to current tenant', () => {
    const sql = rlsAdminPolicy({ table: 'subscriptions' });
    const occurrences = (sql.match(/current_setting\('app\.tenant_id'/g) ?? []).length;
    expect(occurrences).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// rlsOperatorPolicy
// ---------------------------------------------------------------------------

describe('rlsOperatorPolicy', () => {
  it('generates an unrestricted FOR ALL policy', () => {
    const sql = rlsOperatorPolicy({ table: 'users' });
    expect(sql).toContain('FOR ALL');
    expect(sql).toContain('USING (true)');
    expect(sql).toContain('WITH CHECK (true)');
    expect(sql).toContain('"users_operator_all"');
  });

  it('does not include tenant_id filter', () => {
    const sql = rlsOperatorPolicy({ table: 'users' });
    expect(sql).not.toContain('current_setting');
  });
});

// ---------------------------------------------------------------------------
// rlsPolicies (combined)
// ---------------------------------------------------------------------------

describe('rlsPolicies', () => {
  it('viewer role includes ENABLE and SELECT policy only', () => {
    const sql = rlsPolicies('viewer', { table: 'events' });
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FOR SELECT');
    expect(sql).not.toContain('FOR INSERT');
    expect(sql).not.toContain('FOR ALL');
  });

  it('creator role includes ENABLE, SELECT, and INSERT policies', () => {
    const sql = rlsPolicies('creator', { table: 'events' });
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('FOR INSERT');
    expect(sql).not.toContain('FOR ALL');
  });

  it('admin role includes ENABLE and FOR ALL policy', () => {
    const sql = rlsPolicies('admin', { table: 'events' });
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FOR ALL');
  });

  it('operator role includes ENABLE and unrestricted FOR ALL policy', () => {
    const sql = rlsPolicies('operator', { table: 'events' });
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('USING (true)');
  });

  it('custom schema propagates to both ENABLE and POLICY statements', () => {
    const sql = rlsPolicies('admin', { table: 'logs', schema: 'audit' });
    const count = (sql.match(/"audit"\."logs"/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
