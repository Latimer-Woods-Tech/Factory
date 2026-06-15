/**
 * The planets, luminaries, and chart points.
 *
 * These are the PRIMARY actors of a chart (more central than fixed stars). In
 * the personal sky they render as distinct glyph-marked bodies — your Sun, Moon,
 * Mercury … Pluto, Chiron, the Nodes, Lilith, and the angles (ASC/MC) — and they
 * anchor the theme constellations. Each carries its glyph, a planet colour, a
 * default life-theme affinity (its natural signification), a render magnitude
 * (luminaries brightest), and a one-phrase keyword.
 */

import type { ThemeKey } from '../renderer.js';

/** A canonical celestial body (planet, luminary, or chart angle). */
export interface CelestialBody {
  glyph: string;
  name: string;
  color: string;
  mag: number;
  theme: ThemeKey;
  keyword: string;
}

/** All valid body keys in render order. */
export type BodyKey =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus' | 'neptune' | 'pluto' | 'chiron' | 'northNode' | 'southNode'
  | 'lilith' | 'ascendant' | 'midheaven';

export const CELESTIAL_BODIES: Record<BodyKey, CelestialBody> = {
  sun:       { glyph: '☉', name: 'Sun',        color: '#ffd24a', mag: 5, theme: 'purpose',       keyword: 'vitality, identity, the will to be' },
  moon:      { glyph: '☽', name: 'Moon',       color: '#dfe6f0', mag: 5, theme: 'relationships', keyword: 'feeling, need, instinctive rhythm' },
  mercury:   { glyph: '☿', name: 'Mercury',    color: '#b8d4e8', mag: 3, theme: 'decisions',     keyword: 'mind, language, how you weigh things' },
  venus:     { glyph: '♀', name: 'Venus',      color: '#ffb3d0', mag: 4, theme: 'relationships', keyword: 'love, value, what you draw close' },
  mars:      { glyph: '♂', name: 'Mars',       color: '#ff6b4a', mag: 4, theme: 'decisions',     keyword: 'drive, desire, how you act' },
  jupiter:   { glyph: '♃', name: 'Jupiter',    color: '#f0b86b', mag: 4, theme: 'purpose',       keyword: 'growth, meaning, where you expand' },
  saturn:    { glyph: '♄', name: 'Saturn',     color: '#c9b483', mag: 4, theme: 'work',          keyword: 'structure, discipline, the long build' },
  uranus:    { glyph: '♅', name: 'Uranus',     color: '#7af0e0', mag: 3, theme: 'shadow_gift',   keyword: 'disruption, awakening, the break' },
  neptune:   { glyph: '♆', name: 'Neptune',    color: '#6b9bff', mag: 3, theme: 'shadow_gift',   keyword: 'dream, dissolution, the longing' },
  pluto:     { glyph: '♇', name: 'Pluto',      color: '#b06bd0', mag: 3, theme: 'shadow_gift',   keyword: 'power, death and rebirth, the depths' },
  chiron:    { glyph: '⚷', name: 'Chiron',     color: '#9bd0b0', mag: 3, theme: 'shadow_gift',   keyword: 'the wound that becomes the gift' },
  northNode: { glyph: '☊', name: 'North Node', color: '#cdb36a', mag: 3, theme: 'purpose',       keyword: 'the direction of growth, your edge' },
  southNode: { glyph: '☋', name: 'South Node', color: '#8a8a9c', mag: 2, theme: 'shadow_gift',   keyword: 'the comfortable past, the well-worn groove' },
  lilith:    { glyph: '⚸', name: 'Lilith',     color: '#c77dff', mag: 2, theme: 'shadow_gift',   keyword: 'the exiled, the raw, the ungovernable' },
  ascendant: { glyph: 'AC', name: 'Ascendant', color: '#e8d8a0', mag: 3, theme: 'relationships', keyword: 'your approach, the mask the world meets' },
  midheaven: { glyph: 'MC', name: 'Midheaven', color: '#ffd24a', mag: 4, theme: 'work',          keyword: 'calling, the public peak, what you aim at' },
};

/** Canonical render order (luminaries → personal → social → outer → points). */
export const BODY_ORDER: BodyKey[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'chiron', 'northNode', 'southNode',
  'lilith', 'ascendant', 'midheaven',
];

/** Minimal chart shape accepted by bodiesByTheme. */
export interface BodyChart {
  placements?: Partial<Record<string, { lon?: number } | undefined>>;
  [key: string]: unknown;
}

/**
 * Resolve which bodies are present in a chart and group them by life-theme, so
 * each theme constellation can render its own planets as glyph-marked anchor
 * bodies. A body is included only if the chart carries a position for it.
 */
export function bodiesByTheme(
  astroChart: BodyChart | null | undefined,
  extras: Partial<Record<string, { lon?: number } | undefined>> = {},
): Partial<Record<ThemeKey, Array<CelestialBody & { key: BodyKey; present: true }>>> {
  const out: Partial<Record<ThemeKey, Array<CelestialBody & { key: BodyKey; present: true }>>> = {};
  const placements = (astroChart && astroChart.placements) ?? {};
  const has = (key: string): boolean => {
    if (placements[key]) return true;
    if (astroChart && key in astroChart && astroChart[key]) return true;
    if (extras && extras[key]) return true;
    return false;
  };
  for (const key of BODY_ORDER) {
    const body = CELESTIAL_BODIES[key];
    if (!has(key)) continue;
    const bucket = (out[body.theme] ??= []);
    bucket.push({ key, ...body, present: true });
  }
  return out;
}
