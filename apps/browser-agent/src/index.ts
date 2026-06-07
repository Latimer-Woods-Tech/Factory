import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { chromium, type Browser, type ConsoleMessage as PwConsoleMessage, type Response as PwResponse, type Page } from 'playwright';

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

/** A cookie to inject into a browser context. */
export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** A single step in an automated scenario. */
export type ScenarioStep =
  | { action: 'goto'; url: string }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'click'; selector: string }
  | { action: 'wait'; ms: number }
  | { action: 'waitForSelector'; selector: string; timeout?: number }
  | { action: 'select'; selector: string; value: string }
  | { action: 'hover'; selector: string }
  | { action: 'press'; selector: string; key: string }
  | { action: 'setCookies'; cookies: BrowserCookie[] };

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

/** A device viewport for multi-resolution capture. */
export interface Viewport {
  /** Caller-facing label (e.g. "desktop", "tablet", "mobile"). */
  name: string;
  width: number;
  height: number;
}

/** Severity tier for a visual-review finding. */
export type VisualReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A single observation produced by the vision grader. */
export interface VisualReviewFinding {
  severity: VisualReviewSeverity;
  /** Free-form category — e.g. "color", "layout", "rendering", "content". */
  category: string;
  /** Viewport label this applies to, or "all" when cross-cutting. */
  viewport: string;
  description: string;
  recommendation: string;
}

/** A captured screenshot for one viewport. */
export interface VisualReviewShot {
  viewport: string;
  width: number;
  height: number;
  screenshotBase64: string;
}

/** Visual-review request body. */
export interface VisualReviewRequest {
  url: string;
  /** Optional pre-capture scenario steps (e.g. login, navigation). */
  steps?: ScenarioStep[];
  /** Viewports to capture; defaults to desktop (1280x720) + mobile (375x667). */
  viewports?: Viewport[];
  /**
   * Plain-English questions / criteria to ask the vision model about each shot.
   * Defaults to a general rubric covering layout, color, content, and SVG rendering.
   */
  rubric?: string[];
  /** Anthropic model id to use for grading. Defaults to claude-haiku-4-5-20251001. */
  model?: string;
  /** Capture console.warn/error/log messages. Default: true. */
  captureConsole?: boolean;
  /** Flag responses with status >= this value. Default: 400. */
  statusThreshold?: number;
  /**
   * When true, skip the final `goto(url)` and capture the page in whatever
   * state `steps[]` left it. Use this when `steps[]` already drives the SPA
   * into the state you want to grade (e.g. a generated chart) — the default
   * navigation would otherwise reload the page and wipe that state.
   * The `url` is still required (used in the response payload + grader context).
   */
  skipFinalNavigation?: boolean;
  /**
   * When true, run an axe-core accessibility audit on the page after `steps[]`
   * complete but before screenshotting. Surfaces objective WCAG violations
   * (color contrast, ARIA, focus management, etc.) alongside the vision-based
   * findings. Default: false — opt-in to keep latency predictable for callers
   * that only want vision grading.
   */
  runAxe?: boolean;
}

/** A single axe-core accessibility violation flattened for the response. */
export interface AxeViolation {
  /** axe rule id, e.g. "color-contrast", "label", "image-alt". */
  id: string;
  /** axe impact level. */
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  /** Human-readable description of what failed. */
  description: string;
  /** Suggested remediation summary. */
  help: string;
  /** Doc URL for the rule. */
  helpUrl: string;
  /** WCAG criteria tagged on this violation (e.g. ["wcag2aa", "wcag143"]). */
  tags: string[];
  /** Number of DOM nodes that triggered this rule. */
  nodeCount: number;
  /** Up to 3 example selectors that triggered the rule. */
  exampleSelectors: string[];
  /** Viewport label this violation was found on. */
  viewport: string;
}

/** Token usage reported by the grading LLM. */
export interface VisionTokenUsage {
  input: number;
  output: number;
}

/** Grading payload (separated for testability and reuse). */
export interface VisionGradeRequest {
  url: string;
  shots: VisualReviewShot[];
  rubric: string[];
  model: string;
}

