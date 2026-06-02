/**
 * The body-graph renderer — returns an SVG string (runtime-agnostic).
 *
 * Design contract (honored exactly):
 * - Center shapes, gate badges, and gate NUMBERS are ALWAYS razor-sharp. The
 *   soft halo behind a defined center is a *separate blurred layer rendered
 *   under* the crisp shape, so the glow never softens the number or the edge.
 * - Defined channels (both ends defined) are lit in the accent (thicker,
 *   brighter); undefined channels stay quiet.
 * - Open centers get a quiet clean outline.
 *
 * @module render
 */

import {
  CENTER_GATES,
  CENTER_LABELS,
  CENTER_ORDER,
  CENTER_POS,
  CENTER_SIZE,
  CHANNEL_LINES,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  centerShapePoints,
  type CenterKey,
  type CenterPosition,
} from './geometry.js';
import { gatePosition } from './layout.js';
import { resolveTheme, type BadgeColors, type BodyGraphThemeInput, type BodyGraphTheme } from './theme.js';

/** Per-gate activation flags. */
export interface GateActivation {
  /** Conscious (personality) activation. */
  readonly personality?: boolean;
  /** Unconscious (design) activation. */
  readonly design?: boolean;
}

/** Input chart data for {@link renderBodyGraph}. */
export interface BodyGraphInput {
  /** Center keys that are defined (e.g. `['G','Throat','Ajna']`). */
  readonly definedCenters: string[];
  /**
   * Per-gate activation map. When present, drives badge colors precisely
   * (personality / design / both).
   */
  readonly gateActivations?: Record<number, GateActivation>;
  /**
   * Fallback when {@link gateActivations} is absent: these gates are marked
   * active (treated as personality+design / "both") so the film works with its
   * current `signatureGates`-only data.
   */
  readonly signatureGates?: number[];
  /** Gates currently in transit; colored with the transit badge. */
  readonly transitGates?: number[];
}

/** Render-time options. */
export interface BodyGraphOptions {
  /** Draw gate-number badges around each center. Default `true`. */
  readonly showGateBadges?: boolean;
  /** Render the soft halo behind defined centers (film "glow"). Default `true`. */
  readonly glow?: boolean;
  /**
   * Emit `data-*` interaction hooks on centers / channels / gates (web).
   * Default `false`.
   */
  readonly interactiveAttrs?: boolean;
  /**
   * Suffix appended to all generated gradient / filter `id`s so multiple SVGs
   * can coexist on one page without id collisions. Default `''`.
   */
  readonly idSuffix?: string;
  /**
   * Centers to render with an intensified spotlight halo. A center in
   * `spotlightCenters` that is also in `definedCenters` receives a larger,
   * brighter bloom — the blur radius and opacity on the halo layer are both
   * boosted so the viewer's eye is drawn to the gate's home center. Kept
   * subtle (accent, not replacement) by design. Array for forward-compat;
   * gate-concept scenes supply exactly one entry.
   */
  readonly spotlightCenters?: string[];
}

/** @internal Escape a string for safe use inside an SVG attribute value. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @internal Round to 2dp and drop trailing zeros for compact, stable SVG. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** @internal Build the `<defs>` block (gradients + halo blur filter). */
function buildDefs(theme: BodyGraphTheme, idSuffix: string, glow: boolean): string {
  const sheenId = `bg-sheen${idSuffix}`;
  const blurId = `bg-halo${idSuffix}`;
  const spotBlurId = `bg-halo-spot${idSuffix}`;
  const sheen =
    `<linearGradient id="${sheenId}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${esc(theme.accentStrong)}" stop-opacity="0.95"/>` +
    `<stop offset="100%" stop-color="${esc(theme.accent)}" stop-opacity="0.85"/>` +
    `</linearGradient>`;
  const halo = glow
    ? `<filter id="${blurId}" x="-80%" y="-80%" width="260%" height="260%">` +
      `<feGaussianBlur stdDeviation="5"/></filter>` +
      // Spotlight filter: doubled blur radius + extra spread for the accent center.
      `<filter id="${spotBlurId}" x="-120%" y="-120%" width="340%" height="340%">` +
      `<feGaussianBlur stdDeviation="10"/></filter>`
    : '';
  return `<defs>${sheen}${halo}</defs>`;
}

