import type { Template } from './load';

/**
 * Deterministic template matcher. Scores each template against a user
 * description (and optional issue labels), returns the best match above the
 * threshold, or null.
 *
 * Scoring combines two signals:
 *   1. Keyword-hit ratio from `trigger_keywords` (for free-form /plan descriptions)
 *   2. Structured `triggers` block from the YAML schema — AND-gated: every
 *      sub-signal declared (labels_any_of, title_pattern, body_patterns) MUST
 *      fire. A declared signal that does not match disqualifies the template
 *      entirely, regardless of score.
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

export function matchTemplate(
  description: string,
  templates: Template[],
  options: { labels?: string[] } = {},
): Template | null {
  const normalized = description.toLowerCase();
  const issueLabelsLower = (options.labels ?? []).map((l) => l.toLowerCase());
  const scores: MatchScore[] = [];

  templateLoop: for (const t of templates) {
    let score = 0;
    const matchedKeywords: string[] = [];

    // Signal 1: keyword-hit ratio (always additive; independent of triggers block)
    const keywords = t.trigger_keywords ?? [];
    if (keywords.length > 0) {
      const hits = keywords.filter((k) => normalized.includes(k.toLowerCase()));
      score += hits.length / keywords.length;
      matchedKeywords.push(...hits);
    }

    // Signal 2: structured triggers from YAML schema — AND-gated.
    // Every sub-signal that a template *declares* must fire. A non-firing
    // declared signal skips the template entirely.
    if (t.triggers) {
      // labels_any_of — if declared, at least one label must match
      if (t.triggers.labels_any_of?.length) {
        const labelHit = t.triggers.labels_any_of.some((l) =>
          issueLabelsLower.includes(l.toLowerCase()),
        );
        if (!labelHit) continue templateLoop;
        score += 0.5;
        matchedKeywords.push(
          ...t.triggers.labels_any_of.filter((l) =>
            issueLabelsLower.includes(l.toLowerCase()),
          ),
        );
      }

      // title_pattern — if declared, must match
      if (t.triggers.title_pattern) {
        try {
          if (!new RegExp(t.triggers.title_pattern, 'i').test(description)) continue templateLoop;
          score += 0.5;
        } catch {
          // malformed regex — hard-fail to avoid ghost matches
          continue templateLoop;
        }
      }

      // body_patterns — if declared, at least one must match
      if (t.triggers.body_patterns?.length) {
        let bodyHit = false;
        for (const pattern of t.triggers.body_patterns) {
          // Strip PCRE inline flags (?i), (?is), (?s) — unsupported in JS; we apply 'i' and 's' flags.
          const jsPattern = pattern.replace(/^\(\?[is]+\)/, '');
          try {
            if (new RegExp(jsPattern, 'is').test(description)) {
              bodyHit = true;
              break;
            }
          } catch {
            // malformed regex — skip this specific pattern
          }
        }
        if (!bodyHit) continue templateLoop;
        score += 0.25;
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
