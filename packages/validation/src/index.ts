/**
 * Severity levels for output validation findings.
 */
export type ValidationSeverity = 'critical' | 'major' | 'minor';

/**
 * Stable rule identifiers emitted by the shared validator.
 */
export type OutputValidationRule =
  | 'content.empty'
  | 'content.too_short'
  | 'content.too_long'
  | 'content.raw_json'
  | 'section.missing'
  | 'fact.missing'
  | 'phrase.forbidden'
  | 'prompt.leak'
  | 'placeholder.unresolved'
  | 'unsafe.advice'
  | 'brand.term_missing'
  | 'brand.term_blocked';

/**
 * A single validation finding suitable for logs, Sentry context, and dashboards.
 */
export interface OutputValidationIssue {
  rule: OutputValidationRule;
  severity: ValidationSeverity;
  message: string;
  /** Redacted evidence fragment. Never store raw private chart data here. */
  evidence?: string;
}

/**
 * Required content section configured by an application.
 */
export interface RequiredSection {
  id: string;
  label: string;
  pattern: RegExp;
  severity?: ValidationSeverity;
}

/**
 * A chart or business fact that generated output must reference.
 */
export interface RequiredFact {
  label: string;
  expectedText: string | readonly string[];
  severity?: ValidationSeverity;
}

/**
 * Brand voice constraints configured by an application.
 */
export interface BrandVoiceRules {
  requiredTerms?: readonly string[];
  blockedTerms?: readonly string[];
}

/**
 * Configuration for {@link validateAiOutput}.
 */
export interface AiOutputValidationConfig {
  minCharacters?: number;
  maxCharacters?: number;
  requiredSections?: readonly RequiredSection[];
  requiredFacts?: readonly RequiredFact[];
  forbiddenPhrases?: readonly string[];
  brandVoice?: BrandVoiceRules;
  passScore?: number;
}

/**
 * Summary returned by {@link validateAiOutput}.
 */
export interface AiOutputValidationResult {
  passed: boolean;
  score: number;
  issues: OutputValidationIssue[];
  checkedAt: string;
}

const DEFAULT_MIN_CHARACTERS = 120;
const DEFAULT_MAX_CHARACTERS = 12_000;
const DEFAULT_PASS_SCORE = 85;
const EVIDENCE_LIMIT = 96;
const MAJOR_PENALTY = 15;
const MINOR_PENALTY = 5;

const DEFAULT_FORBIDDEN_PHRASES = [
  'as an ai language model',
  'i cannot provide a reading',
  'i do not have access to your chart',
  'lorem ipsum',
] as const;

const PROMPT_LEAK_PATTERNS = [
  /system prompt/i,
  /developer message/i,
  /hidden instructions/i,
  /ignore (all )?(previous|prior) instructions/i,
  /you are chatgpt/i,
  /internal policy/i,
] as const;

const PLACEHOLDER_PATTERNS = [
  /\{\{[^{}]+\}\}/,
  /\[insert [^\]]+\]/i,
  /\bTODO\b/,
  /\bTBD\b/,
] as const;

