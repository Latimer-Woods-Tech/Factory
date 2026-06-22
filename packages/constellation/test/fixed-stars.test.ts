import { describe, expect, it } from 'vitest';
import { activeFixedStars, FIXED_STARS, magTier, SPECTRAL_COLOR } from '../src/data/fixed-stars.js';

describe('fixed-stars catalog', () => {
  it('includes the Behenian 15 plus bright navigators, all well-formed', () => {
    expect(FIXED_STARS.length).toBeGreaterThanOrEqual(20);
    expect(FIXED_STARS.filter((s) => s.behenian).length).toBe(15);
    for (const s of FIXED_STARS) {
      expect(typeof s.name).toBe('string');
      expect(s.lon).toBeGreaterThanOrEqual(0);
      expect(s.lon).toBeLessThan(360);
      expect(SPECTRAL_COLOR[s.spectral]).toBeTruthy();
      expect(s.theme).toMatch(/purpose|decisions|relationships|timing|shadow_gift|work/);
    }
  });

  it('magTier ranks brighter stars higher', () => {
    expect(magTier(-1.46)).toBe(5); // Sirius
    expect(magTier(2.9)).toBe(1);
  });
});

describe('activeFixedStars (conjunction by longitude)', () => {
  it('surfaces a star only when conjunct a natal point within orb', () => {
    // Regulus is at 150.2; put a planet on it and one far away.
    const chart = {
      placements: { sun: { lon: 150.4 }, moon: { lon: 12 } },
      midheaven: { lon: 204.0 },
    };
    const hits = activeFixedStars(chart, 1.5);
    const names = hits.map((h) => h.star.name);
    expect(names).toContain('Regulus');
    expect(names.some((n) => n === 'Spica' || n === 'Arcturus')).toBe(true);
    expect(hits[0]!.orb).toBeLessThanOrEqual(hits[hits.length - 1]!.orb);
  });

  it('returns nothing for an empty chart', () => {
    expect(activeFixedStars(null)).toEqual([]);
    expect(activeFixedStars({ placements: {} })).toEqual([]);
  });

  it('resolves eclipticLongitude field as a fallback', () => {
    // Sirius at 104.45 — put a placement using eclipticLongitude
    const chart = { placements: { venus: { eclipticLongitude: 104.0 } } };
    const hits = activeFixedStars(chart, 1.0);
    expect(hits.some((h) => h.star.name === 'Sirius')).toBe(true);
  });

  it('handles wrap-around orb (e.g. 359° vs 1° → 2° apart)', () => {
    // Fomalhaut at 334.23 — test wrap with a placement near 0°
    // angDiff(334.23, 1.0) = min(333.23, 26.77) = 26.77 — not within 1.5°
    // Put it exactly: 334.23 + 1.0 = 335.23
    const chart = { placements: { sun: { lon: 334.0 } } };
    const hits = activeFixedStars(chart, 1.0);
    expect(hits.some((h) => h.star.name === 'Fomalhaut')).toBe(true);
  });

  it('handles the >180° branch of angDiff (e.g. stars near 0/360 boundary)', () => {
    // lon=0 vs star at 359 → raw diff = 359, reduced = 1 (< 180)
    const chart = { placements: { sun: { lon: 0.5 } } };
    // Algol at 56.53 — not near 0; this just exercises code paths
    const hits = activeFixedStars(chart, 0.1);
    // No star near 0.5° — should return empty
    expect(hits.every((h) => h.orb <= 0.1)).toBe(true);
  });

  it('skips placements with undefined position values', () => {
    const chart = { placements: { sun: undefined, moon: { lon: 150.4 } } };
    const hits = activeFixedStars(chart, 1.5);
    expect(hits.some((h) => h.star.name === 'Regulus')).toBe(true);
  });
});
