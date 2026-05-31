// ---------------------------------------------------------------------------
// @latimer-woods-tech/video-studio — Energy Blueprint Video Engine composition
// library (I1 Slice 1). See docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md.
//
// Single import surface for the composition, its schema/props, the pure
// blueprint -> scenes mapper, the blueprint segment renderer, the Remotion Root
// registration, the render entrypoint, and the shared types/constants. The
// Cloud Run render service (Wave 2) and `apps/video-studio` both consume from
// here.
// ---------------------------------------------------------------------------

// Shared pure types + constants (single source of truth).
export type {
  HdType,
  ForgeTheme,
  SceneType,
  BlueprintScene,
} from './blueprint-types.js';
export { TYPE_COLORS, DEFAULT_BRAND_COLOR } from './blueprint-types.js';

// Pure blueprint -> scenes mapper.
export type { BlueprintSegmentData } from './chartToScenes.js';
export { chartToScenes, deriveForgeTheme } from './chartToScenes.js';

// The Remotion composition + its zod schema / inferred props.
export type { EnergyBlueprintProps } from './compositions/EnergyBlueprintVideo.js';
export {
  EnergyBlueprintVideo,
  blueprintSchema,
} from './compositions/EnergyBlueprintVideo.js';

// Remotion Root registration + render dimensions (consumed by the render
// service / app bundlers).
export {
  EnergyBlueprintRoot,
  VIDEO_FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  ENERGY_BLUEPRINT_FRAMES,
} from './Root.js';
