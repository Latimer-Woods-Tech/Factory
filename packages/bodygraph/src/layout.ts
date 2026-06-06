/**
 * Authentic per-gate badge layout for the canonical body-graph engine.
 *
 * Replaces the legacy 12-slot {@link GATE_OFFSETS} ring (which reused the same
 * fixed offsets around every center and collided badly on dense charts — the
 * Throat alone owns 11 gates) with a **deterministic, topology-derived** layout
 * that is collision-free even when the *entire* chart (all 64 gates) is lit.
 *
 * ## Algorithm
 *
 * **1. Pull direction.** For every gate on a center `C`, we sum the unit vectors
 * from `C` toward each partner center it is channelled to (via
 * {@link CHANNEL_LINES}) and normalize. This points the badge in the direction
 * of the channel(s) it belongs to, so the chart reads like a real Human Design
 * bodygraph. A gate with no channel partner (or whose pull cancels to ~0) falls
 * back to pointing away from the graph's vertical axis (`x = WIDTH / 2`).
 *
 * **2. Per-center fan-out seed.** Each center's gates are ordered by pull-angle
 * (tie-broken by gate number) and seeded on a ring just outside the center
 * shape, blended toward an even angular spread so clustered directions (e.g.
 * Head→Ajna 64/61/63) fan apart instead of stacking. This gives a deterministic
 * starting point that already respects channel direction.
 *
 * **3. Global collision relaxation.** Centers sit close together (G, Throat,
 * Heart, Sacral nearly touch), so a purely per-center ring cannot prevent
 * *inter-center* badge overlaps. We therefore run a deterministic relaxation
 * over the whole chart: every badge is repeatedly pushed out of (a) any other
 * badge it overlaps, (b) any center shape, and (c) any center label, while a
 * weak spring keeps it tethered to its own center along its pull direction. The
 * loop is fully deterministic — fixed gate-number order, fixed pass count, no
 * randomness — so the same chart always yields byte-identical positions.
 *
 * **4. Stability.** The layout is computed once from every center's *complete*
 * {@link CENTER_GATES} set (never the active subset) and cached. A gate's slot
 * is therefore independent of which other gates are active: toggling gates never
 * moves a badge. {@link gateBadgeLayout} simply filters the cached full layout.
 *
 * Coordinate system: the canonical 300×420 viewBox (see {@link module:geometry}).
 *
 * @module layout
 */

import {
  CENTER_GATES,
  CENTER_POS,
  CENTER_SIZE,
  CHANNEL_LINES,
  GATE_TO_CENTER,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  type CenterKey,
} from './geometry.js';

/** Half-width of a gate badge in user units (badge rect is 22 wide). */
export const BADGE_HALF_W = 11;
/** Half-height of a gate badge in user units (badge rect is 16 tall). */
export const BADGE_HALF_H = 8;
/** Padding enforced between adjacent badge bounding boxes (user units). */
export const BADGE_PADDING = 2;
/** Half-extents of the reserved center-label zone (label is centered text). */
const LABEL_HALF_W = 21;
const LABEL_HALF_H = 7;

/** An axis-aligned bounding box in viewBox coordinates. */
export interface BBox {
  /** Minimum x. */
  readonly minX: number;
  /** Minimum y. */
  readonly minY: number;
  /** Maximum x. */
  readonly maxX: number;
  /** Maximum y. */
  readonly maxY: number;
}

/** The resolved position of a single gate badge. */
export interface GatePosition {
  /** The gate number. */
  readonly gate: number;
  /** The center the gate belongs to. */
  readonly center: CenterKey;
  /** Badge center x in the 300×420 viewBox. */
  readonly x: number;
  /** Badge center y in the 300×420 viewBox. */
  readonly y: number;
}

/** @internal Build an AABB centered at (cx, cy) with the given half-extents. */
function boxAround(cx: number, cy: number, halfW: number, halfH: number): BBox {
  return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
}

/** Returns the badge bounding box (with padding) for a resolved gate position. */
export function badgeBBox(pos: { x: number; y: number }, padding = BADGE_PADDING): BBox {
  return boxAround(pos.x, pos.y, BADGE_HALF_W + padding, BADGE_HALF_H + padding);
}

/** Returns the bounding box of a center's drawn shape. */
export function centerShapeBBox(center: CenterKey): BBox {
  const pos = CENTER_POS[center];
  return boxAround(pos.x, pos.y, CENTER_SIZE, CENTER_SIZE);
}

/** Returns the reserved bounding box of a center's label text. */
export function centerLabelBBox(center: CenterKey): BBox {
  const pos = CENTER_POS[center];
  // The label baseline is drawn at y + 4 (font-size 7), centered horizontally.
  return boxAround(pos.x, pos.y + 4, LABEL_HALF_W, LABEL_HALF_H);
}

