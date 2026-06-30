/**
 * trackTokens.ts — the Learning Construct's visual language, as render-time tokens.
 *
 * Single source of truth for how the construct's TRACKS, DISCIPLINES and LEVELS are
 * denoted on screen, so per-track training videos (lower-thirds, bumpers, outros)
 * stay consistent with the in-app Learning Hub. Mirrors the taxonomy in the
 * Self: Prime app (`client/data/curriculum.js`): three tracks, nine disciplines,
 * four levels.
 *
 * Design rule (locked): equal *dignity*, not equal *volume*. COLOUR is reserved for
 * the three TRACKS only — it is wayfinding, not decoration. Disciplines are denoted
 * by LABEL (never their own colour, which would make some lenses louder than
 * others), and levels by a small four-pip progression. Calm, never childish.
 */

export type TrackId = 'app-mastery' | 'interpretive-literacy' | 'practitioner-formation';

export type DisciplineId =
  | 'energy-blueprint' | 'astrology' | 'psychometrics' | 'frequency-keys'
  | 'divination' | 'council' | 'timing' | 'synthesis' | 'business';

export type LevelId = 'foundation' | 'practice' | 'client-ready' | 'advanced';

export interface TrackToken {
  /** Door label as shown in the Hub. */
  label: string;
  /** Primary track colour (gradients, pills, bumper wash). */
  color: string;
  /** Brighter accent for highlights on the track colour. */
  accent: string;
  /** Readable foreground for text sitting on `color`. */
  onColor: string;
}

/**
 * The three doors. Colours are distinct but restrained:
 *   app-mastery            — calm teal (wayfinding / mechanics)
 *   interpretive-literacy  — brand gold (the understanding core)
 *   practitioner-formation — deep violet (craft); matches the app accent
 */
export const TRACK_TOKENS: Record<TrackId, TrackToken> = {
  'app-mastery': { label: 'Use the App', color: '#3f8fa0', accent: '#6fc3d2', onColor: '#ffffff' },
  'interpretive-literacy': { label: 'Understand Your Synthesis', color: '#c9a84c', accent: '#e6cf8c', onColor: '#1b1606' },
  'practitioner-formation': { label: 'Practice the Work', color: '#7d6cca', accent: '#a99af0', onColor: '#ffffff' },
};

/** Display labels for the nine lenses (denoted by label, never their own colour). */
export const DISCIPLINE_LABELS: Record<DisciplineId, string> = {
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

export interface LevelToken {
  label: string;
  /** 1-4 fill, used by the level-pip row (a quiet progression, not a "Level 7" badge). */
  step: number;
}

export const LEVEL_TOKENS: Record<LevelId, LevelToken> = {
  foundation: { label: 'Foundation', step: 1 },
  practice: { label: 'Practice', step: 2 },
  'client-ready': { label: 'Client-ready', step: 3 },
  advanced: { label: 'Advanced', step: 4 },
};

export const TRACK_IDS = Object.keys(TRACK_TOKENS) as TrackId[];
export const LEVEL_STEPS = 4;

/** Track token with a safe fallback so a bad/missing id never throws at render. */
export function trackToken(track: string | undefined): TrackToken {
  return TRACK_TOKENS[track as TrackId] ?? TRACK_TOKENS['interpretive-literacy'];
}

/** Discipline label with a graceful fallback (title-cased id). */
export function disciplineLabel(discipline: string | undefined): string {
  if (!discipline) return '';
  return DISCIPLINE_LABELS[discipline as DisciplineId]
    ?? discipline.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Level token with a graceful fallback. */
export function levelToken(level: string | undefined): LevelToken | null {
  return LEVEL_TOKENS[level as LevelId] ?? null;
}
