import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  issueToken,
  jwtMiddleware,
  refreshToken,
  requireRole,
  verifyToken,
} from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'test-secret-at-least-32-characters!!';

async function makeExpiredToken(): Promise<string> {
  // Issue with -1s expiry by back-dating iat/exp directly.
  // We do this by issuing normally then modifying the payload manually.
  // Easiest: issue with 1s expiry then time-travel is impossible in vitest
  // without fake timers — instead we construct a JWT manually with exp in the past.
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'u1', tenantId: 't1', role: 'member' as const, iat: now - 3600, exp: now - 1 };
  const header = { alg: 'HS256', typ: 'JWT' };

  const encode = (obj: unknown) => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const data = `${encodedHeader}.${encodedPayload}`;

  // Sign with the real key so signature is valid but token is expired.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  let binary = '';
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b);
  const signature = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// ---------------------------------------------------------------------------
// issueToken + verifyToken
// ---------------------------------------------------------------------------

describe('issueToken / verifyToken', () => {
  it('issues a token that verifies successfully', async () => {
    const token = await issueToken({ sub: 'user1', tenantId: 'tenant1', role: 'admin' }, SECRET);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const payload = await verifyToken(token, SECRET);
    expect(payload.sub).toBe('user1');
    expect(payload.tenantId).toBe('tenant1');
    expect(payload.role).toBe('admin');
  });

  it('includes iat and exp in the payload', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'viewer' }, SECRET, 3600);
    const payload = await verifyToken(token, SECRET);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('uses default expiresIn of 3600', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'member' }, SECRET);
    const payload = await verifyToken(token, SECRET);
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'owner' }, 'wrong-secret-that-is-at-least-32-chars');
    await expect(verifyToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects a token with tampered payload', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'viewer' }, SECRET);
    const [header, , sig] = token.split('.');
    const fakePayload = btoa(JSON.stringify({ sub: 'hacker', tenantId: 't', role: 'owner', iat: 0, exp: 9999999999 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(verifyToken(`${header}.${fakePayload}.${sig}`, SECRET)).rejects.toThrow();
  });

  it('rejects a token with only 2 parts', async () => {
    await expect(verifyToken('a.b', SECRET)).rejects.toThrow('Invalid token format');
  });

  it('rejects a token with 4 parts', async () => {
    await expect(verifyToken('a.b.c.d', SECRET)).rejects.toThrow('Invalid token format');
  });

  it('rejects an expired token', async () => {
    const expired = await makeExpiredToken();
    await expect(verifyToken(expired, SECRET)).rejects.toThrow('Token expired');
  });
});

// ---------------------------------------------------------------------------
// dual-key rotation (verifyToken + issueToken + jwtMiddleware with secretNext)
// ---------------------------------------------------------------------------

const SECRET_NEXT = 'next-secret-at-least-32-characters!!';

describe('dual-key rotation', () => {
  it('verifyToken accepts a token signed with the primary secret', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'member' }, SECRET);
    const payload = await verifyToken(token, SECRET, SECRET_NEXT);
    expect(payload.sub).toBe('u');
  });

  it('verifyToken accepts a token signed with secretNext', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'member' }, SECRET_NEXT);
    const payload = await verifyToken(token, SECRET, SECRET_NEXT);
    expect(payload.sub).toBe('u');
  });

  it('verifyToken rejects a token signed with an unknown third secret', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'member' }, 'unknown-secret-that-is-not-registered!');
    await expect(verifyToken(token, SECRET, SECRET_NEXT)).rejects.toThrow();
  });

  it('verifyToken does not fall back to secretNext for expired tokens', async () => {
    const expired = await makeExpiredToken();
    await expect(verifyToken(expired, SECRET, SECRET_NEXT)).rejects.toThrow('Token expired');
  });

  it('issueToken signs with secretNext when provided', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'admin' }, SECRET, 3600, SECRET_NEXT);
    // Verifiable with secretNext but not with primary
    await expect(verifyToken(token, SECRET)).rejects.toThrow();
    const payload = await verifyToken(token, SECRET_NEXT);
    expect(payload.sub).toBe('u');
  });

  it('refreshToken re-signs with secretNext when provided', async () => {
    const token = await issueToken({ sub: 'u', tenantId: 't', role: 'member' }, SECRET);
    const refreshed = await refreshToken(token, SECRET, 3600, SECRET_NEXT);
    // refreshed token must be verifiable with SECRET_NEXT
    const payload = await verifyToken(refreshed, SECRET_NEXT);
    expect(payload.sub).toBe('u');
  });

  it('jwtMiddleware accepts old-secret token during rotation', async () => {
    const app = new Hono<{ Variables: { user: { sub: string } } }>();
    app.use('*', jwtMiddleware(SECRET, { secretNext: SECRET_NEXT }));
    app.get('/me', (c) => c.json(c.get('user')));

    const oldToken = await issueToken({ sub: 'bob', tenantId: 't', role: 'viewer' }, SECRET);
    const res = await app.request('/me', { headers: { authorization: `Bearer ${oldToken}` } });
    expect(res.status).toBe(200);
    const body = await res.json() as { sub: string };
    expect(body.sub).toBe('bob');
  });

  it('jwtMiddleware accepts new-secret token during rotation', async () => {
    const app = new Hono<{ Variables: { user: { sub: string } } }>();
    app.use('*', jwtMiddleware(SECRET, { secretNext: SECRET_NEXT }));
    app.get('/me', (c) => c.json(c.get('user')));

    const newToken = await issueToken({ sub: 'carol', tenantId: 't', role: 'owner' }, SECRET_NEXT);
    const res = await app.request('/me', { headers: { authorization: `Bearer ${newToken}` } });
    expect(res.status).toBe(200);
    const body = await res.json() as { sub: string };
    expect(body.sub).toBe('carol');
  });
});

