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
  /** Western modal scale for music generation (the "mode", center-derived). */
  musicalMode: MusicalMode;
  /**
   * Prose descriptor for {@link musicalMode} (see {@link MODE_DESCRIPTORS}).
   * Denormalized onto the atom so the mode carries its own description.
   */
  modeDescriptor: string;
  forgeTheme: ForgeTheme;
  /**
   * Prose descriptor for {@link forgeTheme} (see {@link FORGE_DESCRIPTORS}) —
   * the visual/sonic "fill" atmosphere, the sibling of {@link modeDescriptor}.
   */
  forgeDescriptor: string;
  /** Hex accent color derived from the gate's center. */
  color: string;
  /**
   * Knowledge-base keyword seeds: [signal, frequency, shadow, archetype].
   * Sourced from gates.json (Gene Keys triad) in the HumanDesign KB.
   * Used as seeded randomizers for LLM script generation and SEO metadata.
   */
  kbKeys: [string, string, string, string];
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

// ── Forge → "fill" atmosphere descriptor ───────────────────────────────────

/**
 * Short forge-atmosphere descriptor for the visual/sonic "fill" of each forge
 * theme — the sibling of {@link MODE_DESCRIPTORS}. Where the mode is induced by
 * the reading's gates (via center → {@link CENTER_TO_MUSICAL_MODE}), the fill is
 * induced by the same HD elements via center → {@link CENTER_TO_FORGE}. Injected
 * into the music-generation prompt alongside the mode descriptor (kept in sync
 * with FORGE_ATMOSPHERE in apps/video-studio/scripts/generate-music.mjs, which
 * runs in Node and cannot import the built package).
 */
export const FORGE_DESCRIPTORS: Readonly<Record<ForgeTheme, string>> = {
  chronos: 'minimalist neoclassical, contemplative piano and strings, slow clockwork pulse, restrained and spacious',
  eros:    'warm romantic ambient, solo cello and soft strings, tender and intimate, lush reverb',
  aether:  'ethereal ambient, airy shimmering pads, glassy bell textures, floating drone with subtle movement',
  lux:     'luminous cinematic ambient, slowly rising warm strings, soft glockenspiel, hopeful and radiant',
  phoenix: 'epic cinematic underscore, swelling strings and low brass, slow crescendo, sense of rebirth',
  self:    'ambient cinematic underscore, warm analog synth pad, intimate and grounded, gentle felt piano',
};

// ── Gate KB keys [signal, frequency, shadow, archetype] ───────────────────
// Sourced from HumanDesign/src/knowledgebase/genekeys/keys.json.
// Tuple order: Gift · Siddhi · Shadow · Archetype (without "The ").

