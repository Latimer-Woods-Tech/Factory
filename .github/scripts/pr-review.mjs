#!/usr/bin/env node
// pr-review.mjs — Factory canonical architecture reviewer
// Detects CODEOWNERS tier, runs deterministic constraint checks, calls Claude
// for architectural reasoning, then posts a real GitHub Review (APPROVE or
// REQUEST_CHANGES) using the factory-cross-repo app token.
//
// Decision model:
//   Green tier + no violations  → APPROVE (no LLM call)
//   Yellow tier + no violations → APPROVE
//   Any tier + violations       → REQUEST_CHANGES
//   Red tier + no violations    → APPROVE with explicit red-tier notice
//   /admin mutations (any tier) → REQUEST_CHANGES (FRIDGE rule 4)

import { readFileSync } from 'node:fs';

const ORG = 'Latimer-Woods-Tech';
const REVIEW_BOT_LOGIN = 'factory-cross-repo[bot]';
const MAX_DIFF_CHARS = 28_000;

const {
  GH_TOKEN,
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL = 'claude-sonnet-4-20250514',
  GROK_API_KEY,
  GROK_MODEL = 'grok-3',
  PR_NUMBER,
  REPO,
  PR_SHA,
  // Max times the bot may post REQUEST_CHANGES before escalating to human.
  // Set MAX_REVIEW_ATTEMPTS in repo/org vars. Default: 3.
  MAX_REVIEW_ATTEMPTS = '3',
  // GitHub login to notify (request review from) on red-tier PRs and escalations.
  HUMAN_REVIEWER = 'adrper79-dot',
  // Telnyx SMS — all three required for SMS to fire; silently skipped if absent.
  TELNYX_API_KEY,
  TELNYX_FROM_NUMBER,
  NOTIFICATION_PHONE,
} = process.env;

const MAX_ATTEMPTS = parseInt(MAX_REVIEW_ATTEMPTS, 10);

// ─── SMS notification via Telnyx ─────────────────────────────────────────────
// Silently no-ops if TELNYX_API_KEY / TELNYX_FROM_NUMBER / NOTIFICATION_PHONE
// are not set — SMS is best-effort, never blocks the review pipeline.

async function sendSms(message) {
  if (!TELNYX_API_KEY || !TELNYX_FROM_NUMBER || !NOTIFICATION_PHONE) {
    console.log('[SMS] Skipped — TELNYX_API_KEY / TELNYX_FROM_NUMBER / NOTIFICATION_PHONE not configured');
    return;
  }
  try {
    const res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        from: TELNYX_FROM_NUMBER,
        to: NOTIFICATION_PHONE,
        text: message.slice(0, 160), // SMS hard limit
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn(`[SMS] Telnyx error ${res.status}: ${t.slice(0, 120)}`);
    } else {
      console.log('[SMS] Sent successfully');
    }
  } catch (err) {
    console.warn(`[SMS] Failed to send: ${err.message.slice(0, 80)}`);
  }
}

