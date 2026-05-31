import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  uploadFromUrl,
  uploadPrivateFromUrl,
  getStreamSignedToken,
  getSignedStreamPlaybackUrl,
  getStreamVideo,
  listStreamVideos,
  deleteStreamVideo,
  getStreamEmbedUrl,
  getStreamThumbnailUrl,
  putR2Object,
  getR2Object,
  deleteR2Object,
} from './index.js';
import type { R2BucketLike, FetchFn } from './index.js';
import { InternalError } from '@latimer-woods-tech/errors';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  CF_ACCOUNT_ID: 'test-account-123',
  CF_STREAM_TOKEN: 'test-stream-token',
};

const MOCK_VIDEO = {
  uid: 'abc123def456',
  thumbnail: 'https://cloudflare.com/thumb.jpg',
  thumbnailTimestampPct: 0,
  readyToStream: true,
  status: { state: 'ready' as const },
  meta: { title: 'Test Video' },
  created: '2024-01-01T00:00:00Z',
  modified: '2024-01-01T00:00:00Z',
  duration: 120,
  size: 5_000_000,
  playback: {
    hls: 'https://hls.test.com/abc123.m3u8',
    dash: 'https://dash.test.com/abc123.mpd',
  },
  preview: 'https://preview.test.com/abc123',
};

/** Build a minimal mock Response. */
function makeResponse(body: unknown, ok: boolean, status: number): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** Build a successful Stream API envelope. */
function streamOk<T>(result: T) {
  return { success: true, result, errors: [] };
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// uploadFromUrl
// ---------------------------------------------------------------------------

describe('uploadFromUrl', () => {
  it('posts to /stream/copy and returns a StreamVideo', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk(MOCK_VIDEO), true, 200),
    );

    const result = await uploadFromUrl(
      'https://example.com/video.mp4',
      { title: 'Test' },
      MOCK_ENV,
      { fetch: mockFetch },
    );

    expect(result.uid).toBe('abc123def456');
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/stream/copy');
    expect(url).toContain(MOCK_ENV.CF_ACCOUNT_ID);
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as { url: string; meta: Record<string, string> };
    expect(sentBody.url).toBe('https://example.com/video.mp4');
    expect(sentBody.meta).toEqual({ title: 'Test' });
  });

  it('throws InternalError on non-OK HTTP status', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse('Internal Server Error', false, 500),
    );
    await expect(
      uploadFromUrl('https://example.com/v.mp4', {}, MOCK_ENV, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('throws InternalError when success is false', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(
        { success: false, result: null, errors: [{ message: 'invalid URL' }] },
        true,
        200,
      ),
    );
    await expect(
      uploadFromUrl('bad-url', {}, MOCK_ENV, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('uses global fetch when no deps provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(streamOk(MOCK_VIDEO), true, 200)));
    const result = await uploadFromUrl('https://example.com/video.mp4', {}, MOCK_ENV);
    expect(result.uid).toBe('abc123def456');
  });
});

// ---------------------------------------------------------------------------
// uploadPrivateFromUrl (D1 — private, signed-playback assets)
// ---------------------------------------------------------------------------

describe('uploadPrivateFromUrl', () => {
  it('posts to /stream/copy with requireSignedURLs: true', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk(MOCK_VIDEO), true, 200),
    );

    const result = await uploadPrivateFromUrl(
      'https://r2.example.com/renders/vo-123.mp4',
      { videoObjectId: '123' },
      MOCK_ENV,
      { fetch: mockFetch },
    );

    expect(result.uid).toBe('abc123def456');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/stream/copy');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string) as {
      url: string;
      meta: Record<string, string>;
      requireSignedURLs: boolean;
    };
    expect(sentBody.url).toBe('https://r2.example.com/renders/vo-123.mp4');
    expect(sentBody.meta).toEqual({ videoObjectId: '123' });
    expect(sentBody.requireSignedURLs).toBe(true);
  });

  it('throws InternalError on non-OK HTTP status', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse('boom', false, 500),
    );
    await expect(
      uploadPrivateFromUrl('https://example.com/v.mp4', {}, MOCK_ENV, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('uses global fetch when no deps provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(streamOk(MOCK_VIDEO), true, 200)));
    const result = await uploadPrivateFromUrl('https://example.com/video.mp4', {}, MOCK_ENV);
    expect(result.uid).toBe('abc123def456');
  });
});

