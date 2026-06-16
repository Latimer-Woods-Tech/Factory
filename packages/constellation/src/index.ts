// ---------------------------------------------------------------------------
// @latimer-woods-tech/constellation — the personal-sky renderer + data catalogs.
//
// A pure, runtime-agnostic SVG-string generator (no DOM, no Node built-ins).
// Parallel to @latimer-woods-tech/bodygraph: bodygraph = the body (microcosm);
// constellation = the sky (macrocosm). Consumed by web, video-studio (Remotion),
// and PDF surfaces. Deterministic from a seed — every person's sky is unique
// but stable across renders.
// ---------------------------------------------------------------------------

// The renderer + its input/output types.
export { renderConstellation, __constellationInternals } from './renderer.js';
export type {
  ForgeKey,
  ThemeKey,
  SpectralClass,
  StarRole,
  StarData,
  FocusNode,
  ConstellationInput,
} from './renderer.js';

// Fixed-star catalog + conjunction matching.
export { FIXED_STARS, SPECTRAL_COLOR, magTier, activeFixedStars } from './data/fixed-stars.js';
export type { FixedStar, ActiveFixedStar, AstroChart } from './data/fixed-stars.js';

// Celestial bodies (planets, luminaries, angles) + theme grouping.
export { CELESTIAL_BODIES, BODY_ORDER, bodiesByTheme } from './data/celestial-bodies.js';
export type { CelestialBody, BodyKey, BodyChart } from './data/celestial-bodies.js';

// Transit pulse — the living sky (which themes are lit tonight).
export { activeTransitThemes, pulseThemes, transitCaption } from './data/transit-pulse.js';
export type {
  TransitAspect,
  TransitData,
  TransitHit,
  TransitCaption,
} from './data/transit-pulse.js';

// Feng Shui / Eight Mansions + Wu Xing lens.
export {
  kuaNumber,
  eightMansions,
  fengShuiByTheme,
  fengShuiElementOnly,
  WU_XING,
} from './data/feng-shui.js';
export type {
  WuXingKey,
  WuXingElement,
  MansionEntry,
  EightMansionsResult,
  FengShuiInsight,
  BirthData,
} from './data/feng-shui.js';
