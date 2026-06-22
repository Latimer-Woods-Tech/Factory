import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, parseVisionResponse } from './index.js';
import type { BrowserAutomation } from './index.js';

const runScenarioMock = vi.fn().mockResolvedValue({
  completedSteps: 2,
  videoKey: null,
  videoUrl: null,
  finishedAt: '2026-05-15T00:00:00.000Z',
});

const auditMock = vi.fn().mockResolvedValue({
  url: 'https://example.com',
  auditedAt: '2026-05-15T00:00:00.000Z',
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  screenshotBase64: 'abc123',
});

const visualReviewMock = vi.fn().mockResolvedValue({
  url: 'https://example.com',
  reviewedAt: '2026-05-15T00:00:00.000Z',
  viewports: [
    { viewport: 'desktop', width: 1280, height: 720, screenshotBase64: 'desktop-bytes' },
    { viewport: 'mobile', width: 375, height: 667, screenshotBase64: 'mobile-bytes' },
  ],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  review: {
    model: 'claude-haiku-4-5-20251001',
    summary: 'Layout looks clean across both viewports.',
    findings: [
      {
        severity: 'medium',
        category: 'color',
        viewport: 'mobile',
        description: 'Primary CTA contrast is borderline against the hero background.',
        recommendation: 'Increase CTA text weight or darken the background overlay.',
      },
    ],
    tokenUsage: { input: 1200, output: 250 },
  },
  axeViolations: null,
});

const mockAutomation: BrowserAutomation = {
  scrape: vi.fn().mockResolvedValue({
    url: 'https://example.com',
    scrapedAt: '2026-05-15T00:00:00.000Z',
    results: { title: { selector: 'h1', text: ['Hello'] } },
  }),
  screenshot: vi.fn().mockResolvedValue({
    url: 'https://example.com',
    capturedAt: '2026-05-15T00:00:00.000Z',
    mimeType: 'image/png',
    dataBase64: 'abc123',
  }),
  runScenario: runScenarioMock,
  audit: auditMock,
  visualReview: visualReviewMock,
};

