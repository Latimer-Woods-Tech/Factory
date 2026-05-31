import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { FactoryDb } from '@latimer-woods-tech/neon';
import {
  createAdminRouter,
  verifyJwt,
  scopeMatches,
  validateSlots,
  createCapabilityMiddleware,
  type AuditRecord,
  type AuditSink,
  type DashboardSummary,
  type JwtPayload,
  type RouteCapability,
} from './index.js';

// ---- helpers ---------------------------------------------------------------
const SECRET = 'test-secret-longer-than-32-chars-please';

function b64url(buf: Uint8Array | string): string {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function mintHs256(payload: Record<string, unknown>, secret = SECRET): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}

describe('verifyJwt', () => {
  it('verifies a valid HS256 token', async () => {
    const tok = await mintHs256({ sub: 'alice', scope: 'admin:read', exp: Math.floor(Date.now() / 1000) + 60 });
    const p = await verifyJwt(tok, { secret: SECRET });
    expect(p.sub).toBe('alice');
  });

  it('rejects expired tokens', async () => {
    const tok = await mintHs256({ sub: 'alice', exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(verifyJwt(tok, { secret: SECRET })).rejects.toThrow(/expired/);
  });

  it('rejects bad signature', async () => {
    const tok = await mintHs256({ sub: 'alice' });
    await expect(verifyJwt(tok, { secret: 'wrong-secret' })).rejects.toThrow(/bad signature/);
  });

  it('rejects malformed token', async () => {
    await expect(verifyJwt('not.a.jwt.too.many', { secret: SECRET })).rejects.toThrow(/malformed/);
  });

  it('rejects non-HS256 alg', async () => {
    const h = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const p = b64url(JSON.stringify({ sub: 'a' }));
    await expect(verifyJwt(`${h}.${p}.`, { secret: SECRET })).rejects.toThrow(/unsupported alg/);
  });

  it('enforces audience when requested', async () => {
    const tok = await mintHs256({ sub: 'a', aud: 'other-app' });
    await expect(verifyJwt(tok, { secret: SECRET, audience: 'my-app' })).rejects.toThrow(/audience/);
  });

  it('enforces issuer when requested', async () => {
    const tok = await mintHs256({ sub: 'a', iss: 'other' });
    await expect(verifyJwt(tok, { secret: SECRET, issuer: 'mine' })).rejects.toThrow(/issuer/);
  });
});

describe('scopeMatches', () => {
  it('matches exact scope', () => {
    expect(scopeMatches({ scope: 'admin:read users:list' }, 'admin:read')).toBe(true);
  });
  it('matches wildcard namespace', () => {
    expect(scopeMatches({ scope: 'admin:*' }, 'admin:write')).toBe(true);
  });
  it('matches root wildcard', () => {
    expect(scopeMatches({ scope: '*' }, 'admin:anything')).toBe(true);
  });
  it('handles array form', () => {
    expect(scopeMatches({ scopes: ['admin:read'] } as JwtPayload, 'admin:read')).toBe(true);
  });
  it('denies missing', () => {
    expect(scopeMatches({ scope: 'users:read' }, 'admin:write')).toBe(false);
  });
});

describe('validateSlots', () => {
  it('validates strings with regex', async () => {
    await expect(validateSlots({ id: { type: 'string', regex: '^u_' } }, { id: 'u_123' })).resolves.toBeUndefined();
    await expect(validateSlots({ id: { type: 'string', regex: '^u_' } }, { id: 'bad' })).rejects.toThrow(/regex/);
  });
  it('validates numbers with bounds', async () => {
    await expect(validateSlots({ n: { type: 'number', min: 1, max: 10 } }, { n: 5 })).resolves.toBeUndefined();
    await expect(validateSlots({ n: { type: 'number', min: 1 } }, { n: 0 })).rejects.toThrow(/below min/);
    await expect(validateSlots({ n: { type: 'number', integer: true } }, { n: 1.5 })).rejects.toThrow(/integer/);
  });
  it('validates enums', async () => {
    await expect(validateSlots({ s: { type: 'enum', values: ['a','b'] } }, { s: 'a' })).resolves.toBeUndefined();
    await expect(validateSlots({ s: { type: 'enum', values: ['a','b'] } }, { s: 'c' })).rejects.toThrow(/enum/);
  });
  it('validates booleans', async () => {
    await expect(validateSlots({ b: { type: 'boolean' } }, { b: true })).resolves.toBeUndefined();
    await expect(validateSlots({ b: { type: 'boolean' } }, { b: 'yes' })).rejects.toThrow(/boolean/);
  });
  it('referential_check via async callback', async () => {
    const check = vi.fn((v: string) => Promise.resolve(v === 'known'));
    await expect(validateSlots({ r: { type: 'referential', check, kind: 'user' } }, { r: 'known' })).resolves.toBeUndefined();
    await expect(validateSlots({ r: { type: 'referential', check, kind: 'user' } }, { r: 'unknown' })).rejects.toThrow(/not found/);
  });
  it('throws on missing slot', async () => {
    await expect(validateSlots({ x: { type: 'string' } }, {})).rejects.toThrow(/missing slot/);
  });
  it('validates string minLen and maxLen', async () => {
    await expect(validateSlots({ s: { type: 'string', minLen: 3 } }, { s: 'ab' })).rejects.toThrow(/too short/);
    await expect(validateSlots({ s: { type: 'string', maxLen: 5 } }, { s: 'toolongvalue' })).rejects.toThrow(/too long/);
    await expect(validateSlots({ s: { type: 'string', minLen: 2, maxLen: 10 } }, { s: 'ok' })).resolves.toBeUndefined();
  });
  it('rejects non-string for string slot', async () => {
    await expect(validateSlots({ s: { type: 'string' } }, { s: 42 })).rejects.toThrow(/expected string/);
  });
  it('rejects NaN for number slot', async () => {
    await expect(validateSlots({ n: { type: 'number' } }, { n: Number.NaN })).rejects.toThrow(/expected number/);
  });
  it('rejects above-max number', async () => {
    await expect(validateSlots({ n: { type: 'number', max: 10 } }, { n: 15 })).rejects.toThrow(/above max/);
  });
  it('accepts number at exact min and max bounds', async () => {
    await expect(validateSlots({ n: { type: 'number', min: 5, max: 5 } }, { n: 5 })).resolves.toBeUndefined();
  });
  it('referential check rejects non-string value', async () => {
    const check = vi.fn().mockResolvedValue(true);
    await expect(validateSlots({ r: { type: 'referential', check, kind: 'user' } }, { r: 99 })).rejects.toThrow(/expected string/);
  });
});

describe('createCapabilityMiddleware', () => {
  function makeAudit(): { sink: AuditSink; records: AuditRecord[] } {
    const records: AuditRecord[] = [];
    return { sink: { write: (r) => { records.push(r); } }, records };
  }

  const cap: RouteCapability = {
    route: 'POST /admin/users/:id/suspend',
    side_effects: 'write-app',
    required_scope: 'admin:write',
    slots: {
      id: { type: 'string', regex: '^u_' },
      reason: { type: 'enum', values: ['spam','fraud','other'] },
    },
    extra_guard: 'requires_codeowner_approval',
  };

  async function request(app: Hono, path: string, init: RequestInit): Promise<Response> {
    return app.request(`http://test${path}`, init);
  }

  it('allows when token + scope + slots + approval all pass', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'admin', scope: 'admin:write', exp: Math.floor(Date.now()/1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
    }), (c) => c.json({ ok: true }));
    const r = await request(app, '/admin/users/u_123/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(200);
    expect(audit.records[0]!.status).toBe('allowed');
    expect(audit.records[0]!.slots).toMatchObject({ id: 'u_123', reason: 'spam' });
  });

  it('denies when scope is missing', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'reader', scope: 'admin:read' });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 'status' in err ? ((err as { status: number }).status as 403) : 500));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.status).toBe('denied');
  });

  it('denies when codeowner approval rejected', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'bot', scope: 'admin:write' });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: false, reason: 'agent, not codeowner' }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 403));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.reason).toContain('codeowner');
  });

  it('denies when slot validation fails', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'admin', scope: 'admin:write' });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 422));
    const r = await request(app, '/admin/users/bad-id/suspend', {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(422);
    expect(audit.records[0]!.reason).toMatch(/regex/);
  });

  it('denies when bearer token missing', async () => {
    const audit = makeAudit();
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 401));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(401);
    expect(audit.records[0]!.status).toBe('denied');
  });

  it('denies and audits when JWT verification throws', async () => {
    const audit = makeAudit();
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 'status' in err ? (err as { status: number }).status as 401 : 401));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid.jwt.token', 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(401);
    expect(audit.records[0]!.status).toBe('denied');
  });

  it('handles malformed JSON body gracefully', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'admin', scope: 'admin:write', exp: Math.floor(Date.now()/1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 422));
    const r = await request(app, '/admin/users/u_123/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: 'not valid json{',
    });
    expect(r.status).toBe(422);
    expect(audit.records[0]!.status).toBe('denied');
  });

  it('audits with custom actor from actorFromPayload hook', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'bot_123', scope: 'admin:write', exp: Math.floor(Date.now()/1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
      actorFromPayload: (p) => `${p.sub}-via-hook`,
    }), (c) => c.json({ ok: true }));
    const r = await request(app, '/admin/users/u_123/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(200);
    expect(audit.records[0]!.actor).toBe('bot_123-via-hook');
  });
});

