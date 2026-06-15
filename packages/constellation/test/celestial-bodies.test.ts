import { describe, expect, it } from 'vitest';
import { bodiesByTheme, BODY_ORDER, CELESTIAL_BODIES } from '../src/data/celestial-bodies.js';

describe('celestial bodies', () => {
  it('covers luminaries, planets, Chiron, nodes, Lilith, and angles with glyphs', () => {
    for (const k of ['sun', 'moon', 'mars', 'saturn', 'chiron', 'northNode', 'lilith', 'ascendant', 'midheaven'] as const) {
      expect(CELESTIAL_BODIES[k]).toBeTruthy();
      expect(CELESTIAL_BODIES[k].glyph).toBeTruthy();
      expect(CELESTIAL_BODIES[k].theme).toMatch(/purpose|decisions|relationships|timing|shadow_gift|work/);
    }
    expect(BODY_ORDER[0]).toBe('sun');
  });

  it('groups present bodies by theme; omits absent ones', () => {
    const chart = { placements: { sun: { lon: 1 }, moon: { lon: 2 }, mars: { lon: 3 } } };
    const byTheme = bodiesByTheme(chart, { chiron: { lon: 4 } });
    expect(byTheme['purpose']!.map((b) => b.key)).toContain('sun');
    expect(byTheme['relationships']!.map((b) => b.key)).toContain('moon');
    expect(byTheme['decisions']!.map((b) => b.key)).toContain('mars');
    expect(byTheme['shadow_gift']!.map((b) => b.key)).toContain('chiron');
    // venus absent from chart -> not present
    const all = Object.values(byTheme).flat().map((b) => b.key);
    expect(all).not.toContain('venus');
  });

  it('picks up bodies stored directly on the chart object (not under placements)', () => {
    // ascendant / midheaven often live at the top level of the chart object
    const chart = { placements: {}, ascendant: { lon: 15 }, midheaven: { lon: 90 } };
    const byTheme = bodiesByTheme(chart);
    const all = Object.values(byTheme).flat().map((b) => b.key);
    expect(all).toContain('ascendant');
    expect(all).toContain('midheaven');
  });

  it('handles null/undefined chart gracefully', () => {
    expect(bodiesByTheme(null)).toEqual({});
    expect(bodiesByTheme(undefined)).toEqual({});
  });
});
