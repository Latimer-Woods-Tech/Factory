// ---------------------------------------------------------------------------
// @latimer-woods-tech/bodygraph — the canonical Energy Blueprint body-graph
// engine. A single, themeable, runtime-agnostic renderer that returns an SVG
// string. Pure TypeScript, zero runtime dependencies. Consumed by the film
// (video-studio) today; web + PDF migrate onto it in Phase 2.
//
// See docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md.
// ---------------------------------------------------------------------------

// The renderer + its input / option types.
export { renderBodyGraph } from './render.js';
export type {
  BodyGraphInput,
  BodyGraphOptions,
  GateActivation,
} from './render.js';

// The themeable design system.
export {
  DEFAULT_THEME,
  resolveTheme,
} from './theme.js';
export type {
  BodyGraphTheme,
  BodyGraphThemeInput,
  BadgeColors,
} from './theme.js';

// The geometry + structural data (so consumers can place motion / overlays).
export {
  CENTER_POS,
  CENTER_SIZE,
  CENTER_GATES,
  CENTER_LABELS,
  CENTER_ORDER,
  CHANNEL_LINES,
  GATE_TO_CENTER,
  VIEWBOX_WIDTH,
  VIEWBOX_HEIGHT,
  centerShapePoints,
} from './geometry.js';
export type {
  CenterKey,
  CenterShape,
  CenterPosition,
} from './geometry.js';

// The authentic per-gate badge layout (deterministic, collision-free) + the
// bbox helpers the collision test (and motion/overlay consumers) build on.
export {
  gateBadgeLayout,
  gatePosition,
  badgeBBox,
  centerShapeBBox,
  centerLabelBBox,
  boxesOverlap,
  BADGE_HALF_W,
  BADGE_HALF_H,
  BADGE_PADDING,
} from './layout.js';
export type {
  GatePosition,
  BBox,
} from './layout.js';

// The Atom Registry — per-gate data spine (hexagram, mode, forge, color).
export {
  ATOM_REGISTRY,
  GATE_KB_KEYS,
  CENTER_TO_MUSICAL_MODE,
  CENTER_TO_FORGE,
  CENTER_COLOR,
  MODE_DESCRIPTORS,
  getAtom,
  modeForGates,
} from './atom-registry.js';
export type {
  AtomEntry,
  MusicalMode,
  ForgeTheme,
} from './atom-registry.js';
