import { describe, expect, it } from 'vitest';
import { renderConstellation, __constellationInternals } from '../src/renderer.js';
import type { ConstellationInput } from '../src/renderer.js';

describe('renderConstellation', () => {
  it('returns a valid SVG string', () => {
    const svg = renderConstellation();
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 1000 1000"');
    expect(svg).toContain('</svg>');
  });

  it('is deterministic — same seed produces identical output', () => {
    const a = renderConstellation({ seed: 'user-42' });
    const b = renderConstellation({ seed: 'user-42' });
    expect(a).toBe(b);
  });

  it('produces different output for different seeds', () => {
    const a = renderConstellation({ seed: 'user-1' });
    const b = renderConstellation({ seed: 'user-2' });
    expect(a).not.toBe(b);
  });

  it('renders all six theme labels when no themes are provided (dormant state)', () => {
    const svg = renderConstellation({ seed: 'test' });
    for (const label of ['PURPOSE', 'DECISIONS', 'RELATIONSHIPS', 'TIMING', 'SHADOW &amp; GIFT', 'WORK']) {
      expect(svg).toContain(label);
    }
  });

  it('emits SMIL animations by default and omits them when animate:false', () => {
    const withAnim = renderConstellation({ animate: true });
    const noAnim = renderConstellation({ animate: false });
    expect(withAnim).toContain('<animate ');
    expect(noAnim).not.toContain('<animate ');
  });

  it('applies forge atmosphere — different forge changes bg colour', () => {
    const chronos = renderConstellation({ forge: 'chronos' });
    const eros = renderConstellation({ forge: 'eros' });
    expect(chronos).toContain('#07091f');
    expect(eros).toContain('#120806');
  });

  it('renders a custom centre name', () => {
    const svg = renderConstellation({ name: 'ALEX' });
    expect(svg).toContain('>ALEX<');
  });

  it('does not emit DOM-specific APIs — output is a plain string', () => {
    const svg = renderConstellation();
    expect(typeof svg).toBe('string');
  });

  it('renders an explored theme with anchor stars and convergence lines', () => {
    const input: ConstellationInput = {
      seed: 'explored-test',
      themes: {
        purpose: {
          stars: [
            { role: 'anchor', magnitude: 4, system: 'astrology', label: 'Sun' },
            { role: 'anchor', magnitude: 3, system: 'numerology' },
            { role: 'voice',  magnitude: 2, system: 'geneKeys' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('cn-theme');
    expect(svg).toContain('cn-star');
  });

  it('renders a pulsing theme ring when pulse is set', () => {
    const svg = renderConstellation({
      seed: 'pulse-test',
      pulse: { timing: true },
      animate: false,
    });
    expect(svg).toContain('cn-theme--pulsing');
  });

  it('escapes HTML in name field', () => {
    const svg = renderConstellation({ name: '<script>bad</script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders body-disc (planet glyph) stars', () => {
    const input: ConstellationInput = {
      seed: 'body-test',
      themes: {
        work: {
          stars: [
            { role: 'anchor', body: true, glyph: '☉', magnitude: 5, color: '#ffd24a', label: 'Sun' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('cn-body');
    expect(svg).toContain('☉');
  });

  it('renders tension opposition lines when two tension stars are present', () => {
    const input: ConstellationInput = {
      seed: 'tension-test',
      themes: {
        shadow_gift: {
          stars: [
            { role: 'tension', magnitude: 3, system: 'astrology' },
            { role: 'tension', magnitude: 2, system: 'geneKeys' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('stroke-dasharray="1.5 6"');
  });

  it('renders spectral-tinted stars and fixed-star labels', () => {
    const input: ConstellationInput = {
      seed: 'spectral-test',
      themes: {
        purpose: {
          stars: [
            { role: 'anchor', magnitude: 4, spectral: 'B', fixed: true, label: 'Regulus', name: 'Regulus' },
            { role: 'voice',  magnitude: 2, spectral: 'K', showLabel: true, name: 'Arcturus' },
            { role: 'anchor', magnitude: 3, spectral: 'A' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('cn-fixed-label');
    expect(svg).toContain('Regulus');
  });

  it('renders body mark without glyph or label', () => {
    const input: ConstellationInput = {
      seed: 'body-nolabel',
      themes: {
        decisions: {
          stars: [
            { role: 'anchor', body: true, magnitude: 3, color: '#ff6b4a' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('cn-body');
  });

  it('single anchor star (no convergence line) renders without error', () => {
    const input: ConstellationInput = {
      seed: 'single-anchor',
      themes: {
        timing: {
          stars: [
            { role: 'anchor', magnitude: 3, system: 'astrology' },
            { role: 'voice',  magnitude: 2, system: 'transits' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('data-theme="timing"');
    expect(svg).not.toContain('stroke-dasharray="1.5 6"');
  });

  it('falls back to _default system colour for unknown system', () => {
    const input: ConstellationInput = {
      seed: 'unknown-sys',
      themes: {
        relationships: {
          stars: [
            { role: 'voice', magnitude: 2, system: 'unknownTradition' },
          ],
        },
      },
    };
    const svg = renderConstellation(input);
    expect(svg).toContain('#dfe6ff');
  });
});

describe('__constellationInternals', () => {
  it('exposes FORGE, SYSTEM_COLOR, and THEMES', () => {
    expect(__constellationInternals.FORGE).toBeDefined();
    expect(__constellationInternals.SYSTEM_COLOR).toBeDefined();
    expect(__constellationInternals.THEMES).toBeDefined();
  });

  it('THEMES has 6 entries in clockwise order', () => {
    const { THEMES } = __constellationInternals;
    expect(THEMES).toHaveLength(6);
    const keys = THEMES.map((t) => t.key);
    expect(keys).toContain('purpose');
    expect(keys).toContain('work');
  });

  it('all forge keys have bg, accent, halo, label', () => {
    for (const forge of Object.values(__constellationInternals.FORGE)) {
      expect(forge.bg).toMatch(/^#/);
      expect(forge.accent).toMatch(/^#/);
      expect(forge.halo).toMatch(/^#/);
      expect(typeof forge.label).toBe('string');
    }
  });
});