describe('createCapabilityMiddleware — branch gaps', () => {
  function makeAudit() {
    const records: AuditRecord[] = [];
    return { sink: { write: (r: AuditRecord) => { records.push(r); } }, records };
  }

  const cap: RouteCapability = {
    route: 'POST /admin/users/:id/suspend',
    side_effects: 'write-app',
    required_scope: 'admin:write',
    slots: {
      id: { type: 'string', regex: '^u_' },
      reason: { type: 'enum', values: ['spam', 'fraud', 'other'] },
    },
    extra_guard: 'requires_codeowner_approval',
  };

  const capNoGuard: RouteCapability = {
    route: 'POST /admin/users/:id/suspend',
    side_effects: 'write-app',
    required_scope: 'admin:write',
    slots: {
      id: { type: 'string', regex: '^u_' },
      reason: { type: 'enum', values: ['spam', 'fraud', 'other'] },
    },
  };

  async function request(app: Hono, path: string, init: RequestInit) {
    return app.request(`http://test${path}`, init);
  }

  // Line 418: ?? '' fires when content-type header is absent
  it('extracts slots from path + query when content-type header is absent', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'admin', scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: capNoGuard, jwt: { secret: SECRET }, audit: audit.sink,
    }), (c) => c.json({ ok: true }));
    const r = await request(app, '/admin/users/u_123/suspend?reason=spam', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}` }, // no content-type
    });
    expect(r.status).toBe(200);
    expect(audit.records[0]!.slots).toMatchObject({ id: 'u_123', reason: 'spam' });
  });

  // Lines 435-437: actor ?? 'unknown' when JWT payload has no sub
  it('records actor as unknown when JWT has no sub and slot validation fails', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 }); // no sub
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 422));
    const r = await request(app, '/admin/users/bad-id/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(422);
    expect(audit.records[0]!.actor).toBe('unknown');
  });

  // Lines 448-452: check.reason ?? 'codeowner approval required'
  it('uses default message when codeowner rejection has no reason field', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'bot', scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: false }), // no reason
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 403));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.reason).toBe('codeowner approval required');
  });

  // Lines 448-452: actor ?? 'unknown' when JWT has no sub and codeowner rejects
  it('records unknown actor when JWT has no sub and codeowner rejects', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 }); // no sub
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      checkCodeownerApproval: () => Promise.resolve({ approved: false, reason: 'no codeowner' }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 403));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.actor).toBe('unknown');
  });

  // Line 458: actor ?? 'unknown' on allowed path when JWT has no sub
  it('records unknown actor on allowed request when JWT has no sub', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 }); // no sub
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: capNoGuard, jwt: { secret: SECRET }, audit: audit.sink,
    }), (c) => c.json({ ok: true }));
    const r = await request(app, '/admin/users/u_123/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(200);
    expect(audit.records[0]!.actor).toBe('unknown');
  });

  // Line 406: actorFromPayload IS defined on scope-deny path
  it('uses actorFromPayload result on scope-deny audit', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'svc', scope: 'users:read', exp: Math.floor(Date.now() / 1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      actorFromPayload: (p) => `actor:${String(p.sub)}`,
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 403));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.actor).toBe('actor:svc');
  });

  // Line 406 branch: actor ?? 'unknown' on scope-deny when payload has no sub
  it('records unknown actor on scope-deny when JWT has no sub', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ scope: 'users:read', exp: Math.floor(Date.now() / 1000) + 60 }); // no sub, wrong scope
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 403));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.actor).toBe('unknown');
  });

  // Lines 435, 448: actorFromPayload IS called in slot-fail and codeowner-deny paths
  it('uses actorFromPayload result in slot-validation-fail audit', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'svc', scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      actorFromPayload: (p) => `actor:${String(p.sub)}`,
      checkCodeownerApproval: () => Promise.resolve({ approved: true }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 422));
    const r = await request(app, '/admin/users/bad-id/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(422);
    expect(audit.records[0]!.actor).toBe('actor:svc');
  });

  it('uses actorFromPayload result in codeowner-deny audit', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'svc', scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      actorFromPayload: (p) => `actor:${String(p.sub)}`,
      checkCodeownerApproval: () => Promise.resolve({ approved: false, reason: 'not approved' }),
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 403));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(403);
    expect(audit.records[0]!.actor).toBe('actor:svc');
  });

  // Line 322: referential slot with non-string value
  it('rejects non-string value for referential slot', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'admin', scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 });
    const capWithRef: RouteCapability = {
      route: 'POST /admin/users/:id/suspend',
      side_effects: 'write-app',
      required_scope: 'admin:write',
      slots: {
        id: { type: 'string', regex: '^u_' },
        userId: { type: 'referential', kind: 'user', check: vi.fn().mockResolvedValue(true) },
      },
    };
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: capWithRef, jwt: { secret: SECRET }, audit: audit.sink,
    }), (c) => c.json({ ok: true }));
    app.onError((err, c) => c.json({ error: err.message }, 422));
    // userId comes from JSON body as a number, not a string
    const r = await request(app, '/admin/users/u_123/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 42 }),
    });
    expect(r.status).toBe(422);
    expect(audit.records[0]!.reason).toMatch(/expected string/);
  });

  // extra_guard present but no checkCodeownerApproval fn provided — guard is skipped
  it('skips codeowner guard when checkCodeownerApproval is not provided', async () => {
    const audit = makeAudit();
    const tok = await mintHs256({ sub: 'admin', scope: 'admin:write', exp: Math.floor(Date.now() / 1000) + 60 });
    const app = new Hono();
    app.post('/admin/users/:id/suspend', createCapabilityMiddleware({
      capability: cap, jwt: { secret: SECRET }, audit: audit.sink,
      // no checkCodeownerApproval
    }), (c) => c.json({ ok: true }));
    const r = await request(app, '/admin/users/u_1/suspend', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(r.status).toBe(200);
    expect(audit.records[0]!.status).toBe('allowed');
  });
});

describe('createAdminRouter', () => {
  type DbRow = Record<string, unknown>;
  type ExecResult = { rows: DbRow[]; rowCount: number };

  function dbExecute(rows: DbRow[], rowCount?: number): FactoryDb {
    const result: ExecResult = { rows, rowCount: rowCount ?? rows.length };
    return {
      execute: vi.fn(
        () => Promise.resolve(result) as unknown as ReturnType<FactoryDb['execute']>
      ),
    } as unknown as FactoryDb;
  }

  function dbSequential(responses: ExecResult[]): FactoryDb {
    let idx = 0;
    return {
      execute: vi.fn(() => {
        const r = responses[idx] ?? { rows: [], rowCount: 0 };
        idx++;
        return Promise.resolve(r) as unknown as ReturnType<FactoryDb['execute']>;
      }),
    } as unknown as FactoryDb;
  }

  function dbReject(err: Error): FactoryDb {
    return {
      execute: vi.fn(
        () => Promise.reject(err) as unknown as ReturnType<FactoryDb['execute']>
      ),
    } as unknown as FactoryDb;
  }

  it('GET / returns dashboard summary', async () => {
    const db = dbExecute([{ count: '3' }]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin');
    expect(r.status).toBe(200);
    const body = await r.json() as DashboardSummary;
    expect(body.appId).toBe('app');
    expect(body.totalUsers).toBe(3);
  });

  it('GET /users returns paginated users', async () => {
    const db = dbExecute([{ id: 'u_1', email: 'a@b.com', status: 'active', created_at: '2024-01-01' }]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/users?page=1&limit=10');
    expect(r.status).toBe(200);
    const body = await r.json() as { users: unknown[] };
    expect(body.users).toHaveLength(1);
  });

  it('GET /users/:id returns user with subscriptions', async () => {
    const db = dbSequential([
      { rows: [{ id: 'u_1', email: 'a@b.com', status: 'active', created_at: '2024-01-01' }], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/users/u_1');
    expect(r.status).toBe(200);
    const body = await r.json() as { user: { id: string }; subscriptions: unknown[] };
    expect(body.user.id).toBe('u_1');
    expect(body.subscriptions).toHaveLength(0);
  });

  it('GET /users/:id returns 404 when user not found', async () => {
    const db = dbExecute([]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/users/missing');
    expect(r.status).toBe(404);
  });

  it('POST /users/:id/suspend suspends user', async () => {
    const db = dbExecute([], 1);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/users/u_1/suspend', { method: 'POST' });
    expect(r.status).toBe(200);
    const body = await r.json() as { success: boolean; status: string };
    expect(body.success).toBe(true);
    expect(body.status).toBe('suspended');
  });

  it('POST /users/:id/suspend returns 404 when user not found', async () => {
    const db = dbExecute([], 0);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/users/missing/suspend', { method: 'POST' });
    expect(r.status).toBe(404);
  });

  it('GET /events returns events with parsed properties', async () => {
    const db = dbExecute([{ event: 'click', user_id: 'u_1', occurred_at: '2024-01-01', properties: '{"x":1}' }]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/events');
    expect(r.status).toBe(200);
    const body = await r.json() as { events: Array<{ event: string }> };
    expect(body.events[0]!.event).toBe('click');
  });

  it('GET /events passes through already-parsed properties object', async () => {
    const db = dbExecute([{ event: 'view', user_id: 'u_2', occurred_at: '2024-01-02', properties: { y: 2 } }]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/events');
    expect(r.status).toBe(200);
    const body = await r.json() as { events: Array<{ properties: { y: number } }> };
    expect(body.events[0]!.properties.y).toBe(2);
  });

  it('GET / returns 500 on non-FactoryBaseError via onError handler', async () => {
    const db = dbReject(new Error('plain crash'));
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin');
    expect(r.status).toBe(500);
    const body = await r.json() as { error: string };
    expect(body.error).toBe('Internal server error');
  });

  it('GET /health returns ok when db is connected', async () => {
    const db = dbExecute([]);
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/health');
    expect(r.status).toBe(200);
    const body = await r.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /health returns 500 when db throws', async () => {
    const db = dbReject(new Error('db down'));
    const router = createAdminRouter({ db, analytics: null as never, appId: 'app' });
    const app = new Hono();
    app.route('/admin', router);
    const r = await app.request('http://test/admin/health');
    expect(r.status).toBe(500);
  });
});
