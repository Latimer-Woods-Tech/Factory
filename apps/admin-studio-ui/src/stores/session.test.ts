/**
 * Tests for session store — login, logout, hydrate, isAuthed, JWT decode.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock sessionStorage before importing the store
const mockStorage: Record<string, string> = {};
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
});

// Helper: mint a valid JWT-like token with given payload
function mintToken(payload: Record<string, unknown>, expOffsetMs = 3_600_000): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  const sig = 'fakesig';
  return `${header}.${p}.${sig}`;
}

const VALID_TOKEN = mintToken({ userId: 'u1', userEmail: 'a@b.com', role: 'admin' });
const EXPIRES_FUTURE = Date.now() + 3_600_000;

describe('session store', () => {
  beforeEach(async () => {
    // Clear storage and reset store between tests
    mockStorage['studio.session'] && delete mockStorage['studio.session'];
    // Re-import to get fresh store state
    vi.resetModules();
  });

  it('starts unauthenticated', async () => {
    const { useSession } = await import('./session.js');
    expect(useSession.getState().token).toBeNull();
    expect(useSession.getState().isAuthed()).toBe(false);
  });

  it('login stores token and user in sessionStorage', async () => {
    const { useSession } = await import('./session.js');
    useSession.getState().login(VALID_TOKEN, 'staging', EXPIRES_FUTURE);

    expect(useSession.getState().token).toBe(VALID_TOKEN);
    expect(useSession.getState().env).toBe('staging');
    expect(useSession.getState().user?.email).toBe('a@b.com');
    expect(useSession.getState().user?.role).toBe('admin');
    expect(useSession.getState().isAuthed()).toBe(true);

    const stored = JSON.parse(mockStorage['studio.session']!);
    expect(stored.token).toBe(VALID_TOKEN);
  });

  it('logout clears state and sessionStorage', async () => {
    const { useSession } = await import('./session.js');
    useSession.getState().login(VALID_TOKEN, 'staging', EXPIRES_FUTURE);
    useSession.getState().logout();

    expect(useSession.getState().token).toBeNull();
    expect(useSession.getState().env).toBeNull();
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().isAuthed()).toBe(false);
    expect(mockStorage['studio.session']).toBeUndefined();
  });

  it('isAuthed returns false when token is expired', async () => {
    const { useSession } = await import('./session.js');
    const pastExpiry = Date.now() - 1000;
    useSession.getState().login(VALID_TOKEN, 'staging', pastExpiry);
    expect(useSession.getState().isAuthed()).toBe(false);
  });

  it('hydrate restores session from sessionStorage', async () => {
    // Pre-populate storage before import
    mockStorage['studio.session'] = JSON.stringify({
      token: VALID_TOKEN,
      env: 'production',
      user: { id: 'u1', email: 'a@b.com', role: 'admin' },
      expiresAt: EXPIRES_FUTURE,
    });

    const { useSession } = await import('./session.js');
    useSession.getState().hydrate();

    expect(useSession.getState().token).toBe(VALID_TOKEN);
    expect(useSession.getState().env).toBe('production');
    expect(useSession.getState().isAuthed()).toBe(true);
  });

  it('hydrate clears storage when session is expired', async () => {
    mockStorage['studio.session'] = JSON.stringify({
      token: VALID_TOKEN,
      env: 'staging',
      user: { id: 'u1', email: 'a@b.com', role: 'admin' },
      expiresAt: Date.now() - 5000,
    });

    const { useSession } = await import('./session.js');
    useSession.getState().hydrate();

    expect(useSession.getState().token).toBeNull();
    expect(useSession.getState().isAuthed()).toBe(false);
    expect(mockStorage['studio.session']).toBeUndefined();
  });

  it('hydrate ignores malformed JSON in sessionStorage', async () => {
    mockStorage['studio.session'] = 'not-json{{{';

    const { useSession } = await import('./session.js');
    useSession.getState().hydrate();

    expect(useSession.getState().token).toBeNull();
    expect(mockStorage['studio.session']).toBeUndefined();
  });

  it('login handles token with missing fields gracefully', async () => {
    const badToken = mintToken({ sub: 'x' }); // missing userId/userEmail/role
    const { useSession } = await import('./session.js');
    useSession.getState().login(badToken, 'local', EXPIRES_FUTURE);

    expect(useSession.getState().token).toBe(badToken);
    expect(useSession.getState().user).toBeNull();
  });

  it('login handles malformed JWT (not 3 parts)', async () => {
    const { useSession } = await import('./session.js');
    useSession.getState().login('not.a.jwt.at.all.extra', 'local', EXPIRES_FUTURE);
    // Should not throw; user may be null
    expect(useSession.getState().token).toBe('not.a.jwt.at.all.extra');
  });
});
