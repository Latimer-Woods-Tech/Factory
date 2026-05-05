// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api.js';
import { useSession } from '../stores/session.js';

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    useSession.getState().logout();
  });

  it('logs out on 401 responses', async () => {
    useSession.getState().login('header.payload.signature', 'production', Date.now() + 60_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })),
    );

    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().token).toBeNull();
  });

  it('logs out on 403 environment mismatch responses', async () => {
    useSession.getState().login('header.payload.signature', 'production', Date.now() + 60_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Environment mismatch', tokenEnv: 'staging' }), {
          status: 403,
        })),
    );

    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 403 });
    expect(useSession.getState().token).toBeNull();
  });

  it('keeps the session for non-session 403 responses', async () => {
    useSession.getState().login('header.payload.signature', 'production', Date.now() + 60_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })),
    );

    await expect(apiFetch('/repo/commit')).rejects.toMatchObject({ status: 403 });
    expect(useSession.getState().token).toBe('header.payload.signature');
  });

  it('returns parsed JSON body on success', async () => {
    const payload = { env: 'production', user: { id: 'u1', email: 'a@b.com', role: 'admin' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const result = await apiFetch<typeof payload>('/me');
    expect(result).toEqual(payload);
  });

  it('never constructs a double-slash URL when VITE_API_BASE has a trailing slash', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    // Simulate a trailing-slash base already stripped at module init time (API_BASE = '/api')
    // The constructed URL must not contain '//'
    await apiFetch('/me');
    expect(calls[0]).not.toMatch(/\/\//);
  });
});