/**
 * @internal Draw the soft blurred halo layer for a defined center (under the
 * crisp shape). When `isSpotlight` is true the halo uses the spotlight filter
 * (doubled blur radius) and higher opacity so the center visually pops as the
 * gate's home. Kept subtle — accent, not replacement.
 */
function drawHalo(
  pos: CenterPosition,
  theme: BodyGraphTheme,
  blurId: string,
  spotBlurId: string,
  isSpotlight: boolean,
): string {
  const filterId = isSpotlight ? spotBlurId : blurId;
  const opacity = isSpotlight ? '0.72' : '0.45';
  const extraSize = isSpotlight ? 6 : 3;
  const shape = centerShapePoints(pos, CENTER_SIZE + extraSize);
  const fill = esc(theme.glow);
  if ('rect' in shape) {
    const { x, y, w, h } = shape.rect;
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="5" fill="${fill}" opacity="${opacity}" filter="url(#${filterId})"/>`;
  }
  return `<polygon points="${shape.points}" fill="${fill}" opacity="${opacity}" filter="url(#${filterId})"/>`;
}

/** @internal Draw the crisp center shape (defined uses sheen gradient + accent stroke). */
function drawCenterShape(
  pos: CenterPosition,
  isDefined: boolean,
  theme: BodyGraphTheme,
  sheenId: string,
): string {
  const fill = isDefined ? `url(#${sheenId})` : esc(theme.openColor);
  const stroke = isDefined ? esc(theme.definedStroke) : esc(theme.openStroke);
  const fillOpacity = isDefined ? '1' : '0.06';
  const shape = centerShapePoints(pos);
  if ('rect' in shape) {
    const { x, y, w, h } = shape.rect;
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
  return `<polygon points="${shape.points}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="1.5"/>`;
}

/** @internal Draw the crisp center label. */
function drawCenterLabel(center: CenterKey, pos: CenterPosition, isDefined: boolean, theme: BodyGraphTheme): string {
  const fill = isDefined ? esc(theme.definedLabel) : esc(theme.openColor);
  const opacity = isDefined ? '1' : '0.7';
  return `<text x="${n(pos.x)}" y="${n(pos.y + 4)}" text-anchor="middle" fill="${fill}" fill-opacity="${opacity}" font-family="${esc(theme.font)}" font-size="7" font-weight="700" pointer-events="none">${esc(CENTER_LABELS[center])}</text>`;
}

/** @internal Draw one channel line. */
function drawChannel(
  key: string,
  from: CenterPosition,
  to: CenterPosition,
  isActive: boolean,
  theme: BodyGraphTheme,
  interactiveAttrs: boolean,
): string {
  const color = isActive ? esc(theme.channelActive) : esc(theme.channelInactive);
  const width = isActive ? 2.5 : 1;
  const opacity = isActive ? '0.95' : '1';
  const attrs = interactiveAttrs ? ` class="bg-channel" data-channel="${esc(key)}"` : '';
  return `<line x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round"${attrs}/>`;
}

/** @internal Pick badge colors for a gate's activation state. */
function badgeColorsFor(
  act: GateActivation | undefined,
  inTransit: boolean,
  theme: BodyGraphTheme,
): BadgeColors {
  if (inTransit && !act) return theme.badgeTransit;
  if (act?.personality && act?.design) return theme.badgeBoth;
  if (act?.personality) return theme.badgePersonality;
  if (act?.design) return theme.badgeDesign;
  return theme.badgeFaint;
}

/** @internal Draw the crisp gate badges around a single center. */
function drawGateBadges(
  center: CenterKey,
  activations: Record<number, GateActivation>,
  transitSet: ReadonlySet<number>,
  theme: BodyGraphTheme,
  interactiveAttrs: boolean,
): string {
  const gates = CENTER_GATES[center];
  let out = '';
  for (const g of gates) {
    const act = activations[g];
    const inTransit = transitSet.has(g);
    if (!act && !inTransit) continue;

    // Canonical, deterministic, collision-free slot for this gate (computed from
    // the center's complete gate set, so it never moves as gates toggle).
    const slot = gatePosition(g);
    if (!slot) continue;
    const bx = slot.x;
    const by = slot.y;

    const colors = badgeColorsFor(act, inTransit, theme);
    const attrs = interactiveAttrs ? ` class="bg-gate" data-gate="${g}"` : '';
    out +=
      `<g${attrs}>` +
      `<rect x="${n(bx - 11)}" y="${n(by - 8)}" width="22" height="16" rx="4" fill="${esc(colors.fill)}" stroke="${esc(colors.stroke)}" stroke-width="0.8"/>` +
      `<text x="${n(bx)}" y="${n(by + 5)}" text-anchor="middle" fill="${esc(colors.text)}" font-family="${esc(theme.font)}" font-size="7.5" font-weight="700" pointer-events="none">${g}</text>` +
      `</g>`;
  }
  return out;
}

/**
 * Renders a canonical Energy Blueprint body graph as an SVG string.
 *
 * Layer order (bottom → top), guaranteeing crisp shapes/numbers:
 * 1. `<defs>` (gradients + halo blur filter)
 * 2. optional background rect
 * 3. channels (lit channels under the accent)
 * 4. soft halos for defined centers (blurred, *behind* the crisp shapes)
 * 5. crisp center shapes
 * 6. crisp center labels
 * 7. crisp gate badges + gate numbers
 *
 * @param input - The chart data (defined centers + activations / signature gates).
 * @param theme - Optional partial theme merged over the premium-clean default.
 * @param options - Optional render flags (badges, glow, interactivity, idSuffix).
 * @returns A complete `<svg>...</svg>` markup string.
 */
export function renderBodyGraph(
  input: BodyGraphInput,
  theme?: BodyGraphThemeInput,
  options?: BodyGraphOptions,
): string {
  const t = resolveTheme(theme);
  const showGateBadges = options?.showGateBadges ?? true;
  const glow = options?.glow ?? true;
  const interactiveAttrs = options?.interactiveAttrs ?? false;
  const idSuffix = options?.idSuffix ?? '';
  const spotlightSet = new Set(options?.spotlightCenters ?? []);
  const sheenId = `bg-sheen${idSuffix}`;
  const blurId = `bg-halo${idSuffix}`;
  const spotBlurId = `bg-halo-spot${idSuffix}`;

  const defined = new Set(input.definedCenters);

  // Build the effective activation map. If gateActivations is absent, fall back
  // to signatureGates (mark each as personality+design / "both") so the film
  // works with its current data.
  let activations: Record<number, GateActivation>;
  if (input.gateActivations) {
    activations = input.gateActivations;
  } else {
    activations = {};
    for (const g of input.signatureGates ?? []) {
      activations[g] = { personality: true, design: true };
    }
  }
  const transitSet = new Set((input.transitGates ?? []).map(Number));

  let svg =
    `<svg viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" xmlns="http://www.w3.org/2000/svg" ` +
    `preserveAspectRatio="xMidYMid meet" role="img" aria-label="Energy Blueprint body graph">`;

  svg += buildDefs(t, idSuffix, glow);

  if (t.background) {
    svg += `<rect x="0" y="0" width="${VIEWBOX_WIDTH}" height="${VIEWBOX_HEIGHT}" fill="${esc(t.background)}"/>`;
  }

  // Channels (behind everything else).
  for (const key of Object.keys(CHANNEL_LINES)) {
    const pair = CHANNEL_LINES[key];
    if (!pair) continue;
    const from = CENTER_POS[pair[0]];
    const to = CENTER_POS[pair[1]];
    const isActive = defined.has(pair[0]) && defined.has(pair[1]);
    svg += drawChannel(key, from, to, isActive, t, interactiveAttrs);
  }

  // Soft halos — a separate blurred layer UNDER the crisp shapes, so the glow
  // never softens the number or the edge. Spotlight centers receive a doubled
  // blur + higher opacity halo so the gate's home center visually pops.
  if (glow) {
    for (const center of CENTER_ORDER) {
      if (defined.has(center)) {
        const isSpotlight = spotlightSet.has(center);
        svg += drawHalo(CENTER_POS[center], t, blurId, spotBlurId, isSpotlight);
      }
    }
  }

  // Crisp center shapes.
  for (const center of CENTER_ORDER) {
    const isDefined = defined.has(center);
    const open = interactiveAttrs ? ` class="bg-center" data-center="${center}"` : '';
    svg += `<g${open}>${drawCenterShape(CENTER_POS[center], isDefined, t, sheenId)}${drawCenterLabel(center, CENTER_POS[center], isDefined, t)}</g>`;
  }

  // Crisp gate badges + numbers, on top.
  if (showGateBadges) {
    for (const center of CENTER_ORDER) {
      svg += drawGateBadges(center, activations, transitSet, t, interactiveAttrs);
    }
  }

  svg += '</svg>';
  return svg;
}
