/**
 * Theme tokens for the body-graph engine — the themeable design system.
 *
 * The engine is runtime-agnostic: web passes CSS-var-backed values, the film
 * passes its per-type color, and PDF passes static values. Every visual token
 * lives here so consumers theme the chart without forking the renderer.
 *
 * @module theme
 */

/** Color tokens for a single gate-badge activation state. */
export interface BadgeColors {
  /** Badge fill. */
  readonly fill: string;
  /** Badge border stroke. */
  readonly stroke: string;
  /** Gate-number text color. */
  readonly text: string;
}

/**
 * The complete themeable token set for {@link renderBodyGraph}. All fields are
 * required on the resolved theme; consumers pass a {@link BodyGraphThemeInput}
 * (partial) which is merged over {@link DEFAULT_THEME}.
 */
export interface BodyGraphTheme {
  /** Primary accent (defined stroke / lit channels / gradient base). */
  readonly accent: string;
  /** Stronger accent (defined fill / channel glow). */
  readonly accentStrong: string;
  /** Color used for open (undefined) center outlines + labels. */
  readonly openColor: string;
  /** Fill for defined center shapes. */
  readonly definedFill: string;
  /** Stroke for defined center shapes. */
  readonly definedStroke: string;
  /** Stroke for open (undefined) center shapes. */
  readonly openStroke: string;
  /** Stroke for a lit (both-ends-defined) channel. */
  readonly channelActive: string;
  /** Stroke for a quiet (undefined) channel. */
  readonly channelInactive: string;
  /** Badge colors for personality + design (gold). */
  readonly badgeBoth: BadgeColors;
  /** Badge colors for personality only (green). */
  readonly badgePersonality: BadgeColors;
  /** Badge colors for design only. */
  readonly badgeDesign: BadgeColors;
  /** Badge colors for a transit-only activation. */
  readonly badgeTransit: BadgeColors;
  /** Badge colors for a faint / otherwise-active gate. */
  readonly badgeFaint: BadgeColors;
  /** Font family for center labels + gate numbers. */
  readonly font: string;
  /** Text color for defined center labels. */
  readonly definedLabel: string;
  /** Optional background rect fill for the whole SVG. */
  readonly background?: string;
  /** Glow/halo color for the soft layer behind defined centers. */
  readonly glow: string;
}

/** A partial theme override merged over {@link DEFAULT_THEME}. */
export type BodyGraphThemeInput = Partial<
  Omit<
    BodyGraphTheme,
    'badgeBoth' | 'badgePersonality' | 'badgeDesign' | 'badgeTransit' | 'badgeFaint'
  >
> & {
  /** Override the personality+design badge colors. */
  readonly badgeBoth?: Partial<BadgeColors>;
  /** Override the personality-only badge colors. */
  readonly badgePersonality?: Partial<BadgeColors>;
  /** Override the design-only badge colors. */
  readonly badgeDesign?: Partial<BadgeColors>;
  /** Override the transit badge colors. */
  readonly badgeTransit?: Partial<BadgeColors>;
  /** Override the faint badge colors. */
  readonly badgeFaint?: Partial<BadgeColors>;
};

/**
 * The premium-clean default theme. Gold accent, crisp defined shapes, quiet
 * open outlines, activation-aware badge colors ported from the canonical
 * `drawGateBadges` (personality+design = gold `#c9a84c`, personality = green
 * `#4ab478`, transit = `#4ac882`, else faint).
 */
export const DEFAULT_THEME: BodyGraphTheme = {
  accent: '#c9a84c',
  accentStrong: '#e0c878',
  openColor: 'rgba(246,239,220,0.96)',
  definedFill: 'rgba(201,168,76,0.92)',
  definedStroke: '#e0c878',
  openStroke: 'rgba(201,168,76,0.55)',
  channelActive: '#e0c878',
  channelInactive: 'rgba(255,255,255,0.08)',
  badgeBoth: { fill: 'rgba(201,168,76,0.25)', stroke: '#c9a84c', text: '#f0dca0' },
  badgePersonality: { fill: 'rgba(74,180,120,0.18)', stroke: '#4ab478', text: '#7fe0a8' },
  badgeDesign: { fill: 'rgba(255,255,255,0.14)', stroke: 'rgba(255,255,255,0.5)', text: '#ffffff' },
  badgeTransit: { fill: 'rgba(74,200,130,0.15)', stroke: '#4ac882', text: '#4ac882' },
  badgeFaint: { fill: 'rgba(255,255,255,0.1)', stroke: 'rgba(255,255,255,0.32)', text: 'rgba(242,236,228,0.82)' },
  font: 'Inter, system-ui, -apple-system, sans-serif',
  definedLabel: 'rgba(20,16,8,0.92)',
  glow: '#c9a84c',
};

/** @internal Merge a partial {@link BadgeColors} over a base. */
function mergeBadge(base: BadgeColors, override?: Partial<BadgeColors>): BadgeColors {
  if (!override) return base;
  return {
    fill: override.fill ?? base.fill,
    stroke: override.stroke ?? base.stroke,
    text: override.text ?? base.text,
  };
}

/**
 * Resolves a partial theme input into a complete {@link BodyGraphTheme} by
 * merging over {@link DEFAULT_THEME}. Badge sub-objects merge field-by-field so
 * a consumer can recolor just the text without restating fill/stroke.
 *
 * @param input - Optional partial overrides.
 * @returns A fully-resolved theme.
 */
export function resolveTheme(input?: BodyGraphThemeInput): BodyGraphTheme {
  if (!input) return DEFAULT_THEME;
  return {
    accent: input.accent ?? DEFAULT_THEME.accent,
    accentStrong: input.accentStrong ?? DEFAULT_THEME.accentStrong,
    openColor: input.openColor ?? DEFAULT_THEME.openColor,
    definedFill: input.definedFill ?? DEFAULT_THEME.definedFill,
    definedStroke: input.definedStroke ?? DEFAULT_THEME.definedStroke,
    openStroke: input.openStroke ?? DEFAULT_THEME.openStroke,
    channelActive: input.channelActive ?? DEFAULT_THEME.channelActive,
    channelInactive: input.channelInactive ?? DEFAULT_THEME.channelInactive,
    badgeBoth: mergeBadge(DEFAULT_THEME.badgeBoth, input.badgeBoth),
    badgePersonality: mergeBadge(DEFAULT_THEME.badgePersonality, input.badgePersonality),
    badgeDesign: mergeBadge(DEFAULT_THEME.badgeDesign, input.badgeDesign),
    badgeTransit: mergeBadge(DEFAULT_THEME.badgeTransit, input.badgeTransit),
    badgeFaint: mergeBadge(DEFAULT_THEME.badgeFaint, input.badgeFaint),
    font: input.font ?? DEFAULT_THEME.font,
    definedLabel: input.definedLabel ?? DEFAULT_THEME.definedLabel,
    background: input.background ?? DEFAULT_THEME.background,
    glow: input.glow ?? DEFAULT_THEME.glow,
  };
}
