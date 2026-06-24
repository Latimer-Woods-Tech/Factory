// ---------------------------------------------------------------------------
// Atom Registry — canonical per-gate data spine.
//
// Maps each of the 64 Human Design gates to its I-Ching hexagram glyph,
// energy center, musical mode (for ElevenLabs Music prompt generation),
// forge-atmosphere theme (visual affinity), accent color, and gate name.
//
// All center-derived properties (musicalMode, forgeTheme, color) flow from
// CENTER_TO_MUSICAL_MODE / CENTER_TO_FORGE / CENTER_COLOR — the gate level
// adds only hexagram glyph and name on top of what geometry.ts already knows.
// ---------------------------------------------------------------------------

import type { CenterKey } from './geometry.js';
import { GATE_TO_CENTER } from './geometry.js';

// ── Types ─────────────────────────────────────────────────────────────────

/** Western modal scale — one per energy center, used to key music generation. */
export type MusicalMode =
  | 'Ionian'
  | 'Dorian'
  | 'Phrygian'
  | 'Lydian'
  | 'Mixolydian'
  | 'Aeolian'
  | 'Locrian'
  | 'Pentatonic';

/** Visual atmosphere theme — the six forge backgrounds. */
export type ForgeTheme = 'chronos' | 'eros' | 'aether' | 'lux' | 'phoenix' | 'self';

/** Full per-gate data atom. */
export interface AtomEntry {
  gate: number;
  gateName: string;
  /** Unicode I-Ching hexagram character (U+4DC0 + gate − 1). */
  hexagram: string;
  center: CenterKey;
  musicalMode: MusicalMode;
  forgeTheme: ForgeTheme;
  /** Hex accent color derived from the gate's center. */
  color: string;
}

// ── Center → derivative maps ───────────────────────────────────────────────

/**
 * Center → Western modal scale.
 *
 * Assignments reflect each center's core quality:
 * - Head/Ajna: Lydian — floating, inspired, otherworldly
 * - Throat/G:  Ionian — bright, manifesting, directed
 * - Heart:     Mixolydian — soulful, powerful, willful
 * - Sacral:    Dorian — earthy, sustaining, rolling life-force
 * - Spleen:    Phrygian — dark, instinctual, ancient immunity
 * - SP:        Aeolian — melancholic, wave-like emotion
 * - Root:      Locrian — pressured, tense grounding drive
 */
export const CENTER_TO_MUSICAL_MODE: Readonly<Record<CenterKey, MusicalMode>> = {
  Head:        'Lydian',
  Ajna:        'Lydian',
  Throat:      'Ionian',
  G:           'Ionian',
  Heart:       'Mixolydian',
  Sacral:      'Dorian',
  Spleen:      'Phrygian',
  SolarPlexus: 'Aeolian',
  Root:        'Locrian',
};

/** Center → forge atmosphere affinity. */
export const CENTER_TO_FORGE: Readonly<Record<CenterKey, ForgeTheme>> = {
  Head:        'aether',
  Ajna:        'chronos',
  Throat:      'lux',
  G:           'self',
  Heart:       'phoenix',
  Sacral:      'eros',
  Spleen:      'aether',
  SolarPlexus: 'eros',
  Root:        'chronos',
};

/** Center → accent hex color. */
export const CENTER_COLOR: Readonly<Record<CenterKey, string>> = {
  Head:        '#c8c8dc',  // pale silver — mental pressure
  Ajna:        '#7b6fd4',  // indigo — conceptualization
  Throat:      '#4a90d9',  // blue — expression
  G:           '#c9a84c',  // gold — identity / love / self
  Heart:       '#d94a6a',  // rose-red — will / ego
  Sacral:      '#e8923a',  // amber-orange — life force
  Spleen:      '#5db87a',  // green — immunity / instinct
  SolarPlexus: '#d4a832',  // amber-yellow — emotion / solar
  Root:        '#96714a',  // earth brown — grounding pressure
};

// ── Mode → ElevenLabs Music prompt descriptor ──────────────────────────────

/**
 * Short modal descriptor injected into the music generation prompt so
 * ElevenLabs Music produces a track with the correct harmonic character.
 */
