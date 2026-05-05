#!/usr/bin/env node
// auto-triage.mjs — classify and label new GitHub issues
// Runs in factory AND can be curl'd by cross-repo workflows (factory is public)

const ORG = 'Latimer-Woods-Tech';
const {
  GH_TOKEN, ANTHROPIC_API_KEY,
  ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY = '', REPO,
} = process.env;

const repo = REPO.split('/')[1];
const num = parseInt(ISSUE_NUMBER, 10);
const title = ISSUE_TITLE || '';
const body = ISSUE_BODY;
const text = `${title} ${body}`.toLowerCase();

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
    throw new Error(`GH ${method} ${path} → ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

// ─── Author trust classification ──────────────────────────────────────────
// Only CODEOWNERs and verified bot accounts (name ending in [bot]) may
// self-approve issues for supervisor pickup. Unknown external authors are
// quarantined so a CODEOWNER can triage before automation acts on them.
const TRUSTED_HUMAN_LOGINS = new Set(['adrper79-dot']);

function classifyAuthor(login = '') {
  if (TRUSTED_HUMAN_LOGINS.has(login)) return 'codeowner';
  if (login.endsWith('[bot]')) return 'bot';
  return 'external';
}

// ─── Deterministic classification ──────────────────────────────────────────
function deterministicLabels() {
  const out = [];
  // Type
  if (/^(fix|bug)|(error|crash|broken|regression|not working|failing)/.test(text)) {
    out.push('bug');
  } else if (/^(feat|feature|add|implement|support|create|build)/.test(text)) {
    out.push('enhancement');
  } else if (/^(doc|readme|changelog|naming|convention)|documentation/.test(text)) {
    out.push('documentation');
  } else if (/^(dep|bump|renovate|dependabot|upgrade)/.test(text)) {
    out.push('dependencies');
  } else if (/^(chore|ci|test|refactor|perf|build|hardening|infra)/.test(text)) {
    out.push('hardening');
  }
  // Priority
  if (/p0|critical|hotfix|production down|outage/.test(text)) out.push('priority:P0');
  else if (/p1|high.priority|blocking/.test(text)) out.push('priority:P1');
  else if (/p3|nice.to.have|low.priority|someday/.test(text)) out.push('priority:P3');
  else out.push('priority:P2');
  // Domain
  if (/(llm|anthropic|openai|claude|gpt|gemini|ai.model|inference)/.test(text)) out.push('llm');
  if (/(sentry|error.*track|exception.*track)/.test(text)) out.push('source:sentry');
  return out;
}

// ─── Anthropic fallback ───────────────────────────────────────────────────
async function aiTypeLabel() {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: `Classify this GitHub issue. Reply with exactly ONE word from: bug, enhancement, documentation, dependencies, hardening, question.\n\nTitle: "${title}"\nBody (first 300 chars): "${body.slice(0, 300)}"`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const label = data.content?.[0]?.text?.trim().toLowerCase().split('\n')[0];
    const valid = ['bug', 'enhancement', 'documentation', 'dependencies', 'hardening', 'question'];
    return valid.includes(label) ? label : null;
  } catch { return null; }
}

// ─── Main ─────────────────────────────────────────────────────────────────
const [existingResp, currentIssue] = await Promise.all([
  gh('GET', `/repos/${ORG}/${repo}/labels?per_page=100`),
  gh('GET', `/repos/${ORG}/${repo}/issues/${num}`),
]);

const existingSet = new Set(existingResp.map(l => l.name));
const alreadyLabeled = (currentIssue.labels || []).map(l => l.name);

if (alreadyLabeled.includes('supervisor:approved-source')) {
  console.log(`${repo}#${num} already has supervisor:approved-source, skipping`);
  process.exit(0);
}

const authorClass = classifyAuthor(currentIssue.user?.login ?? '');
console.log(`[triage] author=${currentIssue.user?.login} class=${authorClass}`);

const proposed = deterministicLabels();

// Trust-gated labels: only CODEOWNERs/bots get supervisor pickup.
// External contributors get quarantine so a CODEOWNER can triage first.
if (authorClass === 'codeowner') {
  proposed.push('source:human', 'supervisor:approved-source');
} else if (authorClass === 'bot') {
  proposed.push('supervisor:approved-source');
} else {
  proposed.push('quarantine');
}
const typeLabels = ['bug', 'enhancement', 'documentation', 'dependencies', 'hardening', 'question'];
const hasType = proposed.some(l => typeLabels.includes(l));

if (!hasType) {
  const ai = await aiTypeLabel();
  if (ai) {
    proposed.push(ai);
    console.log(`AI classified as: ${ai}`);
  } else {
    proposed.push('question');
  }
}

// Only apply labels that exist in this repo
const toApply = proposed.filter(l => existingSet.has(l));

if (toApply.length === 0) {
  console.log('No applicable labels found for this repo');
  process.exit(0);
}

await gh('POST', `/repos/${ORG}/${repo}/issues/${num}/labels`, { labels: toApply });
console.log(`✓ ${repo}#${num} labeled: [${toApply.join(', ')}]`);
