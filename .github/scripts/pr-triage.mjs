#!/usr/bin/env node
// pr-triage.mjs — apply author/path-based labels to a new PR.
//
// Replaces the inline node script that used to live in pr-triage.yml.
// Per per-job Copilot gate strategy (#540): we no longer skip the entire
// workflow for Bot senders; this script itself decides whether labels apply.

const {
  GH_TOKEN, PR_NUMBER, PR_AUTHOR, HEAD_REF, REPO,
} = process.env;

if (!GH_TOKEN || !PR_NUMBER || !PR_AUTHOR || !REPO) {
  throw new Error('GH_TOKEN, PR_NUMBER, PR_AUTHOR, REPO required');
}

const num = parseInt(PR_NUMBER, 10);

async function gh(method, path, data) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GH ${method} ${path} → ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

const labels = new Set();

// ── Author-based priority ─────────────────────────────────────────────────
// Per #540: Copilot PRs MUST receive triage labels. We classify by author
// here (per-job gate) instead of skipping the whole workflow for Bot senders.
const isCopilot = PR_AUTHOR === 'app/copilot-swe-agent' || PR_AUTHOR === 'copilot-swe-agent';
const isHumanCodeowner = PR_AUTHOR === 'adrper79-dot';
const isDependabot = PR_AUTHOR === 'dependabot[bot]' || PR_AUTHOR === 'renovate[bot]';
const isOtherBot = !isCopilot && !isDependabot && PR_AUTHOR.endsWith('[bot]');

if (isCopilot) {
  labels.add('priority:P2');
  labels.add('agent:claimed:copilot');
} else if (isHumanCodeowner) {
  labels.add('priority:P1');
  labels.add('agent:claimed:human');
  labels.add('source:human');
} else if (isDependabot) {
  labels.add('priority:P3');
  labels.add('dependencies');
} else if (isOtherBot) {
  // factory-cross-repo, github-actions, etc. — keep low priority but no agent claim.
  labels.add('priority:P3');
} else {
  labels.add('priority:P2');
  labels.add('agent:claimed:human');
  labels.add('source:human');
}

// ── Branch-name → app: label ──────────────────────────────────────────────
const branch = HEAD_REF || '';
const appMatch = branch.match(/\bapp[s]?\/([\w-]+)/);
if (appMatch && appMatch[1] === 'selfprime') labels.add('app:selfprime');
if (/selfprime/i.test(branch)) labels.add('app:selfprime');

// ── Changed-path → area: label ────────────────────────────────────────────
let files = [];
try {
  files = await gh('GET', `/repos/${REPO}/pulls/${num}/files?per_page=100`);
} catch (e) {
  console.warn(`Could not fetch PR files: ${e.message}`);
}
const paths = files.map(f => f.filename);
const hasCI = paths.some(p => p.startsWith('.github/'));
const hasPackages = paths.some(p => p.startsWith('packages/'));
const hasDocs = paths.some(p => p.startsWith('docs/'));
const hasTests = paths.some(p => p.startsWith('tests/'));

const hasAuth = paths.some(p =>
  /^packages\/auth\//.test(p) ||
  /\/auth\//.test(p) ||
  /auth\.(ts|js|mjs)$/.test(p) ||
  /jwt\.(ts|js|mjs)$/.test(p)
);
const hasMigrations = paths.some(p =>
  /^migrations\//.test(p) ||
  /\/migrations\//.test(p) ||
  /\.sql$/.test(p)
);
const isHighRisk = paths.some(p =>
  /^\.github\/workflows\//.test(p) ||
  /^\.github\/scripts\//.test(p) ||
  /^packages\//.test(p) ||
  /^migrations\//.test(p) ||
  /\/migrations\//.test(p) ||
  /wrangler\.(jsonc?|toml)$/.test(p) ||
  /^scripts\//.test(p) ||
  /handlers\/(billing|admin|stripe)/.test(p) ||
  /docs\/service-registry\.yml$/.test(p)
);

if (hasCI) labels.add('area:ci');
if (hasAuth) labels.add('area:auth');
if (hasMigrations) labels.add('area:migrations');

const onlyLockfiles = paths.length > 0 && paths.every(p =>
  /(^|\/)package(-lock)?\.json$/.test(p) ||
  /(^|\/)pnpm-lock\.yaml$/.test(p) ||
  /(^|\/)yarn\.lock$/.test(p) ||
  /(^|\/)\.npmrc$/.test(p)
);
if (isHighRisk && !(isDependabot && onlyLockfiles)) labels.add('risk:high');
if (hasDocs) labels.add('documentation');
if (!hasCI && !hasDocs && hasPackages) labels.add('engineering');
if (hasTests && !hasCI) labels.add('hardening');

console.log(`PR #${num} by ${PR_AUTHOR} (${branch}) → labels: ${[...labels].join(', ')}`);

if (labels.size === 0) {
  console.log('No labels to apply');
  process.exit(0);
}

await gh('POST', `/repos/${REPO}/issues/${num}/labels`, { labels: [...labels] });
console.log('Labels applied successfully.');
