#!/usr/bin/env node
/**
 * council.mjs — Factory Council CLI
 *
 * Governance CLI for cross-cutting Factory inquiries. Manages the lifecycle of
 * council inquiries from creation through multi-voice LLM deliberation to a
 * recorded decision.
 *
 * Subcommands:
 *   create      --title <text> [--author <name>] [--owner <team>]
 *   deliberate  <inquiry-file> [--dry-run]
 *   approve     <inquiry-id> --summary <text> [--conditions <text>] [--next-actions <text>]
 *   defer       <inquiry-id> --reason <text>
 *   reject      <inquiry-id> --reason <text>
 *   validate
 *   stale
 *   list
 *
 * Run: node scripts/council.mjs <subcommand> [options]
 *
 * Environment:
 *   ANTHROPIC_API_KEY   — required for `deliberate`
 *   ANTHROPIC_MODEL     — optional override (default: claude-sonnet-4-20250514)
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const COUNCIL_DIR = join(ROOT, 'docs', 'council');
const INQUIRIES_DIR = join(COUNCIL_DIR, 'inquiries');
const INDEX_PATH = join(COUNCIL_DIR, 'INDEX.md');
const DECISIONS_PATH = join(COUNCIL_DIR, 'DECISIONS.md');

const {
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL = 'claude-sonnet-4-20250514',
} = process.env;

// ─── Required sections that every inquiry must contain ────────────────────
const REQUIRED_SECTIONS = [
  '## 1. Decision Needed',
  '## 2. Problem',
  '## 3. Recommended Path',
  '## 4. Alternatives Considered',
  '## 5. Impact',
  '## 6. Approval Criteria',
  '## 7. Risks and Mitigations',
  '## 8. Council Questions',
  '## 9. If Approved, Next Actions',
  '## 10. Outcome',
];

const VALID_STATUSES = new Set(['draft', 'review', 'approved', 'deferred', 'rejected', 'superseded']);

// ─── CLI entry point ──────────────────────────────────────────────────────

const [, , subcommand, ...rest] = process.argv;

switch (subcommand) {
  case 'create':     await cmdCreate(parseFlags(rest)); break;
  case 'deliberate': await cmdDeliberate(rest[0], parseFlags(rest.slice(1))); break;
  case 'approve':    await cmdClose(rest[0], parseFlags(rest.slice(1)), 'approved'); break;
  case 'defer':      await cmdClose(rest[0], parseFlags(rest.slice(1)), 'deferred'); break;
  case 'reject':     await cmdClose(rest[0], parseFlags(rest.slice(1)), 'rejected'); break;
  case 'validate':   await cmdValidate(); break;
  case 'stale':      await cmdStale(); break;
  case 'list':       await cmdList(parseFlags(rest)); break;
  default:
    printHelp();
    process.exit(subcommand ? 1 : 0);
}

// ─── Subcommands ──────────────────────────────────────────────────────────

async function cmdCreate(flags) {
  const title = flags['--title'];
  const author = flags['--author'] ?? 'GitHub Copilot';
  const owner = flags['--owner'] ?? '—';

  if (!title) {
    console.error('Error: --title is required');
    console.error('Usage: node scripts/council.mjs create --title "..." [--author "..."] [--owner "..."]');
    process.exit(1);
  }

  await mkdir(INQUIRIES_DIR, { recursive: true });

  const nextId = await nextInquiryId();
  const idStr = String(nextId).padStart(3, '0');
  const inquiryId = `C-${idStr}`;
  const slug = titleToSlug(title);
  const filename = `${idStr}-${slug}.md`;
  const filePath = join(INQUIRIES_DIR, filename);
  const today = isoDate();
  const dueDate = addDays(today, 7);

  const content = buildInquiryTemplate({ inquiryId, idStr, title, author, owner, today, dueDate, filename });
  await writeFile(filePath, content, 'utf8');

  await addToIndex({ id: inquiryId, title, status: 'draft', owner, lastUpdated: today, filename });

  console.log(`\nCouncil inquiry created:`);
  console.log(`  File:   docs/council/inquiries/${filename}`);
  console.log(`  ID:     ${inquiryId}`);
  console.log(`  Status: draft`);
  console.log(`\nNext steps:`);
  console.log(`  1. Fill in sections 1–3, 5–6, 8–9 in the inquiry file`);
  console.log(`  2. Run: node scripts/council.mjs deliberate docs/council/inquiries/${filename}`);
  console.log(`  3. Set status to 'review' and open a PR for council review`);
}

async function cmdDeliberate(filePath, flags) {
  if (!filePath) {
    console.error('Usage: node scripts/council.mjs deliberate <inquiry-file-path> [--dry-run] [--no-write]');
    process.exit(1);
  }
  const dryRun = '--dry-run' in flags;

  if (!dryRun && !ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is required for deliberation (omit with --dry-run)');
    process.exit(1);
  }
  // --no-write: run LLM calls and print the deliberation block to stdout, but do
  // not modify the inquiry file. Used by GitHub Actions to post results as a PR comment.
  const noWrite = '--no-write' in flags;
  const absPath = resolve(ROOT, filePath);

  if (!existsSync(absPath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exit(1);
  }

  const inquiry = await readFile(absPath, 'utf8');
  const inquiryId = extractMetaField(inquiry, 'Inquiry ID') ?? basename(filePath, '.md');

  console.log(`\nDeliberating: ${inquiryId} — ${basename(absPath)}`);
  console.log('Running four council voices...\n');

  const voices = buildVoices();
  const opinions = [];

  for (const voice of voices) {
    process.stdout.write(`  ${voice.name.padEnd(35)} `);
    if (dryRun) {
      console.log('[dry-run skipped]');
      opinions.push({ voice: voice.name, position: 'dry-run', reasoning: 'Dry run — no LLM call made.', alternativesSuggested: [], keyRisks: [] });
      continue;
    }
    try {
      const userMessage = buildVoiceUserMessage(inquiry);
      const raw = await callAnthropic(voice.system, userMessage, 1000);
      const parsed = safeParseJSON(raw, { position: 'error', reasoning: raw, alternativesSuggested: [], keyRisks: [] });
      opinions.push({ voice: voice.name, ...parsed });
      const positionLabel = (parsed.position ?? 'error').toUpperCase().padEnd(12);
      console.log(positionLabel);
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      opinions.push({ voice: voice.name, position: 'error', reasoning: err.message, alternativesSuggested: [], keyRisks: [] });
    }
  }

  // Synthesis pass
  process.stdout.write(`\n  ${'Synthesis'.padEnd(35)} `);
  let synthesis = null;

  if (!dryRun) {
    try {
      const synthesisUser = buildSynthesisUserMessage(inquiry, opinions);
      const raw = await callAnthropic(SYNTHESIS_SYSTEM, synthesisUser, 2000);
      synthesis = safeParseJSON(raw, null);
      const label = synthesis ? (synthesis.consensus ?? 'unknown').toUpperCase() : 'PARSE ERROR';
      console.log(label);
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
    }
  } else {
    console.log('[dry-run skipped]');
  }

  // Write deliberation back to the inquiry file
  if (!dryRun) {
    const deliberationBlock = buildDeliberationBlock(opinions, synthesis);

    if (noWrite) {
      // --no-write: emit the deliberation block to stdout for GHA PR comment posting
      console.log('\n--- COUNCIL DELIBERATION OUTPUT ---\n');
      console.log(deliberationBlock);
      if (synthesis) {
        console.log('\n--- SYNTHESIS SUMMARY ---');
        console.log(`Consensus: ${synthesis.consensus?.toUpperCase() ?? 'UNKNOWN'}`);
        if (synthesis.consensusRationale) console.log(`Rationale: ${synthesis.consensusRationale}`);
        if (synthesis.openQuestions?.length) {
          console.log('\nOpen questions:');
          for (const q of synthesis.openQuestions) console.log(`  1. ${q}`);
        }
      }
      return;
    }

    // Strip existing deliberation section before rewriting
    const withoutOld = inquiry.replace(/\n\n## Deliberation[\s\S]*$/, '');
    let updated = withoutOld.trimEnd() + '\n\n' + deliberationBlock + '\n';

    // Fill stub sections if the deliberation produced structured alternatives/risks
    updated = fillAlternativesStub(updated, synthesis, opinions);
    updated = fillRisksStub(updated, synthesis);
    updated = fillOpenQuestionsStub(updated, synthesis);

    await writeFile(absPath, updated, 'utf8');
    await touchIndexEntry(extractMetaField(inquiry, 'Inquiry ID'));

    console.log(`\nDeliberation written to: docs/council/inquiries/${basename(absPath)}`);
  } else {
    console.log(`\n[dry-run] No files written.`);
  }

  // Summary output
  if (synthesis) {
    const consensusLabel = synthesis.consensus?.toUpperCase() ?? 'UNKNOWN';
    console.log(`\nCouncil consensus: ${consensusLabel}`);
    if (synthesis.consensusRationale) {
      console.log(`Rationale:         ${synthesis.consensusRationale.slice(0, 120)}${synthesis.consensusRationale.length > 120 ? '...' : ''}`);
    }
    if (synthesis.openQuestions?.length) {
      console.log('\nOpen questions for the council:');
      for (const q of synthesis.openQuestions) console.log(`  • ${q}`);
    }
  }
}

async function cmdClose(inquiryId, flags, outcome) {
  if (!inquiryId) {
    console.error(`Usage: node scripts/council.mjs ${outcome} <inquiry-id> --summary "..." [--conditions "..."] [--next-actions "..."]`);
    process.exit(1);
  }

  const summary = flags['--summary'] ?? flags['--reason'];
  if (!summary) {
    console.error(`Error: --summary (or --reason for defer/reject) is required`);
    process.exit(1);
  }

  const conditions = flags['--conditions'] ?? null;
  const nextActions = flags['--next-actions'] ?? null;
  const today = isoDate();

  // Find the inquiry file
  const files = await readdir(INQUIRIES_DIR).catch(() => []);
  const idNum = inquiryId.replace(/^C-0*/, '');
  const file = files.find(f => f.startsWith(idNum.padStart(3, '0') + '-') || f.startsWith('C-' + idNum + '-'));
  if (!file) {
    console.error(`Error: no inquiry file found for ${inquiryId} in docs/council/inquiries/`);
    process.exit(1);
  }

  const filePath = join(INQUIRIES_DIR, file);
  let content = await readFile(filePath, 'utf8');

  // Update Status field in metadata table
  content = content.replace(
    /(\| Status\s*\|\s*)(\w+)(\s*\|)/,
    (_, pre, _old, post) => `${pre}${outcome}${post}`
  );

  // Fill in section 10 — Outcome
  const outcomeBlock = buildOutcomeBlock({ outcome, summary, conditions, nextActions });
  content = content.replace(
    /## 10\. Outcome[\s\S]*/,
    outcomeBlock
  );

  await writeFile(filePath, content, 'utf8');

  // Append to DECISIONS.md
  await appendToDecisions({ inquiryId, title: extractMetaField(content, 'Title'), outcome, summary, conditions, nextActions, today, filename: file });

  // Update INDEX.md
  await updateIndexEntry(inquiryId, { status: outcome, lastUpdated: today, moveToHistorical: true });

  console.log(`\nInquiry ${inquiryId} marked as: ${outcome.toUpperCase()}`);
  console.log(`  Updated: docs/council/inquiries/${file}`);
  console.log(`  Updated: docs/council/INDEX.md`);
  console.log(`  Appended: docs/council/DECISIONS.md`);
}