/** Grading result. */
export interface VisionGradeResult {
  model: string;
  summary: string;
  findings: VisualReviewFinding[];
  tokenUsage: VisionTokenUsage;
}

/** Vision grader interface; injectable so tests can mock without hitting Anthropic. */
export interface VisionGrader {
  grade(request: VisionGradeRequest): Promise<VisionGradeResult>;
}

/** Visual-review result. */
export interface VisualReviewResult {
  url: string;
  reviewedAt: string;
  viewports: VisualReviewShot[];
  consoleErrors: ConsoleMessage[];
  pageErrors: PageError[];
  failedRequests: FailedRequest[];
  /** Null when no vision grader is configured (no ANTHROPIC_API_KEY in env). */
  review: VisionGradeResult | null;
  /** axe-core violations, aggregated across viewports. Null when `runAxe` was not requested. */
  axeViolations: AxeViolation[] | null;
}

/** Browser automation implementation, injectable for tests. */
export interface BrowserAutomation {
  scrape(request: ScrapeRequest): Promise<{ url: string; scrapedAt: string; results: Record<string, ScrapeFieldResult> }>;
  screenshot(request: ScreenshotRequest): Promise<{ url: string; capturedAt: string; mimeType: 'image/png'; dataBase64: string }>;
  runScenario(request: ScenarioRequest, r2?: R2Config): Promise<ScenarioResult>;
  audit(request: AuditRequest): Promise<AuditResult>;
  visualReview(request: VisualReviewRequest): Promise<VisualReviewResult>;
}

/** Default viewports captured when the request omits `viewports`. */
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 375, height: 667 },
];

/** Default vision-grading rubric used when the request omits `rubric`. */
export const DEFAULT_RUBRIC: string[] = [
  'Identify visual rendering issues: clipping, overlap, broken layout, missing assets, or unstyled flashes.',
  'Identify color and contrast issues that hurt readability or brand consistency.',
  'Identify responsive design issues across the captured viewports (only when more than one viewport is provided).',
  'Identify content quality issues: typos, broken text, placeholder copy, lorem ipsum, lorem-style filler.',
  'Identify SVG, canvas, or chart rendering anomalies (e.g. bodygraphs, diagrams, gauges) — note any obviously misaligned, distorted, or partially drawn elements.',
];

/** Default Anthropic model used for grading. Vision-capable Claude Haiku. */
export const DEFAULT_VISION_MODEL = 'claude-haiku-4-5-20251001';

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
      case 'select': {
        if (typeof s['selector'] !== 'string' || !s['selector'].trim()) {
          throw new HttpError(422, `step[${i}].selector is required for select`);
        }
        if (typeof s['value'] !== 'string') {
          throw new HttpError(422, `step[${i}].value is required for select`);
        }
        return { action: 'select', selector: s['selector'], value: s['value'] } as ScenarioStep;
      }
      case 'hover': {
        if (typeof s['selector'] !== 'string' || !s['selector'].trim()) {
          throw new HttpError(422, `step[${i}].selector is required for hover`);
        }
        return { action: 'hover', selector: s['selector'] } as ScenarioStep;
      }
      case 'press': {
        if (typeof s['selector'] !== 'string' || !s['selector'].trim()) {
          throw new HttpError(422, `step[${i}].selector is required for press`);
        }
        if (typeof s['key'] !== 'string' || !s['key'].trim()) {
          throw new HttpError(422, `step[${i}].key is required for press`);
        }
        return { action: 'press', selector: s['selector'], key: s['key'] } as ScenarioStep;
      }
      case 'setCookies': {
        if (!Array.isArray(s['cookies']) || (s['cookies'] as unknown[]).length === 0) {
          throw new HttpError(422, `step[${i}].cookies must be a non-empty array`);
        }
        const cookies = (s['cookies'] as unknown[]).map((c, j) => {
          if (!c || typeof c !== 'object' || Array.isArray(c)) {
            throw new HttpError(422, `step[${i}].cookies[${j}] must be an object`);
          }
          const ck = c as Record<string, unknown>;
          if (typeof ck['name'] !== 'string' || !ck['name'].trim()) {
            throw new HttpError(422, `step[${i}].cookies[${j}].name is required`);
          }
          if (typeof ck['value'] !== 'string') {
            throw new HttpError(422, `step[${i}].cookies[${j}].value is required`);
          }
          const sameSite = ck['sameSite'];
          return {
            name: ck['name'],
            value: ck['value'],
            domain: typeof ck['domain'] === 'string' ? ck['domain'] : undefined,
            path: typeof ck['path'] === 'string' ? ck['path'] : undefined,
            expires: typeof ck['expires'] === 'number' ? ck['expires'] : undefined,
            httpOnly: typeof ck['httpOnly'] === 'boolean' ? ck['httpOnly'] : undefined,
            secure: typeof ck['secure'] === 'boolean' ? ck['secure'] : undefined,
            sameSite: sameSite === 'Strict' || sameSite === 'Lax' || sameSite === 'None' ? sameSite : undefined,
          } satisfies BrowserCookie;
        });
        return { action: 'setCookies', cookies } as ScenarioStep;
      }
      default:
        throw new HttpError(422, `step[${i}].action "${String(s['action'])}" is not supported`);
    }
  });
}

