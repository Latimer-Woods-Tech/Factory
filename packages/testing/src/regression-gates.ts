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
    // Dynamic require for Node.js test environment (safe to use in tests)
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const lighthouseModule = require('lighthouse');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const lighthouse = lighthouseModule.default;

    const browserWSEndpoint = (page as { context: (() => { browser?: { wsEndpoint?: (() => string) } }) }).context?.()?.browser?.wsEndpoint?.();
    if (!browserWSEndpoint) {
      console.warn(`[Lighthouse] Skipped ${reportName}: no browser endpoint`);
      return null;
    }

    const portMatch = String(browserWSEndpoint).match(/:(\d+)/);
    const port = portMatch?.[1] ? parseInt(portMatch[1], 10) : 9222;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const result = await lighthouse(url, {
      port,
      logLevel: 'error',
      output: 'json',
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!result?.lhr) {
      return null;
    }

    // Extract metrics from Lighthouse report
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  const fs = require('fs/promises');
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  const path = require('path');

  const viewports = ['desktop', 'mobile', 'tablet'] as const;
  const paths: Partial<CapturedScreenshots> = {};

  for (const viewport of viewports) {
    const dims = viewport === 'desktop' ? { width: 1280, height: 720 }
      : viewport === 'mobile' ? { width: 375, height: 667 }
      : { width: 768, height: 1024 };

    try {
      (page as { setViewportSize: (dims: { width: number; height: number }) => void }).setViewportSize(dims);
      (page as { waitForLoadState: (state: string) => void }).waitForLoadState('networkidle');
    } catch (err) {
      // Network timeout is acceptable; take screenshot anyway
      console.warn(`Network wait timeout for ${routeName}.${viewport}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const outputPath = path.join(outputDir, routeName, `${viewport}.png`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const screenshotPath = await (page as { screenshot: (opts: { path: string }) => Promise<string> }).screenshot({ path: outputPath });
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
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  const fs = require('fs/promises');
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  const path = require('path');

  try {
    // Check if baseline exists
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await fs.stat(baselinePath);
    } catch {
      // Baseline doesn't exist: create it from actual
      console.info(`[Screenshots] Creating baseline for ${routeName}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await fs.copyFile(actualPath, baselinePath);
      return {
        match: true,
        pixelDiff: 0,
        pixelPercent: 0,
        message: `Baseline created for ${routeName}`,
      };
    }

    // Read and decode both screenshots using pngjs for deterministic pixel comparison.
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const { PNG } = require('pngjs') as { PNG: { sync: { read: (buf: Uint8Array) => { data: Uint8Array; width: number; height: number } } } };
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const pixelmatch = require('pixelmatch') as (img1: Uint8Array, img2: Uint8Array, output: null, width: number, height: number, opts?: { threshold?: number }) => number;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const actualRaw: Uint8Array = await fs.readFile(actualPath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
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
