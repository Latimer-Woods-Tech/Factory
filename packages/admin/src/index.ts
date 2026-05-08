import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { sql } from '@latimer-woods-tech/neon';
import type { FactoryDb } from '@latimer-woods-tech/neon';

export { createEntitlementsRouter, type EntitlementsRouterEnv, type GrantRequest, type RevokeRequest, type AuditLogEntry } from './entitlements-routes.js';
import type { Analytics } from '@latimer-woods-tech/analytics';
import {
  InternalError,
  NotFoundError,
  ErrorCodes,
  FactoryBaseError,
  AuthError,
  ForbiddenError,
  ValidationError,
} from '@latimer-woods-tech/errors';

// ---------------------------------------------------------------------------
// 0.2.0 API — preserved verbatim for back-compat
// ---------------------------------------------------------------------------

/** Options required when constructing the admin Hono router. */
export interface AdminRouterOpts {
  db: FactoryDb;
  analytics: Analytics;
  appId: string;
}

/** Aggregate metrics returned by GET /admin — displayed on the dashboard overview. */
export interface DashboardSummary {
  appId: string;
  totalUsers: number;
  activeUsers: number;
  recentEvents: number;
}

/** User row shape returned by GET /admin/users. */
export interface UserRow { id: string; email: string; status: string; created_at: string }
/** Factory event row shape returned by GET /admin/events. */
export interface EventRow { event: string; user_id: string | null; occurred_at: string; properties: string | Record<string, unknown> }

/**
 * Creates a Hono router that an app mounts at `/admin`.
 * Unchanged from 0.2.0 — routes: `GET /`, `GET /users`, `GET /users/:id`,
 * `POST /users/:id/suspend`, `GET /events`, `GET /health`.
 */
