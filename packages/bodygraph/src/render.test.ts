import { describe, it, expect } from 'vitest';
import { renderBodyGraph } from './render.js';
import { CENTER_POS, GATE_TO_CENTER, centerShapePoints } from './geometry.js';
import { DEFAULT_THEME, resolveTheme } from './theme.js';

describe('renderBodyGraph — structure', () => {
  it('returns a 300×420 viewBox SVG', () => {
    const svg = renderBodyGraph({ definedCenters: [] });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 420"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('renders all nine centers (labels present)', () => {
    const svg = renderBodyGraph({ definedCenters: [] });
    for (const label of ['HEAD', 'AJNA', 'THROAT', 'G/SELF', 'HEART', 'SOLAR', 'SACRAL', 'SPLEEN', 'ROOT']) {
      expect(svg).toContain(`>${label}<`);
    }
  });

  it('renders all 40 channel lines', () => {
    const svg = renderBodyGraph({ definedCenters: [] });
    const lineCount = (svg.match(/<line /g) ?? []).length;
    expect(lineCount).toBe(40);
  });
});

describe('renderBodyGraph — defined centers', () => {
  it('fills a defined center with the sheen gradient + emits a halo behind it', () => {
    const svg = renderBodyGraph({ definedCenters: ['G'] });
    // Crisp shape uses the sheen gradient.
    expect(svg).toContain('fill="url(#bg-sheen)"');
    // Halo layer exists (blurred) and references the halo filter.
    expect(svg).toContain('filter="url(#bg-halo)"');
    // The halo is a polygon (G is a diamond) drawn before the crisp shape.
    const haloIdx = svg.indexOf('filter="url(#bg-halo)"');
    const sheenIdx = svg.indexOf('fill="url(#bg-sheen)"');
    expect(haloIdx).toBeGreaterThan(-1);
    expect(haloIdx).toBeLessThan(sheenIdx);
  });

  it('does not emit a halo for open centers', () => {
    const svg = renderBodyGraph({ definedCenters: [] });
    expect(svg).not.toContain('filter="url(#bg-halo)"');
  });

  it('omits halo entirely when glow:false but still draws crisp defined shape', () => {
    const svg = renderBodyGraph({ definedCenters: ['G'] }, undefined, { glow: false });
    expect(svg).not.toContain('bg-halo');
    expect(svg).toContain('fill="url(#bg-sheen)"');
  });
});

describe('renderBodyGraph — lit channels', () => {
  it('lights the 8-1 channel only when both G and Throat are defined', () => {
    const lit = renderBodyGraph({ definedCenters: ['G', 'Throat'] });
    // Active channel uses the theme.channelActive color + 2.5 width.
    expect(lit).toContain(`stroke="${DEFAULT_THEME.channelActive}"`);
    expect(lit).toContain('stroke-width="2.5"');

    const unlit = renderBodyGraph({ definedCenters: ['G'] });
    expect(unlit).not.toContain('stroke-width="2.5"');
  });

  it('keeps undefined channels quiet (inactive color, width 1)', () => {
    const svg = renderBodyGraph({ definedCenters: [] });
    expect(svg).toContain(`stroke="${DEFAULT_THEME.channelInactive}"`);
    expect(svg).toContain('stroke-width="1"');
  });
});

describe('renderBodyGraph — gate badges (crisp)', () => {
  it('draws a crisp badge with the gate number for an activated gate', () => {
    const svg = renderBodyGraph({
      definedCenters: ['Throat'],
      gateActivations: { 20: { personality: true, design: true } },
    });
    // Crisp number text present.
    expect(svg).toContain('>20</text>');
    // Both-activation uses the gold badge.
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgeBoth.fill}"`);
  });

  it('colors personality-only vs design-only vs transit distinctly', () => {
    const svg = renderBodyGraph({
      definedCenters: [],
      gateActivations: {
        20: { personality: true },
        57: { design: true },
      },
      transitGates: [16],
    });
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgePersonality.fill}"`);
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgeDesign.fill}"`);
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgeTransit.fill}"`);
  });

  it('skips badges for gates that are neither activated nor in transit', () => {
    const svg = renderBodyGraph({ definedCenters: ['Throat'] });
    // No activations + no signatureGates => no gate number text at all.
    expect(svg).not.toContain('>20</text>');
  });

  it('omits all badges when showGateBadges:false', () => {
    const svg = renderBodyGraph(
      { definedCenters: [], signatureGates: [20] },
      undefined,
      { showGateBadges: false },
    );
    expect(svg).not.toContain('>20</text>');
  });
});

