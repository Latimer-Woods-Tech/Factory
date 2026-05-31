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
