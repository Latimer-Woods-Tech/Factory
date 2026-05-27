/**
 * Unit tests for lib/r2.ts
 *
 * Uses an in-memory R2Bucket stub — no actual R2 binding required.
 */

import { describe, it, expect, vi } from 'vitest';
import { InternalError } from '@latimer-woods-tech/errors';
import {
  buildR2Prefix,
  buildScreenshotKey,
  uploadScreenshot,
  uploadViewportScreenshots,
  getPresignedUrl,
  validateScreenshotBase64,
  storeResultsJson,
  deleteRunArtifacts,
} from '../../src/lib/r2.js';

// ---------------------------------------------------------------------------
// Bucket stub factory
// ---------------------------------------------------------------------------

function makeBucket(headResult: unknown = null) {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    head: vi.fn().mockResolvedValue(headResult),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false, cursor: undefined }),
  };
}

// ---------------------------------------------------------------------------
// buildR2Prefix
// ---------------------------------------------------------------------------

describe('buildR2Prefix', () => {
  it('formats key prefix', () => {
    expect(buildR2Prefix('capricast', 'run-abc')).toBe('qa-tools/capricast/run-abc');
  });

  it('works for all app IDs', () => {
    for (const appId of ['selfprime', 'capricast', 'cipherofhealing', 'xicocity']) {
      expect(buildR2Prefix(appId, 'r1')).toBe(`qa-tools/${appId}/r1`);
    }
  });
});

// ---------------------------------------------------------------------------
// buildScreenshotKey
// ---------------------------------------------------------------------------

describe('buildScreenshotKey', () => {
  it('builds default desktop-full key', () => {
    expect(buildScreenshotKey('capricast', 'run-1')).toBe('qa-tools/capricast/run-1/desktop-full.png');
  });

  it('builds custom name key', () => {
    expect(buildScreenshotKey('selfprime', 'run-2', 'mobile-full')).toBe(
      'qa-tools/selfprime/run-2/mobile-full.png',
    );
  });
});

// ---------------------------------------------------------------------------
// validateScreenshotBase64
// ---------------------------------------------------------------------------

describe('validateScreenshotBase64', () => {
  it('accepts a small valid base64 string', () => {
    const small = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'; // tiny PNG
    expect(() => validateScreenshotBase64(small)).not.toThrow();
  });

  it('throws InternalError when decoded size exceeds 10 MB', () => {
    // base64 of 14 MB → decoded ~10.5 MB
    const oversized = 'A'.repeat(Math.ceil((10 * 1024 * 1024 * 4) / 3) + 100);
    expect(() => validateScreenshotBase64(oversized)).toThrow(InternalError);
  });
});

// ---------------------------------------------------------------------------
// uploadScreenshot
// ---------------------------------------------------------------------------

describe('uploadScreenshot', () => {
  it('decodes base64 and calls bucket.put with correct metadata', async () => {
    const bucket = makeBucket();
    const base64 = btoa('PNG test data');
    const key = await uploadScreenshot(bucket as unknown as R2Bucket, 'qa-tools/app/run/desktop.png', base64);
    expect(key).toBe('qa-tools/app/run/desktop.png');
    expect(bucket.put).toHaveBeenCalledOnce();
    const [putKey, putBytes, putMeta] = (bucket.put as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, Uint8Array, Record<string, unknown>];
    expect(putKey).toBe('qa-tools/app/run/desktop.png');
    expect(putBytes).toBeInstanceOf(Uint8Array);
    const meta = putMeta as { httpMetadata?: { contentType?: string } };
    expect(meta.httpMetadata?.contentType).toBe('image/png');
  });
});

// ---------------------------------------------------------------------------
// uploadViewportScreenshots
// ---------------------------------------------------------------------------

