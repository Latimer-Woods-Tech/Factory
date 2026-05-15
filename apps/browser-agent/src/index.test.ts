import { describe, expect, it, vi } from 'vitest';
import { createApp, type BrowserAutomation } from './index.js';

const scrapeMock = vi.fn().mockResolvedValue({
  url: 'https://example.com/',
  scrapedAt: '2026-05-15T00:00:00.000Z',
  results: { title: { selector: 'h1', text: ['Example'] } },
});
const screenshotMock = vi.fn().mockResolvedValue({
  url: 'https://example.com/',
  capturedAt: '2026-05-15T00:00:00.000Z',
  mimeType: 'image/png',
  dataBase64: 'iVBORw0KGgo=',
});
const automation: BrowserAutomation = {
  scrape: scrapeMock,
  screenshot: screenshotMock,
};

describe('browser-agent app', () => {
  it('reports health', async () => {
    const res = await createApp(automation).request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'browser-agent' });
  });

  it('scrapes requested selectors', async () => {
    const app = createApp(automation);
    const res = await app.request('/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', selectors: { title: 'h1' } }),
    });

    expect(res.status).toBe(200);
    expect(scrapeMock).toHaveBeenCalledWith({ url: 'https://example.com/', selectors: { title: 'h1' } });
    await expect(res.json()).resolves.toMatchObject({ results: { title: { text: ['Example'] } } });
  });

  it('rejects invalid scrape payloads', async () => {
    const res = await createApp(automation).request('/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'ftp://example.com', selectors: { title: 'h1' } }),
    });

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: 'url must use http or https' });
  });

  it('captures screenshots', async () => {
    const app = createApp(automation);
    const res = await app.request('/screenshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    expect(res.status).toBe(200);
    expect(screenshotMock).toHaveBeenCalledWith({ url: 'https://example.com/' });
    await expect(res.json()).resolves.toMatchObject({ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' });
  });
});
