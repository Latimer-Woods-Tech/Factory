/**
 * W360-042: UI Regression Gates — Node.js-Only Testing Infrastructure
 *
 * This module provides utilities for multi-viewport visual regression testing,
 * performance auditing via Lighthouse, and pixel-level screenshot diffing.
 *
 * ⚠️ **Node.js Only**: This module is exclusively for local test environments and CI/CD.
 * It is NOT available in Cloudflare Workers (requires Node.js fs, path, dynamic imports).
 *
 * @example
 * ```typescript
 * import { captureScreenshots, compareScreenshots } from '@latimer-woods-tech/testing';
 *
 * test('homepage visual regression', async ({ page }) => {
 *   await page.goto('/');
 *   const paths = await captureScreenshots(page, 'homepage', './screenshots');
 *   const diff = await compareScreenshots('homepage', paths.desktop, baseline);
 *   expect(diff.match).toBe(true);
 * });
 * ```
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/naming-convention
type AnyValue = unknown;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lighthouse audit scores and Web Vitals collected by {@link collectLighthouse}. */
export interface LighthouseMetrics {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  fcp: number;
  lcp: number;
  cls: number;
}

/** Pixel-level diff result returned by {@link compareScreenshots}. */
export interface ScreenshotDiffResult {
  match: boolean;
  pixelDiff: number;
  pixelPercent: number;
  message: string;
}

/** File paths for each viewport screenshot captured by {@link captureScreenshots}. */
export interface CapturedScreenshots {
  desktop: string;
  mobile: string;
  tablet: string;
}

/** Threshold values used by {@link assertLighthouseBudget} to gate CI on performance. */
export interface PerformanceBudget {
  performanceScore: number;
  fcp: number;
  lcp: number;
  cls: number;
}

// ---------------------------------------------------------------------------
// Performance Budget Defaults
// ---------------------------------------------------------------------------