export const MODE_DESCRIPTORS: Readonly<Record<MusicalMode, string>> = {
  Lydian:     'Lydian mode, dreamy and otherworldly, raised fourth gives a floating quality, airy and celestial, wonder and inspiration',
  Ionian:     'major scale, bright and clear, uplifting confidence, radiant and manifesting, directional warmth',
  Mixolydian: 'Mixolydian mode, bluesy and powerful, major with a flattened seventh, soulful and driving willpower',
  Dorian:     'Dorian mode, earthy and soulful, minor with a raised sixth, rolling and grounded, sustaining life-force',
  Phrygian:   'Phrygian mode, dark and instinctual, ancient and primal, tense but alive, visceral immunity',
  Aeolian:    'natural minor scale, melancholic and introspective, emotional depth, wave-like and yearning',
  Locrian:    'Locrian mode, dissonant and pressured, tense grounding force, primal urgency, earthbound drive',
  Pentatonic: 'pentatonic scale, universal and open, timeless and unadorned, clean resonance, pure will',
};

// ── Gate names (I-Ching hexagram titles in Human Design usage) ─────────────

const GATE_NAMES: Readonly<Record<number, string>> = {
  1:  'Self-Expression',
  2:  'Direction',
  3:  'Ordering',
  4:  'Formulization',
  5:  'Fixed Rhythms',
  6:  'Friction',
  7:  'The Role of the Self',
  8:  'Contribution',
  9:  'Focus',
  10: 'Behavior of the Self',
  11: 'Ideas',
  12: 'Caution',
  13: 'The Listener',
  14: 'Power Skills',
  15: 'Extremes',
  16: 'Skills',
  17: 'Opinions',
  18: 'Correction',
  19: 'Wanting',
  20: 'The Now',
  21: 'Biting Through',
  22: 'Openness',
  23: 'Assimilation',
  24: 'Rationalization',
  25: 'Spirit of the Self',
  26: 'The Egoist',
  27: 'Caring',
  28: 'Game Player',
  29: 'Perseverance',
  30: 'Recognition of Feelings',
  31: 'Influence',
  32: 'Continuity',
  33: 'Retreat',
  34: 'Power',
  35: 'Change',
  36: 'Crisis',
  37: 'Friendship',
  38: 'Opposition',
  39: 'Provocation',
  40: 'Aloneness',
  41: 'Contraction',
  42: 'Growth',
  43: 'Insight',
  44: 'Alertness',
  45: 'The Gatherer',
  46: 'Determination',
  47: 'Realization',
  48: 'Depth',
  49: 'Principles',
  50: 'Values',
  51: 'Initiative',
  52: 'Stillness',
  53: 'Beginnings',
  54: 'Ambition',
  55: 'Abundance',
  56: 'Stimulation',
  57: 'Intuitive Clarity',
  58: 'Vitality',
  59: 'Sexuality',
  60: 'Acceptance',
  61: 'Mystery',
  62: 'Details',
  63: 'Doubt',
  64: 'Confusion',
};

// ── Registry (computed, not hardcoded per gate) ────────────────────────────

/**
 * The full 64-gate Atom Registry.
 * Computed once at module load from GATE_TO_CENTER + the center-level maps.
 */
export const ATOM_REGISTRY: Readonly<Record<number, AtomEntry>> = Object.fromEntries(
  Array.from({ length: 64 }, (_, i) => {
    const gate = i + 1;
    const center = GATE_TO_CENTER[gate];
    return [
      gate,
      {
        gate,
        gateName:    GATE_NAMES[gate] ?? `Gate ${gate}`,
        hexagram:    String.fromCodePoint(0x4DC0 + gate - 1),
        center,
        musicalMode: CENTER_TO_MUSICAL_MODE[center],
        forgeTheme:  CENTER_TO_FORGE[center],
        color:       CENTER_COLOR[center],
      } satisfies AtomEntry,
    ];
  }),
);

/**
 * Look up the data atom for a single gate.
 * @throws {RangeError} if gate is outside 1–64.
 */
export function getAtom(gate: number): AtomEntry {
  const entry = ATOM_REGISTRY[gate];
  if (!entry) throw new RangeError(`Gate ${gate} is outside the valid range 1–64`);
  return entry;
}

/**
 * Derive the musical mode for a content brief's focus.
 * Falls back to 'Ionian' (G center default) when no gate or center is known.
 */
export function modeForGates(signatureGates: number[]): MusicalMode {
  if (signatureGates.length === 0) return 'Ionian';
  // Use the first signature gate's mode as the primary color.
  return getAtom(signatureGates[0]).musicalMode;
}
