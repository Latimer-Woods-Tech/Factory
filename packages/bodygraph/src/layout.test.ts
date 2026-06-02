import { describe, it, expect } from 'vitest';
import {
  gateBadgeLayout,
  gatePosition,
  badgeBBox,
  centerShapeBBox,
  centerLabelBBox,
  boxesOverlap,
  type GatePosition,
} from './layout.js';
import { CENTER_GATES, GATE_TO_CENTER, VIEWBOX_WIDTH, VIEWBOX_HEIGHT } from './geometry.js';

/** Every gate number, 1..64, in chart order. */
const ALL_GATES: number[] = (() => {
  const out: number[] = [];
  for (const center of Object.keys(CENTER_GATES) as (keyof typeof CENTER_GATES)[]) {
    for (const g of CENTER_GATES[center]) out.push(g);
  }
  return out.sort((a, b) => a - b);
})();

/** Center keys, typed. */
const CENTERS = Object.keys(CENTER_GATES) as (keyof typeof CENTER_GATES)[];

/**
 * Asserts that a set of resolved gate positions has zero overlaps:
 * - no two badge bboxes overlap each other,
 * - no badge overlaps any center shape bbox,
 * - no badge overlaps any center label bbox.
 */
function assertNoOverlaps(positions: GatePosition[]): void {
  // badge ↔ badge
  for (let i = 0; i < positions.length; i++) {
    const bi = badgeBBox(positions[i]!);
    for (let j = i + 1; j < positions.length; j++) {
      const bj = badgeBBox(positions[j]!);
      expect(
        boxesOverlap(bi, bj),
        `gate ${positions[i]!.gate} overlaps gate ${positions[j]!.gate}`,
      ).toBe(false);
    }
  }
  // badge ↔ center shape  and  badge ↔ center label
  for (const center of CENTERS) {
    const shape = centerShapeBBox(center);
    const label = centerLabelBBox(center);
    for (const p of positions) {
      const b = badgeBBox(p);
      expect(boxesOverlap(b, shape), `gate ${p.gate} overlaps ${center} shape`).toBe(false);
      expect(boxesOverlap(b, label), `gate ${p.gate} overlaps ${center} label`).toBe(false);
    }
  }
}

describe('gateBadgeLayout — fully-activated chart (all 64 gates)', () => {
  const all = gateBadgeLayout(ALL_GATES);

  it('places every one of the 64 gates', () => {
    expect(all.length).toBe(64);
    expect(new Set(all.map((p) => p.gate)).size).toBe(64);
  });

  it('has ZERO overlaps: no badge ↔ badge, badge ↔ shape, or badge ↔ label', () => {
    assertNoOverlaps(all);
  });

  it('keeps every badge inside the 300×420 viewBox', () => {
    for (const p of all) {
      const b = badgeBBox(p);
      expect(b.minX).toBeGreaterThanOrEqual(-1);
      expect(b.minY).toBeGreaterThanOrEqual(-1);
      expect(b.maxX).toBeLessThanOrEqual(VIEWBOX_WIDTH + 1);
      expect(b.maxY).toBeLessThanOrEqual(VIEWBOX_HEIGHT + 1);
    }
  });

  it('places each gate around its OWN center (within reach of the shape)', () => {
    for (const p of all) {
      expect(p.center).toBe(GATE_TO_CENTER[p.gate]);
    }
  });
});

describe('gateBadgeLayout — realistic dense subsets', () => {
  // A few realistic dense activation sets (full single centers + mixed charts).
  const SUBSETS: Record<string, number[]> = {
    'Throat (11 gates) fully lit': [...CENTER_GATES.Throat],
    'Root (9 gates) fully lit': [...CENTER_GATES.Root],
    'Sacral (9 gates) fully lit': [...CENTER_GATES.Sacral],
    'three densest centers together': [
      ...CENTER_GATES.Throat,
      ...CENTER_GATES.Root,
      ...CENTER_GATES.Sacral,
    ],
    'a wide manifestor-ish chart': [64, 47, 17, 62, 23, 43, 8, 1, 31, 7, 20, 34, 57, 10, 51, 25],
    'every other gate': ALL_GATES.filter((_, i) => i % 2 === 0),
  };

  for (const [name, gates] of Object.entries(SUBSETS)) {
    it(`has zero overlaps for: ${name}`, () => {
      assertNoOverlaps(gateBadgeLayout(gates));
    });
  }
});

describe('gateBadgeLayout — determinism', () => {
  it('returns identical positions across repeated calls (same input)', () => {
    const a = gateBadgeLayout(ALL_GATES);
    const b = gateBadgeLayout([...ALL_GATES].reverse());
    expect(a).toEqual(b);
  });

  it('full-chart default argument equals the explicit all-64 list', () => {
    expect(gateBadgeLayout()).toEqual(gateBadgeLayout(ALL_GATES));
  });
});

describe('gateBadgeLayout — stability (slot independent of active subset)', () => {
  it("a gate's position never changes based on which other gates are active", () => {
    const full = new Map(gateBadgeLayout(ALL_GATES).map((p) => [p.gate, p]));
    // Several different active subsets — each gate must keep its full-chart slot.
    const subsets: number[][] = [
      [20],
      [20, 34, 57],
      [...CENTER_GATES.Throat],
      [64, 61, 63, 20, 34, 3, 60],
      ALL_GATES.filter((_, i) => i % 3 === 0),
    ];
    for (const subset of subsets) {
      for (const p of gateBadgeLayout(subset)) {
        const ref = full.get(p.gate)!;
        expect(p.x).toBe(ref.x);
        expect(p.y).toBe(ref.y);
        expect(p.center).toBe(ref.center);
      }
    }
  });

  it('gatePosition() agrees with the full layout', () => {
    for (const p of gateBadgeLayout(ALL_GATES)) {
      expect(gatePosition(p.gate)).toEqual(p);
    }
  });

  it('ignores unknown gate numbers', () => {
    expect(gateBadgeLayout([999, 0, -5]).length).toBe(0);
    expect(gatePosition(999)).toBeUndefined();
  });
});

describe('gateBadgeLayout — directional intent (pull toward channels)', () => {
  it('pulls the Head cluster (64/61/63) downward toward Ajna on average', () => {
    // Head is at y=30, Ajna at y=80. All three Head gates channel to Ajna, so
    // the cluster's centroid must sit below the Head center (collective pull).
    const ys = CENTER_GATES.Head.map((g) => gatePosition(g)!.y);
    const centroid = ys.reduce((s, y) => s + y, 0) / ys.length;
    expect(centroid).toBeGreaterThan(30);
  });

  it('pulls Throat→SolarPlexus gates (35/36 etc.) toward the right where Solar sits', () => {
    // Gate 36 channels Throat(150) → SolarPlexus(210): it should land right of
    // the Throat center (x > 150), reflecting its pull direction.
    expect(gatePosition(36)!.x).toBeGreaterThan(150);
  });
});