function parseViewports(value: unknown): Viewport[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(422, 'viewports must be a non-empty array');
  }
  return (value as unknown[]).map((v, i) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      throw new HttpError(422, `viewports[${i}] must be an object`);
    }
    const vp = v as Record<string, unknown>;
    const name = typeof vp['name'] === 'string' ? vp['name'].trim() : '';
    const width = Number(vp['width']);
    const height = Number(vp['height']);
    if (!name) throw new HttpError(422, `viewports[${i}].name is required`);
    if (!Number.isInteger(width) || width < 200 || width > 4096) {
      throw new HttpError(422, `viewports[${i}].width must be an integer 200-4096`);
    }
    if (!Number.isInteger(height) || height < 200 || height > 4096) {
      throw new HttpError(422, `viewports[${i}].height must be an integer 200-4096`);
    }
    return { name, width, height };
  });
}

function parseRubric(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(422, 'rubric must be a non-empty array of strings');
  }
  return (value as unknown[]).map((item, i) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new HttpError(422, `rubric[${i}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.slice(offset, offset + BASE64_CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

/**
 * Constructs an Anthropic-backed vision grader. Sends screenshots + rubric to
 * Claude and parses the JSON findings array out of the response.
 *
 * The model is instructed to respond with JSON only; if it returns extra prose
 * we extract the first top-level `{...}` block. Malformed responses surface a
 * single `info`-severity finding describing the parse failure rather than
 * throwing, so callers always get a structured payload back.
 */
export function createAnthropicVisionGrader(apiKey: string): VisionGrader {
  const client = new Anthropic({ apiKey });
  return {
    async grade(request: VisionGradeRequest): Promise<VisionGradeResult> {
      const rubricText = request.rubric.map((q, i) => `${i + 1}. ${q}`).join('\n');
      const viewportLabels = request.shots.map((s) => `${s.viewport} (${s.width}x${s.height})`).join(', ');

      const systemPrompt =
        'You are a senior UI/UX reviewer evaluating screenshots of a production web page. ' +
        'Respond with ONLY a single JSON object — no prose, no markdown, no code fences. ' +
        'Schema: { "summary": string, "findings": [ { "severity": "critical" | "high" | "medium" | "low" | "info", "category": string, "viewport": string, "description": string, "recommendation": string } ] }. ' +
        'Use the viewport label from the input (or "all" if cross-cutting). ' +
        'If a rubric question reveals no issue, do not invent one — omit it from findings. ' +
        'Limit findings to at most 25.';

      const userText =
        `URL: ${request.url}\n` +
        `Viewports captured: ${viewportLabels}\n\n` +
        `Rubric:\n${rubricText}\n\n` +
        'Review the attached screenshot(s) against each rubric item. Return only the JSON object described in the system prompt.';

      const contentBlocks: Anthropic.MessageParam['content'] = [
        { type: 'text', text: userText },
      ];
      for (const shot of request.shots) {
        contentBlocks.push({
          type: 'text',
          text: `--- viewport: ${shot.viewport} (${shot.width}x${shot.height}) ---`,
        });
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: shot.screenshotBase64 },
        });
      }

      const response = await client.messages.create({
        model: request.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: contentBlocks }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      const usage: VisionTokenUsage = {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      };

      const parsed = parseVisionResponse(raw);
      if (!parsed) {
        return {
          model: request.model,
          summary: 'Vision grader returned a response that could not be parsed as JSON; raw output preserved in the single finding below.',
          findings: [
            {
              severity: 'info',
              category: 'grader',
              viewport: 'all',
              description: `Unparseable grader output (first 500 chars): ${raw.slice(0, 500)}`,
              recommendation: 'Inspect the raw response and refine the system prompt or model.',
            },
          ],
          tokenUsage: usage,
        };
      }
      return { model: request.model, summary: parsed.summary, findings: parsed.findings, tokenUsage: usage };
    },
  };
}

/**
 * Strips an outer ```json ... ``` fence if present. Uses indexOf/lastIndexOf
 * rather than a regex to avoid polynomial-backtracking on pathological input
 * (CodeQL: js/polynomial-redos).
 */
function stripCodeFence(s: string): string {
  if (!s.startsWith('```')) return s;
  const afterFence = s.indexOf('\n');
  if (afterFence === -1) return s;
  const closeIdx = s.lastIndexOf('```');
  if (closeIdx <= afterFence) return s;
  return s.slice(afterFence + 1, closeIdx).trim();
}

/**
 * Extracts the first top-level JSON object from a string and validates it
 * against the expected vision-grading schema. Returns null when no valid
 * object can be recovered.
 */
export function parseVisionResponse(raw: string): { summary: string; findings: VisualReviewFinding[] } | null {
  // Tolerate ```json fences even though the prompt forbids them.
  const candidate = stripCodeFence(raw.trim());
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj['summary'] === 'string' ? obj['summary'] : '';
  const rawFindings = Array.isArray(obj['findings']) ? (obj['findings'] as unknown[]) : [];

  const allowedSeverity = new Set<VisualReviewSeverity>(['critical', 'high', 'medium', 'low', 'info']);
  const findings: VisualReviewFinding[] = [];
  for (const f of rawFindings) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    const o = f as Record<string, unknown>;
    const severity = typeof o['severity'] === 'string' && allowedSeverity.has(o['severity'] as VisualReviewSeverity)
      ? (o['severity'] as VisualReviewSeverity)
      : 'info';
    const category = typeof o['category'] === 'string' && o['category'].trim() ? o['category'].trim() : 'general';
    const viewport = typeof o['viewport'] === 'string' && o['viewport'].trim() ? o['viewport'].trim() : 'all';
    const description = typeof o['description'] === 'string' ? o['description'].trim() : '';
    const recommendation = typeof o['recommendation'] === 'string' ? o['recommendation'].trim() : '';
    if (!description) continue;
    findings.push({ severity, category, viewport, description, recommendation });
  }
  return { summary, findings };
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

/**
 * Injects axe-core into the page and runs an accessibility audit.
 * Returns flattened violations tagged with the viewport label. Uses
 * `require.resolve` so we ship the bundled axe.min.js from the
 * axe-core npm package — no separate CDN dep at runtime.
 */
async function runAxeAudit(page: Page, viewportName: string): Promise<AxeViolation[]> {
  // axe-core ships a self-contained UMD bundle at axe.min.js — inject it
  // into the page, then call window.axe.run() in the page context.
  // Using createRequire so this works under ESM (tsup output).
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const axePath = require.resolve('axe-core/axe.min.js');
  await page.addScriptTag({ path: axePath });

  // Run with defaults — all WCAG 2.0/2.1 A/AA rules. Best-effort: on failure
  // (e.g. CSP blocks the injected script) return an empty list rather than
  // throwing so callers still get the rest of the visualReview payload.
  let raw: { violations: unknown[] } | null = null;
  try {
    raw = await page.evaluate(async () => {
      // window.axe is injected by addScriptTag above. Wrap in Record<string, unknown>
      // to keep the page-context evaluator typesafe under our lint config.
      const w = window as unknown as { axe: { run: () => Promise<{ violations: unknown[] }> } };
      const r = await w.axe.run();
      return { violations: r.violations };
    });
  } catch {
    return [];
  }
  if (!raw) return [];

  const violations: AxeViolation[] = [];
  for (const v of raw.violations) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const impact = typeof o['impact'] === 'string' && ['minor', 'moderate', 'serious', 'critical'].includes(o['impact'])
      ? (o['impact'] as AxeViolation['impact'])
      : null;
    const nodesRaw = Array.isArray(o['nodes']) ? (o['nodes'] as unknown[]) : [];
    const exampleSelectors: string[] = [];
    for (const n of nodesRaw.slice(0, 3)) {
      if (n && typeof n === 'object' && Array.isArray((n as Record<string, unknown>)['target'])) {
        const target = ((n as Record<string, unknown>)['target']) as unknown[];
        if (target.length > 0 && typeof target[0] === 'string') exampleSelectors.push(target[0]);
      }
    }
    violations.push({
      id: typeof o['id'] === 'string' ? o['id'] : 'unknown',
      impact,
      description: typeof o['description'] === 'string' ? o['description'] : '',
      help: typeof o['help'] === 'string' ? o['help'] : '',
      helpUrl: typeof o['helpUrl'] === 'string' ? o['helpUrl'] : '',
      tags: Array.isArray(o['tags']) ? (o['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : [],
      nodeCount: nodesRaw.length,
      exampleSelectors,
      viewport: viewportName,
    });
  }
  return violations;
}

async function runScenarioSteps(page: Page, steps: ScenarioStep[]): Promise<void> {
  for (const step of steps) {
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
      case 'select':
        await page.selectOption(step.selector, step.value);
        break;
      case 'hover':
        await page.hover(step.selector);
        break;
      case 'press':
        await page.press(step.selector, step.key);
        break;
      case 'setCookies':
        await page.context().addCookies(step.cookies);
        break;
    }
  }
}

/**
 * Factory for the production browser automation. The optional `grader`
 * argument enables vision-LLM grading on /visual-review; when absent, the
 * endpoint still returns screenshots + console diagnostics but `review` is null.
 */
export function createPlaywrightAutomation(grader?: VisionGrader): BrowserAutomation {
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
        page.on('console', (msg: PwConsoleMessage) => {
          const type = msg.type();
          if (type === 'error' || type === 'warning') {
            const loc = msg.location();
            consoleErrors.push({
              type,
              text: msg.text(),
              location: loc.url ? `${loc.url}:${loc.lineNumber}` : '',
            });
          }
        });
      }

      page.on('pageerror', (err: Error) => {
        pageErrors.push({ message: err.message, stack: err.stack ?? '' });
      });

      page.on('response', (res: PwResponse) => {
        if (res.status() >= threshold) {
          const req = res.request();
          failedRequests.push({ url: res.url(), method: req.method(), status: res.status() });
        }
      });

      try {
        // Run optional login/setup steps before auditing
        if (request.steps && request.steps.length > 0) {
          await runScenarioSteps(page, request.steps);
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

    async visualReview(request) {
      const viewports = request.viewports && request.viewports.length > 0 ? request.viewports : DEFAULT_VIEWPORTS;
      const rubric = request.rubric && request.rubric.length > 0 ? request.rubric : DEFAULT_RUBRIC;
      const model = request.model && request.model.trim() ? request.model.trim() : DEFAULT_VISION_MODEL;
      const threshold = request.statusThreshold ?? 400;
      const captureConsole = request.captureConsole !== false;

      const browser = await getBrowser();
      const shots: VisualReviewShot[] = [];
      const consoleErrors: ConsoleMessage[] = [];
      const pageErrors: PageError[] = [];
      const failedRequests: FailedRequest[] = [];
      const axeViolations: AxeViolation[] = [];

      // One fresh context per viewport so cookies, console buffers, and
      // viewport size are isolated. Login (via request.steps) runs again
      // for each viewport — necessary because session state lives in the
      // per-context cookie jar.
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          // bypassCSP is required when runAxe=true: page.addScriptTag is blocked
          // by strict CSP headers (e.g. selfprime.net) unless Playwright
          // intercepts and strips the header at the network layer.
          ...(request.runAxe ? { bypassCSP: true } : {}),
        });
        const page = await context.newPage();
        if (captureConsole) {
          page.on('console', (msg: PwConsoleMessage) => {
            const type = msg.type();
            if (type === 'error' || type === 'warning') {
              const loc = msg.location();
              consoleErrors.push({
                type,
                text: `[${viewport.name}] ${msg.text()}`,
                location: loc.url ? `${loc.url}:${loc.lineNumber}` : '',
              });
            }
          });
        }
        page.on('pageerror', (err: Error) => {
          pageErrors.push({ message: `[${viewport.name}] ${err.message}`, stack: err.stack ?? '' });
        });
        page.on('response', (res: PwResponse) => {
          if (res.status() >= threshold) {
            const req = res.request();
            failedRequests.push({ url: res.url(), method: req.method(), status: res.status() });
          }
        });

        try {
          if (request.steps && request.steps.length > 0) {
            await runScenarioSteps(page, request.steps);
          }
          if (!request.skipFinalNavigation) {
            await page.goto(request.url, { waitUntil: 'networkidle', timeout: 45_000 });
            await page.waitForTimeout(2_000);
          }
          // Run axe-core audit BEFORE screenshot so any UI mutation from the
          // injected script doesn't leak into the captured image.
          if (request.runAxe) {
            const v = await runAxeAudit(page, viewport.name);
            axeViolations.push(...v);
          }
          // Anthropic vision API rejects images with any dimension > 8000px.
          // Long-form pages (terms, privacy, glossary) exceed this on
          // fullPage screenshots. Cap height at 7500px (safety margin under
          // the 8000 limit) by switching to a `clip` screenshot in that case.
          const docHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0));
          const MAX_IMAGE_HEIGHT = 7500;
          const image = docHeight > MAX_IMAGE_HEIGHT
            ? await page.screenshot({
                type: 'png',
                clip: { x: 0, y: 0, width: viewport.width, height: MAX_IMAGE_HEIGHT },
              })
            : await page.screenshot({ type: 'png', fullPage: true });
          shots.push({
            viewport: viewport.name,
            width: viewport.width,
            height: viewport.height,
            screenshotBase64: bytesToBase64(image),
          });
        } finally {
          await page.close();
          await context.close();
        }
      }

      let review: VisionGradeResult | null = null;
      if (grader) {
        review = await grader.grade({ url: request.url, shots, rubric, model });
      }

      return {
        url: request.url,
        reviewedAt: new Date().toISOString(),
        viewports: shots,
        consoleErrors,
        pageErrors,
        failedRequests,
        review,
        axeViolations: request.runAxe ? axeViolations : null,
      };
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
        await runScenarioSteps(page, request.steps);
        completedSteps = request.steps.length;
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

  app.post('/visual-review', async (c) => {
    const body = await readJson(c);
    const url = normalizeUrl(body['url']);
    const steps = body['steps'] !== undefined ? parseSteps(body['steps']) : undefined;
    const viewports = body['viewports'] !== undefined ? parseViewports(body['viewports']) : undefined;
    const rubric = body['rubric'] !== undefined ? parseRubric(body['rubric']) : undefined;
    const model = typeof body['model'] === 'string' && body['model'].trim() ? body['model'].trim() : undefined;
    const captureConsole = body['captureConsole'] !== undefined ? Boolean(body['captureConsole']) : undefined;
    const skipFinalNavigation = body['skipFinalNavigation'] !== undefined ? Boolean(body['skipFinalNavigation']) : undefined;
    const runAxe = body['runAxe'] !== undefined ? Boolean(body['runAxe']) : undefined;
    const statusThreshold = body['statusThreshold'] !== undefined
      ? (() => {
          const v = Number(body['statusThreshold']);
          if (!Number.isInteger(v) || v < 100 || v > 599) throw new HttpError(422, 'statusThreshold must be an integer between 100 and 599');
          return v;
        })()
      : undefined;
    const result = await automation.visualReview({ url, steps, viewports, rubric, model, captureConsole, statusThreshold, skipFinalNavigation, runAxe });
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
