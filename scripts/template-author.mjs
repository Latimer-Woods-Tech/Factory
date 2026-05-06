#!/usr/bin/env node
/**
 * template-author.mjs
 *
 * LLM draft + adversarial critique pipeline for supervisor template authoring.
 * Called by supervisor-template-author.yml when an issue lands supervisor:no-template.
 *
 * Pipeline:
 *   1. Draft  (Haiku, few-shot from existing templates, max 3 attempts)
 *   2. Lint   (deterministic FRIDGE constraint check after each draft)
 *   3. Critique (Haiku, adversarial reviewer, confidence threshold 0.8)
 *   4. Re-draft if critique fails (incorporates concerns, max 2 critique cycles)
 *   5. Write template YAML + update registry, set GITHUB_OUTPUT template_id
 *
 * Required env: ANTHROPIC_API_KEY, ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, ISSUE_LABELS
 * Optional env: ANTHROPIC_MODEL, REPO, GITHUB_OUTPUT
 */

import { readFileSync, writeFileSync, readdirSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { lintTemplate } from './template-linter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const require = createRequire(join(ROOT, 'apps', 'supervisor', 'package.json'));
const { load: yamlLoad, dump: yamlDump } = require('js-yaml');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
const ISSUE_NUMBER      = process.env.ISSUE_NUMBER ?? '0';
const ISSUE_TITLE       = process.env.ISSUE_TITLE ?? '';
const ISSUE_BODY        = process.env.ISSUE_BODY ?? '';
const ISSUE_LABELS      = JSON.parse(process.env.ISSUE_LABELS ?? '[]')
  .map(l => (typeof l === 'string' ? l : l.name)).join(', ');
const REPO              = process.env.REPO ?? 'Latimer-Woods-Tech/Factory';

const PLANS_DIR      = join(ROOT, 'docs', 'supervisor', 'plans');
const FRIDGE_PATH    = join(ROOT, 'docs', 'supervisor', 'FRIDGE.md');
const REGISTRY_PATH  = join(ROOT, 'docs', 'supervisor', 'template-registry.yml');

const MAX_DRAFT_ATTEMPTS   = 3;
const MAX_CRITIQUE_CYCLES  = 2;
const CONFIDENCE_THRESHOLD = 0.8;

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(system, userContent, maxTokens = 2000) {
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
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildDraftSystemPrompt(existingTemplates) {
  // Use up to 6 templates as few-shot examples (token budget)
  const examples = existingTemplates.slice(0, 6)
    .map(t => `### ${t.file}\n\`\`\`yaml\n${t.content.trim()}\n\`\`\``)
    .join('\n\n');

  return `You are a template author for the Factory supervisor system. You write YAML templates the supervisor uses to handle GitHub issues autonomously on Cloudflare Workers repositories.

## NON-NEGOTIABLE RULES

1. NEVER reference "wordis-bond" anywhere — permanent hard reject
2. Auto-authored templates MUST use tier: yellow or tier: red — NEVER tier: green
3. If any step path touches packages/, migrations/, .github/workflows/, or wrangler.jsonc — tier MUST be red
4. Steps writing to /admin paths MUST have requires_human_review: true
5. Every template MUST have acceptance_gate and rollback sections
6. Every step MUST have an intent field (one sentence)
7. All slot validators MUST be valid JavaScript regex
8. Never use process.env, require(), or Buffer in any template field
9. id MUST be kebab-case: ^[a-z][a-z0-9-]+$
10. Slot validators must be narrow enough to block injection (avoid .* patterns)

## FIELD CONSTRAINTS

tier: yellow | red  (never green for auto-authored)
side_effects: none | read-external | write-app | write-external
slot type: string | integer | enum | daterange

## SCHEMA

\`\`\`yaml
id: kebab-case-slug
version: 1
tier: yellow
description: "one-line description of what class of issue this handles"

triggers:
  labels_any_of: [label1, label2]
  title_pattern: "case-insensitive JS regex"
  body_patterns:
    - "regex1"

preconditions:
  - capability_exists: tool.namespace

slots:
  - name: slot_name
    type: string
    validator: "^tight-regex$"
    source: issue_body | issue_title | issue_labels
    default: optional

steps:
  - id: s1
    tool: tool.namespace
    depends_on: null
    params:
      key: "$slots.slot_name"
    intent: "One sentence: what this step does and why."
    requires_human_review: false
    side_effects: none

acceptance_gate:
  description: "Precise success criterion — not a vague placeholder."
  verifier_query:
    tool: tool.namespace
    query: "..."
    assert: "count >= 1"

rollback:
  - on_step: s2
    action: tool.namespace
    params:
      key: value
\`\`\`

## EXISTING TEMPLATES (style reference)

${examples}

## OUTPUT FORMAT

Output ONLY the YAML — no markdown fences, no preamble, no explanation. The YAML must be complete and self-contained.`;
}

function buildCritiqueSystemPrompt() {
  return `You are a hostile security reviewer for the Factory supervisor automation system.

A template has been auto-drafted to run autonomously on GitHub repositories. Find every problem that could cause unsafe actions, runaway PRs, or unintended side effects.

Review for ALL of the following:
1. Is the tier too permissive? (yellow when red is required?)
2. Does any step touch packages/, migrations/, .github/workflows/ without tier:red?
3. Does any /admin write lack requires_human_review: true?
4. Are triggers too broad — would this match unrelated issues and execute incorrectly?
5. Would running the template twice cause duplicate PRs, duplicate labels, or double-apply?
6. Are rollback steps meaningful or just cosmetic?
7. Is acceptance_gate specific enough to detect failure?
8. Are slot validators tight enough to prevent prompt injection?
9. Any wordis-bond, process.env, require(), or Buffer references?
10. Any step with write-app or write-external side_effects that is missing requires_human_review?

Respond with ONLY a JSON object — no markdown, no fences:
{"confidence": 0.85, "issues": ["specific issue 1", "specific issue 2"], "verdict": "one-sentence summary"}

confidence is your certainty that the template is SAFE for autonomous deployment:
1.0 = no concerns at all
0.8 = minor style issues, acceptable
0.5 = real concerns, must be reworked
0.0 = definitely unsafe`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadExistingTemplates() {
  return readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.yml'))
    .sort()
    .map(f => ({ file: f, content: readFileSync(join(PLANS_DIR, f), 'utf8') }));
}

function extractYaml(raw) {
  const fenced = raw.match(/```(?:yaml)?\s*\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function parseCritique(raw) {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match?.[0] ?? raw);
  } catch {
    return { confidence: 0, issues: ['critique response was not valid JSON'], verdict: raw.slice(0, 200) };
  }
}

function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) appendFileSync(outputFile, `${key}=${value}\n`, 'utf8');
}

function updateRegistry(templateId, tier) {
  let registry = { templates: [] };
  try {
    registry = yamlLoad(readFileSync(REGISTRY_PATH, 'utf8')) ?? { templates: [] };
    registry.templates = registry.templates ?? [];
  } catch { /* registry missing — start fresh */ }

  const now = new Date().toISOString();
  const existing = registry.templates.find(t => t.id === templateId);

  if (existing) {
    Object.assign(existing, {
      source: 'auto', authored_at: now, promoted_at: null,
      declared_tier: tier, current_tier: tier,
      status: 'probationary', probationary_runs_remaining: 5,
      originating_issue: Number(ISSUE_NUMBER),
    });
  } else {
    registry.templates.push({
      id: templateId,
      source: 'auto',
      authored_at: now,
      promoted_at: null,
      declared_tier: tier,
      current_tier: tier,
      status: 'probationary',
      probationary_runs_remaining: 5,
      run_count: 0,
      failure_count: 0,
      originating_issue: Number(ISSUE_NUMBER),
    });
  }

  writeFileSync(REGISTRY_PATH, `# Auto-maintained — do not edit manually\n${yamlDump(registry, { lineWidth: 120 })}`, 'utf8');
}

// ── Draft loop ───────────────────────────────────────────────────────────────

async function draftWithLint(draftSystemPrompt, issueContext, feedbackLines = []) {
  let userPrompt = issueContext;
  if (feedbackLines.length > 0) {
    userPrompt += `\n\nPREVIOUS DRAFT FAILED — fix these before re-drafting:\n${feedbackLines.map(l => `- ${l}`).join('\n')}`;
  }

  for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
    console.log(`[draft] attempt ${attempt}/${MAX_DRAFT_ATTEMPTS}`);
    const raw = await callAnthropic(draftSystemPrompt, userPrompt, 2000);
    const yaml = extractYaml(raw);
    const lint = lintTemplate(yaml, { autoAuthored: true });

    if (lint.hardReject) {
      console.error('[draft] HARD REJECT — stopping');
      lint.errors.forEach(e => console.error(`  ✗ ${e}`));
      process.exit(1);
    }
    if (lint.warnings.length > 0) {
      lint.warnings.forEach(w => console.warn(`  ⚠ ${w}`));
    }
    if (lint.ok) {
      console.log('[draft] lint passed');
      return yaml;
    }

    console.warn(`[draft] lint failed: ${lint.errors.join('; ')}`);
    // Feed errors back into next attempt
    userPrompt = `${issueContext}\n\nFix these lint errors:\n${lint.errors.map(e => `- ${e}`).join('\n')}`;
    if (feedbackLines.length > 0) {
      userPrompt += `\n\nAlso address these security concerns:\n${feedbackLines.map(l => `- ${l}`).join('\n')}`;
    }
  }

  return null; // exhausted attempts
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('[ERROR] ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  const existingTemplates = loadExistingTemplates();
  const draftSystemPrompt = buildDraftSystemPrompt(existingTemplates);
  const critiqueSystemPrompt = buildCritiqueSystemPrompt();

  const issueContext = [
    `Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`,
    ISSUE_LABELS ? `Labels: ${ISSUE_LABELS}` : '',
    '',
    ISSUE_BODY,
  ].filter(Boolean).join('\n');

  let finalYaml = null;
  let critiqueIssues = [];

  for (let cycle = 1; cycle <= MAX_CRITIQUE_CYCLES; cycle++) {
    console.log(`\n[cycle ${cycle}/${MAX_CRITIQUE_CYCLES}] drafting...`);

    const yaml = await draftWithLint(draftSystemPrompt, issueContext, critiqueIssues);
    if (!yaml) {
      console.error(`[ERROR] Draft failed lint after ${MAX_DRAFT_ATTEMPTS} attempts in cycle ${cycle}`);
      process.exit(1);
    }

    console.log(`[cycle ${cycle}] running adversarial critique...`);
    const critiquePrompt = `Template to review:\n${yaml}\n\nOriginating issue:\n${issueContext}`;
    const critiqueRaw = await callAnthropic(critiqueSystemPrompt, critiquePrompt, 600);
    const critique = parseCritique(critiqueRaw);

    console.log(`[critique] confidence=${critique.confidence} — ${critique.verdict}`);

    if ((critique.confidence ?? 0) >= CONFIDENCE_THRESHOLD) {
      console.log('[critique] passed — confidence meets threshold');
      finalYaml = yaml;
      break;
    }

    critiqueIssues = critique.issues ?? [];
    console.warn(`[critique] below threshold (${critique.confidence} < ${CONFIDENCE_THRESHOLD})`);
    critiqueIssues.forEach(i => console.warn(`  ⚠ ${i}`));

    if (cycle === MAX_CRITIQUE_CYCLES) {
      console.error(`[ERROR] Template failed security critique after ${MAX_CRITIQUE_CYCLES} cycles`);
      process.exit(1);
    }
  }

  // Safety: never overwrite a manually-authored template
  const parsed = yamlLoad(finalYaml);
  const templateId = parsed.id;
  const outPath = join(PLANS_DIR, `${templateId}.yml`);

  if (existsSync(outPath)) {
    let existingSource = 'unknown';
    try {
      const registry = yamlLoad(readFileSync(REGISTRY_PATH, 'utf8')) ?? {};
      existingSource = (registry.templates ?? []).find(t => t.id === templateId)?.source ?? 'manual';
    } catch { /* registry unreadable */ }
    if (existingSource === 'manual') {
      console.error(`[ERROR] Template "${templateId}" is manually authored — refusing to overwrite`);
      process.exit(1);
    }
  }

  writeFileSync(outPath, finalYaml, 'utf8');
  console.log(`\n[OK] Template written → ${outPath}`);

  updateRegistry(templateId, parsed.tier);
  console.log(`[OK] Registry updated`);

  setOutput('template_id', templateId);
  console.log(`[OK] template_id=${templateId}`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