describe('renderBodyGraph — gateActivations vs signatureGates fallback', () => {
  it('marks signatureGates as both (gold) when gateActivations is absent', () => {
    const svg = renderBodyGraph({ definedCenters: [], signatureGates: [20, 57] });
    expect(svg).toContain('>20</text>');
    expect(svg).toContain('>57</text>');
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgeBoth.fill}"`);
  });

  it('prefers gateActivations over signatureGates when both present', () => {
    const svg = renderBodyGraph({
      definedCenters: [],
      signatureGates: [20],
      gateActivations: { 20: { personality: true } },
    });
    // Should use personality color, NOT the both/gold fallback.
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgePersonality.fill}"`);
  });

  it('renders no badges when neither activations nor signatureGates given', () => {
    const svg = renderBodyGraph({ definedCenters: ['G'] });
    expect(svg).not.toMatch(/<g><rect[^>]*rx="4"/);
  });
});

describe('renderBodyGraph — theming', () => {
  it('changes output when a custom accent / channel color is supplied', () => {
    const base = renderBodyGraph({ definedCenters: ['G', 'Throat'] });
    const themed = renderBodyGraph(
      { definedCenters: ['G', 'Throat'] },
      { channelActive: '#ff0000', definedStroke: '#00ff00' },
    );
    expect(themed).not.toEqual(base);
    expect(themed).toContain('stroke="#ff0000"');
    expect(themed).toContain('stroke="#00ff00"');
  });

  it('renders a background rect only when theme.background is set', () => {
    const without = renderBodyGraph({ definedCenters: [] });
    expect(without).not.toContain('width="300" height="420" fill=');
    const withBg = renderBodyGraph({ definedCenters: [] }, { background: '#0b0b12' });
    expect(withBg).toContain('width="300" height="420" fill="#0b0b12"');
  });

  it('merges badge sub-tokens field-by-field', () => {
    const svg = renderBodyGraph(
      { definedCenters: [], gateActivations: { 20: { personality: true, design: true } } },
      { badgeBoth: { text: '#123456' } },
    );
    // overridden text...
    expect(svg).toContain('fill="#123456"');
    // ...but fill falls back to default.
    expect(svg).toContain(`fill="${DEFAULT_THEME.badgeBoth.fill}"`);
  });
});

describe('renderBodyGraph — idSuffix uniqueness', () => {
  it('namespaces gradient + filter ids so two SVGs do not collide', () => {
    const a = renderBodyGraph({ definedCenters: ['G'] }, undefined, { idSuffix: '-a' });
    const b = renderBodyGraph({ definedCenters: ['G'] }, undefined, { idSuffix: '-b' });
    expect(a).toContain('id="bg-sheen-a"');
    expect(a).toContain('url(#bg-sheen-a)');
    expect(a).toContain('id="bg-halo-a"');
    expect(b).toContain('id="bg-sheen-b"');
    expect(a).not.toContain('bg-sheen-b');
    expect(b).not.toContain('bg-sheen-a');
  });
});

describe('renderBodyGraph — interactive attrs', () => {
  it('emits data-* hooks only when interactiveAttrs:true', () => {
    const off = renderBodyGraph({ definedCenters: ['G'], signatureGates: [20] });
    expect(off).not.toContain('data-center');
    expect(off).not.toContain('data-channel');
    expect(off).not.toContain('data-gate');

    const on = renderBodyGraph(
      { definedCenters: ['G'], signatureGates: [20] },
      undefined,
      { interactiveAttrs: true },
    );
    expect(on).toContain('data-center="G"');
    expect(on).toContain('data-channel="8-1"');
    expect(on).toContain('data-gate="20"');
  });
});

