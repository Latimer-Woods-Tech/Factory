/**
 * Curated catalog of named fixed stars (the "fixed-stars lens").
 *
 * This is TRADITION, not measured impact. Fixed-star astrology is a pattern
 * language astrologers have read for ~2000 years (the medieval Behenian set plus
 * the brightest navigational stars). A star is surfaced for a person only when
 * it sits conjunct one of their natal points — and even then it is offered as a
 * lens, calibrated against their own lived data, never asserted as a cause.
 *
 * Longitudes are tropical ecliptic, epoch ~2000, in degrees [0,360). They are
 * approximate (good to ~0.5°) — refine against an ephemeris if exactness is ever
 * needed. `mag` is visual magnitude (lower = brighter). `spectral` drives the
 * star colour so the sky reads like a real planetarium. `nature` is the
 * traditional planetary signature; `keyword` is the lore in one phrase; `theme`
 * is the life-theme this star most belongs to.
 */

import type { ThemeKey, SpectralClass } from '../renderer.js';

/** A named fixed star in the curated catalog. */
export interface FixedStar {
  name: string;
  lon: number;
  mag: number;
  spectral: SpectralClass;
  nature: string;
  keyword: string;
  theme: ThemeKey;
  behenian?: boolean;
}

/** A conjunction hit between a fixed star and a natal point. */
export interface ActiveFixedStar {
  star: FixedStar;
  point: string;
  orb: number;
}

/** Minimal chart shape accepted by activeFixedStars. */
export interface AstroChart {
  placements?: Record<string, { lon?: number; longitude?: number; absLon?: number; eclipticLongitude?: number } | undefined>;
  ascendant?: { lon?: number; longitude?: number; absLon?: number };
  midheaven?: { lon?: number; longitude?: number; absLon?: number };
}

/** Spectral class → hex colour (Stellarium-style temperature palette). */
export const SPECTRAL_COLOR: Record<SpectralClass, string> = {
  O: '#9bb0ff', B: '#aabfff', A: '#cad8ff', F: '#f6f4ff',
  G: '#fff4e8', K: '#ffd6a5', M: '#ffb188',
};

export const FIXED_STARS: FixedStar[] = [
  // Tropical ecliptic longitudes, epoch 2026.0 (J2000 + precession ~50.29"/yr → +0.363°).
  // ── Behenian 15 (the classical magical stars) ──
  { name: 'Algol',        lon: 56.53,  mag: 2.1,   spectral: 'B', nature: 'Saturn/Jupiter', keyword: 'the intense head — crisis that concentrates into power', theme: 'shadow_gift', behenian: true },
  { name: 'Alcyone',      lon: 60.36,  mag: 2.87,  spectral: 'B', nature: 'Moon/Mars',      keyword: 'the Pleiad — sight earned through sorrow',               theme: 'shadow_gift', behenian: true },
  { name: 'Aldebaran',    lon: 70.15,  mag: 0.85,  spectral: 'K', nature: 'Mars',           keyword: 'the Watcher — integrity tested, honour kept',           theme: 'purpose',     behenian: true },
  { name: 'Capella',      lon: 82.21,  mag: 0.08,  spectral: 'G', nature: 'Mercury/Mars',   keyword: 'restless curiosity, the perpetual learner',             theme: 'work',        behenian: true },
  { name: 'Sirius',       lon: 104.45, mag: -1.46, spectral: 'A', nature: 'Jupiter/Mars',   keyword: 'the brilliant — sacred fire, scorching ambition',       theme: 'purpose',     behenian: true },
  { name: 'Procyon',      lon: 116.15, mag: 0.34,  spectral: 'F', nature: 'Mercury/Mars',   keyword: 'swift rise, sudden reversal — act before it passes',    theme: 'timing',      behenian: true },
  { name: 'Regulus',      lon: 150.20, mag: 1.35,  spectral: 'B', nature: 'Mars/Jupiter',   keyword: 'the Royal Star — leadership held without revenge',      theme: 'work',        behenian: true },
  { name: 'Alkaid',       lon: 177.30, mag: 1.85,  spectral: 'B', nature: 'Moon/Mercury',   keyword: 'the mourner — endings that must be grieved to pass',    theme: 'shadow_gift', behenian: true },
  { name: 'Algorab',      lon: 193.81, mag: 2.9,   spectral: 'B', nature: 'Mars/Saturn',    keyword: 'repulsion turned to transformation',                    theme: 'shadow_gift', behenian: true },
  { name: 'Spica',        lon: 204.20, mag: 1.04,  spectral: 'B', nature: 'Venus/Mars',     keyword: 'the Sheaf — the unearned gift, pure talent',            theme: 'work',        behenian: true },
  { name: 'Arcturus',     lon: 204.60, mag: -0.05, spectral: 'K', nature: 'Mars/Jupiter',   keyword: 'the Pathfinder — prosperity through bold effort',       theme: 'purpose',     behenian: true },
  { name: 'Alphecca',     lon: 222.66, mag: 2.2,   spectral: 'A', nature: 'Venus/Mercury',  keyword: 'the Crown — dignity, honours in love and art',          theme: 'relationships', behenian: true },
  { name: 'Antares',      lon: 250.13, mag: 1.0,   spectral: 'M', nature: 'Mars/Jupiter',   keyword: 'the Rival — obsession forged into courage',             theme: 'decisions',   behenian: true },
  { name: 'Vega',         lon: 285.68, mag: 0.03,  spectral: 'A', nature: 'Venus/Mercury',  keyword: 'the Falling Eagle — artistry and high idealism',        theme: 'work',        behenian: true },
  { name: 'Deneb Algedi', lon: 323.91, mag: 2.85,  spectral: 'A', nature: 'Saturn/Jupiter', keyword: 'the Lawgiver — justice, the weight of the verdict',     theme: 'decisions',   behenian: true },
  // ── Bright navigational stars (iconic, not Behenian) ──
  { name: 'Rigel',        lon: 77.20,  mag: 0.13,  spectral: 'B', nature: 'Jupiter/Mars',   keyword: 'the teacher — ascendance through structure',            theme: 'work' },
  { name: 'Bellatrix',    lon: 81.31,  mag: 1.6,   spectral: 'B', nature: 'Mars/Mercury',   keyword: 'the Amazon — quick, decisive force',                    theme: 'decisions' },
  { name: 'Betelgeuse',   lon: 89.11,  mag: 0.5,   spectral: 'M', nature: 'Mars/Mercury',   keyword: 'the Giant — martial success, big presence',             theme: 'work' },
  { name: 'Castor',       lon: 110.60, mag: 1.58,  spectral: 'A', nature: 'Mercury',        keyword: 'the Writer — duality, mind in two places',              theme: 'relationships' },
  { name: 'Pollux',       lon: 113.58, mag: 1.15,  spectral: 'K', nature: 'Mars',           keyword: 'the Boxer — forceful, competitive will',                theme: 'decisions' },
  { name: 'Altair',       lon: 302.15, mag: 0.77,  spectral: 'A', nature: 'Mars/Jupiter',   keyword: 'the Eagle — bold, sudden flight',                       theme: 'timing' },
  { name: 'Fomalhaut',    lon: 334.23, mag: 1.16,  spectral: 'A', nature: 'Venus/Mercury',  keyword: 'the Lonely Star — idealism, the magical outsider',      theme: 'purpose' },
];