export const GATE_KB_KEYS: Readonly<Record<number, [string, string, string, string]>> = {
  1:  ['Origination',   'Radiance',      'Stagnation',     'Creator'],
  2:  ['Navigation',    'Communion',     'Drift',          'Driver'],
  3:  ['Emergence',     'Renewal',       'Turbulence',     'Innovator'],
  4:  ['Translation',   'Grace',         'Rigidity',       'Universal Mind'],
  5:  ['Attunement',    'Presence',      'Friction',       'Timekeeper'],
  6:  ['Attunement',    'Serenity',      'Friction',       'Peacemaker'],
  7:  ['Direction',     'Emanation',     'Manipulation',   'Guide'],
  8:  ['Origination',   'Radiance',      'Conformity',     'Diamond'],
  9:  ['Momentum',      'Sovereignty',   'Paralysis',      'Gatherer'],
  10: ['Authenticity',  'Presence',      'Fixation',       'Natural'],
  11: ['Vision',        'Radiance',      'Fog',            'Idealist'],
  12: ['Articulation',  'Transmission',  'Performance',    'Speaker'],
  13: ['Attunement',    'Communion',     'Deafness',       'Listener'],
  14: ['Mastery',       'Emanation',     'Depletion',      'Master'],
  15: ['Rhythm',        'Radiance',      'Stagnation',     'Magnet'],
  16: ['Cultivation',   'Embodiment',    'Drift',          'Enthusiast'],
  17: ['Navigation',    'Omnipresence',  'Fixation',       'Seer'],
  18: ['Refinement',    'Wholeness',     'Corrosion',      'Healer'],
  19: ['Attunement',    'Communion',     'Enmeshment',     'Sensitive'],
  20: ['Grounding',     'Omnipresence',  'Scatter',        'Present One'],
  21: ['Stewardship',   'Sovereignty',   'Grip',           'Leader'],
  22: ['Transparency',  'Radiance',      'Contamination',  'Graceful'],
  23: ['Translation',   'Distillation',  'Fragmentation',  'Simplifier'],
  24: ['Crystallization','Stillness',    'Fixation',       'Inventor'],
  25: ['Presence',      'Radiance',      'Armor',          'Mystic'],
  26: ['Precision',     'Transparency',  'Inflation',      'Trickster'],
  27: ['Nourishment',   'Abundance',     'Depletion',      'Nurturer'],
  28: ['Commitment',    'Presence',      'Drift',          'Player'],
  29: ['Perseverance',  'Surrender',     'Scatter',        'Devotee'],
  30: ['Buoyancy',      'Radiance',      'Friction',       'Burning'],
  31: ['Guidance',      'Grace',         'Rigidity',       'Alpha'],
  32: ['Continuity',    'Reverence',     'Paralysis',      'Ancestor'],
  33: ['Presence',      'Illumination',  'Drift',          'Witness'],
  34: ['Vitality',      'Sovereignty',   'Strain',         'Natural'],
  35: ['Vitality',      'Omnipresence',  'Depletion',      'Explorer'],
  36: ['Vulnerability', 'Grace',         'Turbulence',     'Humanitarian'],
  37: ['Reciprocity',   'Communion',     'Bargaining',     'Family'],
  38: ['Resilience',    'Grace',         'Friction',       'Warrior'],
  39: ['Momentum',      'Emanation',     'Turbulence',     'Provocateur'],
  40: ['Restoration',   'Surrender',     'Depletion',      'Solitary'],
  41: ['Incubation',    'Radiance',      'Drift',          'Mystic'],
  42: ['Release',       'Reverence',     'Projection',     'Completer'],
  43: ['Attunement',    'Revelation',    'Static',         'Breakthrough'],
  44: ['Weaving',       'Communion',     'Friction',       'Alchemist'],
  45: ['Distribution',  'Abundance',     'Hoarding',       'Gatherer'],
  46: ['Savoring',      'Ascension',     'Burden',         'Ascender'],
  47: ['Alchemy',       'Illumination',  'Compression',    'Alchemist'],
  48: ['Wellspring',    'Omnipresence',  'Depletion',      'Well'],
  49: ['Catalysis',     'Renewal',       'Isolation',      'Alchemist'],
  50: ['Calibration',   'Resonance',     'Distortion',     'Guardian'],
  51: ['Momentum',      'Revelation',    'Turbulence',     'Thunderbolt'],
  52: ['Focus',         'Equanimity',    'Pressure',       'Mountain'],
  53: ['Renewal',       'Regeneration',  'Stagnation',     'Evolver'],
  54: ['Drive',         'Liberation',    'Hunger',         'Serpent Path'],
  55: ['Liberation',    'Omnipresence',  'Paralysis',      'Dragonfly'],
  56: ['Weaving',       'Emanation',     'Scatter',        'Storyteller'],
  57: ['Attunement',    'Transparency',  'Hypervigilance', 'Oracle'],
  58: ['Aliveness',     'Radiance',      'Depletion',      'Vitalizer'],
  59: ['Vulnerability', 'Dissolution',   'Armor',          'Intimate'],
  60: ['Resourcefulness','Equilibrium',  'Constriction',   'Master'],
  61: ['Emergence',     'Reverence',     'Fracture',       'Holy Fool'],
  62: ['Articulation',  'Omnipresence',  'Fragmentation',  'Wordsmith'],
  63: ['Penetration',   'Stillness',     'Turbulence',     'Questioner'],
  64: ['Weaving',       'Coherence',     'Scatter',        'Visionary'],
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
    // Every gate 1-64 is present in GATE_TO_CENTER — the ! is safe.
    const center = GATE_TO_CENTER[gate]!;
    return [
      gate,
      {
        gate,
        gateName:    GATE_NAMES[gate] ?? `Gate ${gate}`,
        hexagram:    String.fromCodePoint(0x4DC0 + gate - 1),
        center,
        musicalMode:     CENTER_TO_MUSICAL_MODE[center],
        modeDescriptor:  MODE_DESCRIPTORS[CENTER_TO_MUSICAL_MODE[center]],
        forgeTheme:      CENTER_TO_FORGE[center],
        forgeDescriptor: FORGE_DESCRIPTORS[CENTER_TO_FORGE[center]],
        color:           CENTER_COLOR[center],
        // GATE_KB_KEYS covers all 64 gates — the ! is safe.
        kbKeys:      GATE_KB_KEYS[gate]!,
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
  const first = signatureGates[0];
  if (first === undefined) return 'Ionian';
  return getAtom(first).musicalMode;
}