// ---------------------------------------------------------------------------
// getStreamSignedToken + getSignedStreamPlaybackUrl (D1 — signed playback)
// ---------------------------------------------------------------------------

describe('getStreamSignedToken', () => {
  it('posts to /stream/{uid}/token and returns the token', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk({ token: 'signed.jwt.token' }), true, 200),
    );

    const token = await getStreamSignedToken('abc123', MOCK_ENV, {}, { fetch: mockFetch });

    expect(token).toBe('signed.jwt.token');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/abc123/token');
    expect(init?.method).toBe('POST');
  });

  it('defaults exp to ~1 hour from now', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk({ token: 't' }), true, 200),
    );
    await getStreamSignedToken('abc123', MOCK_ENV, {}, { fetch: mockFetch });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init?.body as string) as { exp: number };
    expect(body.exp).toBeGreaterThanOrEqual(nowSec + 3600 - 2);
    expect(body.exp).toBeLessThanOrEqual(nowSec + 3600 + 2);
  });

  it('honours expiresInSeconds, downloadable, and accessRules', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk({ token: 't' }), true, 200),
    );
    await getStreamSignedToken(
      'abc123',
      MOCK_ENV,
      { expiresInSeconds: 600, downloadable: true, accessRules: [{ type: 'ip.geoip.country', country: ['US'] }] },
      { fetch: mockFetch },
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init?.body as string) as {
      exp: number;
      downloadable: boolean;
      accessRules: unknown[];
    };
    expect(body.exp).toBeLessThanOrEqual(nowSec + 600 + 2);
    expect(body.downloadable).toBe(true);
    expect(body.accessRules).toHaveLength(1);
  });

  it('throws InternalError when the token API fails', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse('forbidden', false, 403),
    );
    await expect(
      getStreamSignedToken('abc123', MOCK_ENV, {}, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('uses global fetch when no deps provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(streamOk({ token: 'g' }), true, 200)));
    const token = await getStreamSignedToken('abc123', MOCK_ENV);
    expect(token).toBe('g');
  });
});

describe('getSignedStreamPlaybackUrl', () => {
  it('builds the HLS manifest URL from a token', () => {
    const url = getSignedStreamPlaybackUrl('signed.jwt.token');
    expect(url).toBe('https://videodelivery.net/signed.jwt.token/manifest/video.m3u8');
  });
});

// ---------------------------------------------------------------------------
// getStreamVideo
// ---------------------------------------------------------------------------

describe('getStreamVideo', () => {
  it('returns a video by UID', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk(MOCK_VIDEO), true, 200),
    );
    const result = await getStreamVideo('abc123def456', MOCK_ENV, { fetch: mockFetch });
    expect(result.uid).toBe('abc123def456');
    expect(result.readyToStream).toBe(true);
  });

  it('includes the UID in the request URL', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk(MOCK_VIDEO), true, 200),
    );
    await getStreamVideo('uid-xyz', MOCK_ENV, { fetch: mockFetch });
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('uid-xyz');
  });

  it('throws InternalError on HTTP 404', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse('not found', false, 404),
    );
    await expect(
      getStreamVideo('missing', MOCK_ENV, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('uses global fetch when no deps provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(streamOk(MOCK_VIDEO), true, 200)));
    const result = await getStreamVideo('abc123', MOCK_ENV);
    expect(result.uid).toBe('abc123def456');
  });
});

// ---------------------------------------------------------------------------
// listStreamVideos
// ---------------------------------------------------------------------------

