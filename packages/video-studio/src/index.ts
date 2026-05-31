// ---------------------------------------------------------------------------
// @latimer-woods-tech/video-studio — Energy Blueprint Video Engine composition
// library (I1 Slice 1). See docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md.
//
// The pure mapper + shared types/constants are exported here. The Remotion
// composition, its scene components, the Root registration, the render
// entrypoint, and the blueprint segment renderer are added (Deliverables 2–3)
// alongside these exports so consumers import everything from one place.
// ---------------------------------------------------------------------------

export type {
  HdType,
  ForgeTheme,
  SceneType,
  BlueprintScene,
} from './blueprint-types.js';
export { TYPE_COLORS, DEFAULT_BRAND_COLOR } from './blueprint-types.js';

export type { BlueprintSegmentData } from './chartToScenes.js';
export { chartToScenes, deriveForgeTheme } from './chartToScenes.js';
