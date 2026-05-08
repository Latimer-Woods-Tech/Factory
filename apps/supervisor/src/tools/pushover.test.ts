import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendDigest } from './pushover';

const FAKE_TOKEN = 'po_token';
const FAKE_USER_KEY = 'po_userkey';

describe('sendDigest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts to the Pushover API with correct token and user', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 1 }), { status: 200 }),
    );

    await sendDigest(FAKE_TOKEN, FAKE_USER_KEY, {
      matched: 3,
      noTemplate: 1,
      approved: 1,
      errors: [],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.pushover.net/1/messages.json');
    expect(init.method).toBe('POST');

    const bodyStr = init.body as string;
    expect(bodyStr).toContain(`token=${FAKE_TOKEN}`);
    expect(bodyStr).toContain(`user=${FAKE_USER_KEY}`);
  });

  it('includes matched, noTemplate, and approved counts in message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 1 }), { status: 200 }),
    );

    await sendDigest(FAKE_TOKEN, FAKE_USER_KEY, {
      matched: 5,
      noTemplate: 2,
      approved: 1,
      errors: [],
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const bodyStr = decodeURIComponent(init.body as string);
    expect(bodyStr).toContain('5');
    expect(bodyStr).toContain('2');
    expect(bodyStr).toContain('1');
  });

  it('does NOT throw when fetch fails (best-effort)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));

    await expect(
      sendDigest(FAKE_TOKEN, FAKE_USER_KEY, {
        matched: 0,
        noTemplate: 0,
        approved: 0,
        errors: [],
      }),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[pushover]'),
      expect.any(Error),
    );
  });

  it('does NOT throw when API returns non-200 (best-effort)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Bad request', { status: 400 }),
    );

    await expect(
      sendDigest(FAKE_TOKEN, FAKE_USER_KEY, {
        matched: 0,
        noTemplate: 0,
        approved: 0,
        errors: ['some error'],
      }),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[pushover] API error 400'),
    );
  });

  it('logs success when API responds 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 1 }), { status: 200 }),
    );

    await sendDigest(FAKE_TOKEN, FAKE_USER_KEY, {
      matched: 1,
      noTemplate: 0,
      approved: 0,
      errors: [],
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[pushover] digest sent'),
    );
  });
});
