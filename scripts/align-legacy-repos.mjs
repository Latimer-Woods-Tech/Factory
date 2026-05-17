#!/usr/bin/env node
/**
 * OPS-2.1 — Align legacy pre-Factory repos (coh, focusbro) and archive The_Calling.
 *
 * This script is intended to be run once via the align-legacy-repos.yml workflow,
 * and can be re-run safely — all operations are idempotent.
 *
 * Actions performed:
 *   1. Archives The_Calling (duplicate of the Factory-managed the-calling app)
 *   2. For coh and focusbro:
 *      - Sets a description
 *      - Enforces squash-only merge policy (disables rebase and merge commits)
 *      - Enables delete-branch-on-merge
 *      - Creates SECURITY.md if absent
 */

// NOTE: This script runs under Node.js in GitHub Actions, not Cloudflare Workers.
// process.env is intentional here — it is not available in Worker runtime code.

const ORG = 'Latimer-Woods-Tech';
const API = 'https://api.github.com';

const GH_TOKEN = process.env.GH_TOKEN;
if (!GH_TOKEN) {
  console.error('ERROR: GH_TOKEN environment variable is required.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) {
  console.log('⚠️  DRY RUN — no mutations will be made.\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ghFetch(path, options = {}) {
  const url = path.startsWith('https://') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  return res;
}

async function getRepo(repo) {
  const res = await ghFetch(`/repos/${ORG}/${repo}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET /repos/${ORG}/${repo} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function patchRepo(repo, payload) {
  if (DRY_RUN) {
    console.log(`  [dry-run] PATCH /repos/${ORG}/${repo}`, JSON.stringify(payload));
    return;
  }
  const res = await ghFetch(`/repos/${ORG}/${repo}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH /repos/${ORG}/${repo} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function getFileContents(repo, filePath) {
  const res = await ghFetch(`/repos/${ORG}/${repo}/contents/${filePath}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET /repos/${ORG}/${repo}/contents/${filePath} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function putFile(repo, filePath, message, content, sha) {
  const payload = {
    message,
    content: Buffer.from(content).toString('base64'),
    ...(sha ? { sha } : {}),
  };
  if (DRY_RUN) {
    const action = sha ? 'update' : 'create';
    console.log(`  [dry-run] PUT /repos/${ORG}/${repo}/contents/${filePath} (${action})`);
    return;
  }
  const res = await ghFetch(`/repos/${ORG}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT /repos/${ORG}/${repo}/contents/${filePath} → ${res.status}: ${body}`);
  }
  return res.json();
}

// ── SECURITY.md content ───────────────────────────────────────────────────────

function securityMdContent(repoName) {
  return `# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to **security@latimer-woods-tech.com**.

Do not open a public GitHub issue for security vulnerabilities. We will acknowledge within 48 hours and provide a resolution timeline within 7 days.

## Scope

This repository is part of the [Factory](https://github.com/Latimer-Woods-Tech/factory) shared infrastructure platform.

## Disclosure Policy

We follow coordinated disclosure. Please give us reasonable time to address vulnerabilities before public disclosure.
`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function archiveRepo(repo) {
  console.log(`\n📦 Archiving ${ORG}/${repo} ...`);
  const info = await getRepo(repo);
  if (info.archived) {
    console.log(`  ✅ Already archived — skipping.`);
    return;
  }
  await patchRepo(repo, { archived: true });
  console.log(`  ✅ Archived.`);
}

async function alignRepo(repo, description) {
  console.log(`\n🔧 Aligning ${ORG}/${repo} ...`);

  const info = await getRepo(repo);

  if (info.archived) {
    console.log(`  ⚠️  Repo is archived — skipping alignment.`);
    return;
  }

  // 1. Repository settings
  const settingsPayload = {};
  let settingsNeeded = false;

  if (!info.description || info.description !== description) {
    settingsPayload.description = description;
    settingsNeeded = true;
    console.log(`  • description: "${info.description || '(empty)'}" → "${description}"`);
  } else {
    console.log(`  ✓ description already set`);
  }

  if (info.allow_rebase_merge !== false) {
    settingsPayload.allow_rebase_merge = false;
    settingsNeeded = true;
    console.log(`  • allow_rebase_merge: true → false`);
  } else {
    console.log(`  ✓ allow_rebase_merge already false`);
  }

  if (info.allow_merge_commit !== false) {
    settingsPayload.allow_merge_commit = false;
    settingsNeeded = true;
    console.log(`  • allow_merge_commit: true → false`);
  } else {
    console.log(`  ✓ allow_merge_commit already false`);
  }

  if (info.allow_squash_merge !== true) {
    settingsPayload.allow_squash_merge = true;
    settingsNeeded = true;
    console.log(`  • allow_squash_merge: false → true`);
  } else {
    console.log(`  ✓ allow_squash_merge already true`);
  }

  if (info.delete_branch_on_merge !== true) {
    settingsPayload.delete_branch_on_merge = true;
    settingsNeeded = true;
    console.log(`  • delete_branch_on_merge: false → true`);
  } else {
    console.log(`  ✓ delete_branch_on_merge already true`);
  }

  if (settingsNeeded) {
    await patchRepo(repo, settingsPayload);
    console.log(`  ✅ Settings applied.`);
  } else {
    console.log(`  ✅ Settings already compliant — no PATCH needed.`);
  }

  // 2. SECURITY.md
  console.log(`  • Checking SECURITY.md ...`);
  const existing = await getFileContents(repo, 'SECURITY.md');
  if (!existing) {
    await putFile(
      repo,
      'SECURITY.md',
      'docs(security): add SECURITY.md per Factory policy [OPS-2.1]',
      securityMdContent(repo),
    );
    console.log(`  ✅ SECURITY.md created.`);
  } else {
    console.log(`  ✓ SECURITY.md already exists — skipping.`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const REPOS_TO_ALIGN = [
  {
    name: 'coh',
    description: 'Circle of Healers — legacy app (pre-Factory); aligned to Factory standards',
  },
  {
    name: 'focusbro',
    description: 'FocusBro — legacy app (pre-Factory); aligned to Factory standards',
  },
];

const REPOS_TO_ARCHIVE = ['The_Calling'];

console.log('=== OPS-2.1: Legacy repo alignment ===');
console.log(`Org: ${ORG}`);
console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'live'}`);

// Archive
for (const repo of REPOS_TO_ARCHIVE) {
  try {
    await archiveRepo(repo);
  } catch (err) {
    console.error(`  ❌ Failed to archive ${repo}: ${err.message}`);
    process.exitCode = 1;
  }
}

// Align
for (const { name, description } of REPOS_TO_ALIGN) {
  try {
    await alignRepo(name, description);
  } catch (err) {
    console.error(`  ❌ Failed to align ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n=== Done ===');
