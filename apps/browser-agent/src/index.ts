import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

/** A single step in an automated scenario. */
export type ScenarioStep =
  | { action: 'goto'; url: string }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'click'; selector: string }
  | { action: 'wait'; ms: number }
  | { action: 'waitForSelector'; selector: string; timeout?: number };

/** Scenario execution request body. */
export interface ScenarioRequest {
  steps: ScenarioStep[];
}

/** Cloudflare R2 upload configuration. */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicDomain?: string;
}

/** Result returned by runScenario. */
export interface ScenarioResult {
  completedSteps: number;
  videoKey: string | null;
  videoUrl: string | null;
  finishedAt: string;
}

/** A captured browser console message. */
export interface ConsoleMessage {
  type: string;
  text: string;
  location: string;
}

/** A captured JS runtime error. */
export interface PageError {
  message: string;
  stack: string;
}

/** A captured HTTP response that met the status threshold. */
export interface FailedRequest {
  url: string;
  method: string;
  status: number;
}

/** Audit request body. */
export interface AuditRequest {
  url: string;
  /** Optional scenario steps to run before auditing (e.g. login). */
  steps?: ScenarioStep[];
  /** Capture console.warn/error/log messages. Default: true. */
  captureConsole?: boolean;
  /** Flag responses with status >= this value. Default: 400. */
  statusThreshold?: number;
}

/** Audit result. */
export interface AuditResult {
  url: string;
  auditedAt: string;
  consoleErrors: ConsoleMessage[];
  pageErrors: PageError[];
  failedRequests: FailedRequest[];
  screenshotBase64: string;
}

/** Browser automation implementation, injectable for tests. */
export interface BrowserAutomation {
  scrape(request: ScrapeRequest): Promise<{ url: string; scrapedAt: string; results: Record<string, ScrapeFieldResult> }>;
  screenshot(request: ScreenshotRequest): Promise<{ url: string; capturedAt: string; mimeType: 'image/png'; dataBase64: string }>;
  runScenario(request: ScenarioRequest, r2?: R2Config): Promise<ScenarioResult>;
  audit(request: AuditRequest): Promise<AuditResult>;
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

function parseSteps(value: unknown): ScenarioStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(422, 'steps must be a non-empty array');
  }
  return (value as unknown[]).map((step, i) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new HttpError(422, `step[${i}] must be an object`);
    }
    const s = step as Record<string, unknown>;
    switch (s['action']) {
      case 'goto': {
        if (typeof s['url'] !== 'string' || !s['url'].trim()) {
          throw new HttpError(422, `step[${i}].url is required for goto`);
        }
        return { action: 'goto', url: s['url'] } as ScenarioStep;
      }
      case 'fill': {
        if (typeof s['selector'] !== 'string' || !s['selector'].trim()) {
          throw new HttpError(422, `step[${i}].selector is required for fill`);
        }
        if (typeof s['value'] !== 'string') {
          throw new HttpError(422, `step[${i}].value is required for fill`);
        }
        return { action: 'fill', selector: s['selector'], value: s['value'] } as ScenarioStep;
      }
      case 'click': {
        if (typeof s['selector'] !== 'string' || !s['selector'].trim()) {
          throw new HttpError(422, `step[${i}].selector is required for click`);
        }
        return { action: 'click', selector: s['selector'] } as ScenarioStep;
      }
      case 'wait': {
        if (typeof s['ms'] !== 'number' || s['ms'] <= 0) {
          throw new HttpError(422, `step[${i}].ms must be a positive number`);
        }
        return { action: 'wait', ms: s['ms'] } as ScenarioStep;
      }
      case 'waitForSelector': {
        if (typeof s['selector'] !== 'string' || !s['selector'].trim()) {
          throw new HttpError(422, `step[${i}].selector is required for waitForSelector`);
        }
        const timeout = s['timeout'] !== undefined ? s['timeout'] : undefined;
        if (timeout !== undefined && typeof timeout !== 'number') {
          throw new HttpError(422, `step[${i}].timeout must be a number`);
        }
        return { action: 'waitForSelector', selector: s['selector'], timeout } as ScenarioStep;
      }
      default:
        throw new HttpError(422, `step[${i}].action "${String(s['action'])}" is not supported`);
    }
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.slice(offset, offset + BASE64_CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

async function uploadToR2(videoPath: string, key: string, config: R2Config): Promise<string> {
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const stream = createReadStream(videoPath);
  await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: stream, ContentType: 'video/webm' }));
  if (config.publicDomain) return `https://${config.publicDomain}/${key}`;
  return `${endpoint}/${config.bucket}/${key}`;
}