const repo = REPO?.split('/')[1] ?? REPO;
const prNum = parseInt(PR_NUMBER, 10);

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function gh(method, path, body, accept) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: accept ?? 'application/vnd.github+json',
        Authorization: `Bearer ${GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GH ${method} ${path} → ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.status === 204 ? null : res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Tier detection (mirrors CODEOWNERS trust tiers) ─────────────────────────

const RED_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.github\/scripts\//,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/settings\.yml$/,
  /^packages\//,
  /migrations\//,
  /wrangler\.(jsonc?|toml)$/,
  /handlers\/(billing|admin|stripe)/,
  /capabilities\.yml$/,
  /docs\/service-registry\.yml$/,
  /docs\/supervisor\/(plans|FRIDGE)/,
  /apps\/supervisor\//,
];

const GREEN_PATTERNS = [
  /^docs\//,
  /\.md$/,
  /^session\//,
  /^documents\//,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/PULL_REQUEST_TEMPLATE/,
];

const ADMIN_MUTATION_PATTERNS = [
  /handlers\/(billing|admin|stripe)/,
  /\/admin\//,
  /stripe/i,
];

function detectTier(filenames) {
  if (filenames.some(f => RED_PATTERNS.some(p => p.test(f)))) return 'red';
  if (filenames.every(f => GREEN_PATTERNS.some(p => p.test(f)))) return 'green';
  return 'yellow';
}

function hasAdminMutation(filenames) {
  return filenames.some(f => ADMIN_MUTATION_PATTERNS.some(p => p.test(f)));
}

// ─── Deterministic constraint checks (no LLM) ────────────────────────────────
// Run on added lines only — deletions removing violations are fine.

function extractAddedLines(files) {
  return files
    .map(f => (f.patch ?? '').split('\n').filter(l => l.startsWith('+')).join('\n'))
    .join('\n');
}

// Files that are NOT Cloudflare Workers runtime code.
// Workers runtime constraints (process.env, require, Buffer, Node built-ins)
// do NOT apply to these files — applying them causes false positives.
const NON_WORKER_PATH_PREFIXES = ['.github/', 'scripts/', 'docs/', 'tests/', 'migrations/'];
const NON_WORKER_EXTENSIONS = ['.md', '.yml', '.yaml', '.json', '.jsonc', '.toml', '.txt', '.gitignore'];

function isNonWorkerFile(filename) {
  if (NON_WORKER_PATH_PREFIXES.some(p => filename.startsWith(p))) return true;
  const ext = filename.slice(filename.lastIndexOf('.'));
  if (NON_WORKER_EXTENSIONS.includes(ext)) return true;
  // Config/dotfiles with no path prefix
  const basename = filename.split('/').pop() ?? filename;
  return /^(CODEOWNERS|\.gitignore|\.gitattributes|renovate\.json|package\.json|tsconfig\.json)$/.test(basename);
}

function isFrontendUiFile(filename) {
  return /^apps\/[^/]+-ui\//.test(filename) || filename.startsWith('apps/admin-studio-ui/');
}

function hasFetchCallInPatch(file) {
  const patch = file?.patch ?? '';
  if (!patch) return false;
  return /\bfetch\s*\(/.test(patch);
}

function runDeterministicChecks(workerAddedLines, allAddedLines, filenames) {
  // workerAddedLines — added content from non-Actions-runner files only
  //   (Workers runtime constraints apply here)
  // allAddedLines — all added content regardless of file path
  //   (universal checks: secrets, fetch, any type)
  const violations = [];
  const warnings = [];

  if (/\bprocess\.env\b/.test(workerAddedLines))
    violations.push({ constraint: 'No process.env', detail: 'Use c.env / env bindings instead of process.env' });

  if (/\brequire\s*\(/.test(workerAddedLines))
    violations.push({ constraint: 'No CommonJS require()', detail: 'ESM imports only — replace require() with import' });

  if (/\bnew Buffer\b|\bBuffer\.from\b|\bBuffer\.alloc\b/.test(workerAddedLines))
    violations.push({ constraint: 'No Buffer', detail: 'Use Uint8Array, TextEncoder, or TextDecoder instead of Buffer' });

  if (/from\s+['"](?:fs|path|crypto)['"]/m.test(workerAddedLines))
    violations.push({ constraint: 'No Node.js built-ins', detail: 'fs, path, crypto are not available in Workers — use platform-safe APIs' });

  if (/from\s+['"]node:/m.test(workerAddedLines))
    violations.push({ constraint: 'No node: imports', detail: 'node: protocol imports are not available in Cloudflare Workers' });

  if (/from\s+['"](?:express|fastify|next)['"]/m.test(workerAddedLines))
    violations.push({ constraint: 'No Express/Fastify/Next', detail: 'Use Hono for routing — no other HTTP frameworks' });

  if (/import\s+.*jsonwebtoken/m.test(workerAddedLines))
    violations.push({ constraint: 'No jsonwebtoken', detail: 'Use Web Crypto API for JWT — never the jsonwebtoken package' });

  // Secret in vars block (wrangler config) — check all lines
  if (filenames.some(f => /wrangler/.test(f)) &&
      /vars:\s*[\s\S]*?(?:KEY|SECRET|TOKEN|PASSWORD)\s*:/im.test(allAddedLines))
    violations.push({ constraint: 'No secrets in wrangler vars', detail: 'Use wrangler secret put — never put secrets in the vars block' });

  // Fetch without error handling — check all lines
  const rawFetchMatches = allAddedLines.match(/await\s+fetch\s*\(/g) ?? [];
  const handledFetchMatches = allAddedLines.match(/(?:\.ok|\.status|res\.ok|response\.ok)/g) ?? [];
  if (rawFetchMatches.length > handledFetchMatches.length)
    warnings.push({ detail: `${rawFetchMatches.length} fetch() call(s) detected — verify each checks .ok or .status before consuming the body` });

  // any in TypeScript (warning only) — check all lines
  const anyCount = (allAddedLines.match(/:\s*any\b/g) ?? []).length;
  if (anyCount > 0)
    warnings.push({ detail: `${anyCount} use(s) of \`any\` type — strict mode forbids any in public APIs` });

  return { violations, warnings };
}

// ─── Canonical constraint context (loaded live from repo docs) ───────────────
// Reads CLAUDE.md, FRIDGE.md, and the per-repo CLAUDE.md (if this is a
// cross-repo review) at runtime so the reviewer always sees current constraints
// rather than a stale hardcoded snapshot. Falls back to empty string per file
// if the file is missing — the REVIEW_SCHEMA instructions still guide the LLM.

function loadDoc(filePath, maxChars = 8000) {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.length > maxChars ? content.slice(0, maxChars) + '\n\n[... truncated]' : content;
  } catch {
    return null;
  }
}

// Tracks which docs were missing at load time so the review body can surface the gap.
const MISSING_DOCS = [];

function buildConstraintBlock(repoName) {
  const sections = [];

  const claudeMd = loadDoc('CLAUDE.md');
  if (claudeMd) {
    sections.push(`## CLAUDE.md — Factory Standing Orders\n\n${claudeMd}`);
  } else {
    MISSING_DOCS.push('CLAUDE.md');
    console.warn('[WARN] CLAUDE.md not found on disk');
  }

  const fridge = loadDoc('docs/supervisor/FRIDGE.md', 4000);
  if (fridge) {
    sections.push(`## FRIDGE.md — Non-Negotiable Operating Rules\n\n${fridge}`);
  } else {
    MISSING_DOCS.push('docs/supervisor/FRIDGE.md');
    console.warn('[WARN] docs/supervisor/FRIDGE.md not found on disk');
  }

  // Per-repo standing orders for cross-repo reviews (.github/repo-contexts/{repo}/CLAUDE.md)
  if (repoName && repoName !== 'factory') {
    const perRepo = loadDoc(`.github/repo-contexts/${repoName}/CLAUDE.md`, 4000);
    if (perRepo) {
      sections.push(`## ${repoName}/CLAUDE.md — Repo-Specific Standing Orders\n\n${perRepo}`);
    } else {
      MISSING_DOCS.push(`.github/repo-contexts/${repoName}/CLAUDE.md`);
      console.warn(`[WARN] No per-repo CLAUDE.md found at .github/repo-contexts/${repoName}/CLAUDE.md — review proceeds without repo-specific context`);
    }
  }

  if (sections.length === 0) {
    console.warn('[WARN] No canonical docs found on disk — falling back to minimal constraint set');
    return '## Factory Hard Constraints\nSee CLAUDE.md and docs/supervisor/FRIDGE.md for full constraints.';
  }

  return sections.join('\n\n---\n\n');
}

