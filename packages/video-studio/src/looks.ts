import type { SkyMood } from './components/CosmicSky.js';
import type { ParticleMode } from './components/effects.js';

// ---------------------------------------------------------------------------
// Looks — hand-authored, internally-coherent cinematic presets ("director's
// cuts" / film stocks). Each bundles a sky mood + grade + lens (DOF, halation)
// + camera language + atmosphere + a hero moment that were designed to go
// TOGETHER, so every randomized render looks intentional, never like random
// toggles. We randomize across LOOKS (seeded per chart), and each look is then
// multiplied to near-infinite instances by the already-seeded sky/voice/music.
//
// The brand divine-feminine palette (lavender/pearl/rose) stays the base; a
// look varies the *treatment*, not the brand. Add a look = add one entry here.
// ---------------------------------------------------------------------------

export type HeroMoment =
  | 'stardustBirth' | 'godrayCathedral' | 'constellation'
  | 'auroraRibbon' | 'tideRise';

export interface LookSpec {
  /** Display + lookup name. */
  name: string;
  /** HD types this look suits ('*' = any) — keeps "randomized" always appropriate. */
  suits: string[];
  /** Procedural sky mood. */
  skyMood: SkyMood;
  /** Colour-grade overlay: a screen-blend bloom tint + a base wash. */
  grade: { bloom: string; base: string };
  /** Halation strength on type + highlights (0..1) — soft film-print glow. */
  halation: number;
  /** Depth-of-field: max blur (px) on the out-of-focus layer for rack-focus. */
  dof: number;
  /** Organic camera-float amplitude (px). */
  float: number;
  /** Volumetric god-ray intensity at its peak (0 = off). */
  godRays: number;
  /** Atmospheric particle register. */
  particles: ParticleMode;
  /** Accent colour for rays / particles / constellation. */
  accent: string;
  /** Secondary accent (particle variety). */
  accent2: string;
  /** The signature hero moment. */
  hero: HeroMoment;
}

// Brand moonlight anchors (kept in sync with HeroBlueprint).
const LAV = '#cdbcef';
const PEARL = '#f5eefb';
const ROSE = '#e8c4de';
const STAR = '#bcd2ec';
const AQUA = '#8fd0d8';
const GOLD = '#f0c69a'; // rose-gold, kept warm-but-soft inside the brand
const SILVER = '#c8ccd8';

