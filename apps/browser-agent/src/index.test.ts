import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from './index.js';
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
        body: JSON.stringify({ steps: [{ action: 'hover', selector: 'button' }] }),
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
});