describe('renderBodyGraph — escaping', () => {
  it('escapes theme values that contain XML-significant characters', () => {
    const svg = renderBodyGraph({ definedCenters: [] }, { font: 'A & "B"' });
    expect(svg).toContain('A &amp; &quot;B&quot;');
  });
});

describe('renderBodyGraph — spotlight centers', () => {
  it('renders a spotlight filter when spotlightCenters is set and glow is true', () => {
    const svg = renderBodyGraph(
      { definedCenters: ['Throat'] },
      undefined,
      { spotlightCenters: ['Throat'] },
    );
    // The spotlight blur filter should be present.
    expect(svg).toContain('id="bg-halo-spot"');
    // The spotlight halo uses the spotlight filter reference.
    expect(svg).toContain('filter="url(#bg-halo-spot)"');
  });

  it('spotlight halo uses higher opacity than the regular halo', () => {
    const spotlight = renderBodyGraph(
      { definedCenters: ['Throat'] },
      undefined,
      { spotlightCenters: ['Throat'] },
    );
    const regular = renderBodyGraph(
      { definedCenters: ['Throat'] },
      undefined,
      { spotlightCenters: [] },
    );
    // Spotlight uses opacity 0.72, regular uses 0.45.
    expect(spotlight).toContain('opacity="0.72"');
    expect(regular).toContain('opacity="0.45"');
  });

  it('non-spotlit defined centers still use the regular halo even when spotlightCenters is set', () => {
    const svg = renderBodyGraph(
      { definedCenters: ['G', 'Throat'] },
      undefined,
      { spotlightCenters: ['Throat'] },
    );
    // G is defined but not spotlit → regular halo filter
    expect(svg).toContain('filter="url(#bg-halo)"');
    // Throat is spotlit → spotlight filter
    expect(svg).toContain('filter="url(#bg-halo-spot)"');
  });

  it('idSuffix is applied to spotlight filter ids too', () => {
    const svg = renderBodyGraph(
      { definedCenters: ['G'] },
      undefined,
      { idSuffix: '-x', spotlightCenters: ['G'] },
    );
    expect(svg).toContain('id="bg-halo-spot-x"');
    expect(svg).toContain('filter="url(#bg-halo-spot-x)"');
  });
});

describe('geometry helpers', () => {
  it('returns a rect for square centers and points for the rest', () => {
    const sacral = centerShapePoints(CENTER_POS.Sacral);
    expect('rect' in sacral).toBe(true);
    const head = centerShapePoints(CENTER_POS.Head);
    expect('points' in head).toBe(true);
    const ajna = centerShapePoints(CENTER_POS.Ajna);
    expect('points' in ajna).toBe(true);
    const heart = centerShapePoints(CENTER_POS.Heart);
    expect('points' in heart).toBe(true);
    const g = centerShapePoints(CENTER_POS.G);
    expect('points' in g).toBe(true);
  });

  it('GATE_TO_CENTER is the inverse of CENTER_GATES', () => {
    expect(GATE_TO_CENTER[20]).toBe('Throat');
    expect(GATE_TO_CENTER[34]).toBe('Sacral');
    expect(GATE_TO_CENTER[64]).toBe('Head');
    // 64 gates total across all centers.
    expect(Object.keys(GATE_TO_CENTER).length).toBe(64);
  });
});

describe('resolveTheme', () => {
  it('returns the default theme unchanged when no input', () => {
    expect(resolveTheme()).toBe(DEFAULT_THEME);
  });

  it('overrides top-level tokens while preserving the rest', () => {
    const t = resolveTheme({ accent: '#abcdef' });
    expect(t.accent).toBe('#abcdef');
    expect(t.openColor).toBe(DEFAULT_THEME.openColor);
  });
});
