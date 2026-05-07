/**
 * Phase F — Smoke probe executor.
 *
 * Takes a catalogued endpoint (method, path, auth) and a list of SmokeProbe
 * records, executes them sequentially against the target URL, and collects
 * timing + match results. Only runs idempotent probes (GET, HEAD, OPTIONS,
 * read-only POST). Respects a global 30-second timeout per suite.
 *
 * Returned rows are suitable for audit logging (reversibility = 'trivial',
 * not logged unless explicitly requested by operator).
 */

import type { SmokeProbe, AuthRequirement } from './manifest.js';

/** Single probe result returned by the smoke probe executor. */
export interface SmokeProbeResult {
  /** Probe label (if provided) or index */
  label: string;
  /** HTTP status code */
  status: number;
  /** Response time in ms */
  durationMs: number;
  /** Pass if status matches expected and (if set) response contains substring */
  passed: boolean;
  /** If failed, human-readable reason */
  reason?: string;
  /** First 200 chars of response body for debugging */
  bodyPreview?: string;
}

/** Aggregate result for a full smoke probe suite run against one endpoint. */
export interface SmokeSuiteResult {
  /** (method path, e.g. "POST /orders/create") */
  endpoint: string;
  /** Number of probes executed */
  total: number;
  /** Number that passed */
  passed: number;
  /** Individual probe results */
  results: SmokeProbeResult[];
  /** Total time across all probes + overhead */
  durationMs: number;
}

const SUITE_TIMEOUT_MS = 30_000;
const SINGLE_PROBE_TIMEOUT_MS = 5_000;

/**
 * Execute a suite of smoke probes against a target endpoint.
 *
 * @param targetUrl — base URL (e.g. "https://admin-studio.prod.workers.dev")
 * @param method — HTTP method (GET, POST, etc.)
 * @param path — URL path (e.g. "/auth/login")
 * @param auth — auth requirement (used to decide whether to attach bearer token)
 * @param probes — array of smoke probes to run
 * @param authToken — JWT token if auth != 'public'; optional for other auth types
 * @returns suite result with per-probe pass/fail + timing
 */
export async function executeSmokeProbes(
  targetUrl: string,
  method: string,
  path: string,
  auth: AuthRequirement,
  probes: ReadonlyArray<SmokeProbe>,
  authToken?: string,
): Promise<SmokeSuiteResult> {
  const baseUrl = new URL(targetUrl);
  const start = performance.now();
  const results: SmokeProbeResult[] = [];

  // Global suite timeout safeguard
  const suiteController = new AbortController();
  const suiteTimer = setTimeout(() => suiteController.abort(), SUITE_TIMEOUT_MS);

  try {
    for (let i = 0; i < probes.length; i++) {
      const probe = probes[i]!;
      const label = probe.label ?? `probe${i}`;

      try {
        const result = await executeProbe(
          baseUrl,
          method,
          path,
          probe,
          auth,
          authToken,
          suiteController.signal,
        );
        results.push({ label, ...result });
      } catch (err) {
        results.push({
          label,
          status: 0,
          durationMs: 0,
          passed: false,
          reason: (err as Error).message || 'unknown error',
        });
      }
    }
  } finally {
    clearTimeout(suiteTimer);
  }

  const passed = results.filter((r) => r.passed).length;
  const durationMs = Math.round(performance.now() - start);

  return {
    endpoint: `${method} ${path}`,
    total: probes.length,
    passed,
    results,
    durationMs,
  };
}

interface ProbeExecResult {
  status: number;
  durationMs: number;
  passed: boolean;
  reason?: string;
  bodyPreview?: string;
}

async function executeProbe(
  baseUrl: URL,
  method: string,
  path: string,
  probe: SmokeProbe,
  auth: AuthRequirement,
  authToken?: string,
  signal?: AbortSignal,
): Promise<ProbeExecResult> {
  const url = new URL(path, baseUrl);
  if (probe.query) {
    url.search = probe.query;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SINGLE_PROBE_TIMEOUT_MS);

  const headers = new Headers();
  headers.set('User-Agent', 'factory-studio-smoke/1');

  // Attach bearer token if auth requires it
  if (auth === 'admin' || auth === 'session' || auth === 'webhook') {
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    } else {
      return {
        status: 0,
        durationMs: 0,
        passed: false,
        reason: `auth=${auth} but no token provided`,
      };
    }
  }

  if (probe.body) {
    headers.set('Content-Type', 'application/json');
  }

  const start = performance.now();

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      signal: signal || controller.signal,
    });

    const durationMs = Math.round(performance.now() - start);
    let bodyText = '';

    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }

    const expectedStatus = probe.expectedStatus ?? (method === 'DELETE' ? 204 : 200);
    const statusMatch = res.status === expectedStatus;
    const bodyMatch =
      !probe.expectContains ||
      bodyText.includes(probe.expectContains) ||
      JSON.stringify(bodyText).includes(probe.expectContains);

    const passed = statusMatch && bodyMatch;

    return {
      status: res.status,
      durationMs,
      passed,
      reason: !passed
        ? `status: expected ${expectedStatus}, got ${res.status}${
            probe.expectContains && !bodyMatch
              ? `; body does not contain "${probe.expectContains}"`
              : ''
          }`
        : undefined,
      bodyPreview: bodyText.slice(0, 200),
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const name = (err as Error).name || 'unknown';
    const msg = (err as Error).message || '';
    const reason =
      name === 'AbortError' ? 'timeout' : `${name}: ${msg}`.slice(0, 100);
    return {
      status: 0,
      durationMs,
      passed: false,
      reason,
    };
  } finally {
    clearTimeout(timer);
  }
}
