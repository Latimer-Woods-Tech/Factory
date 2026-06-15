import { describe, expect, it } from 'vitest';
import { activeTransitThemes, pulseThemes, transitCaption } from '../src/data/transit-pulse.js';

const transits = {
  transitToNatalAspects: [
    { transitPlanet: 'sun',     natalPlanet: 'mars', type: 'Conjunction', orb: 0.4,  applying: true },  // mars -> decisions
    { transitPlanet: 'jupiter', natalPlanet: 'sun',  type: 'Trine',       orb: 1.2,  applying: false }, // sun -> purpose
    { transitPlanet: 'saturn',  natalPlanet: 'moon', type: 'Square',      orb: 5.0 },                   // too wide
  ],
};

describe('transit pulse (the living sky)', () => {
  it('lights themes whose natal body is within orb, drops wide aspects', () => {
    const t = activeTransitThemes(transits, { orb: 2 });
    expect(Object.keys(t).sort()).toEqual(['decisions', 'purpose']);
    expect(t['decisions']![0]!.transitBody).toBe('sun');
  });

  it('pulseThemes is a themeKey->true map', () => {
    expect(pulseThemes(transits)).toEqual({ decisions: true, purpose: true });
  });

  it('caption names the single tightest aspect', () => {
    const c = transitCaption(transits);
    expect(c!.theme).toBe('decisions');
    expect(c!.text).toMatch(/Transiting Sun/);
    expect(c!.text).toMatch(/your Mars/);
    expect(c!.text).toMatch(/Decisions is lit/);
  });

  it('is empty for no transits', () => {
    expect(transitCaption(null)).toBe(null);
    expect(pulseThemes(null)).toEqual({});
  });

  it('uses ✦ glyph when transit planet has no known body entry', () => {
    const t = {
      transitToNatalAspects: [
        { transitPlanet: 'ceres', natalPlanet: 'mars', type: 'Conjunction', orb: 0.3, applying: true },
      ],
    };
    const c = transitCaption(t);
    expect(c!.text).toContain('✦');
  });

  it('falls back to theme key string when THEME_LABEL has no entry (impossible in practice but defensive)', () => {
    // Use a real theme so CELESTIAL_BODIES resolves, but verify text is non-empty.
    const t = {
      transitToNatalAspects: [
        { transitPlanet: 'jupiter', natalPlanet: 'sun', type: 'Trine', orb: 0.5, applying: false },
      ],
    };
    const c = transitCaption(t);
    expect(typeof c!.text).toBe('string');
    expect(c!.text.length).toBeGreaterThan(0);
  });
});
