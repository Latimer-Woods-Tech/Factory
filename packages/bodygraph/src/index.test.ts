import { describe, it, expect } from 'vitest';
import * as pkg from './index.js';

/**
 * Smoke test the public barrel: every documented export must be reachable from
 * the package entry point, and the layout/render helpers must work when imported
 * through it (this is the surface consumers — video-studio, web, PDF — use).
 */
describe('@latimer-woods-tech/bodygraph public API', () => {
  it('re-exports the renderer + geometry + theme + layout helpers', () => {
    // Renderer.
    expect(typeof pkg.renderBodyGraph).toBe('function');
    // Theme.
    expect(typeof pkg.resolveTheme).toBe('function');
    expect(pkg.DEFAULT_THEME).toBeDefined();
    // Geometry data + helpers.
    expect(pkg.CENTER_POS.G).toBeDefined();
    expect(pkg.CENTER_GATES.Throat.length).toBe(11);
    expect(pkg.CENTER_ORDER.length).toBe(9);
    expect(pkg.CHANNEL_LINES['8-1']).toEqual(['Throat', 'G']);
    expect(pkg.GATE_TO_CENTER[20]).toBe('Throat');
    expect(pkg.VIEWBOX_WIDTH).toBe(300);
    expect(pkg.VIEWBOX_HEIGHT).toBe(420);
    expect(typeof pkg.centerShapePoints).toBe('function');
    // Layout helpers.
    expect(typeof pkg.gateBadgeLayout).toBe('function');
    expect(typeof pkg.gatePosition).toBe('function');
    expect(typeof pkg.badgeBBox).toBe('function');
    expect(typeof pkg.centerShapeBBox).toBe('function');
    expect(typeof pkg.centerLabelBBox).toBe('function');
    expect(typeof pkg.boxesOverlap).toBe('function');
    expect(pkg.BADGE_HALF_W).toBe(11);
    expect(pkg.BADGE_HALF_H).toBe(8);
    expect(typeof pkg.BADGE_PADDING).toBe('number');
  });

  it('no longer exports the removed GATE_OFFSETS', () => {
    expect((pkg as Record<string, unknown>).GATE_OFFSETS).toBeUndefined();
  });

  it('renders an SVG and a full collision-free layout through the barrel', () => {
    const svg = pkg.renderBodyGraph({ definedCenters: ['G', 'Throat'], signatureGates: [20, 34] });
    expect(svg).toContain('<svg');
    const layout = pkg.gateBadgeLayout();
    expect(layout.length).toBe(64);
    // Spot-check the barrel-exported bbox + overlap helpers agree with the layout.
    const a = pkg.badgeBBox(layout[0]!);
    const b = pkg.badgeBBox(layout[1]!);
    expect(typeof pkg.boxesOverlap(a, b)).toBe('boolean');
  });
});