describe('uploadViewportScreenshots', () => {
  it('uploads each viewport and returns key map', async () => {
    const bucket = makeBucket();
    const viewports = [
      { viewport: 'desktop', screenshotBase64: btoa('PNG desktop') },
      { viewport: 'mobile', screenshotBase64: btoa('PNG mobile') },
    ];
    const result = await uploadViewportScreenshots(
      bucket as unknown as R2Bucket,
      'capricast',
      'run-1',
      viewports,
    );
    expect(result['desktop']).toBe('qa-tools/capricast/run-1/desktop-full.png');
    expect(result['mobile']).toBe('qa-tools/capricast/run-1/mobile-full.png');
    expect(bucket.put).toHaveBeenCalledTimes(2);
  });

  it('returns empty map for empty viewports', async () => {
    const bucket = makeBucket();
    const result = await uploadViewportScreenshots(bucket as unknown as R2Bucket, 'app', 'r1', []);
    expect(result).toEqual({});
    expect(bucket.put).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPresignedUrl
// ---------------------------------------------------------------------------

describe('getPresignedUrl', () => {
  it('returns null when object does not exist', async () => {
    const bucket = makeBucket(null); // head returns null
    const url = await getPresignedUrl(bucket as unknown as R2Bucket, 'missing.png');
    expect(url).toBeNull();
  });

  it('returns r2:// reference when object exists', async () => {
    const bucket = makeBucket({ size: 1024, key: 'existing.png' }); // head returns object
    const url = await getPresignedUrl(bucket as unknown as R2Bucket, 'existing.png');
    expect(url).toBe('r2://existing.png');
  });

  it('accepts custom expiration seconds (no-op for now)', async () => {
    const bucket = makeBucket({ size: 100 });
    const url = await getPresignedUrl(bucket as unknown as R2Bucket, 'key.png', 3600);
    expect(url).toBe('r2://key.png');
  });
});

// ---------------------------------------------------------------------------
// storeResultsJson
// ---------------------------------------------------------------------------

describe('storeResultsJson', () => {
  it('stores JSON blob and returns key', async () => {
    const bucket = makeBucket();
    const data = { violations: 3, passes: 10 };
    const key = await storeResultsJson(bucket as unknown as R2Bucket, 'selfprime', 'run-99', data);
    expect(key).toBe('qa-tools/selfprime/run-99/results.json');
    expect(bucket.put).toHaveBeenCalledOnce();
    const [putKey, putBody, putMeta] = (bucket.put as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, string, Record<string, unknown>];
    expect(putKey).toBe('qa-tools/selfprime/run-99/results.json');
    expect(JSON.parse(putBody)).toEqual(data);
    const meta = putMeta as { httpMetadata?: { contentType?: string } };
    expect(meta.httpMetadata?.contentType).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// deleteRunArtifacts
// ---------------------------------------------------------------------------

describe('deleteRunArtifacts', () => {
  it('is a no-op when there are no objects', async () => {
    const bucket = makeBucket();
    await deleteRunArtifacts(bucket as unknown as R2Bucket, 'qa-tools/capricast/run-1');
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('deletes all objects under the prefix', async () => {
    const bucket = makeBucket();
    (bucket.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      objects: [
        { key: 'qa-tools/capricast/run-1/desktop-full.png' },
        { key: 'qa-tools/capricast/run-1/results.json' },
      ],
      truncated: false,
      cursor: undefined,
    });
    await deleteRunArtifacts(bucket as unknown as R2Bucket, 'qa-tools/capricast/run-1');
    expect(bucket.delete).toHaveBeenCalledWith([
      'qa-tools/capricast/run-1/desktop-full.png',
      'qa-tools/capricast/run-1/results.json',
    ]);
  });

  it('handles paginated listing', async () => {
    const bucket = makeBucket();
    (bucket.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        objects: [{ key: 'qa-tools/run-1/desktop.png' }],
        truncated: true,
        cursor: 'cursor-abc',
      })
      .mockResolvedValueOnce({
        objects: [{ key: 'qa-tools/run-1/mobile.png' }],
        truncated: false,
        cursor: undefined,
      });

    await deleteRunArtifacts(bucket as unknown as R2Bucket, 'qa-tools/run-1');

    // Two delete calls — one per page
    expect(bucket.delete).toHaveBeenCalledTimes(2);
    expect(bucket.list).toHaveBeenCalledTimes(2);
  });
});