/** Default per-route performance budgets used when no custom budget is supplied. */
export const DEFAULT_PERFORMANCE_BUDGETS: Record<string, PerformanceBudget> = {
  homepage: {
    performanceScore: 80,
    fcp: 1500,
    lcp: 3500,
    cls: 0.1,
  },
  pricing: {
    performanceScore: 80,
    fcp: 1600,
    lcp: 3800,
    cls: 0.15,
  },
  dashboard: {
    performanceScore: 75,
    fcp: 2000,
    lcp: 4500,
    cls: 0.2,
  },
  checkout: {
    performanceScore: 85,
    fcp: 1200,
    lcp: 3000,
    cls: 0.05,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect Lighthouse metrics for performance budgeting.
 * Runs only on localhost to prevent prod audit spam.
 * Returns null if Lighthouse is not available or URL is not localhost.
 */
export async function collectLighthouse(
  page: AnyValue,
  reportName: string,
  options?: { skipLocalhost?: boolean },
): Promise<LighthouseMetrics | null> {
  const url = (page as { url: (() => string) | undefined }).url?.() ?? '';

  // Guard: Only localhost in local dev
  if (!options?.skipLocalhost && !url.includes('localhost')) {
    console.warn(`[Lighthouse] Skipped ${reportName}: not localhost (${url})`);
    return null;
  }

  try {
    // Dynamic ESM import — lighthouse is an optional heavy dep; lazy-load it
    // at call time so module load doesn't pull it into environments that
    // never run audits.
    type LighthouseFn = (
      url: string,
      flags: { port: number; logLevel: string; output: string },
    ) => Promise<{ lhr: unknown } | undefined>;
    const lighthouseModule: { default: LighthouseFn } = await import('lighthouse');
    const lighthouse = lighthouseModule.default;

    const browserWSEndpoint = (page as { context: (() => { browser?: { wsEndpoint?: (() => string) } }) }).context?.()?.browser?.wsEndpoint?.();
    if (!browserWSEndpoint) {
      console.warn(`[Lighthouse] Skipped ${reportName}: no browser endpoint`);
      return null;
    }

    const portMatch = String(browserWSEndpoint).match(/:(\d+)/);
    const port = portMatch?.[1] ? parseInt(portMatch[1], 10) : 9222;

    const result = await lighthouse(url, {
      port,
      logLevel: 'error',
      output: 'json',
    });

    if (!result?.lhr) {
      return null;
    }

    // Extract metrics from Lighthouse report
    const lhr = result.lhr as { categories: { performance: { score: number }, accessibility: { score: number }, 'best-practices': { score: number }, seo: { score: number } }, audits: Record<string, { numericValue?: number }> };
    const audits = lhr.audits as Record<string, { numericValue?: number }>;

    return {
      performance: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
      accessibility: Math.round((lhr.categories?.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((lhr.categories?.['best-practices']?.score ?? 0) * 100),
      seo: Math.round((lhr.categories?.seo?.score ?? 0) * 100),
      fcp: audits['first-contentful-paint']?.numericValue ?? 0,
      lcp: audits['largest-contentful-paint']?.numericValue ?? 0,
      cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Lighthouse] Collection failed for ${reportName}: ${msg}`);
    return null;
  }
}

/**
 * Capture multi-viewport screenshots (desktop, mobile, tablet).
 * Returns file paths for each viewport.
 */
export async function captureScreenshots(
  page: AnyValue,
  routeName: string,
  outputDir: string,
): Promise<CapturedScreenshots> {
  const viewports = ['desktop', 'mobile', 'tablet'] as const;
  const paths: Partial<CapturedScreenshots> = {};

  // Both setViewportSize and waitForLoadState in Playwright are async; the
  // previous version did not await them, so the screenshot could fire before
  // the resize and network had settled — every capture observed a slightly
  // different render moment, producing 0.2-0.6% pixel drift between runs of
  // the same page and falsely flagging visual regression. Await both, and
  // give a longer per-viewport budget to absorb cold-start re-layouts.
  type PageLike = {
    setViewportSize: (dims: { width: number; height: number }) => Promise<void>;
    waitForLoadState: (state: string, opts?: { timeout?: number }) => Promise<void>;
    screenshot: (opts: { path: string; animations?: 'disabled' | 'allow'; caret?: 'hide' | 'initial' }) => Promise<string>;
  };
  const p = page as PageLike;

  for (const viewport of viewports) {
    const dims = viewport === 'desktop' ? { width: 1280, height: 720 }
      : viewport === 'mobile' ? { width: 375, height: 667 }
      : { width: 768, height: 1024 };

    await p.setViewportSize(dims);
    try {
      await p.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch {
      // Network never settles on some pages (analytics beacons, RUM). Take
      // the screenshot anyway — the viewport resize has already taken effect.
      console.warn(`Network wait timeout for ${routeName}.${viewport}; capturing anyway`);
    }

    const outputPath: string = path.join(outputDir, routeName, `${viewport}.png`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // animations: 'disabled' freezes CSS transitions, caret: 'hide' kills
    // the text-input caret blink — both are common sources of small per-run
    // pixel drift on visual-regression captures.
    const screenshotPath = await p.screenshot({
      path: outputPath,
      animations: 'disabled',
      caret: 'hide',
    });
    paths[viewport] = screenshotPath;
  }

  return paths as CapturedScreenshots;
}

/**
 * Compare current screenshot against baseline using pixel-diff.
 * Auto-creates baseline on first run (copies actual → baseline).
 * Returns diff result with pixel count and percentage.
 */
export async function compareScreenshots(
  routeName: string,
  actualPath: string,
  baselinePath: string,
  pixelThreshold: number = 100,
): Promise<ScreenshotDiffResult> {
  try {
    // Check if baseline exists
    try {
      await fs.stat(baselinePath);
    } catch {
      // Baseline doesn't exist: create it from actual
      console.info(`[Screenshots] Creating baseline for ${routeName}`);
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.copyFile(actualPath, baselinePath);
      return {
        match: true,
        pixelDiff: 0,
        pixelPercent: 0,
        message: `Baseline created for ${routeName}`,
      };
    }

    // Read and decode both screenshots using pngjs for deterministic pixel comparison.
    // Dynamic ESM import — pngjs is heavy and only needed when a diff is run.
    type PngModule = { PNG: { sync: { read: (buf: Uint8Array) => { data: Uint8Array; width: number; height: number } } } };
    const { PNG } = (await import('pngjs')) as PngModule;
    // pixelmatch v6+ ships as pure ESM. require() returns the Module wrapper
    // (with `.default` as the actual function), not the function itself —
    // calling it directly threw "pixelmatch is not a function" on every
    // diff. Use dynamic import + .default to support both v5 (CJS, default
    // export *is* the function) and v6+ (ESM, function on .default).
    type Pixelmatch = (
      img1: Uint8Array,
      img2: Uint8Array,
      output: Uint8Array | null,
      width: number,
      height: number,
      opts?: { threshold?: number },
    ) => number;
    // The local pixelmatch.d.ts shim declares `export default pixelmatch`, so
    // dynamic import is precisely typed — no `any` and no unsafe member access.
    // We still tolerate the v5 CJS shape (module itself is the function) at
    // runtime via a typeof check, narrowing through a typed union.
    type PixelmatchModule = { default: Pixelmatch } | Pixelmatch;
    const pmModule: PixelmatchModule = (await import('pixelmatch')) as PixelmatchModule;
    const candidate: Pixelmatch | undefined =
      typeof pmModule === 'function' ? pmModule : pmModule.default;
    if (typeof candidate !== 'function') {
      throw new Error('pixelmatch resolution failed: neither default export nor module is a function');
    }
    const pixelmatch: Pixelmatch = candidate;

    const actualRaw: Uint8Array = await fs.readFile(actualPath);
    const baselineRaw: Uint8Array = await fs.readFile(baselinePath);

    const actualPng = PNG.sync.read(actualRaw);
    const baselinePng = PNG.sync.read(baselineRaw);

    if (actualPng.width !== baselinePng.width || actualPng.height !== baselinePng.height) {
      return {
        match: false,
        pixelDiff: actualPng.width * actualPng.height,
        pixelPercent: 100,
        message: `Dimension mismatch for ${routeName}: actual ${actualPng.width}x${actualPng.height}, baseline ${baselinePng.width}x${baselinePng.height}`,
      };
    }

    const { width, height } = actualPng;
    const pixelDiff = pixelmatch(actualPng.data, baselinePng.data, null, width, height, { threshold: 0.1 });
    const totalPixels = width * height;
    const pixelPercent = (pixelDiff / totalPixels) * 100;

    const match = pixelDiff <= pixelThreshold;
    return {
      match,
      pixelDiff,
      pixelPercent: Math.round(pixelPercent * 100) / 100,
      message: match
        ? `${routeName}: ✓ (${pixelDiff} pixels diff, ${pixelPercent.toFixed(2)}%)`
        : `${routeName}: ✗ (${pixelDiff} pixels diff, ${pixelPercent.toFixed(2)}%, threshold ${pixelThreshold})`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      match: false,
      pixelDiff: 0,
      pixelPercent: 0,
      message: `Error comparing screenshots for ${routeName}: ${msg}`,
    };
  }
}

/**
 * Assert Lighthouse metrics against budget thresholds.
 * Throws if any metric violates budget.
 */
export function assertLighthouseBudget(metrics: LighthouseMetrics, budget: PerformanceBudget): void {
  const errors: string[] = [];

  if (metrics.performance < budget.performanceScore) {
    errors.push(
      `Performance score ${metrics.performance} < ${budget.performanceScore} (${metrics.performance - budget.performanceScore})`,
    );
  }

  if (metrics.fcp > budget.fcp) {
    errors.push(`FCP ${metrics.fcp}ms > ${budget.fcp}ms (+${metrics.fcp - budget.fcp}ms)`);
  }

  if (metrics.lcp > budget.lcp) {
    errors.push(`LCP ${metrics.lcp}ms > ${budget.lcp}ms (+${metrics.lcp - budget.lcp}ms)`);
  }

  if (metrics.cls > budget.cls) {
    errors.push(`CLS ${metrics.cls} > ${budget.cls} (+${(metrics.cls - budget.cls).toFixed(3)})`);
  }

  if (errors.length > 0) {
    throw new Error(`Lighthouse budget violations:\n  ${errors.join('\n  ')}`);
  }
}
