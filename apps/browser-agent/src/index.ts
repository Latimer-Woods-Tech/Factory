import { Hono } from 'hono';
import { chromium, type Browser } from 'playwright';

/** Selector map keyed by caller-defined field names. */
export type BrowserSelectors = Record<string, string>;

const BASE64_CHUNK_SIZE = 0x8000;

/** Scrape request body. */
export interface ScrapeRequest {
  url: string;
  selectors: BrowserSelectors;
}

/** Screenshot request body. */
export interface ScreenshotRequest {
  url: string;
}

/** Scraped text for a single selector. */
export interface ScrapeFieldResult {
  selector: string;
  text: string[];
}

/** Browser automation implementation, injectable for tests. */
export interface BrowserAutomation {
  scrape(request: ScrapeRequest): Promise<{ url: string; scrapedAt: string; results: Record<string, ScrapeFieldResult> }>;
  screenshot(request: ScreenshotRequest): Promise<{ url: string; capturedAt: string; mimeType: 'image/png'; dataBase64: string }>;
}

class HttpError extends Error {
  public constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(422, 'url is required');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(422, 'url must use http or https');
  }
  return parsed.toString();
}

function parseSelectors(value: unknown): BrowserSelectors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(422, 'selectors must be an object');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) throw new HttpError(422, 'selectors must not be empty');
  const selectors: BrowserSelectors = {};
  for (const [key, selector] of entries) {
    if (!key.trim() || typeof selector !== 'string' || !selector.trim()) {
      throw new HttpError(422, 'selector keys and values must be non-empty strings');
    }
    selectors[key] = selector;
  }
  return selectors;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.slice(offset, offset + BASE64_CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

function createPlaywrightAutomation(): BrowserAutomation {
  let browserPromise: Promise<Browser> | undefined;
  const getBrowser = (): Promise<Browser> => {
    browserPromise ??= chromium.launch({ headless: true });
    return browserPromise;
  };

  return {
    async scrape(request) {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        const results: Record<string, ScrapeFieldResult> = {};
        for (const [key, selector] of Object.entries(request.selectors)) {
          const text = (await page.locator(selector).allTextContents()).map((value) => value.trim()).filter(Boolean);
          results[key] = { selector, text };
        }
        return { url: request.url, scrapedAt: new Date().toISOString(), results };
      } finally {
        await page.close();
      }
    },
    async screenshot(request) {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.goto(request.url, { waitUntil: 'networkidle', timeout: 45_000 });
        const image = await page.screenshot({ type: 'png', fullPage: true });
        return {
          url: request.url,
          capturedAt: new Date().toISOString(),
          mimeType: 'image/png',
          dataBase64: bytesToBase64(image),
        };
      } finally {
        await page.close();
      }
    },
  };
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'JSON object body required');
  return body as Record<string, unknown>;
}

/** Creates the Browser Agent Hono app. */
export function createApp(automation: BrowserAutomation = createPlaywrightAutomation()): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'browser-agent' }));

  app.post('/scrape', async (c) => {
    const body = await readJson(c);
    const result = await automation.scrape({ url: normalizeUrl(body['url']), selectors: parseSelectors(body['selectors']) });
    return c.json(result);
  });

  app.post('/screenshot', async (c) => {
    const body = await readJson(c);
    const result = await automation.screenshot({ url: normalizeUrl(body['url']) });
    return c.json(result);
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400 | 422);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}

export default createApp();
