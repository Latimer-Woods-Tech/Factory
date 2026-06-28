// ---------------------------------------------------------------------------
// Energy Blueprint composition — pure types + constants (no React, no Remotion)
//
// This module is deliberately free of React/Remotion/Node imports so it can be
// consumed by the pure `chartToScenes` mapper and the blueprint segment
// renderer and unit-tested anywhere (Workers, Node, jsdom-less Vitest). The
// Remotion composition imports the same constants/types so there is a single
// source of truth for HD-type colours, forge themes, and the scene shape.
// ---------------------------------------------------------------------------

/**
 * Human Design energy type. Drives the body-graph glow colour and the framing
 * of the arrival/invitation copy (doc §2). Additive: never remove a member.
 */
export type HdType =
  | 'generator'
  | 'manifesting_generator'
  | 'projector'
  | 'manifestor'
  | 'reflector';

/**
 * Atmospheric background theme for the composition. `self` (pure deep space) is
 * the default; the others tint the {@link "./components/ForgeAtmosphere"} layer.
 */
export type ForgeTheme =
  | 'chronos'
  | 'eros'
  | 'aether'
  | 'lux'
  | 'phoenix'
  | 'self';

/**
 * The kind of a single scene in the Energy Blueprint arc.
 *
 * - `arrival` — pure atmosphere open, no text.
 * - `revelation` — single large line of kinetic text.
 * - `concept` — narration text beside the body graph.
 * - `breath` — silent body-graph hold (pacing beat).
 * - `triad` — shadow → gift → siddhi reveal.
 * - `invitation` — closing line + logo.
 */
export type SceneType =
  | 'arrival'
  | 'revelation'
  | 'concept'
  | 'breath'
  | 'triad'
  | 'invitation';

/**
 * A single scene definition consumed by the composition. Matches the
 * `blueprintSchema.scenes` element exactly so {@link BlueprintScene}`[]` is
 * assignable to `EnergyBlueprintProps['scenes']`.
 */
export interface BlueprintScene {
  /** Which scene variant to render. */
  type: SceneType;
  /** Duration of this scene in frames (30fps). */
  durationFrames: number;
  /** Narration / display text for text-bearing scenes. */
  text?: string;
  /** `[shadow, gift, siddhi]` — only used in `triad` scenes. */
  triad?: [string, string, string];
  /** Whether the body graph is shown in this scene. */
  showBodyGraph: boolean;
  /** Defined-centre keys to light up (e.g. `['G','Throat']`). */
  definedCenters?: string[];
  /** Per-scene override of the type glow colour. */
  typeColor?: string;
  /**
   * The center to visually spotlight on this scene — rendered with an
   * intensified halo so the viewer's eye is drawn to the gate's home center.
   * Gate concept scenes set this to the gate's center key.
   */
  spotlightCenter?: string;
}

/**
 * HD energy type → body-graph glow colour. Shared by the composition and the
 * {@link "./chartToScenes"} mapper so a single palette governs both.
 */
export const TYPE_COLORS: Record<HdType, string> = {
  generator: '#e8923a',
  manifesting_generator: '#d4742a',
  projector: '#7b6fd4',
  manifestor: '#c42b2b',
  reflector: '#b8d4e8',
};

/** Default brand accent colour (selfprime gold). */
export const DEFAULT_BRAND_COLOR = '#c9a84c';

/**
 * Per-type visual/sonic register for the hero film. Each HD type gets its own
 * "feel" so a Manifestor film reads differently from a Reflector's — the forge
 * background mood, a default theatrical narrator voice, and a pacing multiplier
 * applied to reveal timing. Music *mode* stays gate-derived (more personal);
 * this governs the film-level register. Consumed by `chartToScenes` /
 * `derive-blueprint-props` when assembling the hero props.
 *
 * voiceId defaults to a deep narrator ("George" — captivating storyteller),
 * replacing the prior generic voice; override per operator preference.
 */
export interface TypeRegister {
  /** Background forge theme that sets the film's overall mood. */
  forge: ForgeTheme;
  /** Default ElevenLabs narrator voice id for this type. */
  voiceId: string;
  /** Reveal-timing pace multiplier (>1 = quicker, <1 = more spacious). */
  pace: number;
}

/** Current STANDARD narrator (operator-chosen): Vivie — powerful, commanding
 *  (the Angela Bassett register). Brian remains in the rotation pool. */
export const STANDARD_VOICE_ID = 'z7U1SjrEq4fDDDriOQEN';

/**
 * Rotation pool — the narrator is randomised/rotated across these per render so
 * the films don't all sound identical. Brian is the standard/default; Michelle
 * (soulful, in the Maya Angelou register) and Vivie (commanding, Angela Bassett
 * register) add range. Operator can reweight or pin via {@link pickVoice}.
 */
export const VOICE_POOL: ReadonlyArray<{ name: string; id: string }> = [
  { name: 'Brian',        id: 'nPczCjzI2devNBz1zQrb' }, // deep, resonant (standard, male)
  { name: 'Michelle',     id: 'BeKZH03brdNaVyYtd97H' }, // soulful, African American (Maya Angelou)
  { name: 'Vivie',        id: 'z7U1SjrEq4fDDDriOQEN' }, // powerful, commanding (Angela Bassett)
  { name: 'Cate',         id: 'J64VNrjLE6uKFBKlxfSJ' }, // resonant, deep, elegant (Jessica Lange)
  { name: 'EtherealHusk', id: 'jpUA5miJyO2ygonZPVsO' }, // gravely, atmospheric (Frances Conroy)
  { name: 'Karolina',     id: 'Wuv1s5YTNCjL9mFJTqo4' }, // Latina — warm, deep
  { name: 'Mona',         id: 'mKn4iVyn09DrJ8cFw5Rn' }, // Desi (Indian) — deep, sophisticated
  { name: 'Seeta',        id: 'QKyvRuehpb8zB3cRkzIn' }, // Desi (Telugu) — rich narrator
  { name: 'Eunha',        id: 'cBOtnpVZNlQ5VJygXGB8' }, // Korean (Seoul) — elegant
  { name: 'Colleen',      id: '1OYA2kgM85gF2eGN8HEp' }, // Celtic (Irish) — warm narrator
];

/**
 * Pick the narrator voice for a render. Pass a numeric `seed` (e.g. a hash of
 * the videoObjectId) to rotate deterministically across {@link VOICE_POOL};
 * omit it to use the standard voice (Brian). The narration generator calls this
 * so each render can vary while staying reproducible.
 */
export function pickVoice(seed?: number): string {
  if (seed == null || !Number.isFinite(seed)) return STANDARD_VOICE_ID;
  // Modulo keeps the index in range; the `!` reflects that to the compiler.
  return VOICE_POOL[Math.abs(Math.trunc(seed)) % VOICE_POOL.length]!.id;
}

// Per-type forge/pace; voice defaults to the standard (rotation via pickVoice).
export const TYPE_REGISTRY: Record<HdType, TypeRegister> = {
  projector:             { forge: 'lux',     voiceId: STANDARD_VOICE_ID, pace: 1.0 },
  manifestor:            { forge: 'phoenix', voiceId: STANDARD_VOICE_ID, pace: 1.08 },
  generator:             { forge: 'eros',    voiceId: STANDARD_VOICE_ID, pace: 1.0 },
  manifesting_generator: { forge: 'eros',    voiceId: STANDARD_VOICE_ID, pace: 1.05 },
  reflector:             { forge: 'aether',  voiceId: STANDARD_VOICE_ID, pace: 0.92 },
};
