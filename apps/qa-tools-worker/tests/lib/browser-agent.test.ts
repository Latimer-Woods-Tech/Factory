/**
 * Unit tests for lib/browser-agent.ts
 *
 * @latimer-woods-tech/browser and globalThis.fetch are mocked.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { InternalError } from '@latimer-woods-tech/errors';

// ---------------------------------------------------------------------------
// Mock @latimer-woods-tech/browser before import
// ---------------------------------------------------------------------------

vi.mock('@latimer-woods-tech/browser', () => ({
  mintBrowserAgentIdToken: vi.fn().mockResolvedValue('mock-oidc-token'),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { mapAxeImpact, buildRemediationHint, dispatchAudit } from '../../src/lib/browser-agent.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SA_KEY = JSON.stringify({
  client_email: 'sa@test.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake-key-bytes\n-----END PRIVATE KEY-----',
});

const mockVisualReview = {
  url: 'https://capricast.com',
  reviewedAt: new Date().toISOString(),
  viewports: [
    { viewport: 'desktop', width: 1280, height: 720, screenshotBase64: btoa('PNG data') },
  ],
  consoleErrors: [] as Array<{ type: string; text: string; location: string }>,
  pageErrors: [] as Array<{ message: string; stack: string }>,
  failedRequests: [] as Array<{ url: string; method: string; status: number }>,
  review: null as unknown,
  axeViolations: [] as Array<unknown>,
};

// ---------------------------------------------------------------------------
// mapAxeImpact
// ---------------------------------------------------------------------------

describe('mapAxeImpact', () => {
  it.each([
    ['critical', 'critical'],
    ['serious', 'serious'],
    ['moderate', 'moderate'],
    ['minor', 'minor'],
    [null, 'moderate'],            // null → best-practice → moderate
    ['unknown-level', 'moderate'], // unrecognized → moderate
    ['', 'moderate'],
  ] as Array<[string | null, string]>)('maps %s → %s', (impact, expected) => {
    expect(mapAxeImpact(impact)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// buildRemediationHint
// ---------------------------------------------------------------------------

describe('buildRemediationHint', () => {
  it('returns help text when helpUrl is empty', () => {
    expect(buildRemediationHint('Ensure sufficient color contrast', '')).toBe(
      'Ensure sufficient color contrast',
    );
  });

  it('combines help text and helpUrl with em-dash separator', () => {
    const hint = buildRemediationHint(
      'Ensure images have alt text',
      'https://dequeuniversity.com/rules/axe/4.3/image-alt',
    );
    expect(hint).toBe(
      'Ensure images have alt text — https://dequeuniversity.com/rules/axe/4.3/image-alt',
    );
  });
});

// ---------------------------------------------------------------------------
// dispatchAudit
// ---------------------------------------------------------------------------

describe('dispatchAudit', () => {
  // Restore fetch spies after each test so they don't leak between tests.
  // Note: do NOT call restoreAllMocks() at the top level — it would reset the
  // mintBrowserAgentIdToken mock between tests in this file.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /visual-review with correct payload and auth header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVisualReview), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await dispatchAudit(
      'https://browser-agent.test',
      'https://browser-agent.test',
      SA_KEY,
      { targetUrl: 'https://capricast.com', profile: 'fast', runAxe: true },
    );

    expect(result.visualReview.url).toBe('https://capricast.com');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://browser-agent.test/visual-review');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer mock-oidc-token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('trims trailing slash from agentUrl', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVisualReview), { status: 200 }),
    );

    await dispatchAudit(
      'https://browser-agent.test/', // trailing slash
      'https://browser-agent.test',
      SA_KEY,
      { targetUrl: 'https://capricast.com', profile: 'fast' },
    );

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://browser-agent.test/visual-review');
  });

  it('filters steps to only recognized action types', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVisualReview), { status: 200 }),
    );

    await dispatchAudit(
      'https://browser-agent.test',
      'https://browser-agent.test',
      SA_KEY,
      {
        targetUrl: 'https://capricast.com',
        profile: 'scenario',
        steps: [
          { action: 'goto', url: 'https://capricast.com/login' },
          { action: 'fill', selector: '#email', value: 'test@test.com' },
          { action: 'click', selector: 'button[type=submit]' },
          { action: 'assertText', selector: '#msg' }, // filtered out — not in browser-agent API
        ],
      },
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { steps?: unknown[] };
    // Only goto, fill, click are recognized — assertText is filtered
    expect(body.steps).toHaveLength(3);
  });

  it('does not include steps key when steps array is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockVisualReview), { status: 200 }),
    );

    await dispatchAudit(
      'https://browser-agent.test',
      'https://browser-agent.test',
      SA_KEY,
      { targetUrl: 'https://capricast.com', profile: 'fast', steps: [] },
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect('steps' in body).toBe(false);
  });

  it('throws InternalError on non-2xx HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      dispatchAudit('https://browser-agent.test', 'https://browser-agent.test', SA_KEY, {
        targetUrl: 'https://capricast.com',
        profile: 'fast',
      }),
    ).rejects.toThrow(InternalError);
  });

  it('throws InternalError when fetch rejects with AbortError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    );

    await expect(
      dispatchAudit('https://browser-agent.test', 'https://browser-agent.test', SA_KEY, {
        targetUrl: 'https://capricast.com',
        profile: 'fast',
      }),
    ).rejects.toThrow(InternalError);
  });

  it('re-throws non-abort errors as-is', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network failure'));

    await expect(
      dispatchAudit('https://browser-agent.test', 'https://browser-agent.test', SA_KEY, {
        targetUrl: 'https://capricast.com',
        profile: 'fast',
      }),
    ).rejects.toThrow(TypeError);
  });
});