async function cmdValidate() {
  const errors = [];
  const warnings = [];
  let ok = 0;

  const files = await readdir(INQUIRIES_DIR).catch(() => []);
  const indexContent = await readFile(INDEX_PATH, 'utf8').catch(() => '');
  const decisionsContent = await readFile(DECISIONS_PATH, 'utf8').catch(() => '');

  for (const file of files.filter(f => f.endsWith('.md'))) {
    const filePath = join(INQUIRIES_DIR, file);
    const content = await readFile(filePath, 'utf8');
    const inquiryId = extractMetaField(content, 'Inquiry ID') ?? file;
    const status = extractMetaField(content, 'Status') ?? 'unknown';

    // Section completeness
    for (const section of REQUIRED_SECTIONS) {
      if (!content.includes(section)) {
        errors.push(`${inquiryId} (${file}): missing required section "${section}"`);
      }
    }

    // Status validity
    if (!VALID_STATUSES.has(status)) {
      errors.push(`${inquiryId}: invalid status "${status}" — must be one of: ${[...VALID_STATUSES].join(', ')}`);
    }

    // INDEX.md presence
    if (!indexContent.includes(inquiryId)) {
      errors.push(`${inquiryId}: not listed in INDEX.md`);
    }

    // If approved, must be in DECISIONS.md
    if (status === 'approved' && !decisionsContent.includes(inquiryId)) {
      errors.push(`${inquiryId}: status=approved but not recorded in DECISIONS.md`);
    }

    // Stub sections remaining (warning only — deliberation not yet run)
    if (content.includes('_Run `node scripts/council.mjs deliberate')) {
      warnings.push(`${inquiryId}: deliberation not yet run — Alternatives and/or Risks sections are stubs`);
    }

    // Desired Decision Date
    const dueDate = extractMetaField(content, 'Desired Decision Date');
    if (dueDate && dueDate !== 'YYYY-MM-DD' && (status === 'draft' || status === 'review')) {
      if (new Date(dueDate) < new Date()) {
        warnings.push(`${inquiryId}: past desired decision date (${dueDate}) — still in ${status}`);
      }
    }

    ok += 1;
  }

  // INDEX.md entries that have no corresponding file
  const idMatches = [...indexContent.matchAll(/\| (C-\d+) \|/g)].map(m => m[1]);
  for (const id of idMatches) {
    if (id === 'None') continue;
    const idNum = id.replace('C-', '').replace(/^0+/, '');
    const exists = files.some(f => f.startsWith(idNum.padStart(3, '0') + '-'));
    if (!exists) {
      errors.push(`INDEX.md lists ${id} but no matching file exists in docs/council/inquiries/`);
    }
  }

  console.log(`\nCouncil validate — ${files.length} inquiry file(s) checked\n`);

  if (errors.length === 0 && warnings.length === 0) {
    console.log('  ✓ All inquiries are valid and consistent');
  } else {
    for (const w of warnings) console.log(`  WARN  ${w}`);
    for (const e of errors)   console.log(`  ERROR ${e}`);
  }

  console.log(`\n  ${ok} file(s), ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exit(1);
}

async function cmdStale() {
  const files = await readdir(INQUIRIES_DIR).catch(() => []);
  const today = new Date();
  const stale = [];

  for (const file of files.filter(f => f.endsWith('.md'))) {
    const content = await readFile(join(INQUIRIES_DIR, file), 'utf8');
    const status = extractMetaField(content, 'Status') ?? 'unknown';
    if (status !== 'draft' && status !== 'review') continue;

    const dueDate = extractMetaField(content, 'Desired Decision Date');
    if (!dueDate || dueDate === 'YYYY-MM-DD') continue;

    const due = new Date(dueDate);
    if (due < today) {
      const daysOverdue = Math.floor((today - due) / 86_400_000);
      const inquiryId = extractMetaField(content, 'Inquiry ID') ?? file;
      const title = extractMetaField(content, 'Title') ?? '—';
      const owner = extractMetaField(content, 'Primary Owner') ?? '—';
      stale.push({ inquiryId, title, status, dueDate, daysOverdue, owner });
    }
  }

  if (stale.length === 0) {
    console.log('\nNo stale inquiries — all active inquiries are within their desired decision date.\n');
    return;
  }

  console.log(`\nStale council inquiries (${stale.length}):\n`);
  for (const s of stale.sort((a, b) => b.daysOverdue - a.daysOverdue)) {
    console.log(`  ${s.inquiryId.padEnd(8)} ${s.status.padEnd(10)} ${String(s.daysOverdue).padStart(3)}d overdue  ${s.title.slice(0, 50)}`);
    console.log(`           Owner: ${s.owner}  Due: ${s.dueDate}`);
    console.log('');
  }
}

async function cmdList(flags = {}) {
  const jsonMode = '--json' in flags;
  const files = await readdir(INQUIRIES_DIR).catch(() => []);
  const active = [];
  const historical = [];
  let staleCount = 0;
  const today = new Date();

  for (const file of files.filter(f => f.endsWith('.md'))) {
    const content = await readFile(join(INQUIRIES_DIR, file), 'utf8');
    const inquiryId = extractMetaField(content, 'Inquiry ID') ?? file;
    const title = extractMetaField(content, 'Title') ?? '—';
    const status = extractMetaField(content, 'Status') ?? 'unknown';
    const owner = extractMetaField(content, 'Primary Owner') ?? '—';
    const dueDate = extractMetaField(content, 'Desired Decision Date') ?? null;
    const created = extractMetaField(content, 'Date Created') ?? null;
    const hasDeliberation = content.includes('## Deliberation');
    const isStale = (status === 'draft' || status === 'review') &&
      dueDate && dueDate !== 'YYYY-MM-DD' && new Date(dueDate) < today;
    if (isStale) staleCount++;

    const entry = { id: inquiryId, title, status, owner, dueDate, created, hasDeliberation, isStale, file };
    const closed = ['approved', 'deferred', 'rejected', 'superseded'];
    if (closed.includes(status)) historical.push(entry);
    else active.push(entry);
  }

  if (jsonMode) {
    const outPath = flags['--out'] ?? join(ROOT, 'apps', 'admin-studio-ui', 'public', 'council-state.json');
    const state = {
      generatedAt: new Date().toISOString(),
      active,
      historical,
      staleCount,
      totalCount: files.length,
    };
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    console.log(`Council state written → ${outPath}`);
    console.log(`  Active: ${active.length}  Historical: ${historical.length}  Stale: ${staleCount}`);
    return;
  }

  const indexContent = await readFile(INDEX_PATH, 'utf8').catch(() => '');
  console.log('\n' + indexContent);
}

// ─── LLM helpers ─────────────────────────────────────────────────────────

function buildVoices() {
  return [
    {
      name: 'Platform Architect',
      system: `You are a senior platform architect reviewing a Factory council inquiry.

Factory is a Cloudflare Workers platform using Hono, Neon Postgres, and a strict package dependency order.
The stack forbids: process.env, Node.js built-ins, CommonJS require(), Buffer, Express/Fastify/Next.js.

Your focus:
- Is the abstraction sound and sustainable?
- Does this respect the existing package dependency order?
- Will this create circular imports or coupling that is hard to undo?
- Is the recommended path consistent with the working patterns already proven in the codebase?

Be direct, concrete, and skeptical of unnecessary complexity.
Output ONLY valid JSON — no markdown wrapper:
{
  "position": "for|against|conditional",
  "reasoning": "3-5 sentence assessment",
  "alternativesSuggested": ["brief alternative 1", "brief alternative 2"],
  "keyRisks": ["specific risk 1", "specific risk 2", "specific risk 3"]
}`,
    },
    {
      name: 'Product Skeptic',
      system: `You are a product manager and user advocate reviewing a Factory council inquiry.

Your focus:
- Is this actually needed, or can the problem be solved with something simpler today?
- What is the minimum lovable version that delivers real value?
- Will this improve the experience for the operators running the platform?
- Is the complexity justified by the user benefit?

Push back on over-engineering. Champion delivery speed and operator clarity.
Output ONLY valid JSON — no markdown wrapper:
{
  "position": "for|against|conditional",
  "reasoning": "3-5 sentence assessment",
  "alternativesSuggested": ["brief alternative 1", "brief alternative 2"],
  "keyRisks": ["specific risk 1", "specific risk 2", "specific risk 3"]
}`,
    },
    {
      name: 'Security and Operations',
      system: `You are a security engineer and site reliability captain reviewing a Factory council inquiry.

Your focus:
- What can go wrong in production, and how bad is the blast radius?
- Is there a clear detection and recovery path for each failure mode?
- Does this introduce new attack surface (SQL injection, auth bypass, secret exposure)?
- Is the rollback story credible?

Be concrete about failure modes. Do not accept vague mitigations.
Output ONLY valid JSON — no markdown wrapper:
{
  "position": "for|against|conditional",
  "reasoning": "3-5 sentence assessment",
  "alternativesSuggested": ["brief alternative 1", "brief alternative 2"],
  "keyRisks": ["specific risk 1", "specific risk 2", "specific risk 3"]
}`,
    },
    {
      name: 'Delivery Velocity Lead',
      system: `You are a delivery lead and engineering manager reviewing a Factory council inquiry.

Your focus:
- Is this deliverable in increments, each of which is itself valuable?
- What is the smallest provable slice that closes the core risk?
- What sequencing dependencies exist, and are they acknowledged?
- Is there hidden scope that will surface once implementation starts?

Question anything that requires building everything before getting signal.
Output ONLY valid JSON — no markdown wrapper:
{
  "position": "for|against|conditional",
  "reasoning": "3-5 sentence assessment",
  "alternativesSuggested": ["brief alternative 1", "brief alternative 2"],
  "keyRisks": ["specific risk 1", "specific risk 2", "specific risk 3"]
}`,
    },
  ];
}

const SYNTHESIS_SYSTEM = `You are the council facilitator synthesizing four expert voices on a Factory council inquiry.

Your job: produce a clear, balanced synthesis that the council can act on. Be direct. Resolve disagreements where the evidence is clear; surface only genuine open questions.

Output ONLY valid JSON — no markdown wrapper:
{
  "consensus": "for|against|conditional",
  "consensusRationale": "2-4 sentence plain-language summary of why the council leans this way",
  "alternatives": [
    { "title": "Alternative name", "pros": ["pro 1", "pro 2"], "cons": ["con 1", "con 2"] }
  ],
  "risks": [
    { "risk": "specific risk description", "likelihood": "high|medium|low", "mitigation": "concrete mitigation action" }
  ],
  "openQuestions": [
    "Specific answerable question the council must resolve before deciding",
    "Another specific question"
  ]
}

Produce at most 3 alternatives, 5 risks, and 3 open questions. Keep each point concise.`;

function buildVoiceUserMessage(inquiry) {
  return `Here is the Factory council inquiry. Review it from your assigned perspective.\n\n---\n\n${inquiry}\n\n---\n\nOutput only valid JSON.`;
}

function buildSynthesisUserMessage(inquiry, opinions) {
  return `Council inquiry:\n\n${inquiry}\n\n---\n\nFour expert opinions:\n\n${JSON.stringify(opinions, null, 2)}\n\nSynthesize these into a structured council recommendation. Output only valid JSON.`;
}

async function callAnthropic(system, userMessage, maxTokens = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? '';
  // Strip markdown fences if the model wrapped JSON anyway
  return raw.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, '$1').trim();
}

// ─── Block builders ───────────────────────────────────────────────────────

function buildDeliberationBlock(opinions, synthesis) {
  const lines = [
    '## Deliberation',
    '',
    '_Auto-generated by `node scripts/council.mjs deliberate`. Re-run to refresh._',
    '',
  ];

  for (const op of opinions) {
    const posLabel = (op.position ?? 'error').toUpperCase();
    lines.push(`### ${op.voice}: ${posLabel}`);
    lines.push('');
    lines.push(op.reasoning ?? '_No output._');
    if (op.alternativesSuggested?.length > 0) {
      lines.push('');
      lines.push('**Alternatives suggested:**');
      for (const alt of op.alternativesSuggested) lines.push(`- ${alt}`);
    }
    if (op.keyRisks?.length > 0) {
      lines.push('');
      lines.push('**Key risks flagged:**');
      for (const r of op.keyRisks) lines.push(`- ${r}`);
    }
    lines.push('');
  }

  if (synthesis) {
    lines.push('### Council Synthesis');
    lines.push('');
    lines.push(`**Consensus: ${(synthesis.consensus ?? 'UNKNOWN').toUpperCase()}**`);
    lines.push('');
    lines.push(synthesis.consensusRationale ?? '_No rationale provided._');
    if (synthesis.openQuestions?.length > 0) {
      lines.push('');
      lines.push('**Open questions the council must resolve:**');
      for (const q of synthesis.openQuestions) lines.push(`1. ${q}`);
    }
  }

  // Trailing newline handled by caller
  return lines.join('\n');
}

