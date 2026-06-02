// ---------------------------------------------------------------------------
// @latimer-woods-tech/video-studio — Energy Blueprint Video Engine composition
// library (I1 Slices 1–3). See docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md.
//
// Single import surface for the composition, schema/props, the pure
// blueprint/source scene mappers, all segment renderers, the registry, the
// film assembler, the Remotion Root, and shared types/constants. The Cloud Run
// render service and `apps/video-studio` both consume from here.
// ---------------------------------------------------------------------------

// Shared pure types + constants (single source of truth).
export type {
  HdType,
  ForgeTheme,
  SceneType,
  BlueprintScene,
} from './blueprint-types.js';
export { TYPE_COLORS, DEFAULT_BRAND_COLOR } from './blueprint-types.js';

// Pure blueprint → scenes mappers.
export type { BlueprintSegmentData } from './chartToScenes.js';
export { chartToScenes, chartToBodyScenes, deriveForgeTheme } from './chartToScenes.js';

// The Remotion composition + its zod schema / inferred props.
export type { EnergyBlueprintProps } from './compositions/EnergyBlueprintVideo.js';
export {
  EnergyBlueprintVideo,
  blueprintSchema,
} from './compositions/EnergyBlueprintVideo.js';

// Segment renderers — one per VideoSource (Slice 1 = blueprint; Slice 3 = rest).
export type { BlueprintSourceData } from './blueprintSegment.js';
export { renderBlueprintSegment, buildBlueprintProps } from './blueprintSegment.js';

export type { TransitsSegmentData } from './transitsSegment.js';
export { renderTransitsSegment } from './transitsSegment.js';

export type { DreamJournalSegmentData } from './dreamJournalSegment.js';
export { renderDreamJournalSegment } from './dreamJournalSegment.js';

export type { MilestonesSegmentData } from './milestonesSegment.js';
export { renderMilestonesSegment } from './milestonesSegment.js';

export type { PersonalitySegmentData } from './personalitySegment.js';
export { renderPersonalitySegment } from './personalitySegment.js';

// Source → renderer registry (Slice 3).
export { SEGMENT_REGISTRY, getRenderer } from './segmentRegistry.js';

// Pure source scene mappers + film assembler (Slice 3).
export type { FilmBookendOptions } from './sourceScenes.js';
export {
  transitsToBodyScenes,
  dreamJournalToBodyScenes,
  milestonesToBodyScenes,
  personalityToBodyScenes,
  assembleFilmScenes,
  totalDurationFrames,
} from './sourceScenes.js';

// Remotion Root registration + render dimensions (consumed by the render
// service / app bundlers).
export {
  EnergyBlueprintRoot,
  VIDEO_FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  ENERGY_BLUEPRINT_FRAMES,
} from './Root.js';