function createPlaywrightAutomation(): BrowserAutomation {
  let browserPromise: Promise<Browser> | undefined;
  const getBrowser = (): Promise<Browser> => {
    // --no-sandbox + --disable-dev-shm-usage: required on Cloud Run (gVisor)
    // where Chromium's namespace-based sandbox cannot initialize and /dev/shm
    // is undersized. Without these flags chromium.launch() throws and every
    // /scrape, /screenshot, /run-scenario request 500s.
    browserPromise ??= chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
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
          const text = (await page.locator(selector).allTextContents()).map((value: string) => value.trim()).filter(Boolean);
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

    async audit(request) {
      const threshold = request.statusThreshold ?? 400;
      const captureConsole = request.captureConsole !== false;

      const browser = await getBrowser();
      const context = await browser.newContext();
      const page = await context.newPage();

      const consoleErrors: ConsoleMessage[] = [];
      const pageErrors: PageError[] = [];
      const failedRequests: FailedRequest[] = [];

      if (captureConsole) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        page.on('console', (msg: any) => {
          const type: string = msg.type();
          if (type === 'error' || type === 'warning' || type === 'warn') {
            const loc: { url?: string; lineNumber?: number } = msg.location();
            consoleErrors.push({
              type,
              text: msg.text(),
              location: loc.url ? `${loc.url}:${loc.lineNumber ?? 0}` : '',
            });
          }
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.on('pageerror', (err: any) => {
        pageErrors.push({ message: err.message, stack: err.stack ?? '' });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.on('response', (res: any) => {
        if (res.status() >= threshold) {
          const req = res.request();
          failedRequests.push({ url: res.url(), method: req.method(), status: res.status() });
        }
      });

      try {
        // Run optional login/setup steps before auditing
        if (request.steps && request.steps.length > 0) {
          for (const step of request.steps) {
            switch (step.action) {
              case 'goto':
                await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
                break;
              case 'fill':
                await page.fill(step.selector, step.value);
                break;
              case 'click':
                await page.click(step.selector);
                break;
              case 'wait':
                await page.waitForTimeout(step.ms);
                break;
              case 'waitForSelector':
                await page.waitForSelector(step.selector, step.timeout !== undefined ? { timeout: step.timeout } : undefined);
                break;
            }
          }
        }

        // Navigate to the target URL and wait for network to settle
        await page.goto(request.url, { waitUntil: 'networkidle', timeout: 45_000 });
        // Brief extra wait to catch deferred XHR calls that fire after networkidle
        await page.waitForTimeout(2_000);

        const image = await page.screenshot({ type: 'png', fullPage: true });
        return {
          url: request.url,
          auditedAt: new Date().toISOString(),
          consoleErrors,
          pageErrors,
          failedRequests,
          screenshotBase64: bytesToBase64(image),
        };
      } finally {
        await page.close();
        await context.close();
      }
    },

    async runScenario(request, r2) {
      const browser = await getBrowser();
      const videoDir = join(tmpdir(), `scenario-${crypto.randomUUID()}`);
      mkdirSync(videoDir, { recursive: true });
      const context = await browser.newContext({
        recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
      });
      const page = await context.newPage();
      let completedSteps = 0;
      try {
        for (const step of request.steps) {
          switch (step.action) {
            case 'goto':
              await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
              break;
            case 'fill':
              await page.fill(step.selector, step.value);
              break;
            case 'click':
              await page.click(step.selector);
              break;
            case 'wait':
              await page.waitForTimeout(step.ms);
              break;
            case 'waitForSelector':
              await page.waitForSelector(step.selector, step.timeout !== undefined ? { timeout: step.timeout } : undefined);
              break;
          }
          completedSteps++;
        }
      } finally {
        await page.close();
        // Video is only finalized after context.close()
        await context.close();
      }

      let videoKey: string | null = null;
      let videoUrl: string | null = null;
      if (r2) {
        try {
          const files = await readdir(videoDir);
          const videoFile = files.find((f) => f.endsWith('.webm'));
          if (videoFile) {
            videoKey = `scenarios/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.webm`;
            videoUrl = await uploadToR2(join(videoDir, videoFile), videoKey, r2);
          }
        } finally {
          rmSync(videoDir, { recursive: true, force: true });
        }
      } else {
        rmSync(videoDir, { recursive: true, force: true });
      }

      return { completedSteps, videoKey, videoUrl, finishedAt: new Date().toISOString() };
    },
  };
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'JSON object body required');
  return body as Record<string, unknown>;
}

/** Creates the Browser Agent Hono app. */
export function createApp(automation: BrowserAutomation = createPlaywrightAutomation(), r2?: R2Config): Hono {
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

  app.post('/audit', async (c) => {
    const body = await readJson(c);
    const url = normalizeUrl(body['url']);
    const steps = body['steps'] !== undefined ? parseSteps(body['steps']) : undefined;
    const captureConsole = body['captureConsole'] !== undefined ? Boolean(body['captureConsole']) : undefined;
    const statusThreshold = body['statusThreshold'] !== undefined
      ? (() => {
          const raw: unknown = body['statusThreshold'];
          const v = Number(raw);
          if (!Number.isInteger(v) || v < 100 || v > 599) throw new HttpError(422, 'statusThreshold must be an integer between 100 and 599');
          return v;
        })()
      : undefined;
    const result = await automation.audit({ url, steps, captureConsole, statusThreshold });
    return c.json(result);
  });

  app.post('/run-scenario', async (c) => {
    const body = await readJson(c);
    const steps = parseSteps(body['steps']);
    const result = await automation.runScenario({ steps }, r2);
    return c.json(result);
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400 | 422);
    // Cloud Run only persists logs that reach stdout/stderr — without this the
    // 500-path discards the real failure and operators see empty {} payloads.
    console.error('browser-agent error:', err instanceof Error ? err.stack ?? err.message : err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