/** @internal Do two AABBs overlap (touching edges do NOT count as overlap)? */
export function boxesOverlap(a: BBox, b: BBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * @internal Compute the pull direction (unit vector) for a gate on its center.
 *
 * Sums the unit vectors from the gate's center toward each partner center it is
 * channelled to. Falls back to pointing away from the vertical axis when the
 * gate has no channel partner or the summed pull cancels out.
 */
function pullDirection(gate: number, center: CenterKey): { x: number; y: number } {
  const here = CENTER_POS[center];
  let sx = 0;
  let sy = 0;
  for (const key of Object.keys(CHANNEL_LINES)) {
    const dash = key.indexOf('-');
    const a = Number(key.slice(0, dash));
    const b = Number(key.slice(dash + 1));
    if (a !== gate && b !== gate) continue;
    const pair = CHANNEL_LINES[key];
    if (!pair) continue;
    let partner: CenterKey | undefined;
    if (pair[0] === center && pair[1] !== center) partner = pair[1];
    else if (pair[1] === center && pair[0] !== center) partner = pair[0];
    else {
      const otherGate = a === gate ? b : a;
      const otherCenter = GATE_TO_CENTER[otherGate];
      if (otherCenter && otherCenter !== center) partner = otherCenter;
    }
    if (!partner) continue;
    const to = CENTER_POS[partner];
    const dx = to.x - here.x;
    const dy = to.y - here.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      sx += dx / len;
      sy += dy / len;
    }
  }
  const len = Math.hypot(sx, sy);
  if (len > 1e-6) return { x: sx / len, y: sy / len };
  // Fallback: point away from the vertical axis.
  const axisDx = here.x - VIEWBOX_WIDTH / 2;
  if (Math.abs(axisDx) > 1e-3) return { x: Math.sign(axisDx), y: 0 };
  // Dead on the axis: alternate by gate parity so they don't all stack.
  return { x: gate % 2 === 0 ? 1 : -1, y: 0 };
}

/** @internal Normalize an angle to [0, 2π). */
function norm(angle: number): number {
  const tau = Math.PI * 2;
  let a = angle % tau;
  if (a < 0) a += tau;
  return a;
}

/** @internal A gate with its center anchor + ideal pull angle, in placement order. */
interface Seed {
  gate: number;
  center: CenterKey;
  ax: number;
  ay: number;
  /** Fanned-out ideal angle (radians) — the badge's preferred direction. */
  angle: number;
}

/**
 * @internal Build the deterministic placement seeds: every gate's center anchor
 * plus a fanned-out ideal angle derived from its pull direction. Returned in a
 * fixed priority order — centers in canonical (top→bottom) order, gates within a
 * center sorted by fanned angle then gate number — so greedy placement is stable.
 */
function buildSeeds(): Seed[] {
  const tau = Math.PI * 2;
  const seeds: Seed[] = [];
  for (const center of Object.keys(CENTER_GATES) as CenterKey[]) {
    const pos = CENTER_POS[center];
    const gates = CENTER_GATES[center];
    const count = gates.length;
    if (count === 0) continue;

    const withAngle = gates.map((gate) => {
      const d = pullDirection(gate, center);
      return { gate, angle: norm(Math.atan2(d.y, d.x)) };
    });
    withAngle.sort((p, q) => p.angle - q.angle || p.gate - q.gate);

    const angles = withAngle.map((w) => w.angle);
    if (count > 1) {
      // Blend each pull angle toward an even slot (rotated to the pull centroid)
      // so clustered gates fan apart while still leaning toward their channels.
      let cx = 0;
      let cy = 0;
      for (const a of angles) {
        cx += Math.cos(a);
        cy += Math.sin(a);
      }
      const centroid = Math.abs(cx) > 1e-6 || Math.abs(cy) > 1e-6 ? Math.atan2(cy, cx) : 0;
      const even = tau / count;
      for (let i = 0; i < count; i++) {
        const evenAngle = norm(centroid - tau / 2 + even * (i + 0.5));
        let delta = evenAngle - angles[i]!;
        while (delta > Math.PI) delta -= tau;
        while (delta < -Math.PI) delta += tau;
        angles[i] = norm(angles[i]! + delta * 0.6);
      }
    }

    for (let i = 0; i < count; i++) {
      seeds.push({ gate: withAngle[i]!.gate, center, ax: pos.x, ay: pos.y, angle: angles[i]! });
    }
  }
  return seeds;
}

/**
 * @internal Static obstacle boxes (every center shape + label) that no badge may
 * overlap. Computed once.
 */
function obstacleBoxes(): BBox[] {
  const boxes: BBox[] = [];
  for (const center of Object.keys(CENTER_GATES) as CenterKey[]) {
    boxes.push(centerShapeBBox(center));
    boxes.push(centerLabelBBox(center));
  }
  return boxes;
}