export function createAdminRouter(opts: AdminRouterOpts): Hono {
  const { db, appId } = opts;
  const router = new Hono();

  router.onError((err, c) => {
    if (err instanceof FactoryBaseError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400 | 401 | 403 | 404 | 500);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  router.get('/', async (c) => {
    interface CountRow extends Record<string, unknown> { count: string }
    const [total, active, events] = await Promise.all([
      db.execute<CountRow>(sql`SELECT COUNT(*) AS count FROM users`),
      db.execute<CountRow>(sql`SELECT COUNT(*) AS count FROM users WHERE status = 'active'`),
      db.execute<CountRow>(
        sql`SELECT COUNT(*) AS count FROM factory_events
            WHERE app_id = ${appId}
              AND occurred_at > NOW() - INTERVAL '24 hours'`,
      ),
    ]);
    const summary: DashboardSummary = {
      appId,
      totalUsers: Number(total.rows[0]?.count ?? 0),
      activeUsers: Number(active.rows[0]?.count ?? 0),
      recentEvents: Number(events.rows[0]?.count ?? 0),
    };
    return c.json(summary);
  });

  router.get('/users', async (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')));
    const offset = (page - 1) * limit;
    interface UsersRow extends Record<string, unknown> { id: string; email: string; status: string; created_at: string }
    const rows = await db.execute<UsersRow>(
      sql`SELECT id, email, status, created_at FROM users
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
    );
    return c.json({ page, limit, users: rows.rows });
  });

  router.get('/users/:id', async (c) => {
    const id = c.req.param('id');
    interface UserDetailRow extends Record<string, unknown> { id: string; email: string; status: string; created_at: string }
    interface SubRow extends Record<string, unknown> { plan: string; mrr: string | number; status: string }
    const userRows = await db.execute<UserDetailRow>(
      sql`SELECT id, email, status, created_at FROM users WHERE id = ${id} LIMIT 1`,
    );
    const user = userRows.rows[0];
    if (!user) throw new NotFoundError(`User ${id} not found`);
    const subRows = await db.execute<SubRow>(
      sql`SELECT plan, mrr, status FROM stripe_subscriptions WHERE user_id = ${id}`,
    );
    return c.json({ user, subscriptions: subRows.rows });
  });

  router.post('/users/:id/suspend', async (c) => {
    const id = c.req.param('id');
    const result = await db.execute(
      sql`UPDATE users SET status = 'suspended' WHERE id = ${id}`,
    );
    if ((result.rowCount ?? 0) === 0) throw new NotFoundError(`User ${id} not found`);
    return c.json({ success: true, userId: id, status: 'suspended' });
  });

  router.get('/events', async (c) => {
    interface FactoryEvtRow extends Record<string, unknown> {
      event: string; user_id: string | null; occurred_at: string; properties: string;
    }
    const rows = await db.execute<FactoryEvtRow>(
      sql`SELECT event, user_id, occurred_at, properties
          FROM factory_events
          WHERE app_id = ${appId}
          ORDER BY occurred_at DESC
          LIMIT 100`,
    );
    const events = rows.rows.map((r: FactoryEvtRow) => ({
      event: r.event,
      userId: r.user_id,
      occurredAt: r.occurred_at,
      properties: (typeof r.properties === 'string'
        ? JSON.parse(r.properties)
        : r.properties) as Record<string, unknown>,
    }));
    return c.json({ events });
  });

  router.get('/health', async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: 'ok', db: 'connected', appId });
    } catch (err) {
      throw new InternalError('Database connectivity check failed', {
        code: ErrorCodes.DB_CONNECTION_FAILED,
        cause: (err as Error).message,
      });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// 0.3.0 — Capability primitives (additive, supervisor-ready)
// ---------------------------------------------------------------------------

/**
 * Graded side-effects level for a route. The supervisor uses this to decide
 * whether a plan step needs human approval, an audit trail, or a second
 * verifier pass.
 */
export type SideEffects = 'none' | 'read-external' | 'write-app' | 'write-external';

/**
 * Slot specification. Each slot on a route has one validation strategy;
 * referential_check callbacks return a promise<boolean> and let the caller
 * look up foreign keys (e.g. "is this user_id in the users table?").
 */
export type SlotSpec =
  | { type: 'string'; regex?: string; minLen?: number; maxLen?: number }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'enum'; values: readonly string[] }
  | { type: 'boolean' }
  | { type: 'referential'; check: (value: string) => Promise<boolean>; kind: string };

/**
 * Capability definition for a single route — the runtime parallel of the
 * forward-declared entries in each app's `capabilities.yml`.
 */
export interface RouteCapability {
  route: string;                           // e.g. "POST /admin/users/:id/suspend"
  side_effects: SideEffects;
  required_scope: string;                  // JWT claim required
  slots?: Record<string, SlotSpec>;
  extra_guard?: 'requires_codeowner_approval' | 'none';
}

/**
 * JWT verification options. Supports HS256 only in 0.3.0 — RS256 follows in
 * a patch release once the supervisor gains access to a JWKS endpoint.
 */
export interface JwtVerifyOpts {
  secret: string;
  issuer?: string;
  audience?: string;
  now?: () => number;
}

/**
 * Decoded JWT payload after verification.
 */
export interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  scope?: string;          // space-delimited
  scopes?: string[];       // alt array form
  [claim: string]: unknown;
}

// -- JWT verify (HS256 only) -------------------------------------------------

function base64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Verifies an HS256 JWT. Throws AuthError on failure.
 */
export async function verifyJwt(token: string, opts: JwtVerifyOpts): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('malformed JWT');
  const [h64, p64, s64] = parts as [string, string, string];

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(h64))) as { alg?: string; typ?: string };
  if (header.alg !== 'HS256') throw new AuthError(`unsupported alg ${String(header.alg)}`);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(opts.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`${h64}.${p64}`)),
  );
  const provided = base64urlDecode(s64);
  if (!timingSafeEqual(signature, provided)) throw new AuthError('bad signature');

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(p64))) as JwtPayload;
  const now = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  if (payload.exp && payload.exp < now) throw new AuthError('token expired');
  if (opts.issuer && payload.iss !== opts.issuer) throw new AuthError('bad issuer');
  if (opts.audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!aud.includes(opts.audience)) throw new AuthError('bad audience');
  }
  return payload;
}

function payloadScopes(p: JwtPayload): Set<string> {
  const s = new Set<string>();
  if (typeof p.scope === 'string') for (const tok of p.scope.split(/\s+/)) if (tok) s.add(tok);
  if (Array.isArray(p.scopes)) for (const tok of p.scopes) if (typeof tok === 'string') s.add(tok);
  return s;
}

/**
 * Returns true if `payload` carries `required` (or a wildcard that covers it).
 * Wildcards: `admin:*` covers `admin:write`; `*` covers everything.
 */
export function scopeMatches(payload: JwtPayload, required: string): boolean {
  const scopes = payloadScopes(payload);
  if (scopes.has(required) || scopes.has('*')) return true;
  const [ns] = required.split(':');
  if (ns && scopes.has(`${ns}:*`)) return true;
  return false;
}

// -- Slot validation ---------------------------------------------------------

/**
 * Validates `input` against `slots`. Throws ValidationError on the first
 * failure (no multi-error aggregation in 0.3.0 — caller can retry with fixed
 * input and see next error).
 */
export async function validateSlots(
  slots: Record<string, SlotSpec>,
  input: Record<string, unknown>,
): Promise<void> {
  for (const [name, spec] of Object.entries(slots)) {
    const v = input[name];
    if (v === undefined || v === null) {
      throw new ValidationError(`missing slot: ${name}`);
    }
    switch (spec.type) {
      case 'string': {
        if (typeof v !== 'string') throw new ValidationError(`slot ${name}: expected string`);
        if (spec.minLen !== undefined && v.length < spec.minLen) throw new ValidationError(`slot ${name}: too short`);
        if (spec.maxLen !== undefined && v.length > spec.maxLen) throw new ValidationError(`slot ${name}: too long`);
        if (spec.regex && !new RegExp(spec.regex).test(v)) throw new ValidationError(`slot ${name}: regex mismatch`);
        break;
      }
      case 'number': {
        if (typeof v !== 'number' || Number.isNaN(v)) throw new ValidationError(`slot ${name}: expected number`);
        if (spec.integer && !Number.isInteger(v)) throw new ValidationError(`slot ${name}: expected integer`);
        if (spec.min !== undefined && v < spec.min) throw new ValidationError(`slot ${name}: below min`);
        if (spec.max !== undefined && v > spec.max) throw new ValidationError(`slot ${name}: above max`);
        break;
      }
      case 'enum': {
        if (typeof v !== 'string' || !spec.values.includes(v)) throw new ValidationError(`slot ${name}: not in enum`);
        break;
      }
      case 'boolean': {
        if (typeof v !== 'boolean') throw new ValidationError(`slot ${name}: expected boolean`);
        break;
      }
      case 'referential': {
        if (typeof v !== 'string') throw new ValidationError(`slot ${name}: expected string for ${spec.kind}`);
        const ok = await spec.check(v);
        if (!ok) throw new ValidationError(`slot ${name}: ${spec.kind} not found`);
        break;
      }
    }
  }
}

// -- Audit sink --------------------------------------------------------------

/** Audit record written to the audit sink for every capability-gated route invocation. */
export interface AuditRecord {
  at: number;
  route: string;
  side_effects: SideEffects;
  actor: string;
  sub?: string;
  scopes: string[];
  slots: Record<string, unknown>;
  status: 'allowed' | 'denied';
  reason?: string;
}

/** Sink that receives audit records — implement to persist to DB, log to Sentry, etc. */
export interface AuditSink {
  write(r: AuditRecord): Promise<void> | void;
}

// -- Middleware --------------------------------------------------------------

/** Options for {@link createCapabilityMiddleware} — capability, JWT config, optional audit sink. */
export interface CapabilityMiddlewareOpts {
  capability: RouteCapability;
  jwt: JwtVerifyOpts;
  audit?: AuditSink;
  /**
   * Hook invoked when a route declares `extra_guard: 'requires_codeowner_approval'`.
   * Return `{ approved: true }` to let the call through. Supervisor-side agents
   * will return false unless a codeowner has explicitly approved the operation.
   * Humans with bypass rights return true.
   */
  checkCodeownerApproval?: (r: { route: string; slots: Record<string, unknown>; payload: JwtPayload }) => Promise<{ approved: boolean; reason?: string }>;
  /** Scope claim of the ambient actor — `supervisor | human | agent`. */
  actorFromPayload?: (p: JwtPayload) => string;
}

/**
 * Hono middleware enforcing one RouteCapability. Order:
 *   1. Extract bearer token, verifyJwt, fail 401 on bad
 *   2. Check required_scope, fail 403 on missing
 *   3. Parse slots from body + query + path params, validate, fail 422
 *   4. If extra_guard set, invoke checkCodeownerApproval, fail 403 if denied
 *   5. Emit audit record (allowed), attach parsed slots + payload to context
 *
 * On success, `c.get('capability.slots')` and `c.get('capability.payload')`
 * are populated for the route handler.
 */
export function createCapabilityMiddleware(opts: CapabilityMiddlewareOpts): MiddlewareHandler {
  const { capability, jwt, audit } = opts;
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!m) {
      await audit?.write({
        at: Date.now(), route: capability.route, side_effects: capability.side_effects,
        actor: 'unknown', scopes: [], slots: {}, status: 'denied', reason: 'no bearer token',
      });
      throw new AuthError('missing bearer token');
    }
    let payload: JwtPayload;
    try {
      payload = await verifyJwt(m[1]!, jwt);
    } catch (e) {
      await audit?.write({
        at: Date.now(), route: capability.route, side_effects: capability.side_effects,
        actor: 'unknown', scopes: [], slots: {}, status: 'denied',
        reason: e instanceof Error ? e.message : 'verify failed',
      });
      throw e;
    }
    if (!scopeMatches(payload, capability.required_scope)) {
      await audit?.write({
        at: Date.now(), route: capability.route, side_effects: capability.side_effects,
        actor: opts.actorFromPayload?.(payload) ?? payload.sub ?? 'unknown',
        sub: payload.sub, scopes: [...payloadScopes(payload)], slots: {}, status: 'denied',
        reason: `missing scope ${capability.required_scope}`,
      });
      throw new ForbiddenError(`requires scope ${capability.required_scope}`);
    }

    // Gather slots from path, query, and body
    const slotInput: Record<string, unknown> = {};
    if (capability.slots) {
      const body: Record<string, unknown> = {};
      try {
        const ct = c.req.header('content-type') ?? '';
        if (ct.includes('application/json')) {
          const json = (await c.req.json()) as unknown;
          if (json && typeof json === 'object') Object.assign(body, json);
        }
      } catch { /* empty body */ }
      for (const name of Object.keys(capability.slots)) {
        slotInput[name] =
          c.req.param(name) ??
          c.req.query(name) ??
          body[name];
      }
      try {
        await validateSlots(capability.slots, slotInput);
      } catch (e) {
        await audit?.write({
          at: Date.now(), route: capability.route, side_effects: capability.side_effects,
          actor: opts.actorFromPayload?.(payload) ?? payload.sub ?? 'unknown',
          sub: payload.sub, scopes: [...payloadScopes(payload)], slots: slotInput, status: 'denied',
          reason: e instanceof Error ? e.message : 'slot validation failed',
        });
        throw e;
      }
    }

    if (capability.extra_guard === 'requires_codeowner_approval' && opts.checkCodeownerApproval) {
      const check = await opts.checkCodeownerApproval({ route: capability.route, slots: slotInput, payload });
      if (!check.approved) {
        await audit?.write({
          at: Date.now(), route: capability.route, side_effects: capability.side_effects,
          actor: opts.actorFromPayload?.(payload) ?? payload.sub ?? 'unknown',
          sub: payload.sub, scopes: [...payloadScopes(payload)], slots: slotInput, status: 'denied',
          reason: check.reason ?? 'codeowner approval required',
        });
        throw new ForbiddenError(check.reason ?? 'codeowner approval required');
      }
    }

    await audit?.write({
      at: Date.now(), route: capability.route, side_effects: capability.side_effects,
      actor: opts.actorFromPayload?.(payload) ?? payload.sub ?? 'unknown',
      sub: payload.sub, scopes: [...payloadScopes(payload)], slots: slotInput, status: 'allowed',
    });

    c.set('capability.slots' as never, slotInput);
    c.set('capability.payload' as never, payload);
    await next();
  };
}