// `suits` uses the canonical lowercase HD type ids (matches hdType enum:
// generator | manifesting_generator | projector | manifestor | reflector).
// '*' = universal. Every type maps to the 4 universal looks plus its targeted
// cuts, so a "randomized" render is always type-appropriate yet varied.
export const LOOK_POOL: LookSpec[] = [
  {
    name: 'Moonlit Veil',
    suits: ['*'],
    skyMood: 'lux',
    grade: { bloom: 'rgba(205,188,239,0.09)', base: 'rgba(10,6,24,0.16)' },
    halation: 0.6,
    dof: 8,
    float: 6,
    godRays: 0.28,
    particles: 'motes',
    accent: LAV,
    accent2: PEARL,
    hero: 'stardustBirth',
  },
  {
    name: 'Opaline Cathedral',
    suits: ['*'],
    skyMood: 'aether',
    grade: { bloom: 'rgba(232,224,247,0.12)', base: 'rgba(10,8,22,0.14)' },
    halation: 0.82,
    dof: 11,
    float: 4,
    godRays: 0.72,
    particles: 'motes',
    accent: PEARL,
    accent2: LAV,
    hero: 'godrayCathedral',
  },
  {
    name: 'Astral Cartography',
    suits: ['*'],
    skyMood: 'chronos',
    grade: { bloom: 'rgba(188,210,236,0.08)', base: 'rgba(8,10,22,0.2)' },
    halation: 0.5,
    dof: 7,
    float: 8,
    godRays: 0.16,
    particles: 'stardust',
    accent: STAR,
    accent2: ROSE,
    hero: 'constellation',
  },
  {
    name: 'Nebula Bloom',
    suits: ['*'],
    skyMood: 'petal',
    grade: { bloom: 'rgba(232,196,222,0.12)', base: 'rgba(12,8,24,0.16)' },
    halation: 0.7,
    dof: 9,
    float: 6,
    godRays: 0.22,
    particles: 'stardust',
    accent: ROSE,
    accent2: LAV,
    hero: 'stardustBirth',
  },
  {
    name: 'Pearl Aurora',
    suits: ['reflector', 'projector', 'manifesting_generator'],
    skyMood: 'eros',
    grade: { bloom: 'rgba(232,196,222,0.11)', base: 'rgba(10,6,18,0.18)' },
    halation: 0.66,
    dof: 8,
    float: 7,
    godRays: 0.14,
    particles: 'aurora',
    accent: ROSE,
    accent2: PEARL,
    hero: 'auroraRibbon',
  },
  {
    name: 'Tidal',
    suits: ['reflector', 'projector'],
    skyMood: 'tide',
    grade: { bloom: 'rgba(143,208,216,0.10)', base: 'rgba(6,12,18,0.2)' },
    halation: 0.5,
    dof: 8,
    float: 9,
    godRays: 0.12,
    particles: 'motes',
    accent: AQUA,
    accent2: STAR,
    hero: 'tideRise',
  },
  {
    name: 'Obsidian Mirror',
    suits: ['manifestor', 'projector'],
    skyMood: 'self',
    grade: { bloom: 'rgba(205,188,239,0.06)', base: 'rgba(4,4,10,0.34)' },
    halation: 0.42,
    dof: 12,
    float: 4,
    godRays: 0.1,
    particles: 'bokeh',
    accent: LAV,
    accent2: SILVER,
    hero: 'stardustBirth',
  },
  {
    name: 'Gilded Dawn',
    suits: ['generator', 'manifesting_generator', 'manifestor'],
    skyMood: 'dawn',
    grade: { bloom: 'rgba(240,198,154,0.12)', base: 'rgba(12,7,14,0.18)' },
    halation: 0.78,
    dof: 9,
    float: 5,
    godRays: 0.6,
    particles: 'motes',
    accent: GOLD,
    accent2: ROSE,
    hero: 'godrayCathedral',
  },
  {
    name: 'Veil of Petals',
    suits: ['generator', 'reflector'],
    skyMood: 'petal',
    grade: { bloom: 'rgba(232,196,222,0.13)', base: 'rgba(12,8,24,0.15)' },
    halation: 0.72,
    dof: 7,
    float: 6,
    godRays: 0.18,
    particles: 'petals',
    accent: ROSE,
    accent2: LAV,
    hero: 'stardustBirth',
  },
  {
    name: 'Ink & Starlight',
    suits: ['projector', 'manifestor'],
    skyMood: 'ink',
    grade: { bloom: 'rgba(200,204,216,0.08)', base: 'rgba(6,7,10,0.26)' },
    halation: 0.46,
    dof: 8,
    float: 7,
    godRays: 0.14,
    particles: 'stardust',
    accent: SILVER,
    accent2: STAR,
    hero: 'constellation',
  },
];

/**
 * Pick a look deterministically from a seed, filtered to those that suit the
 * given HD type (so a randomized render is always appropriate). Mirrors the
 * narrator `pickVoice(seed)` rotation.
 */
export function pickLook(seed: number, hdType?: string): LookSpec {
  const pool = LOOK_POOL.filter((l) => l.suits.includes('*') || (hdType !== undefined && l.suits.includes(hdType)));
  const list = pool.length > 0 ? pool : LOOK_POOL;
  const idx = Math.floor(Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % list.length);
  return list[idx] ?? list[0]!;
}

/** Look up a look by name (forces a specific look for sampling/QA). */
export function lookByName(name: string): LookSpec | undefined {
  return LOOK_POOL.find((l) => l.name.toLowerCase() === name.toLowerCase());
}
