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

const VOICE_STORYTELLER = 'JBFqnCBsd6RMkjVDRZzb'; // George — warm captivating storyteller
const VOICE_DEEP = 'nPczCjzI2devNBz1zQrb';        // Brian — deep, resonant
const VOICE_ORACLE = 'pqHfZKP75CvOlQylNhV4';      // Bill — wise, mature

export const TYPE_REGISTRY: Record<HdType, TypeRegister> = {
  projector:             { forge: 'lux',     voiceId: VOICE_STORYTELLER, pace: 1.0 },
  manifestor:            { forge: 'phoenix', voiceId: VOICE_DEEP,        pace: 1.08 },
  generator:             { forge: 'eros',    voiceId: VOICE_STORYTELLER, pace: 1.0 },
  manifesting_generator: { forge: 'eros',    voiceId: VOICE_DEEP,        pace: 1.05 },
  reflector:             { forge: 'aether',  voiceId: VOICE_ORACLE,      pace: 0.92 },
};