const CONSTRAINT_BLOCK = buildConstraintBlock(REPO?.split('/')[1]);

const REVIEW_SCHEMA = `\
## Your task
Review the PR diff below against the Factory constraints above.
The deterministic checks (process.env, Buffer, require, etc.) have already been run — do NOT re-check those.

IMPORTANT SCOPE RULE: Constraints apply only to Workers source code (apps/**, packages/**, src/**).
Files under .github/workflows/, .github/scripts/, and scripts/ run on GitHub Actions Ubuntu runners,
not inside Cloudflare Workers V8 isolates. apt-get, psql, bash, Node.js, and shell tools are
expected and correct in those files. Do NOT flag them as Workers violations.

## EXPLICITLY NOT YOUR JOB — do NOT flag these as violations
- The design of the PR review pipeline itself (trust tiers, bot review, 2-party consensus, CODEOWNERS structure).
  These are intentional governance choices made by the repository owners.
- CODEOWNERS file changes — the bot co-ownership assignments are deliberate and correct.
  The bot is listed as co-owner on ALL tiers (green, yellow, red); this is intentional and correct.
  EXCEPTION: Flag as CRITICAL if a CODEOWNERS change removes @adrper79-dot from any path — that removes the human safety anchor.
- Architectural patterns or system design decisions that are documented in CLAUDE.md, FRIDGE.md, or CODEOWNERS.
- Style preferences, naming conventions, or subjective code organization.
- GitHub Actions workflow changes (syntax, steps, shell commands) — these are not Workers code.
- The review pipeline flagging its own behavior or meta-commenting on the review system.

## DO flag these

### Factory constraints (in Workers source: apps/**, packages/**, src/**)
- Hard constraint violations not caught by deterministic checks
- Error handling missing on fetch/DB calls
- Type safety holes (unsafe casts, untyped generics)
- Package dependency order violations in packages/**
- FRIDGE rules 1, 2, 5, 7, 8, 9, 10 violated by the actual code changes

### Security — flag as architectural_concern (blocks merge)
- SQL injection: raw string interpolation into Drizzle queries or \`sql\` tagged templates with unescaped user input
- Auth bypass: JWT verification skipped, \`alg: none\` accepted, token fields trusted without signature check
- Credentials or PII logged to console or included in error responses sent to clients
- User-controlled input reflected in HTTP responses without sanitization (XSS)
- CORS configured with \`*\` on routes that accept cookies or Authorization headers
- Missing RLS enforcement on Neon queries that touch multi-tenant user data
- Secrets or API keys hardcoded in source (not caught by the wrangler-vars check)

### Correctness — flag as architectural_concern (blocks merge)
- Missing \`await\` on a Promise where the result or side-effect matters (silent data loss)
- Durable Object state mutated from outside the DO class (breaks actor isolation)
- Race condition: shared mutable state between concurrent requests in a Worker (Workers share nothing — flag globals that accumulate state across requests)
- DB mutations that must be atomic but lack a transaction (e.g., debit + credit, insert + update)
- Unhandled rejection: \`.catch()\` or \`try/catch\` absent on a top-level async call that can fail at runtime

### Reliability — flag as warning (non-blocking)
- External API call with no timeout (beyond the fetch \`.ok\` check — is there an AbortController?)
- Webhook or payment handler missing idempotency key (duplicate delivery = duplicate charge)
- Polling loop or retry without exponential backoff inside a Worker (CPU budget risk)
- Error message exposes internal stack trace or DB schema details to the HTTP client

### Cloudflare Workers specifics — flag as architectural_concern if severe, warning otherwise
- Synchronous CPU loop > ~5ms estimated wall time (Workers have a 10ms CPU subrequest limit in the free tier, 30ms paid — flag obvious offenders like sorting large arrays, heavy regex on large strings)
- Streaming response (\`TransformStream\`, SSE) that never closes on error path (leaks the connection)
- KV or R2 used for data that requires strong consistency (flag if the comment or logic implies read-your-writes guarantee)

### RED-TIER HARDCODED RULES — these override lgtm:true. Apply when the PR touches these paths.

#### GitHub Actions security (.github/workflows/**, .github/scripts/**)
These run with GITHUB_TOKEN repo access and can exfiltrate all secrets or rewrite code.
You are the ONLY gate — flag any of these as architectural_concern and set lgtm:false:
- CRITICAL: User-controlled data interpolated directly into a \`run:\` shell step — e.g., \`run: echo "\${{ github.event.pull_request.title }}"\` or any \`\${{ github.event.* }}\` / \`\${{ github.head_ref }}\` / \`\${{ inputs.* }}\` used directly in shell. Script injection. Fix is always \`env: { VAR: "\${{ ... }}" }\` then reference \`\$VAR\` in shell.
- CRITICAL: \`pull_request_target\` trigger combined with \`actions/checkout\` of the PR head SHA or branch — allows arbitrary code from a fork to execute with elevated token. Flag any workflow with \`on: pull_request_target\` that also checks out the PR head.
- CRITICAL: Third-party \`uses:\` action pinned to a mutable ref (tag like \`@v3\`, branch like \`@main\`) rather than a full commit SHA — tag can be moved to point to malicious code. Only exempt actions in the \`actions/*\`, \`github/*\`, or \`Latimer-Woods-Tech/*\` namespaces from this rule.
- CRITICAL: \`.github/CODEOWNERS\` change that removes \`@adrper79-dot\` from ANY path — eliminates the human safety anchor from the trust model.
- Warning: Secrets passed via \`with:\` to third-party actions — prefer passing via \`env:\` to limit surface.
- Warning: Job declares \`permissions: write-all\` or \`contents: write\` when triggered by an external event (pull_request, issues, etc.) — scope to least privilege.

#### Database migrations (migrations/**, workers/src/db/migrations/**)
Migrations are irreversible on production. You are the ONLY gate:
- CRITICAL: \`DROP TABLE\` or \`DROP COLUMN\` with no corresponding rollback/down migration in the same PR — data loss with no recovery path.
- CRITICAL: Adding a NOT NULL column without a DEFAULT value to a table that has existing rows — will crash the migration on any populated database.
- CRITICAL: RLS policy removed or disabled without an equivalent replacement in the same PR — exposes multi-tenant data immediately on deploy.
- Warning: \`CREATE INDEX\` without \`CONCURRENTLY\` on a table that is likely to have significant data (production tables) — takes an exclusive lock.

#### Billing and Stripe handlers (handlers/billing*, handlers/stripe*, apps/*/src/billing**)
Money errors are not recoverable. You are the ONLY gate:
- CRITICAL: Stripe PaymentIntent, charge, or Subscription creation missing an \`idempotencyKey\` — duplicate webhook delivery = duplicate charge to the customer.
- CRITICAL: Stripe webhook handler that does not call \`stripe.webhooks.constructEvent(body, sig, secret)\` before processing — forged webhook events can trigger charges or subscription changes.
- CRITICAL: Non-atomic read-then-write on billing state (e.g., read subscription status, then conditionally create a charge without a transaction or lock) — race condition = double charge.
- CRITICAL: \`sk_test_\` key used in a production code path, or \`sk_live_\` key referenced outside of a clearly production-gated path — mode mismatch causes real charges in test or missed charges in prod.

Output ONLY valid JSON — no markdown wrapper, no explanation outside the JSON:
{
  "architectural_concerns": [
    { "file": "path/to/file.ts", "line": 42, "detail": "description of concern" }
  ],
  "warnings": [
    { "file": "path/to/file.ts", "line": null, "detail": "description" }
  ],
  "summary": "2-4 sentence plain-English summary of what this PR does and what you found. Be specific about the files and patterns involved.",
  "lgtm": true
}

"lgtm": true means no architectural concerns were found (warnings are OK).
"lgtm": false means the PR has issues that should block merge.
Keep architectural_concerns to genuine problems — do not flag style preferences or CI runner commands.`;

