#!/usr/bin/env node
// secret-contract-preflight.mjs — Phase 1 report-only secret contract preflight
//
// Reads docs/service-registry.yml to discover registered workers and Pages apps,
// detects which of them are touched by the current PR's changed files, then
// posts (or updates) an idempotent comment on the PR listing the expected secret
// contracts for every touched service.
//
// Never exits non-zero — this is a report-only tool.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const { GH_TOKEN, REPO, PR_NUMBER } = process.env;
const prNum = parseInt(PR_NUMBER, 10);

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function gh(method, apiPath, body) {
  const url = apiPath.startsWith('http') ? apiPath : `https://api.github.com${apiPath}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GH ${method} ${apiPath} → ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

// ─── Minimal service-registry.yml parser ─────────────────────────────────────
// Parses only the fields needed: id, repo, required_secrets, optional_secrets.
// No external YAML library — avoids npm install in the workflow.

/** Escapes a string for safe use inside a RegExp constructor. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts a YAML list value from a block of text.
 * Matches:  <key>:\n    - item1\n    - item2\n
 */
function extractListItems(block, key) {
  const re = new RegExp(`\\b${escapeRegExp(key)}:\\s*\\n((?:[ \\t]+-[ \\t]+\\S+[ \\t]*\\n?)+)`);
  const match = re.exec(block);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(l => l.match(/^\s+-\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
}

/** Extracts a scalar value from a block: `<key>: <value>` */
function extractScalar(block, key) {
  const match = block.match(new RegExp(`\\b${escapeRegExp(key)}:\\s+(.+)`));
  return match?.[1]?.trim() ?? null;
}

/**
 * Parses docs/service-registry.yml and returns an array of service entries:
 *   { id, kind ('worker'|'pages'), repo, required, optional }
 */
function parseRegistry() {
  const regPath = path.resolve('docs/service-registry.yml');
  const content = readFileSync(regPath, 'utf8');

  const entries = [];

  // Split the file into workers section (before `pages:`) and pages section.
  const [rawWorkers = '', rawPages = ''] = content.split(/^pages:/m);

  function parseSection(block, kind) {
    // Each list entry starts with `  - id:` (2-space indent).
    const parts = block.split(/^  - id:/m).slice(1);
    for (const part of parts) {
      const lines = part.split('\n');
      const id = lines[0].trim();
      if (!id) continue;

      const required = extractListItems(part, 'required_secrets');
      const optional = extractListItems(part, 'optional_secrets');
      const repo = extractScalar(part, 'repo');

      entries.push({ id, kind, repo, required, optional });
    }
  }

  parseSection(rawWorkers, 'worker');
  parseSection(rawPages, 'pages');

  return entries;
}

// ─── Touch detection ──────────────────────────────────────────────────────────
// Maps changed file paths to registered service entries.

// Known environment suffixes for multi-environment workers (e.g. admin-studio-staging).
// Only these suffixes trigger the prefix-match logic so that unrelated apps whose
// names happen to share a prefix (e.g. admin-studio-ui) are not falsely included.
const ENV_SUFFIXES = new Set(['staging', 'production', 'prod', 'dev', 'preview', 'canary']);

/**
 * Returns true when `id` is an environment variant of `appDir`.
 * Examples:
 *   isEnvVariant('admin-studio-staging', 'admin-studio')   → true
 *   isEnvVariant('admin-studio-production', 'admin-studio') → true
 *   isEnvVariant('admin-studio-ui', 'admin-studio')         → false
 *   isEnvVariant('schedule-worker', 'schedule-worker')      → true
 */
function isEnvVariant(id, appDir) {
  if (id === appDir) return true;
  if (!id.startsWith(`${appDir}-`)) return false;
  const suffix = id.slice(appDir.length + 1);
  return ENV_SUFFIXES.has(suffix);
}

/**
 * Returns the subset of `entries` that are touched by the given changed files.
 * A service is "touched" when:
 *   - A file under `apps/<id>/` matches the entry id (or an env variant of it).
 *   - A workflow file `.github/workflows/*.yml` whose name contains the entry id
 *     (or its base name, stripping `-staging`/`-production` suffixes).
 */
function detectTouched(changedFiles, entries) {
  const touched = new Map(); // id → entry (Map preserves insertion order, dedupes)

  for (const file of changedFiles) {
    // ── apps/<dir>/** ──────────────────────────────────────────────────────
    const appDirMatch = file.match(/^apps\/([^/]+)\//);
    if (appDirMatch) {
      const appDir = appDirMatch[1];
      for (const entry of entries) {
        // Exact match: apps/schedule-worker → id:schedule-worker
        // Env-variant match: apps/admin-studio → id:admin-studio-staging AND id:admin-studio-production
        // Excluded: apps/admin-studio does NOT match id:admin-studio-ui
        if (isEnvVariant(entry.id, appDir)) {
          touched.set(entry.id, entry);
        }
      }
    }

    // ── .github/workflows/<name>.yml ──────────────────────────────────────
    const wfMatch = file.match(/^\.github\/workflows\/([^/]+)\.yml$/);
    if (wfMatch) {
      const wfName = wfMatch[1];
      for (const entry of entries) {
        // Strip environment suffixes so deploy-admin-studio.yml matches
        // both admin-studio-staging and admin-studio-production.
        const idBase = entry.id.replace(/-(staging|production)$/, '');
        if (wfName.includes(entry.id) || wfName.includes(idBase)) {
          touched.set(entry.id, entry);
        }
      }
    }
  }

  return [...touched.values()];
}

// ─── Comment body ─────────────────────────────────────────────────────────────

// HTML comment marker used to find and update the preflight comment on re-runs.
const MARKER = '<!-- secret-contract-preflight-v1 -->';

/**
 * Builds the markdown comment body.
 * Returns `null` when no services were detected (caller skips posting).
 */
function buildComment(touchedEntries, changedFiles) {
  if (touchedEntries.length === 0) return null;

  const lines = [MARKER];
  lines.push('## 🔐 Secret Contract Preflight');
  lines.push('');
  lines.push(
    '> **Phase 1 — report only.** The following apps/workflows are touched by this PR.' +
    ' Their expected secret contracts are listed below. No action is required to merge.',
  );
  lines.push('');

  for (const entry of touchedEntries) {
    const kindLabel = entry.kind === 'worker' ? 'Cloudflare Worker' : 'Cloudflare Pages';
    lines.push(`### \`${entry.id}\` (${kindLabel})`);
    lines.push('');

    if (entry.repo) {
      lines.push(`**Repo:** \`${entry.repo}\``);
      lines.push('');
    }

    if (entry.required.length === 0 && entry.optional.length === 0) {
      lines.push('_No secrets declared in `docs/service-registry.yml` for this entry._');
    } else {
      lines.push('| Secret | Status |');
      lines.push('|--------|--------|');
      for (const s of entry.required) {
        lines.push(`| \`${s}\` | ✅ required |`);
      }
      for (const s of entry.optional) {
        lines.push(`| \`${s}\` | ⚠️ optional |`);
      }
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    `<sub>🔐 Secret Contract Preflight · Phase 1 report-only · ` +
    `${changedFiles.length} changed file(s) checked · ` +
    `source of truth: <code>docs/service-registry.yml</code></sub>`,
  );

  return lines.join('\n');
}

// ─── Idempotent comment upsert ───────────────────────────────────────────────

/**
 * Creates a new comment or updates the existing preflight comment on the PR.
 * Existing comment is identified by the MARKER string in its body.
 */
async function upsertComment(owner, repoName, body) {
  // Scan existing comments for the marker (handles pagination).
  let existingId = null;
  let page = 1;
  while (!existingId) {
    const comments = await gh(
      'GET',
      `/repos/${owner}/${repoName}/issues/${prNum}/comments?per_page=100&page=${page}`,
    );
    if (!comments?.length) break;
    const found = comments.find(c => typeof c.body === 'string' && c.body.includes(MARKER));
    if (found) {
      existingId = found.id;
      break;
    }
    if (comments.length < 100) break;
    page++;
  }

  if (existingId) {
    await gh('PATCH', `/repos/${owner}/${repoName}/issues/comments/${existingId}`, { body });
    console.log(`[OK] Updated existing preflight comment #${existingId}`);
  } else {
    await gh('POST', `/repos/${owner}/${repoName}/issues/${prNum}/comments`, { body });
    console.log('[OK] Posted new secret-contract-preflight comment');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!GH_TOKEN || !REPO || !PR_NUMBER || isNaN(prNum)) {
    console.error('[ERROR] GH_TOKEN, REPO, and PR_NUMBER must be set');
    // Exit 0 — report-only: never block the PR
    return;
  }

  const [owner, repoName] = REPO.split('/');

  // 1. Fetch PR changed files (up to 100; sufficient for most PRs).
  let changedFiles = [];
  try {
    const files = await gh('GET', `/repos/${owner}/${repoName}/pulls/${prNum}/files?per_page=100`);
    changedFiles = (files ?? []).map(f => f.filename);
    console.log(`[INFO] PR #${prNum}: ${changedFiles.length} changed file(s)`);
    if (changedFiles.length === 100) {
      console.warn('[WARN] PR has 100+ changed files — additional files beyond the first 100 are not checked');
    }
  } catch (err) {
    console.warn(`[WARN] Could not fetch PR files: ${err.message} — skipping preflight`);
    return;
  }

  // 2. Parse service registry.
  let entries;
  try {
    entries = parseRegistry();
    console.log(`[INFO] Parsed ${entries.length} service entries from docs/service-registry.yml`);
  } catch (err) {
    console.warn(`[WARN] Could not parse docs/service-registry.yml: ${err.message} — skipping preflight`);
    return;
  }

  // 3. Detect which services are touched.
  const touched = detectTouched(changedFiles, entries);
  if (touched.length === 0) {
    console.log('[INFO] No registered services detected in changed files — no comment needed');
    return;
  }
  console.log(`[INFO] Touched services: ${touched.map(e => e.id).join(', ')}`);

  // 4. Build comment.
  const commentBody = buildComment(touched, changedFiles);
  if (!commentBody) {
    console.log('[INFO] Comment body is empty — skipping');
    return;
  }

  // 5. Post or update comment.
  try {
    await upsertComment(owner, repoName, commentBody);
  } catch (err) {
    console.warn(`[WARN] Could not post preflight comment: ${err.message}`);
    // Still exit 0 — never block the PR.
  }
}

main().catch(err => {
  // Catch-all — always exit 0 (report-only).
  console.warn(`[WARN] Unexpected error in secret-contract-preflight: ${err.message}`);
});