const UNSAFE_ADVICE_PATTERNS = [
  /\b(stop|start|change) (your )?(medication|medicine|prescription)\b/i,
  /\bdiagnos(e|is|ing|ed)\b/i,
  /\bguaranteed (profit|return|income|result|cure)\b/i,
  /\blegal advice\b/i,
  /\binvest (all|everything)\b/i,
] as const;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function redactEvidence(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.length <= EVIDENCE_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, EVIDENCE_LIMIT - 1)}…`;
}

function includesCaseInsensitive(content: string, phrase: string): boolean {
  return content.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

function findFirstPattern(content: string, patterns: readonly RegExp[]): RegExp | null {
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return pattern;
    }
  }
  return null;
}

function isRawJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function issue(
  rule: OutputValidationRule,
  severity: ValidationSeverity,
  message: string,
  evidence?: string,
): OutputValidationIssue {
  return evidence
    ? { rule, severity, message, evidence: redactEvidence(evidence) }
    : { rule, severity, message };
}

function scoreIssues(issues: readonly OutputValidationIssue[]): number {
  if (issues.some((entry) => entry.severity === 'critical')) {
    return 0;
  }
  const penalty = issues.reduce((total, entry) => {
    if (entry.severity === 'major') {
      return total + MAJOR_PENALTY;
    }
    return total + MINOR_PENALTY;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function validateLength(content: string, config: AiOutputValidationConfig): OutputValidationIssue[] {
  const minCharacters = config.minCharacters ?? DEFAULT_MIN_CHARACTERS;
  const maxCharacters = config.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const issues: OutputValidationIssue[] = [];

  if (content.length === 0) {
    issues.push(issue('content.empty', 'critical', 'Output is empty.'));
    return issues;
  }
  if (content.length < minCharacters) {
    issues.push(
      issue(
        'content.too_short',
        'major',
        `Output is shorter than the minimum ${String(minCharacters)} characters.`,
      ),
    );
  }
  if (content.length > maxCharacters) {
    issues.push(
      issue(
        'content.too_long',
        'major',
        `Output is longer than the maximum ${String(maxCharacters)} characters.`,
      ),
    );
  }
  return issues;
}

function validateSections(
  content: string,
  requiredSections: readonly RequiredSection[] = [],
): OutputValidationIssue[] {
  return requiredSections
    .filter((section) => !section.pattern.test(content))
    .map((section) =>
      issue(
        'section.missing',
        section.severity ?? 'major',
        `Missing required section: ${section.label}.`,
      ),
    );
}

function expectedFactValues(fact: RequiredFact): readonly string[] {
  return typeof fact.expectedText === 'string' ? [fact.expectedText] : fact.expectedText;
}

function validateFacts(
  content: string,
  requiredFacts: readonly RequiredFact[] = [],
): OutputValidationIssue[] {
  return requiredFacts
    .filter((fact) => expectedFactValues(fact).every((value) => !includesCaseInsensitive(content, value)))
    .map((fact) =>
      issue(
        'fact.missing',
        fact.severity ?? 'critical',
        `Output does not reference expected fact: ${fact.label}.`,
      ),
    );
}

function validateForbiddenPhrases(
  content: string,
  phrases: readonly string[],
): OutputValidationIssue[] {
  const issues: OutputValidationIssue[] = [];
  for (const phrase of phrases) {
    if (includesCaseInsensitive(content, phrase)) {
      issues.push(issue('phrase.forbidden', 'major', `Output contains forbidden phrase: ${phrase}.`, phrase));
    }
  }
  return issues;
}

function validatePatterns(content: string): OutputValidationIssue[] {
  const issues: OutputValidationIssue[] = [];
  const promptLeak = findFirstPattern(content, PROMPT_LEAK_PATTERNS);
  const placeholder = findFirstPattern(content, PLACEHOLDER_PATTERNS);
  const unsafeAdvice = findFirstPattern(content, UNSAFE_ADVICE_PATTERNS);

  if (isRawJson(content)) {
    issues.push(issue('content.raw_json', 'critical', 'Output is raw JSON instead of user-facing prose.'));
  }
  if (promptLeak) {
    issues.push(issue('prompt.leak', 'critical', 'Output appears to leak internal prompt or policy text.', promptLeak.source));
  }
  if (placeholder) {
    issues.push(issue('placeholder.unresolved', 'critical', 'Output contains an unresolved placeholder.', placeholder.source));
  }
  if (unsafeAdvice) {
    issues.push(issue('unsafe.advice', 'critical', 'Output contains unsafe advice language.', unsafeAdvice.source));
  }
  return issues;
}

function validateBrandVoice(content: string, brandVoice?: BrandVoiceRules): OutputValidationIssue[] {
  if (!brandVoice) {
    return [];
  }

  const issues: OutputValidationIssue[] = [];
  for (const term of brandVoice.requiredTerms ?? []) {
    if (!includesCaseInsensitive(content, term)) {
      issues.push(issue('brand.term_missing', 'minor', `Output is missing preferred brand term: ${term}.`));
    }
  }
  for (const term of brandVoice.blockedTerms ?? []) {
    if (includesCaseInsensitive(content, term)) {
      issues.push(issue('brand.term_blocked', 'major', `Output contains blocked brand term: ${term}.`, term));
    }
  }
  return issues;
}

/**
 * Validates AI-generated output for production quality gates and synthetic monitoring.
 *
 * The validator is deterministic and Worker-safe. It checks structure, safety,
 * unresolved placeholders, prompt leakage, required chart/business facts, and
 * app-provided brand voice rules without storing raw private chart data.
 *
 * @param output - Generated text to validate.
 * @param config - App-specific validation requirements.
 * @returns A score, pass/fail flag, timestamp, and actionable issues.
 */
export function validateAiOutput(
  output: string,
  config: AiOutputValidationConfig = {},
): AiOutputValidationResult {
  const content = normalizeText(output);
  const forbiddenPhrases = [...DEFAULT_FORBIDDEN_PHRASES, ...(config.forbiddenPhrases ?? [])];
  const issues = [
    ...validateLength(content, config),
    ...validateSections(content, config.requiredSections),
    ...validateFacts(content, config.requiredFacts),
    ...validateForbiddenPhrases(content, forbiddenPhrases),
    ...validatePatterns(content),
    ...validateBrandVoice(content, config.brandVoice),
  ];
  const score = scoreIssues(issues);
  const passScore = config.passScore ?? DEFAULT_PASS_SCORE;

  return {
    passed: score >= passScore && !issues.some((entry) => entry.severity === 'critical'),
    score,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Convenience check for prompt or policy leakage in generated text.
 *
 * @param output - Generated text to inspect.
 */
export function hasPromptLeak(output: string): boolean {
  return Boolean(findFirstPattern(output, PROMPT_LEAK_PATTERNS));
}

/**
 * Convenience check for unresolved template placeholders in generated text.
 *
 * @param output - Generated text to inspect.
 */
export function hasUnresolvedPlaceholder(output: string): boolean {
  return Boolean(findFirstPattern(output, PLACEHOLDER_PATTERNS));
}

/**
 * Convenience check for unsafe medical, legal, financial, or guarantee language.
 *
 * @param output - Generated text to inspect.
 */
export function hasUnsafeAdvice(output: string): boolean {
  return Boolean(findFirstPattern(output, UNSAFE_ADVICE_PATTERNS));
}
