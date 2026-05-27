#!/usr/bin/env node
/**
 * constraints-loader.mjs — Extracts the Hard Constraints section from CLAUDE.md.
 *
 * Parses the "## Hard Constraints" bullet list and returns both structured items
 * (for programmatic use in deterministic checks) and a formatted block suitable
 * for LLM system prompts.
 *
 * Used by pr-review.mjs to inject a focused, live constraint set at the top of
 * the reviewer system prompt so the LLM always sees current constraints even
 * when the full CLAUDE.md is truncated by the 8 000-char loading limit.
 *
 * Runs in Node.js (GitHub Actions); exempt from Cloudflare hard constraints.
 */

import { readFileSync, existsSync } from 'node:fs';

const SECTION_HEADING = '## Hard Constraints';

/**
 * @typedef {{ text: string }} ConstraintItem
 * @typedef {{
 *   items: ConstraintItem[],
 *   raw: string,
 *   block: string,
 *   source: string,
 * }} HardConstraints
 */

/**
 * Extracts the "## Hard Constraints" section from a CLAUDE.md file.
 *
 * @param {string} [claudeMdPath='CLAUDE.md']
 * @returns {HardConstraints | null} Null if the file or section is missing.
 */
export function loadHardConstraints(claudeMdPath = 'CLAUDE.md') {
  if (!existsSync(claudeMdPath)) return null;

  const content = readFileSync(claudeMdPath, 'utf8');
  const startIdx = content.indexOf(SECTION_HEADING);
  if (startIdx === -1) return null;

  // Slice to the next top-level "## " heading (or end of file).
  const afterSection = content.indexOf('\n## ', startIdx + SECTION_HEADING.length);
  const raw =
    afterSection === -1 ? content.slice(startIdx) : content.slice(startIdx, afterSection);

  // Extract bullet items (any leading whitespace + "- ").
  const items = raw
    .split('\n')
    .filter((line) => line.trimStart().startsWith('- '))
    .map((line) => ({ text: line.trimStart().slice(2).trim() }));

  const block = [
    '## Hard Constraints (live from CLAUDE.md)',
    '',
    '**Scope:** Cloudflare Workers runtime only (apps/**, packages/**, src/**).',
    'GitHub Actions scripts (.github/scripts/, .github/workflows/, scripts/) are exempt.',
    '',
    ...items.map((item) => `- ${item.text}`),
  ].join('\n');

  return { items, raw, block, source: claudeMdPath };
}

/**
 * Returns a formatted Hard Constraints block for inclusion in an LLM system
 * prompt.  Falls back to a minimal hardcoded list when CLAUDE.md is absent.
 *
 * @param {string} [claudeMdPath='CLAUDE.md']
 * @returns {string}
 */
export function buildConstraintSystemBlock(claudeMdPath = 'CLAUDE.md') {
  const result = loadHardConstraints(claudeMdPath);
  if (!result) {
    return [
      '## Hard Constraints (fallback — CLAUDE.md not found)',
      '',
      '**Scope:** Cloudflare Workers runtime only.',
      '',
      '- No process.env — use Hono/Worker bindings (c.env.VAR / env.VAR)',
      '- No Node.js built-ins (fs, path, crypto) — use platform-safe APIs',
      '- No CommonJS require() — use ESM import/export only',
      '- No Buffer — use Uint8Array, TextEncoder, or TextDecoder',
      '- No raw fetch without explicit error handling',
      '- No secrets in source code or in wrangler.jsonc vars',
      '- No *.workers.dev URLs in user-facing HTML, JS, or API client code',
    ].join('\n');
  }
  return result.block;
}