describe('listStreamVideos', () => {
  it('returns an array of videos', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse(streamOk([MOCK_VIDEO, { ...MOCK_VIDEO, uid: 'second' }]), true, 200),
    );
    const result = await listStreamVideos(MOCK_ENV, { fetch: mockFetch });
    expect(result).toHaveLength(2);
    expect(result[0]?.uid).toBe('abc123def456');
    expect(result[1]?.uid).toBe('second');
  });

  it('throws InternalError on HTTP 403', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce(
      makeResponse('Forbidden', false, 403),
    );
    await expect(
      listStreamVideos(MOCK_ENV, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('uses global fetch when no deps provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(streamOk([MOCK_VIDEO]), true, 200)));
    const result = await listStreamVideos(MOCK_ENV);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deleteStreamVideo
// ---------------------------------------------------------------------------

describe('deleteStreamVideo', () => {
  it('resolves when deletion succeeds (204)', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(
      deleteStreamVideo('abc123', MOCK_ENV, { fetch: mockFetch }),
    ).resolves.toBeUndefined();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/abc123');
    expect(init?.method).toBe('DELETE');
  });

  it('throws InternalError when deletion fails', async () => {
    const mockFetch = vi.fn<FetchFn>().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('not found'),
    } as unknown as Response);

    await expect(
      deleteStreamVideo('missing', MOCK_ENV, { fetch: mockFetch }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('uses global fetch when no deps provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, status: 204, text: () => Promise.resolve('') } as unknown as Response));
    await expect(deleteStreamVideo('abc123', MOCK_ENV)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getStreamEmbedUrl
// ---------------------------------------------------------------------------

describe('getStreamEmbedUrl', () => {
  it('returns the videodelivery.net iframe URL', () => {
    const url = getStreamEmbedUrl('abc123def456');
    expect(url).toBe('https://iframe.videodelivery.net/abc123def456');
  });

  it('includes the UID verbatim', () => {
    const uid = 'unique-uid-here';
    expect(getStreamEmbedUrl(uid)).toContain(uid);
  });
});

// ---------------------------------------------------------------------------
// getStreamThumbnailUrl
// ---------------------------------------------------------------------------

describe('getStreamThumbnailUrl', () => {
  it('returns a thumbnail URL with default 1s timestamp', () => {
    const url = getStreamThumbnailUrl('abc123');
    expect(url).toContain('abc123');
    expect(url).toContain('1s');
    expect(url).toContain('thumbnail.jpg');
  });

  it('encodes custom time parameter', () => {
    const url = getStreamThumbnailUrl('abc123', '10s');
    expect(url).toContain('10s');
  });
});

// ---------------------------------------------------------------------------
// putR2Object
// ---------------------------------------------------------------------------

describe('putR2Object', () => {
  it('calls bucket.put and returns the key', async () => {
    const mockPut = vi.fn().mockResolvedValue(undefined);
    const mockBucket: R2BucketLike = {
      put: mockPut,
      get: vi.fn(),
      delete: vi.fn(),
    };
    const data = new ArrayBuffer(8);
    const key = await putR2Object(mockBucket, 'videos/test.mp4', data);

    expect(key).toBe('videos/test.mp4');
    expect(mockPut).toHaveBeenCalledWith('videos/test.mp4', data);
  });
});

// ---------------------------------------------------------------------------
// getR2Object
// ---------------------------------------------------------------------------

describe('getR2Object', () => {
  it('returns ArrayBuffer when object exists', async () => {
    const mockBuffer = new ArrayBuffer(16);
    const mockGet = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(mockBuffer), body: new ReadableStream(), text: vi.fn() });
    const mockBucket: R2BucketLike = {
      put: vi.fn(),
      get: mockGet,
      delete: vi.fn(),
    };

    const result = await getR2Object(mockBucket, 'videos/test.mp4');
    expect(result).toBe(mockBuffer);
    expect(mockGet).toHaveBeenCalledWith('videos/test.mp4');
  });

  it('throws InternalError when object does not exist', async () => {
    const mockBucket: R2BucketLike = {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    };

    await expect(getR2Object(mockBucket, 'missing.mp4')).rejects.toBeInstanceOf(InternalError);
  });
});

// ---------------------------------------------------------------------------
// deleteR2Object
// ---------------------------------------------------------------------------

describe('deleteR2Object', () => {
  it('calls bucket.delete with the key', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const mockBucket: R2BucketLike = {
      put: vi.fn(),
      get: vi.fn(),
      delete: mockDelete,
    };

    await deleteR2Object(mockBucket, 'videos/old.mp4');
    expect(mockDelete).toHaveBeenCalledWith('videos/old.mp4');
  });
});