/** Magnitude → 1..5 render tier (brighter star = higher tier). */
export function magTier(mag: number): number {
  if (mag <= -0.5) return 5;
  if (mag <= 0.5)  return 4;
  if (mag <= 1.3)  return 3;
  if (mag <= 2.2)  return 2;
  return 1;
}

const TWO_PI_DEG = 360;
function angDiff(a: number, b: number): number {
  let d = Math.abs(((a - b) % TWO_PI_DEG + TWO_PI_DEG) % TWO_PI_DEG);
  if (d > 180) d = TWO_PI_DEG - d;
  return d;
}

/**
 * Which fixed stars are active for a chart — conjunct (within `orb`°, by
 * ecliptic longitude) one of the natal points. Returns enriched hits sorted by
 * tightness then brightness. A star only speaks when it sits on your chart.
 */
export function activeFixedStars(astroChart: AstroChart | null | undefined, orb = 1.5): ActiveFixedStar[] {
  if (!astroChart) return [];
  const points: [string, number][] = [];
  const placements = astroChart.placements ?? {};
  for (const [body, p] of Object.entries(placements)) {
    if (!p) continue;
    const lon = p.lon ?? p.longitude ?? p.absLon ?? p.eclipticLongitude;
    if (typeof lon === 'number') points.push([body, lon]);
  }
  for (const ang of ['ascendant', 'midheaven'] as const) {
    const a = astroChart[ang];
    const lon = a?.lon ?? a?.longitude ?? a?.absLon;
    if (typeof lon === 'number') points.push([ang === 'ascendant' ? 'Ascendant' : 'Midheaven', lon]);
  }

  const hits: ActiveFixedStar[] = [];
  for (const star of FIXED_STARS) {
    let best: { point: string; orb: number } | null = null;
    for (const [body, lon] of points) {
      const d = angDiff(star.lon, lon);
      if (d <= orb && (!best || d < best.orb)) best = { point: body, orb: Number(d.toFixed(2)) };
    }
    if (best) hits.push({ star, point: best.point, orb: best.orb });
  }
  return hits.sort((x, y) => (x.orb - y.orb) || (x.star.mag - y.star.mag));
}