function fillAlternativesStub(content, synthesis, opinions) {
  const stubPattern = /## 4\. Alternatives Considered\n\n_Run `node scripts\/council\.mjs deliberate.*?`.*?_/s;
  if (!stubPattern.test(content)) return content; // Already filled or pattern different

  const all = [
    ...(synthesis?.alternatives ?? []),
    // Deduplicate suggestions from voices that didn't produce structured alternatives
    ...opinions
      .flatMap(op => op.alternativesSuggested ?? [])
      .filter(s => typeof s === 'string' && s.length > 0)
      .slice(0, 2)
      .map(s => ({ title: s, pros: [], cons: [] })),
  ].slice(0, 3);

  if (all.length === 0) return content;

  const altContent = all.map((a, i) => {
    const letter = String.fromCharCode(65 + i);
    const prosLines = a.pros?.length > 0 ? `\nPros:\n\n${a.pros.map(p => `1. ${p}`).join('\n')}` : '';
    const consLines = a.cons?.length > 0 ? `\nCons:\n\n${a.cons.map(c => `1. ${c}`).join('\n')}` : '';
    return `### ${letter}. ${a.title}${prosLines}${consLines}`;
  }).join('\n\n');

  return content.replace(stubPattern, `## 4. Alternatives Considered\n\n${altContent}`);
}