// ─── Shared LLM payload builder ──────────────────────────────────────────────
// Both callClaude and callGrok require identical user-message content.
// Build it once and pass it to each caller to avoid drift between the two.

function buildLLMContent(prTitle, tier, files, deterministicWarnings) {
  const filesSummary = files.map(f => `  ${f.status ?? 'modified'}: ${f.filename}`).join('\n');
  const diffText = files
    .filter(f => f.patch)
    .map(f => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
    .join('\n\n');
  const truncated = diffText.length > MAX_DIFF_CHARS;
  const truncatedDiff = truncated
    ? diffText.slice(0, MAX_DIFF_CHARS) + '\n\n[... diff truncated at 28k chars — review remaining files manually]'
    : diffText;
  const deterministicNote = deterministicWarnings.length > 0
    ? `\nDeterministic warnings already flagged (do not re-check):\n${deterministicWarnings.map(w => `- ${w.detail}`).join('\n')}\n`
    : '';
  const userContent =
    `PR: "${prTitle}"\n` +
    `Tier: ${tier.toUpperCase()}\n` +
    `Files changed:\n${filesSummary}\n` +
    deterministicNote +
    `\n---\n${truncatedDiff}`;
  return { userContent, truncated };
}

function parseLLMJson(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  try {
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { architectural_concerns: [], warnings: [], summary: raw, lgtm: false };
  } catch {
    return { architectural_concerns: [], warnings: [], summary: raw, lgtm: false };
  }
}

// ─── LLM review — Claude (party 2) ───────────────────────────────────────────

async function callClaude(prTitle, tier, files, deterministicWarnings) {
  const { userContent } = buildLLMContent(prTitle, tier, files, deterministicWarnings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: [
          { type: 'text', text: CONSTRAINT_BLOCK, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: REVIEW_SCHEMA, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return parseLLMJson(data.content?.[0]?.text ?? '{}');
  } finally {
    clearTimeout(timer);
  }
}

// ─── LLM review — Grok (party 1, xAI OpenAI-compatible API) ──────────────────

async function callGrok(prTitle, tier, files, deterministicWarnings) {
  const { userContent } = buildLLMContent(prTitle, tier, files, deterministicWarnings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: `${CONSTRAINT_BLOCK}\n\n${REVIEW_SCHEMA}` },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return parseLLMJson(data.choices?.[0]?.message?.content ?? '{}');
  } finally {
    clearTimeout(timer);
  }
}

// ─── LLM orchestration (Grok first-pass → Claude confirmation) ───────────────
//
// 2-party consensus model (replaces single-LLM + fallback):
//   1. Grok reviews the diff first (party 1)
//   2. If Grok says lgtm=true → Claude reviews, receives Grok's reasoning as
//      additional context so it can challenge or confirm (party 2)
//   3. APPROVE only if BOTH say lgtm=true
//   4. If either rejects → REQUEST_CHANGES with both analyses in the body
//
// This reduces hallucinations: a single LLM cannot approve its own blind spot.
// Red-tier paths (workflows, packages, migrations, billing) are now fully gated
// by this 2-party system — Claude has hardcoded blocking rules for the genuine
// catastrophic failure classes (Actions injection, irreversible migrations,
// billing idempotency). Both parties must agree to APPROVE.

async function callLLMConsensus(prTitle, tier, files, deterministicWarnings) {
  if (!GROK_API_KEY && !ANTHROPIC_API_KEY) {
    throw new Error('No LLM API keys available — set GROK_API_KEY and ANTHROPIC_API_KEY');
  }

  // ── Party 1: Grok ──────────────────────────────────────────────────────────
  let grokResult = null;
  if (GROK_API_KEY) {
    console.log('[INFO] Party 1: Calling Grok for first-pass review...');
    try {
      grokResult = await callGrok(prTitle, tier, files, deterministicWarnings);
      console.log(`[INFO] Grok: lgtm=${grokResult.lgtm} | concerns=${grokResult.architectural_concerns?.length ?? 0}`);
    } catch (err) {
      console.warn(`[WARN] Grok failed (${err.message.slice(0, 80)}) — proceeding with Claude only`);
    }
  } else {
    console.warn('[WARN] GROK_API_KEY not set — 2-party consensus degraded to Claude-only');
  }

  // ── Party 2: Claude ────────────────────────────────────────────────────────
  // Always runs (even if Grok rejected) so we get Claude's independent view.
  // Grok's summary is injected as context so Claude can challenge it.
  let claudeResult = null;
  if (ANTHROPIC_API_KEY) {
    // Inject Grok's verdict into deterministic warnings so Claude sees it
    const warningsWithGrok = [
      ...deterministicWarnings,
      ...(grokResult
        ? [{
            detail: `Grok first-pass verdict — lgtm=${grokResult.lgtm}. ` +
              `Summary: ${grokResult.summary ?? 'none'}. ` +
              (grokResult.architectural_concerns?.length
                ? `Concerns: ${grokResult.architectural_concerns.map(c => c.detail).join('; ')}`
                : 'No concerns raised.'),
          }]
        : []),
    ];

    console.log('[INFO] Party 2: Calling Claude for confirmation review...');
    try {
      claudeResult = await callClaude(prTitle, tier, files, warningsWithGrok);
      console.log(`[INFO] Claude: lgtm=${claudeResult.lgtm} | concerns=${claudeResult.architectural_concerns?.length ?? 0}`);
    } catch (err) {
      console.warn(`[WARN] Claude failed (${err.message.slice(0, 80)})`);
    }
  } else {
    console.warn('[WARN] ANTHROPIC_API_KEY not set — 2-party consensus degraded to Grok-only');
  }

  // ── Consensus ──────────────────────────────────────────────────────────────
  // Both must agree to approve. If one is unavailable, the available one decides.
  // If BOTH parties fail (runtime errors), fail closed — never silently approve.
  if (!grokResult && !claudeResult) {
    throw new Error('Both LLM parties failed to respond — cannot post a review without consensus. Check GROK_API_KEY and ANTHROPIC_API_KEY.');
  }

  const grokLgtm   = grokResult   == null ? true : (grokResult.lgtm   ?? false);
  const claudeLgtm = claudeResult == null ? true : (claudeResult.lgtm ?? false);
  const consensusLgtm = grokLgtm && claudeLgtm;

  // Merge concerns and warnings from both parties
  const mergedConcerns = [
    ...(grokResult?.architectural_concerns  ?? []).map(c => ({ ...c, reviewer: 'Grok' })),
    ...(claudeResult?.architectural_concerns ?? []).map(c => ({ ...c, reviewer: 'Claude' })),
  ];
  const mergedWarnings = [
    ...(grokResult?.warnings  ?? []).map(w => ({ ...w, reviewer: 'Grok' })),
    ...(claudeResult?.warnings ?? []).map(w => ({ ...w, reviewer: 'Claude' })),
  ];

  const grokSummary   = grokResult?.summary  ? `**Grok:** ${grokResult.summary}`  : null;
  const claudeSummary = claudeResult?.summary ? `**Claude:** ${claudeResult.summary}` : null;
  const combinedSummary = [grokSummary, claudeSummary].filter(Boolean).join('\n\n');

  return {
    architectural_concerns: mergedConcerns,
    warnings: mergedWarnings,
    summary: combinedSummary || 'No LLM summary available.',
    lgtm: consensusLgtm,
    // Pass both raw results for the review body builder
    _grokResult: grokResult,
    _claudeResult: claudeResult,
  };
}

// ─── Build review body ────────────────────────────────────────────────────────

function tierEmoji(tier) {
  return { red: '🔴', yellow: '🟡', green: '🟢' }[tier] ?? '⚪';
}

function buildReviewBody({ tier, decision, deterministicResult, llmResult, prTitle, isAdminMutation, truncated }) {
  const lines = [];
  const emoji = tierEmoji(tier);
  const decisionLine = decision === 'APPROVE'
    ? '✅ **APPROVED** — no constraint violations found'
    : '🚫 **CHANGES REQUESTED** — constraint violations must be resolved before merge';

  lines.push(`## 🏭 Factory Canonical Review`);
  lines.push('');
  lines.push(`**Tier:** ${emoji} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`);
  lines.push(`**Decision:** ${decisionLine}`);
  lines.push(`**Reviewers:** 🤖 Grok (party 1) → 🤖 Claude (party 2) — both must approve`);
  lines.push('');

  if (MISSING_DOCS.length > 0) {
    lines.push(`> ⚠️ **Partial context** — the following canonical docs were not found at review time. The LLM reviewed with reduced context. Add these files and re-run to get a fully-informed review:`);
    for (const f of MISSING_DOCS) lines.push(`> - \`${f}\``);
    lines.push('');
  }

  // Violations
  const allViolations = [
    ...deterministicResult.violations,
    ...(llmResult?.architectural_concerns ?? []).map(c => ({ constraint: 'Architecture', detail: c.detail, file: c.file, line: c.line })),
  ];

  if (isAdminMutation) {
    lines.push('> ⚠️ **FRIDGE Rule 4:** This PR touches `/admin` mutation paths. Out-of-band CODEOWNER ✅ required even after this review approves.');
    lines.push('');
  }

  if (tier === 'red') {
    lines.push('> 🔴 **Red-tier PR.** High-risk paths (workflows, packages, migrations, wrangler, capabilities). The 2-party LLM review is the final gate — hardcoded rules enforce Actions injection safety, migration reversibility, and billing idempotency.');
    lines.push('');
  }

  if (allViolations.length > 0) {
    lines.push('### ❌ Violations (must fix before merge)');
    lines.push('');
    for (const v of allViolations) {
      const location = v.file ? ` · \`${v.file}${v.line ? `:${v.line}` : ''}\`` : '';
      lines.push(`- **${v.constraint}**${location}: ${v.detail}`);
    }
    lines.push('');
  }

  // Warnings
  const allWarnings = [
    ...deterministicResult.warnings,
    ...(llmResult?.warnings ?? []).map(w => ({ detail: w.detail, file: w.file })),
  ];

  if (allWarnings.length > 0) {
    lines.push('### ⚠️ Warnings (non-blocking)');
    lines.push('');
    for (const w of allWarnings) {
      const location = w.file ? ` · \`${w.file}\`` : '';
      lines.push(`- ${w.detail}${location}`);
    }
    lines.push('');
  }

  // Summary
  if (llmResult?.summary) {
    lines.push('### Summary');
    lines.push('');
    lines.push(llmResult.summary);
    lines.push('');
  }

  if (truncated) {
    lines.push('> ℹ️ Diff exceeded 28k chars — full diff was truncated. Large files may need manual spot-check.');
    lines.push('');
  }

  // Constraint checklist
  lines.push('<details><summary>Constraint checklist</summary>');
  lines.push('');
  lines.push('| Constraint | Status |');
  lines.push('|---|---|');
  const checks = [
    ['No process.env', deterministicResult.violations.some(v => v.constraint === 'No process.env')],
    ['No CommonJS require()', deterministicResult.violations.some(v => v.constraint === 'No CommonJS require()')],
    ['No Buffer', deterministicResult.violations.some(v => v.constraint === 'No Buffer')],
    ['No Node.js built-ins', deterministicResult.violations.some(v => v.constraint === 'No Node.js built-ins')],
    ['No Express/Fastify/Next', deterministicResult.violations.some(v => v.constraint === 'No Express/Fastify/Next')],
    ['No jsonwebtoken', deterministicResult.violations.some(v => v.constraint === 'No jsonwebtoken')],
    ['No secrets in wrangler vars', deterministicResult.violations.some(v => v.constraint === 'No secrets in wrangler vars')],
  ];
  for (const [name, violated] of checks) {
    lines.push(`| ${name} | ${violated ? '❌ FAIL' : '✅ Pass'} |`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push(`---`);
  lines.push(`_Factory Canonical Reviewer · [factory-cross-repo] · \`${PR_SHA?.slice(0, 7) ?? 'unknown'}\`_`);

  return lines.join('\n');
}

// ─── Escalation: limit hit ───────────────────────────────────────────────────
//
// Called when the bot has posted REQUEST_CHANGES MAX_ATTEMPTS times without the
// PR being fixed. Actions taken:
//   1. Add label `supervisor:review-limit-reached` to the PR
//   2. Request review from HUMAN_REVIEWER so GitHub sends an immediate notification
//   3. File a GitHub issue referencing the PR so it appears on the board
//   4. Post a COMMENT on the PR explaining what happened

async function escalateToHuman(prUrl, prTitle, attemptCount, concerns) {
  console.log(`[ESCALATE] Review limit reached (${attemptCount}/${MAX_ATTEMPTS}) — escalating to ${HUMAN_REVIEWER}`);

  // 1. Label the PR
  try {
    await gh('POST', `/repos/${ORG}/${repo}/issues/${prNum}/labels`, { labels: ['supervisor:review-limit-reached'] });
  } catch (err) {
    console.warn(`[WARN] Could not apply escalation label: ${err.message.slice(0, 80)}`);
  }

  // 2. Request human review
  try {
    await gh('POST', `/repos/${ORG}/${repo}/pulls/${prNum}/requested_reviewers`, { reviewers: [HUMAN_REVIEWER] });
    console.log(`[OK] Requested review from ${HUMAN_REVIEWER}`);
  } catch (err) {
    console.warn(`[WARN] Could not request review: ${err.message.slice(0, 80)}`);
  }

  // 3. File a tracking issue
  const issueBody = [
    `## 🚨 Review Limit Reached — Manual Intervention Required`,
    ``,
    `PR **[#${prNum}: ${prTitle}](${prUrl})** has been rejected by the 2-party LLM reviewer **${attemptCount} times** without a successful fix.`,
    ``,
    `### Unresolved concerns`,
    ...(concerns.length
      ? concerns.map(c => `- **${c.reviewer ?? 'Bot'}** · \`${c.file ?? '?'}\`: ${c.detail}`)
      : ['- No structured concerns recorded — check PR review thread for details']),
    ``,
    `### Action required`,
    `1. Open the PR: ${prUrl}`,
    `2. Read the review comments from \`factory-cross-repo[bot]\``,
    `3. Either approve the PR (if the bot is wrong) or close it and fix the underlying issue`,
    ``,
    `_Filed automatically by factory-cross-repo after ${attemptCount} failed review cycles._`,
  ].join('\n');

  try {
    const expectedTitle = `[supervisor] Review limit reached: PR #${prNum} — ${prTitle}`;
    // Dedup: skip filing if an open escalation issue for this PR already exists.
    let alreadyFiled = false;
    try {
      const existingIssues = await gh('GET', `/repos/${ORG}/${repo}/issues?state=open&labels=supervisor%3Areview-limit-reached&per_page=50`);
      alreadyFiled = existingIssues.some(i => i.title === expectedTitle);
    } catch (_) { /* non-fatal — proceed to file */ }

    if (alreadyFiled) {
      console.log(`[OK] Escalation issue for PR #${prNum} already open — skipping duplicate`);
    } else {
      const issue = await gh('POST', `/repos/${ORG}/${repo}/issues`, {
        title: expectedTitle,
        body: issueBody,
        labels: ['supervisor:review-limit-reached', 'status:blocked'],
        assignees: [HUMAN_REVIEWER],
      });
      console.log(`[OK] Filed escalation issue #${issue.number}`);
    }
  } catch (err) {
    console.warn(`[WARN] Could not file escalation issue: ${err.message.slice(0, 80)}`);
  }

  // 4. Comment on the PR
  const comment = [
    `## 🚨 Review Limit Reached`,
    ``,
    `This PR has been rejected by the Grok→Claude 2-party reviewer **${attemptCount} times** (limit: ${MAX_ATTEMPTS}).`,
    ``,
    `**@${HUMAN_REVIEWER}** — your review is now required. A tracking issue has been filed in this repository.`,
    ``,
    `_The automated fix loop is paused. Push a new commit to restart it, or close this PR._`,
  ].join('\n');

  try {
    await gh('POST', `/repos/${ORG}/${repo}/issues/${prNum}/comments`, { body: comment });
  } catch (err) {
    console.warn(`[WARN] Could not post escalation comment: ${err.message.slice(0, 80)}`);
  }

  // 5. SMS notification
  await sendSms(`[Factory] PR #${prNum} stuck after ${attemptCount} rejections. Review needed: ${prUrl}`);
}

// ─── Post GitHub review ───────────────────────────────────────────────────────

async function postReview(event, body) {
  // event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  try {
    await gh('POST', `/repos/${ORG}/${repo}/pulls/${prNum}/reviews`, { event, body });
    console.log(`[OK] Posted ${event} review on ${repo}#${prNum}`);
  } catch (err) {
    // Approval may fail if the app lacks pull_requests:write — fall back to comment
    if (event === 'APPROVE' && err.message.includes('403')) {
      console.warn('[WARN] App lacks pull_requests:write — posting COMMENT instead of APPROVE');
      console.warn('[ACTION REQUIRED] Grant the factory-cross-repo GitHub App "Pull requests: Read and write" permission');
      await gh('POST', `/repos/${ORG}/${repo}/pulls/${prNum}/reviews`, {
        event: 'COMMENT',
        body: body + '\n\n> ⚠️ **Setup required:** Grant `factory-cross-repo` app `Pull requests: Read and write` to enable auto-approve.',
      });
    } else {
      throw err;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[INFO] Reviewing ${repo}#${prNum} @ ${PR_SHA?.slice(0, 7)}`);

  // Fetch PR metadata
  const pr = await gh('GET', `/repos/${ORG}/${repo}/pulls/${prNum}`);

  // Don't review our own PRs (bot is the author)
  if (pr.user?.login === REVIEW_BOT_LOGIN) {
    console.log('[SKIP] PR authored by review bot — skipping self-review');
    return;
  }

  // Don't re-review if we already have an active (non-dismissed) review on this exact commit.
  // Dismissed reviews don't count — dismiss_stale_reviews_on_push invalidates old approvals
  // when new commits land, so the bot must re-approve on the new SHA.
  const existingReviews = await gh('GET', `/repos/${ORG}/${repo}/pulls/${prNum}/reviews`);
  const alreadyReviewed = existingReviews.some(
    r => r.user?.login === REVIEW_BOT_LOGIN &&
         r.commit_id === PR_SHA &&
         r.state !== 'DISMISSED',
  );
  if (alreadyReviewed) {
    console.log('[SKIP] Already reviewed this commit (active review exists)');
    return;
  }

  // ── Retry limit check ────────────────────────────────────────────────────────
  // Count prior REQUEST_CHANGES reviews by this bot across all commits.
  const priorRejections = existingReviews.filter(
    r => r.user?.login === REVIEW_BOT_LOGIN && r.state === 'CHANGES_REQUESTED',
  ).length;
  console.log(`[INFO] Prior rejections by bot: ${priorRejections}/${MAX_ATTEMPTS}`);

  if (priorRejections >= MAX_ATTEMPTS) {
    // Gather the last batch of concerns to surface in the escalation issue
    const lastReview = existingReviews
      .filter(r => r.user?.login === REVIEW_BOT_LOGIN && r.state === 'CHANGES_REQUESTED')
      .at(-1);
    // Parse concerns out of the review body (best-effort)
    const concernLines = (lastReview?.body ?? '')
      .split('\n')
      .filter(l => l.startsWith('- **'))
      .map(l => ({ detail: l.replace(/^- \*\*[^*]+\*\*[^:]*: /, ''), file: null, reviewer: 'Bot' }));
    await escalateToHuman(pr.html_url, pr.title, priorRejections, concernLines);
    return;
  }

  // Fetch changed files
  const files = await gh('GET', `/repos/${ORG}/${repo}/pulls/${prNum}/files`);
  const filenames = files.map(f => f.filename);

  const tier = detectTier(filenames);
  const adminMutation = hasAdminMutation(filenames);
  const totalDiffChars = files.reduce((n, f) => n + (f.patch?.length ?? 0), 0);
  const truncated = totalDiffChars > MAX_DIFF_CHARS;

  console.log(`[INFO] Tier: ${tier} | Files: ${filenames.length} | Diff: ${totalDiffChars} chars | Admin: ${adminMutation}`);

  // ── Red-tier: immediately request human review ────────────────────────────
  // This triggers a GitHub notification so @HUMAN_REVIEWER can act fast.
  // The review body will contain both LLM verdicts, so they need only one tap.
  if (tier === 'red' && HUMAN_REVIEWER) {
    try {
      // Requesting review sends a free GitHub notification (email + mobile push).
      // No SMS here — GitHub notification is sufficient for red-tier PRs since the
      // LLM verdicts will already be in the review body when you open it.
      await gh('POST', `/repos/${ORG}/${repo}/pulls/${prNum}/requested_reviewers`, { reviewers: [HUMAN_REVIEWER] });
      console.log(`[INFO] Red-tier PR — requested review from ${HUMAN_REVIEWER} (GitHub notification sent)`);
    } catch (err) {
      console.warn(`[WARN] Could not request red-tier review: ${err.message.slice(0, 80)}`);
    }
  }

  // Deterministic checks
  // workerAddedLines — only files that run in CF Workers (excludes Actions runner files)
  // allAddedLines — all files (for universal checks: secrets in wrangler, fetch handling, any type)
  const allAddedLines = extractAddedLines(files);
  const workerAddedLines = extractAddedLines(files.filter(f => !isNonWorkerFile(f.filename ?? '')));
  const deterministicResult = runDeterministicChecks(workerAddedLines, allAddedLines, filenames);

  console.log(`[INFO] Deterministic: ${deterministicResult.violations.length} violations, ${deterministicResult.warnings.length} warnings`);

  // Green tier with no violations → approve without LLM call
  let llmResult = null;
  if (tier === 'green' && deterministicResult.violations.length === 0 && !adminMutation) {
    console.log('[INFO] Green tier + no violations — skipping LLM call');
    llmResult = { architectural_concerns: [], warnings: [], summary: 'Green-tier change (docs/markdown only) — no architectural review required.', lgtm: true };
  } else {
    console.log('[INFO] Running 2-party LLM consensus (Grok → Claude)...');
    llmResult = await callLLMConsensus(pr.title, tier, files, deterministicResult.warnings);
    console.log(`[INFO] Consensus: lgtm=${llmResult.lgtm} | concerns=${llmResult.architectural_concerns?.length ?? 0}`);
  }

  // Filter out LLM concerns that reference non-Worker paths (.github/, scripts/, etc.)
  // LLMs sometimes flag Buffer/require/process.env in Actions runner scripts despite
  // explicit prompt instructions not to. This structural filter is the safety net.
  if (llmResult.architectural_concerns?.length) {
    const before = llmResult.architectural_concerns.length;
    const filesByName = new Map(files.map(f => [f.filename, f]));
    llmResult.architectural_concerns = llmResult.architectural_concerns.filter(c => {
      if (!c.file) return true;

      // Path-based false positives: CI runner/config/docs/non-worker files.
      if (NON_WORKER_PATH_PREFIXES.some(p => c.file.startsWith(p))) return false;

      // Frontend UI code is not Workers runtime code; Workers hard constraints
      // (like mandatory fetch handling semantics) should not block merge here.
      if (isFrontendUiFile(c.file)) return false;

      // Content-based false positive: concern claims missing fetch handling, but
      // the referenced patch has no fetch() calls at all.
      if (/fetch\(\) call without explicit error handling|fetch\(\) calls that need explicit error handling/i.test(c.detail ?? '')) {
        const file = filesByName.get(c.file);
        if (!hasFetchCallInPatch(file)) return false;
      }

      return true;
    });
    const filtered = before - llmResult.architectural_concerns.length;
    if (filtered > 0) {
      console.log(`[INFO] Filtered ${filtered} LLM concern(s) referencing non-Worker paths (false positives)`);
    }
  }

  // Determine decision
  const hasViolations = deterministicResult.violations.length > 0 ||
    (llmResult.architectural_concerns?.length ?? 0) > 0;

  let decision;
  if (adminMutation) {
    // FRIDGE rule 4 — admin mutations always need explicit CODEOWNER ✅ via branch protection.
    // The bot still posts its verdict (APPROVE when clean, REQUEST_CHANGES when not) so the
    // human sees the 2-party result before clicking. CODEOWNERS on billing/admin/stripe paths
    // is @adrper79-dot only — the bot APPROVE is advisory, not the merge gate.
    decision = hasViolations ? 'REQUEST_CHANGES' : 'APPROVE';
  } else if (hasViolations) {
    decision = 'REQUEST_CHANGES';
  } else {
    decision = 'APPROVE';
  }

  const body = buildReviewBody({
    tier,
    decision,
    deterministicResult,
    llmResult,
    prTitle: pr.title,
    isAdminMutation: adminMutation,
    truncated,
  });

  await postReview(decision, body);

  // Auto-label bot-branch PRs so auto-merge-approved-prs.yml can proceed.
  // Safe on red-tier: CODEOWNERS (@adrper79-dot only) still gates the actual merge.
  if (decision === 'APPROVE') {
    try {
      await gh('POST', `/repos/${ORG}/${repo}/issues/${prNum}/labels`, { labels: ['automerge:allow-bot-branch'] });
      console.log('[OK] Added automerge:allow-bot-branch label');
    } catch (err) {
      console.warn(`[WARN] Could not add automerge:allow-bot-branch: ${err.message.slice(0, 80)}`);
    }
  }

  console.log(`[DONE] ${repo}#${prNum} → ${decision}`);
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
