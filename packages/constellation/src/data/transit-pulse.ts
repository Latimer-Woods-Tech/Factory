/**
 * The living sky.
 *
 * The bodygraph is fixed (your design never changes); the sky MOVES. Today's
 * transiting planets form aspects to your natal points, and each natal point
 * belongs to a life-theme — so a tight transit lights that theme's constellation
 * "tonight." This turns the sky into a daily-changing surface.
 *
 * Pure: maps the engine's transit-to-natal aspects onto themes. No DOM.
 */

import { CELESTIAL_BODIES } from './celestial-bodies.js';
import type { ThemeKey } from '../renderer.js';

/** A single transit-to-natal aspect from the engine. */
export interface TransitAspect {
  transitPlanet: string;
  natalPlanet: string;
  type: string;
  orb: number;
  applying?: boolean;
}

/** Engine transit output shape. */
export interface TransitData {
  transitToNatalAspects?: TransitAspect[];
}

/** An enriched transit hit bound to a life-theme. */
export interface TransitHit {
  transitBody: string;
  natalBody: string;
  natalKey: string;
  aspect: string;
  orb: number;
  applying: boolean;
}

/** The most significant active pulse caption. */
export interface TransitCaption {
  theme: ThemeKey;
  text: string;
}

const THEME_LABEL: Record<ThemeKey, string> = {
  purpose: 'Purpose', decisions: 'Decisions', relationships: 'Relationships',
  timing: 'Timing', shadow_gift: 'Shadow & Gift', work: 'Work',
};

const _cap = (s: string): string =>
  s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;

/**
 * Which themes are lit by current transits, and why.
 * @param transits Engine output (expects transitToNatalAspects[]).
 * @param opts Conjunction/aspect orb (default 2°).
 */
export function activeTransitThemes(
  transits: TransitData | null | undefined,
  opts: { orb?: number } = {},
): Partial<Record<ThemeKey, TransitHit[]>> {
  const orb = opts.orb ?? 2.0;
  const aspects = (transits && transits.transitToNatalAspects) ?? [];
  const out: Partial<Record<ThemeKey, TransitHit[]>> = {};
  for (const a of aspects) {
    if (typeof a.orb !== 'number' || a.orb > orb) continue;
    const natalKey = String(a.natalPlanet ?? '').toLowerCase();
    const body = CELESTIAL_BODIES[natalKey as keyof typeof CELESTIAL_BODIES];
    if (!body) continue;
    const bucket = (out[body.theme] ??= []);
    bucket.push({
      transitBody: a.transitPlanet,
      natalBody: body.name,
      natalKey,
      aspect: a.type,
      orb: Number(a.orb.toFixed(2)),
      applying: !!a.applying,
    });
  }
  for (const k of Object.keys(out) as ThemeKey[]) out[k]!.sort((x, y) => x.orb - y.orb);
  return out;
}

/** Map of themeKey → true for the renderer's pulse layer. */
export function pulseThemes(
  transits: TransitData | null | undefined,
  opts: { orb?: number } = {},
): Partial<Record<ThemeKey, true>> {
  const out: Partial<Record<ThemeKey, true>> = {};
  for (const k of Object.keys(activeTransitThemes(transits, opts)) as ThemeKey[]) out[k] = true;
  return out;
}

/**
 * A short human caption for the single most significant current pulse, or null.
 * Example: "☉ Transiting Sun conjunction your Mars — your Decisions is lit today."
 */
export function transitCaption(
  transits: TransitData | null | undefined,
  opts: { orb?: number } = {},
): TransitCaption | null {
  const themes = activeTransitThemes(transits, opts);
  let best: (TransitHit & { theme: ThemeKey }) | null = null;
  for (const [theme, hits] of Object.entries(themes) as [ThemeKey, TransitHit[]][]) {
    const h = hits[0];
    if (h && (!best || h.orb < best.orb)) best = { theme, ...h };
  }
  if (!best) return null;
  const tg = CELESTIAL_BODIES[String(best.transitBody).toLowerCase() as keyof typeof CELESTIAL_BODIES];
  const glyph = (tg && tg.glyph) || '✦';
  return {
    theme: best.theme,
    text: `${glyph} Transiting ${_cap(best.transitBody)} ${best.aspect.toLowerCase()} your ${best.natalBody} — your ${THEME_LABEL[best.theme] ?? best.theme} is lit today.`,
  };
}