function fillRisksStub(content, synthesis) {
  const stubPattern = /## 7\. Risks and Mitigations\n\n_Run `node scripts\/council\.mjs deliberate.*?`.*?_/s;
  if (!stubPattern.test(content) || !synthesis?.risks?.length) return content;

  const riskContent = synthesis.risks.map(r =>
    `### ${r.risk}\n\n- Likelihood: ${r.likelihood ?? 'unknown'}\n- Mitigation: ${r.mitigation ?? '—'}`
  ).join('\n\n');

  return content.replace(stubPattern, `## 7. Risks and Mitigations\n\n${riskContent}`);
}

function fillOpenQuestionsStub(content, synthesis) {
  if (!synthesis?.openQuestions?.length) return content;

  // Only inject into section 8 if it still has the template placeholder
  const sectionStub = /## 8\. Council Questions\n\n1\. \n/;
  if (!sectionStub.test(content)) return content;

  const questionsContent = synthesis.openQuestions.map(q => `1. ${q}`).join('\n');
  return content.replace(sectionStub, `## 8. Council Questions\n\n${questionsContent}\n`);
}

function buildOutcomeBlock({ outcome, summary, conditions, nextActions }) {
  const lines = ['## 10. Outcome', ''];
  lines.push('### Decision', '');
  lines.push(outcome.charAt(0).toUpperCase() + outcome.slice(1) + '.', '');
  lines.push('### Notes', '');
  lines.push(summary, '');
  if (conditions) {
    lines.push('### Conditions', '');
    for (const c of conditions.split(';').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }
  if (nextActions) {
    lines.push('### Next Actions', '');
    for (const a of nextActions.split(';').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${a}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ─── INDEX.md management ──────────────────────────────────────────────────

async function addToIndex({ id, title, status, owner, lastUpdated, filename }) {
  // Read as bytes and normalise to LF so regexes work regardless of repo line endings.
  const raw = await readFile(INDEX_PATH, 'utf8').catch(() => '');
  const content = raw.replace(/\r\n/g, '\n');

  const artifact = `[${filename}](./inquiries/${filename})`;
  const newRow = `| ${id} | ${title} | ${status} | ${owner} | ${lastUpdated} | ${artifact} |`;

  // Remove the "None yet" placeholder row if present
  const withoutNone = content.replace(/\| None yet \| — \| — \| — \| — \| — \|\n?/, '');

  // Insert new row into "## Active inquiries" table (after the separator row)
  let updated = withoutNone.replace(
    /(## Active inquiries\n\n\|[^\n]+\|\n\|[-|\s]+\|\n)/,
    `$1${newRow}\n`
  );

  // Fallback: if pattern still didn't match, append after the header block
  if (updated === withoutNone) {
    console.warn('[WARN] INDEX.md Active inquiries table pattern not found — appending row directly');
    updated = withoutNone + `\n${newRow}\n`;
  }

  await writeFile(INDEX_PATH, updated, 'utf8');
}

async function updateIndexEntry(inquiryId, { status, lastUpdated, moveToHistorical }) {
  const content = await readFile(INDEX_PATH, 'utf8').catch(() => '');

  // Update the status and last-updated columns in whatever table the ID appears in
  const idPattern = new RegExp(`(\\| ${inquiryId} \\|[^|]+\\|\\s*)\\w+(\\s*\\|[^|]+\\|[^|]+\\|[^|]+\\|)([^|]+)(\\|)`);
  let updated = content.replace(idPattern, (match, pre, mid, _lastUpdated, pipe) => {
    return `${pre}${status}${mid}${lastUpdated}${pipe}`;
  });

  if (moveToHistorical && status !== 'draft' && status !== 'review') {
    // Move from active to historical by rebuilding the row in the historical table
    const rowPattern = new RegExp(`\\| ${inquiryId} \\|[^\n]+\n`);
    const rowMatch = updated.match(rowPattern);
    if (rowMatch) {
      const cols = rowMatch[0].split('|').map(c => c.trim()).filter(Boolean);
      // ID, Title, Status, Owner, LastUpdated, Artifact
      const histRow = `| ${cols[0]} | ${cols[1]} | ${status} | ${lastUpdated} | ${cols[5] ?? '—'} |\n`;

      // Remove from active table
      updated = updated.replace(rowPattern, '');

      // Insert into historical table (after the header rows)
      updated = updated.replace(
        /(## Historical inquiries\n\n\|[^\n]+\|\n\|[^\n]+\|\n)/,
        `$1${histRow}`
      );
    }
  }

  await writeFile(INDEX_PATH, updated, 'utf8');
}

async function touchIndexEntry(inquiryId) {
  if (!inquiryId) return;
  // Update the "Last Updated" column to today for an existing entry
  await updateIndexEntry(inquiryId, { status: null, lastUpdated: isoDate(), moveToHistorical: false })
    .catch(() => { /* non-critical */ });
}

// ─── DECISIONS.md management ──────────────────────────────────────────────

async function appendToDecisions({ inquiryId, title, outcome, summary, conditions, nextActions, today, filename }) {
  const content = await readFile(DECISIONS_PATH, 'utf8').catch(() => '');

  const conditionLines = conditions
    ? '\n- Conditions:\n' + conditions.split(';').map(c => `\t- ${c.trim()}`).join('\n')
    : '';
  const nextLines = nextActions
    ? '\n- Next actions:\n' + nextActions.split(';').map(a => `\t- ${a.trim()}`).join('\n')
    : '';

  const block = `
### ${inquiryId} — ${title ?? '—'}

- Date: ${today}
- Outcome: ${outcome}
- Primary artifact: [${filename}](./inquiries/${filename})
- Summary: ${summary}${conditionLines}${nextLines}
`;

  // Insert before the "## Format for new decisions" section if present, otherwise append
  const formatMarker = '## Format for new decisions';
  if (content.includes(formatMarker)) {
    const updated = content.replace(formatMarker, block + '\n' + formatMarker);
    await writeFile(DECISIONS_PATH, updated, 'utf8');
  } else {
    await writeFile(DECISIONS_PATH, content.trimEnd() + '\n' + block, 'utf8');
  }
}

// ─── Template builder ─────────────────────────────────────────────────────

function buildInquiryTemplate({ inquiryId, idStr, title, author, owner, today, dueDate, filename }) {
  return `# ${inquiryId} — ${title}

| Field | Value |
|---|---|
| Inquiry ID | ${inquiryId} |
| Title | ${title} |
| Author | ${author} |
| Date Opened | ${today} |
| Status | draft |
| Desired Decision Date | ${dueDate} |
| Primary Owner | ${owner} |
| Related Docs | — |

## 1. Decision Needed

State exactly what the council is being asked to decide.

## 2. Problem

Current state:

1.

Pain or risk:

1.

Why now:

1.

## 3. Recommended Path

What should be done:

1.

What should not be done:

1.

Why this is the best current path:

1.

## 4. Alternatives Considered

_Run \`node scripts/council.mjs deliberate docs/council/inquiries/${filename}\` to populate this section via multi-voice LLM deliberation._

## 5. Impact

### Platform

1.

### Studio UX

1.

### Delivery speed

1.

### Governance and review load

1.

### Long-term maintenance

1.

## 6. Approval Criteria

1.

## 7. Risks and Mitigations

_Run \`node scripts/council.mjs deliberate docs/council/inquiries/${filename}\` to populate this section._

## 8. Council Questions

1.

## 9. If Approved, Next Actions

1.

## 10. Outcome

_Pending decision._

### Decision

_Not yet decided._

### Notes

_Not yet decided._
`;
}

// ─── Utility helpers ──────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i]] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return flags;
}

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDateStr, days) {
  const d = new Date(isoDateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractMetaField(content, field) {
  const pattern = new RegExp(`\\|\\s*${field}\\s*\\|\\s*([^|\\n]+)\\s*\\|`);
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function safeParseJSON(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function nextInquiryId() {
  const files = await readdir(INQUIRIES_DIR).catch(() => []);
  const ids = files
    .map(f => parseInt(f.match(/^(\d+)-/)?.[1] ?? '0', 10))
    .filter(n => n > 0);
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

function printHelp() {
  console.log(`council.mjs — Factory Council CLI

Subcommands:
  create      --title <text> [--author <name>] [--owner <team>]
  deliberate  <inquiry-file> [--dry-run]
  approve     <inquiry-id> --summary <text> [--conditions "c1; c2"] [--next-actions "a1; a2"]
  defer       <inquiry-id> --reason <text>
  reject      <inquiry-id> --reason <text>
  validate
  stale
  list

Examples:
  node scripts/council.mjs create --title "Should we add a rules engine?" --owner capability-factory
  node scripts/council.mjs deliberate docs/council/inquiries/002-rules-engine.md
  node scripts/council.mjs deliberate docs/council/inquiries/002-rules-engine.md --dry-run
  node scripts/council.mjs approve C-002 --summary "Approved with conditions" --conditions "Thin slice first; No visual canvas before proof gate"
  node scripts/council.mjs validate
  node scripts/council.mjs stale
  node scripts/council.mjs list`);
}
