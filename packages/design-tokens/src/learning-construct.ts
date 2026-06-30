/**
 * Learning Construct denotation tokens — the cross-surface visual language for the
 * Self: Prime Learning Construct (tracks · disciplines · levels).
 *
 * This is the SINGLE SOURCE OF TRUTH for how the construct is denoted on screen, so
 * the in-app Learning Hub, per-track training videos (lower-thirds, bumpers), and
 * PDFs all read the same colours and labels. Runtime-agnostic and dependency-free.
 *
 * Design rule (locked): equal *dignity*, not equal *volume*. COLOUR is reserved for
 * the three TRACKS only — it is wayfinding, not decoration. Disciplines are denoted
 * by LABEL (never their own colour, which would make some lenses louder than
 * others); levels by a small four-step progression. Calm, never childish.
 *
 * Mirrors the taxonomy in the Self: Prime app's curriculum registry
 * (`client/data/curriculum.js`).
 *
 * @example
 * import { trackToken, disciplineLabel } from '@latimer-woods-tech/design-tokens';
 * const { color, label } = trackToken('practitioner-formation');
 */

/** The three doors of the Learning Hub. */
export type TrackId = 'app-mastery' | 'interpretive-literacy' | 'practitioner-formation';

/** The nine lenses the synthesis is built from. */
export type DisciplineId =
  | 'energy-blueprint' | 'astrology' | 'psychometrics' | 'frequency-keys'
  | 'divination' | 'council' | 'timing' | 'synthesis' | 'business';

/** The four difficulty rungs. */
export type LevelId = 'foundation' | 'practice' | 'client-ready' | 'advanced';

/** Visual token for one track — the only construct axis that carries colour. */
export interface TrackToken {
  /** Door label, as shown in the Hub. */
  label: string;
  /** Primary track colour (gradients, pills, bumper wash). */
  color: string;
  /** Brighter accent for highlights on the track colour. */
  accent: string;
  /** Readable foreground for text sitting on `color` (WCAG-aware). */
  onColor: string;
}

/**
 * The three doors. Colours are distinct but restrained:
 *   app-mastery            — calm teal (wayfinding / mechanics)
 *   interpretive-literacy  — brand gold (the understanding core)
 *   practitioner-formation — deep violet (craft; matches the app accent)
 */
export const trackTokens: Record<TrackId, TrackToken> = {
  'app-mastery': { label: 'Use the App', color: '#3f8fa0', accent: '#6fc3d2', onColor: '#ffffff' },
  'interpretive-literacy': { label: 'Understand Your Synthesis', color: '#c9a84c', accent: '#e6cf8c', onColor: '#1b1606' },
  'practitioner-formation': { label: 'Practice the Work', color: '#7d6cca', accent: '#a99af0', onColor: '#ffffff' },
};

/** Display labels for the nine lenses (denoted by label, never their own colour). */
export const disciplineLabels: Record<DisciplineId, string> = {
  'energy-blueprint': 'Energy Blueprint',
  astrology: 'Astrology',
  psychometrics: 'Psychometrics',
  'frequency-keys': 'Frequency Keys',
  divination: 'Divination',
  council: 'Council',
  timing: 'Timing',
  synthesis: 'Synthesis',
  business: 'Practice & Craft',
};

/** Visual token for one level — a quiet 1-4 progression, never a "Level 7" badge. */
export interface LevelToken {
  label: string;
  /** 1-4 fill, used by the level-pip row. */
  step: number;
}

export const levelTokens: Record<LevelId, LevelToken> = {
  foundation: { label: 'Foundation', step: 1 },
  practice: { label: 'Practice', step: 2 },
  'client-ready': { label: 'Client-ready', step: 3 },
  advanced: { label: 'Advanced', step: 4 },
};

/** Canonical track order. */
export const trackIds = Object.keys(trackTokens) as TrackId[];

/** Number of level steps (for pip rows). */
export const levelSteps = 4;

/**
 * Track token with a safe fallback, so a bad/missing id never throws at render.
 * @param track - a {@link TrackId}, or any string (falls back to interpretive-literacy)
 */
export function trackToken(track: string | undefined): TrackToken {
  return trackTokens[track as TrackId] ?? trackTokens['interpretive-literacy'];
}

/**
 * Discipline label with a graceful fallback (title-cased id).
 * @param discipline - a {@link DisciplineId}, or any string
 */
export function disciplineLabel(discipline: string | undefined): string {
  if (!discipline) return '';
  return disciplineLabels[discipline as DisciplineId]
    ?? discipline.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Level token with a graceful fallback (null for an unknown level).
 * @param level - a {@link LevelId}, or any string
 */
export function levelToken(level: string | undefined): LevelToken | null {
  return levelTokens[level as LevelId] ?? null;
}

/** All Learning Construct denotation tokens, as one object (parity with `tokens`). */
export const learningConstruct = {
  trackTokens,
  disciplineLabels,
  levelTokens,
  trackIds,
  levelSteps,
} as const;