// ---------------------------------------------------------------------------
// refreshToken
// ---------------------------------------------------------------------------

describe('refreshToken', () => {
  it('returns a new valid token with extended expiry', async () => {
    const original = await issueToken({ sub: 'u', tenantId: 't', role: 'member' }, SECRET, 60);
    const refreshed = await refreshToken(original, SECRET, 7200);
    expect(refreshed).not.toBe(original);
    const payload = await verifyToken(refreshed, SECRET);
    expect(payload.exp - payload.iat).toBe(7200);
    expect(payload.sub).toBe('u');
    expect(payload.tenantId).toBe('t');
    expect(payload.role).toBe('member');
  });

  it('propagates verification error on invalid token', async () => {
    await expect(refreshToken('bad.token.here', SECRET)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// jwtMiddleware
// ---------------------------------------------------------------------------

describe('jwtMiddleware', () => {
  function makeApp() {
    const app = new Hono<{ Variables: { user: { sub: string; role: string } } }>();
    app.use('*', jwtMiddleware(SECRET));
    app.get('/me', (c) => c.json(c.get('user')));
    return app;
  }

  it('sets user in context for a valid token', async () => {
    const token = await issueToken({ sub: 'alice', tenantId: 't1', role: 'admin' }, SECRET);
    const res = await makeApp().request('/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { sub: string; role: string };
    expect(body.sub).toBe('alice');
    expect(body.role).toBe('admin');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await makeApp().request('/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const res = await makeApp().request('/me', {
      headers: { authorization: 'Basic abc123' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await makeApp().request('/me', {
      headers: { authorization: 'Bearer not.a.real.token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expired = await makeExpiredToken();
    const res = await makeApp().request('/me', {
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole', () => {
  function makeApp(minRole: 'viewer' | 'member' | 'admin' | 'owner') {
    const app = new Hono();
    app.use('*', jwtMiddleware(SECRET));
    app.use('*', requireRole(minRole));
    app.get('/protected', (c) => c.json({ ok: true }));
    return app;
  }

  async function requestAs(role: 'viewer' | 'member' | 'admin' | 'owner', minRole: typeof role) {
    const token = await issueToken({ sub: 'u', tenantId: 't', role }, SECRET);
    return makeApp(minRole).request('/protected', {
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it('allows when user role meets the requirement', async () => {
    const res = await requestAs('admin', 'admin');
    expect(res.status).toBe(200);
  });

  it('allows when user role exceeds the requirement', async () => {
    const res = await requestAs('owner', 'admin');
    expect(res.status).toBe(200);
  });

  it('allows viewer to reach viewer-level routes', async () => {
    const res = await requestAs('viewer', 'viewer');
    expect(res.status).toBe(200);
  });

  it('blocks member from owner-only route', async () => {
    const res = await requestAs('member', 'owner');
    expect(res.status).toBe(403);
  });

  it('blocks viewer from admin route', async () => {
    const res = await requestAs('viewer', 'admin');
    expect(res.status).toBe(403);
  });

  it('blocks viewer from member route', async () => {
    const res = await requestAs('viewer', 'member');
    expect(res.status).toBe(403);
  });
});
