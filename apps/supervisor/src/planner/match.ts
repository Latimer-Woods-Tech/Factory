import type { Template } from './load';

/**
 * Deterministic template matcher. Scores each template against a user
 * description, returns the best match above the threshold, or null.
 *
 * Scoring combines three signals:
 *   1. Keyword-hit ratio from `trigger_keywords` (for free-form /plan descriptions)
 *   2. Structured `triggers.labels_any_of` overlap
 *   3. Structured `triggers` regex patterns from the YAML schema (title_pattern,
 *      body_patterns)
 *
 * For structured triggers, declared signals are required: if a template declares
 * labels_any_of/title_pattern/body_patterns, each declared signal must match.
 *
 * Phase 2 (SUP-3.5): replace keyword scoring with embedding similarity once
 * `@latimer-woods-tech/llm` supports embeddings (0.4.x).
 */
export interface MatchScore {
  template: Template;
  score: number;
  matchedKeywords: string[];
}

const MIN_SCORE = 1 / 3;

export interface MatchTemplateOptions {
  labels?: string[];
}

export function matchTemplate(
  description: string,
  templates: Template[],
  options: MatchTemplateOptions = {},
): Template | null {
  const normalized = description.toLowerCase();
  const normalizedLabels = new Set((options.labels ?? []).map((label) => label.toLowerCase()));
  const scores: MatchScore[] = [];

  for (const t of templates) {
    let score = 0;
    const matchedKeywords: string[] = [];
    let requiredTriggerMiss = false;

    // Signal 1: keyword-hit ratio
    const keywords = t.trigger_keywords ?? [];
    if (keywords.length > 0) {
      const hits = keywords.filter((k) => normalized.includes(k.toLowerCase()));
      score += hits.length / keywords.length;
      matchedKeywords.push(...hits);
    }

    // Signal 2: structured triggers from YAML schema
    if (t.triggers) {
      if (t.triggers.labels_any_of?.length) {
        const labelHits = t.triggers.labels_any_of.filter((label) =>
          normalizedLabels.has(label.toLowerCase()),
        );
        if (labelHits.length > 0) {
          score += 0.5;
          matchedKeywords.push(...labelHits);
        } else {
          requiredTriggerMiss = true;
        }
      }

      if (t.triggers.title_pattern) {
        try {
          if (new RegExp(t.triggers.title_pattern, 'i').test(description)) {
            score += 0.5;
          } else {
            requiredTriggerMiss = true;
          }
        } catch {
          // malformed regex in template — treat as required trigger miss
          requiredTriggerMiss = true;
        }
      }
      let bodyMatched = false;
      for (const pattern of t.triggers.body_patterns ?? []) {
        // Strip PCRE inline flags (?i), (?is), (?s) — unsupported in JS; we apply 'i' and 's' flags.
        const jsPattern = pattern.replace(/^\(\?[is]+\)/, '');
        try {
          if (new RegExp(jsPattern, 'is').test(description)) {
            score += 0.25;
            bodyMatched = true;
            break; // only count body once
          }
        } catch {
          // malformed regex — skip
        }
      }
      if ((t.triggers.body_patterns?.length ?? 0) > 0 && !bodyMatched) {
        requiredTriggerMiss = true;
      }
    }

    if (!requiredTriggerMiss && score >= MIN_SCORE) {
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