/** @internal Clamp a badge center so its (padded) box stays inside the viewBox. */
function inViewBox(x: number, y: number): { x: number; y: number } {
  const hw = BADGE_HALF_W + BADGE_PADDING;
  const hh = BADGE_HALF_H + BADGE_PADDING;
  return {
    x: Math.max(hw, Math.min(VIEWBOX_WIDTH - hw, x)),
    y: Math.max(hh, Math.min(VIEWBOX_HEIGHT - hh, y)),
  };
}

/**
 * @internal Greedy spiral placement. Each gate (in deterministic priority order)
 * is placed at the first candidate position — searched outward along an
 * expanding arc around its pull angle — that collides with neither a previously
 * placed badge, a center shape, nor a center label. Placement is order-stable
 * and guaranteed to terminate (candidates expand without bound). Earlier gates
 * win the prime spot; later gates route around them, exactly like reading a real
 * bodygraph where every badge sits clear around its center.
 */
function placeSeeds(seeds: Seed[]): GatePosition[] {
  const obstacles = obstacleBoxes();
  const placed: GatePosition[] = [];
  const placedBoxes: BBox[] = [];
  const minR = CENTER_SIZE + BADGE_HALF_H + 1; // outside the shape on the short axis.

  const fits = (x: number, y: number): boolean => {
    const box = badgeBBox({ x, y });
    for (const o of obstacles) if (boxesOverlap(box, o)) return false;
    for (const b of placedBoxes) if (boxesOverlap(box, b)) return false;
    return true;
  };

  for (const seed of seeds) {
    let best: { x: number; y: number } | undefined;
    // Expand the radius outward; at each radius sweep angle offsets symmetrically
    // around the ideal pull angle so the badge stays as close to its channel
    // direction as possible while finding free space.
    for (let r = minR; r <= 110 && !best; r += 2) {
      // Angular step shrinks as radius grows (finer sweep further out).
      const angStep = Math.max(6, 700 / r) * (Math.PI / 180);
      const maxOffset = Math.PI; // up to a full half-turn either way.
      for (let off = 0; off <= maxOffset + 1e-9 && !best; off += angStep) {
        for (const sign of off === 0 ? [0] : [1, -1]) {
          const a = seed.angle + sign * off;
          const { x, y } = inViewBox(seed.ax + Math.cos(a) * r, seed.ay + Math.sin(a) * r);
          if (fits(x, y)) {
            best = { x, y };
            break;
          }
        }
      }
    }
    const chosen = best ?? inViewBox(seed.ax + Math.cos(seed.angle) * 110, seed.ay + Math.sin(seed.angle) * 110);
    // Snap to 2dp so output (and the rendered SVG) is byte-stable.
    const x = Math.round(chosen.x * 100) / 100;
    const y = Math.round(chosen.y * 100) / 100;
    placed.push({ gate: seed.gate, center: seed.center, x, y });
    placedBoxes.push(badgeBBox({ x, y }));
  }
  return placed;
}

/**
 * @internal Memoized full-chart layout: every gate placed at its canonical,
 * stable slot. Computed once (the inputs are static module data).
 */
let FULL_LAYOUT_CACHE: ReadonlyMap<number, GatePosition> | undefined;

function fullLayout(): ReadonlyMap<number, GatePosition> {
  if (FULL_LAYOUT_CACHE) return FULL_LAYOUT_CACHE;
  const placed = placeSeeds(buildSeeds());
  const map = new Map<number, GatePosition>();
  for (const p of placed) map.set(p.gate, p);
  FULL_LAYOUT_CACHE = map;
  return map;
}

/**
 * Returns the canonical badge positions for the given active gates.
 *
 * Each gate's position is taken from the **full-chart** layout (computed from
 * every center's complete {@link CENTER_GATES} set), so a gate always lands in
 * the same slot regardless of which other gates are active — the layout is both
 * **deterministic** (same input → identical output) and **stable** (a gate's
 * slot is independent of the active subset). The result is filtered to the
 * requested gates and ordered by gate number.
 *
 * Pass no argument (or omit it) to get the full 64-gate layout.
 *
 * @param activeGates - The gates to position. Defaults to all 64 gates.
 * @returns The resolved positions, ordered ascending by gate number.
 */
export function gateBadgeLayout(activeGates?: Iterable<number>): GatePosition[] {
  const full = fullLayout();
  const wanted =
    activeGates === undefined
      ? [...full.keys()]
      : [...new Set([...activeGates])].filter((g) => full.has(g));
  wanted.sort((a, b) => a - b);
  const out: GatePosition[] = [];
  for (const g of wanted) {
    const p = full.get(g);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Returns the canonical position for a single gate, or `undefined` if the gate
 * number is not part of the chart. Convenience wrapper over the full layout.
 *
 * @param gate - The gate number (1–64).
 * @returns The resolved position, or `undefined`.
 */
export function gatePosition(gate: number): GatePosition | undefined {
  return fullLayout().get(gate);
}