describe('browser-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const app = createApp(mockAutomation);

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(body).toEqual({ status: 'ok', service: 'browser-agent' });
    });
  });

  describe('POST /scrape', () => {
    it('returns 200 with scrape results', async () => {
      const res = await app.request('/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', selectors: { title: 'h1' } }),
      });
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(body).toHaveProperty('url', 'https://example.com');
      expect(body).toHaveProperty('results');
    });

    it('returns 422 when url is missing', async () => {
      const res = await app.request('/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectors: { title: 'h1' } }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 when selectors is empty', async () => {
      const res = await app.request('/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', selectors: {} }),
      });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /screenshot', () => {
    it('returns 200 with screenshot data', async () => {
      const res = await app.request('/screenshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(body).toHaveProperty('mimeType', 'image/png');
      expect(body).toHaveProperty('dataBase64');
    });

    it('returns 422 when url is missing', async () => {
      const res = await app.request('/screenshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /run-scenario', () => {
    it('returns 200 with scenario result for valid steps', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          steps: [
            { action: 'goto', url: 'https://example.com' },
            { action: 'click', selector: 'button' },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(body).toHaveProperty('completedSteps', 2);
      expect(body).toHaveProperty('videoKey', null);
      expect(body).toHaveProperty('videoUrl', null);
      expect(body).toHaveProperty('finishedAt');
      expect(runScenarioMock).toHaveBeenCalledOnce();
    });

    it('returns 422 when steps is empty', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steps: [] }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 when steps is missing', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 for unknown action', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steps: [{ action: 'drag', selector: 'button' }] }),
      });
      expect(res.status).toBe(422);
    });

    it('accepts hover, select, press, and setCookies steps', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          steps: [
            { action: 'hover', selector: 'nav' },
            { action: 'select', selector: 'select', value: 'opt1' },
            { action: 'press', selector: 'input', key: 'Enter' },
            { action: 'setCookies', cookies: [{ name: 'auth', value: 'tok', domain: '.example.com' }] },
          ],
        }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 422 when setCookies has empty cookies array', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steps: [{ action: 'setCookies', cookies: [] }] }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 when a cookie is missing name', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steps: [{ action: 'setCookies', cookies: [{ value: 'tok' }] }] }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 400 when body is not JSON', async () => {
      const res = await app.request('/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /audit', () => {
    it('returns 200 with audit result for a valid url', async () => {
      const res = await app.request('/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(body).toHaveProperty('url', 'https://example.com');
      expect(body).toHaveProperty('consoleErrors');
      expect(body).toHaveProperty('pageErrors');
      expect(body).toHaveProperty('failedRequests');
      expect(body).toHaveProperty('screenshotBase64');
      expect(auditMock).toHaveBeenCalledOnce();
    });

    it('accepts optional steps, captureConsole, and statusThreshold', async () => {
      const res = await app.request('/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          steps: [{ action: 'goto', url: 'https://example.com/login' }],
          captureConsole: false,
          statusThreshold: 500,
        }),
      });
      expect(res.status).toBe(200);
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ captureConsole: false, statusThreshold: 500 }),
      );
    });

    it('returns 422 when url is missing', async () => {
      const res = await app.request('/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 for an out-of-range statusThreshold', async () => {
      const res = await app.request('/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', statusThreshold: 50 }),
      });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /visual-review', () => {
    it('returns 200 with shots + review for a valid url', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('url', 'https://example.com');
      expect(body).toHaveProperty('viewports');
      expect(body).toHaveProperty('review');
      const review = body['review'] as Record<string, unknown>;
      expect(review['findings']).toHaveLength(1);
      expect(visualReviewMock).toHaveBeenCalledOnce();
    });

    it('accepts optional steps, viewports, rubric, model overrides', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          steps: [{ action: 'goto', url: 'https://example.com/login' }],
          viewports: [{ name: 'wide', width: 1920, height: 1080 }],
          rubric: ['Find any broken images.'],
          model: 'claude-sonnet-4-6',
        }),
      });
      expect(res.status).toBe(200);
      expect(visualReviewMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          viewports: [{ name: 'wide', width: 1920, height: 1080 }],
          rubric: ['Find any broken images.'],
        }),
      );
    });

    it('returns 422 when url is missing', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 when viewports has zero entries', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', viewports: [] }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 when a viewport is missing width', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', viewports: [{ name: 'm', height: 600 }] }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 when a rubric item is empty', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', rubric: ['', 'ok'] }),
      });
      expect(res.status).toBe(422);
    });

    it('passes runAxe and skipFinalNavigation through to the automation', async () => {
      const res = await app.request('/visual-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          runAxe: true,
          skipFinalNavigation: true,
        }),
      });
      expect(res.status).toBe(200);
      expect(visualReviewMock).toHaveBeenCalledWith(
        expect.objectContaining({ runAxe: true, skipFinalNavigation: true }),
      );
    });
  });
});

describe('parseVisionResponse', () => {
  it('extracts a clean JSON object', () => {
    const raw = '{"summary":"ok","findings":[{"severity":"high","category":"layout","viewport":"desktop","description":"x","recommendation":"y"}]}';
    const parsed = parseVisionResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.summary).toBe('ok');
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0]?.severity).toBe('high');
  });

  it('strips a leading ```json code fence', () => {
    const raw = '```json\n{"summary":"f","findings":[]}\n```';
    const parsed = parseVisionResponse(raw);
    expect(parsed?.summary).toBe('f');
  });

  it('recovers when the model emits leading prose before the JSON', () => {
    const raw = 'Sure — here is the review:\n{"summary":"after prose","findings":[]}';
    expect(parseVisionResponse(raw)?.summary).toBe('after prose');
  });

  it('drops findings with no description', () => {
    const raw = '{"summary":"","findings":[{"severity":"high","category":"c","viewport":"v"}]}';
    expect(parseVisionResponse(raw)?.findings).toEqual([]);
  });

  it('coerces unknown severity to info and missing category to general', () => {
    const raw = '{"summary":"s","findings":[{"description":"bad","severity":"catastrophic"}]}';
    const parsed = parseVisionResponse(raw);
    expect(parsed?.findings[0]?.severity).toBe('info');
    expect(parsed?.findings[0]?.category).toBe('general');
    expect(parsed?.findings[0]?.viewport).toBe('all');
  });

  it('returns null for non-JSON', () => {
    expect(parseVisionResponse('definitely not json')).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    expect(parseVisionResponse('{"summary":"x","findings":[}')).toBeNull();
  });
});
