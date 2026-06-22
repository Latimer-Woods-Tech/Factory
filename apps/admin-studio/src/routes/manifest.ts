/**
 * Phase E — Self-introspection manifest for admin-studio.
 *
 * Exposes the Worker's own public surface as a versioned JSON document.
 * Studio's catalog crawler (and any external monitor) calls this to keep
 * its function inventory in sync with deployed reality.
 *
 * Kept hand-maintained on purpose: Hono does not expose a stable runtime
  {
    method: 'POST',
    path: '/capabilities/preview',
    auth: 'admin',
    summary: 'Compile and render a governed capability concept into a plan preview',
    reversibility: 'reversible',
    tags: ['capabilities'],
  },
 * route iterator, and a curated list lets us attach owner/SLO/smoke
 * metadata that pure introspection would miss.
 */
import { Hono } from 'hono';
import {
  MANIFEST_VERSION,
  type FunctionManifest,
  type ManifestEntry,
} from '@latimer-woods-tech/studio-core';
import type { AppEnv } from '../types.js';

const manifest = new Hono<AppEnv>();

const ENTRIES: ReadonlyArray<ManifestEntry> = [
  // ── Public ────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/health',
    auth: 'public',
    summary: 'Liveness probe with deployed env',
    smoke: [{ expectedStatus: 200, expectContains: '"status":"ok"' }],
    slo: { p95Ms: 200, errorRate: 0.001 },
    tags: ['ops'],
  },
  {
    method: 'GET',
    path: '/manifest',
    auth: 'public',
    summary: 'This document — function manifest for catalog crawlers',
    smoke: [{ expectedStatus: 200, expectContains: '"manifestVersion"' }],
    tags: ['ops'],
  },
  {
    method: 'POST',
    path: '/auth/login',
    auth: 'public',
    summary: 'Email + password login → access token',
    reversibility: 'reversible',
    slo: { p95Ms: 600, errorRate: 0.01 },
    smoke: [
      {
        label: 'rejects bad creds',
        body: { email: 'invalid@example.com', password: 'wrong', env: 'production' },
        expectedStatus: 401,
      },
    ],
    tags: ['auth'],
  },
  // ── Webhooks (public, signed) ─────────────────────────────────────────
  {
    method: 'POST',
    path: '/webhooks/studio-tests',
    auth: 'webhook',
    summary: 'GitHub Actions test-run callback',
    reversibility: 'reversible',
    tags: ['webhooks', 'tests'],
  },
  // ── Authenticated: identity ───────────────────────────────────────────
  {
    method: 'GET',
    path: '/me',
    auth: 'session',
    summary: 'Resolve current session → user profile',
    slo: { p95Ms: 300, errorRate: 0.005 },
    tags: ['auth'],
  },
  // ── Authenticated: tests ──────────────────────────────────────────────
  {
    method: 'POST',
    path: '/tests/run',
    auth: 'admin',
    summary: 'Dispatch a test workflow run',
    reversibility: 'reversible',
    tags: ['tests'],
  },
  {
    method: 'GET',
    path: '/tests/runs/:id',
    auth: 'admin',
    summary: 'Live SSE stream of a test run',
    tags: ['tests', 'sse'],
  },
  // ── Authenticated: deploy ─────────────────────────────────────────────
  {
    method: 'POST',
    path: '/deploys',
    auth: 'admin',
    summary: 'Trigger a deploy workflow',
    reversibility: 'irreversible',
    tags: ['deploy'],
  },
  // ── Authenticated: AI ─────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/ai/chat',
    auth: 'admin',
    summary: 'Streaming Anthropic chat with Factory standing-orders system prompt',
    tags: ['ai', 'sse'],
  },
  {
    method: 'POST',
    path: '/ai/proposals',
    auth: 'admin',
    summary: 'Structured code-edit proposal {before, after, rationale}',
    tags: ['ai'],
  },
  {
    method: 'GET',
    path: '/capabilities',
    auth: 'admin',
    summary: 'List governed capability concepts from the compiled catalog',
    tags: ['capabilities'],
  },
  {
    method: 'POST',
    path: '/capabilities/resolve',
    auth: 'admin',
    summary: 'Resolve a capability concept into an approved recipe handoff',
    reversibility: 'reversible',
    tags: ['capabilities'],
  },
  {
    method: 'POST',
    path: '/capabilities/preview',
    auth: 'admin',
    summary: 'Compile and preview the plan for a resolved capability concept',
    reversibility: 'reversible',
    tags: ['capabilities'],
  },
  {
    method: 'POST',
    path: '/capabilities/handoff',
    auth: 'admin',
    summary: 'Generate the audited scaffold handoff artifact for a previewed capability concept',
    reversibility: 'reversible',
    tags: ['capabilities'],
  },
  {
    method: 'POST',
    path: '/capabilities/provision-staging',
    auth: 'admin',
    summary: 'Record a staging-provision request against a persisted handoff (Stage C — proof-gated, manual-rollback in audit log)',
    reversibility: 'irreversible',
    tags: ['capabilities'],
  },
  {
    method: 'GET',
    path: '/capabilities/handoffs',
    auth: 'admin',
    summary: 'List recent capability handoff packages (lineage view; supports conceptId/recipeId/limit filters)',
    tags: ['capabilities'],
  },
  {
    method: 'GET',
    path: '/capabilities/provision-requests',
    auth: 'admin',
    summary: 'List capability provision requests (lineage view; supports status/handoffId/limit filters)',
    tags: ['capabilities'],
  },
  {
    method: 'POST',
    path: '/capabilities/provision-requests/:id/transition',
    auth: 'admin',
    summary: 'Operator-confirmed lifecycle transition for a provision request (acknowledged/dispatched/succeeded/failed/withdrawn)',
    reversibility: 'irreversible',
    tags: ['capabilities'],
  },
  // ── Authenticated: audit ──────────────────────────────────────────────
  {
    method: 'GET',
    path: '/audit',
    auth: 'admin',
    summary: 'Paginated audit log',
    tags: ['ops'],
  },
  // ── Authenticated: apps registry ──────────────────────────────────────
  {
    method: 'GET',
    path: '/apps',
    auth: 'admin',
    summary: 'List registered Factory apps from service-registry.yml',
    tags: ['ops'],
  },
  // ── Authenticated: observability ──────────────────────────────────────
  {
    method: 'GET',
    path: '/observability/summary',
    auth: 'admin',
    summary: 'Aggregated Sentry + PostHog health snapshot',
    tags: ['ops'],
  },
  {
    method: 'GET',
    path: '/observability/synthetic/journey',
    auth: 'admin',
    summary: 'Synthetic journey probe results with pass/fail trend and outage classification',
    slo: { p95Ms: 500, errorRate: 0.01 },
    tags: ['ops', 'monitoring', 'synthetic'],
  },
  {
    method: 'GET',
    path: '/observability/sentry/issues',
    auth: 'admin',
    summary: 'Recent Sentry issues with triage-grade signal (count, users, culprit)',
    tags: ['ops', 'observability'],
  },
  {
    method: 'GET',
    path: '/observability/posthog/tiles',
    auth: 'admin',
    summary: 'PostHog metric tiles (events 24h, etc.)',
    tags: ['ops', 'observability'],
  },
  {
    method: 'GET',
    path: '/observability/telemetry-coverage',
    auth: 'admin',
    summary: 'Telemetry contract conformance matrix — which apps expose /api/admin/{health,metrics,events}',
    tags: ['ops', 'observability'],
  },
  // ── Authenticated: repo ───────────────────────────────────────────────
  {
    method: 'GET',
    path: '/repo/branches',
    auth: 'admin',
    summary: 'List repo branches',
    tags: ['repo'],
  },
  {
    method: 'GET',
    path: '/repo/tree',
    auth: 'admin',
    summary: 'Recursive tree at ref',
    tags: ['repo'],
  },
  {
    method: 'GET',
    path: '/repo/file',
    auth: 'admin',
    summary: 'Single file content (text or binary flag)',
    tags: ['repo'],
  },
  {
    method: 'POST',
    path: '/repo/branches',
    auth: 'admin',
    summary: 'Create a feature branch off main',
    reversibility: 'reversible',
    tags: ['repo'],
  },
  {
    method: 'POST',
    path: '/repo/commit',
    auth: 'admin',
    summary: 'Commit a single file (refuses protected branches)',
    reversibility: 'reversible',
    tags: ['repo'],
  },
  {
    method: 'POST',
    path: '/repo/pull-requests',
    auth: 'admin',
    summary: 'Open a PR (refuses protected head)',
    reversibility: 'reversible',
    tags: ['repo'],
  },
  // ── Authenticated: catalog (Phase E) ──────────────────────────────────
  {
    method: 'GET',
    path: '/catalog',
    auth: 'admin',
    summary: 'List all known apps and their function counts',
    tags: ['catalog'],
  },
  {
    method: 'GET',
    path: '/catalog/:app',
    auth: 'admin',
    summary: 'Fetch the cached manifest for an app',
    tags: ['catalog'],
  },
  {
    method: 'POST',
    path: '/catalog/:app/refresh',
    auth: 'admin',
    summary: 'Re-crawl an app\u2019s /manifest and upsert into function_catalog',
    reversibility: 'reversible',
    tags: ['catalog'],
  },
];

manifest.get('/', (c) => {
  const doc: FunctionManifest = {
    manifestVersion: MANIFEST_VERSION,
    app: 'admin-studio',
    env: c.env.STUDIO_ENV,
    buildSha: c.env.BUILD_SHA,
    generatedAt: new Date().toISOString(),
    entries: ENTRIES,
  };
  return c.json(doc, 200, {
    'Cache-Control': 'public, max-age=60',
  });
});

export default manifest;
