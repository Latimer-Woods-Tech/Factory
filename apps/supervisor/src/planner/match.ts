import type { Template } from './load';

/**
 * Deterministic template matcher. Scores each template against a user
 * description, returns the best match above the threshold, or null.
 *
 * Scoring combines two signals:
 *   1. Keyword-hit ratio from `trigger_keywords` (for free-form /plan descriptions)
 *   2. Structured `triggers` regex patterns from the YAML schema (title_pattern,
 *      body_patterns) — each match adds 0.5 to ensure structured templates
 *      beat keyword-only guesses.
 *
 * Phase 2 (SUP-3.5): replace keyword scoring with embedding similarity once
 * `@latimer-woods-tech/llm` supports embeddings (0.4.x).
 */
export interface MatchScore {
  template: Template;
  score: number;
  matchedKeywords: string[];
}

const MIN_SCORE = 0.35;

export function matchTemplate(
  description: string,
  templates: Template[],
): Template | null {
  const normalized = description.toLowerCase();
  const scores: MatchScore[] = [];

  for (const t of templates) {
    let score = 0;
    const matchedKeywords: string[] = [];

    // Signal 1: keyword-hit ratio
    const keywords = t.trigger_keywords ?? [];
    if (keywords.length > 0) {
      const hits = keywords.filter((k) => normalized.includes(k.toLowerCase()));
      score += hits.length / keywords.length;
      matchedKeywords.push(...hits);
    }

    // Signal 2: structured triggers from YAML schema
    if (t.triggers) {
      if (t.triggers.title_pattern) {
        try {
          if (new RegExp(t.triggers.title_pattern, 'i').test(description)) score += 0.5;
        } catch {
          // malformed regex in template — skip this signal
        }
      }
      for (const pattern of t.triggers.body_patterns ?? []) {
        // Strip PCRE inline flags (?i), (?is), (?s) — unsupported in JS; we apply 'i' and 's' flags.
        const jsPattern = pattern.replace(/^\(\?[is]+\)/, '');
        try {
          if (new RegExp(jsPattern, 'is').test(description)) {
            score += 0.25;
            break; // only count body once
          }
        } catch {
          // malformed regex — skip
        }
      }
    }

    if (score >= MIN_SCORE) {
      scores.push({ template: t, score, matchedKeywords });
    }
  }

  if (scores.length === 0) return null;
  scores.sort((a, b) => {
    // Primary: highest score
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreak: lower tier (green before yellow before red) — safer default
    const tierOrder = { green: 0, yellow: 1, red: 2 } as const;
    return (tierOrder[a.template.tier] ?? 99) - (tierOrder[b.template.tier] ?? 99);
  });
  return scores[0]!.template;
}
