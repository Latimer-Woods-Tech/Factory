/**
 * Canonical Energy Blueprint body-graph geometry and structural data.
 *
 * Self-contained, zero-dependency port of the selfprime web generator
 * (`client/components/bodygraph.js` + `client/data/hd-data.js`). This module is
 * the single source of truth for the 9 centers, their HD shapes, the 36
 * channels, the gate-badge offsets, and the center<->gate maps. Nothing here
 * imports from selfprime; the data is copied verbatim so the engine renders the
 * same chart everywhere (film, web, PDF).
 *
 * Coordinate system: a **300×420 viewBox** matching the canonical web source.
 *
 * @module geometry
 */

/** The nine Human Design energy centers, in render order (top to bottom). */
export type CenterKey =
  | 'Head'
  | 'Ajna'
  | 'Throat'
  | 'G'
  | 'Heart'
  | 'SolarPlexus'
  | 'Sacral'
  | 'Spleen'
  | 'Root';

/** Geometric shape primitive used to draw a center. */
export type CenterShape =
  | 'triangle-up'
  | 'triangle-down'
  | 'triangle-right'
  | 'square'
  | 'diamond';

/** Position + shape of a single center within the 300×420 viewBox. */
export interface CenterPosition {
  /** Center x coordinate. */
  readonly x: number;
  /** Center y coordinate. */
  readonly y: number;
  /** HD shape used to render the center. */
  readonly shape: CenterShape;
}

/**
 * Center positions (x, y) + HD shape within a 300×420 viewBox.
 * Ported verbatim from the canonical `CENTER_POS`.
 */
export const CENTER_POS: Readonly<Record<CenterKey, CenterPosition>> = {
  Head: { x: 150, y: 30, shape: 'triangle-up' },
  Ajna: { x: 150, y: 80, shape: 'triangle-down' },
  Throat: { x: 150, y: 135, shape: 'square' },
  G: { x: 150, y: 200, shape: 'diamond' },
  Heart: { x: 95, y: 185, shape: 'triangle-right' },
  SolarPlexus: { x: 210, y: 275, shape: 'triangle-right' },
  Sacral: { x: 150, y: 290, shape: 'square' },
  Spleen: { x: 90, y: 275, shape: 'square' },
  Root: { x: 150, y: 370, shape: 'square' },
};

/** The half-size used by {@link centerShapePoints}. Ported as `CENTER_SIZE`. */
export const CENTER_SIZE = 22;

/**
 * The 36 channels, keyed by `"gateA-gateB"`, each mapping to the pair of
 * centers it connects. Ported verbatim from the canonical `CHANNEL_LINES`.
 */
export const CHANNEL_LINES: Readonly<Record<string, readonly [CenterKey, CenterKey]>> = {
  '64-47': ['Head', 'Ajna'],
  '61-24': ['Head', 'Ajna'],
  '63-4': ['Head', 'Ajna'],
  '17-62': ['Ajna', 'Throat'],
  '43-23': ['Ajna', 'Throat'],
  '11-56': ['Ajna', 'Throat'],
  '16-48': ['Throat', 'Spleen'],
  '20-57': ['Throat', 'Spleen'],
  '20-34': ['Throat', 'Sacral'],
  '20-10': ['Throat', 'G'],
  '31-7': ['Throat', 'G'],
  '33-13': ['Throat', 'G'],
  '45-21': ['Throat', 'Heart'],
  '35-36': ['Throat', 'SolarPlexus'],
  '12-22': ['Throat', 'SolarPlexus'],
  '8-1': ['Throat', 'G'],
  '25-51': ['G', 'Heart'],
  '46-29': ['G', 'Sacral'],
  '10-34': ['G', 'Sacral'],
  '15-5': ['G', 'Sacral'],
  '2-14': ['G', 'Sacral'],
  '10-57': ['G', 'Spleen'],
  '26-44': ['Heart', 'Spleen'],
  '40-37': ['Heart', 'SolarPlexus'],
  '6-59': ['Sacral', 'SolarPlexus'],
  '36-35': ['SolarPlexus', 'Throat'],
  '30-41': ['SolarPlexus', 'Root'],
  '55-39': ['SolarPlexus', 'Root'],
  '49-19': ['SolarPlexus', 'Root'],
  '42-53': ['Sacral', 'Root'],
  '3-60': ['Sacral', 'Root'],
  '9-52': ['Sacral', 'Root'],
  '27-50': ['Sacral', 'Spleen'],
  '34-57': ['Sacral', 'Spleen'],
  '28-38': ['Spleen', 'Root'],
  '18-58': ['Spleen', 'Root'],
  '32-54': ['Spleen', 'Root'],
  '48-16': ['Spleen', 'Throat'],
  '57-20': ['Spleen', 'Throat'],
  '44-26': ['Spleen', 'Heart'],
};

/**
 * Gate-badge offsets (relative to a center's x/y) — up to 12 positions per
 * center. Ported verbatim from the canonical `GATE_OFFSETS`.
 */
export const GATE_OFFSETS: ReadonlyArray<{ readonly dx: number; readonly dy: number }> = [
  { dx: -34, dy: 0 },
  { dx: 34, dy: 0 },
  { dx: 0, dy: -28 },
  { dx: 0, dy: 28 },
  { dx: -28, dy: -18 },
  { dx: 28, dy: -18 },
  { dx: -28, dy: 18 },
  { dx: 28, dy: 18 },
  { dx: -38, dy: -28 },
  { dx: 38, dy: -28 },
  { dx: -20, dy: 36 },
  { dx: 20, dy: 36 },
];

/**
 * Center → gates map. Ported verbatim from `HD_CENTERS[center].gates`. Used to
 * place gate badges; the engine is self-contained and does not import from
 * selfprime.
 */
export const CENTER_GATES: Readonly<Record<CenterKey, readonly number[]>> = {
  Head: [61, 63, 64],
  Ajna: [4, 11, 17, 24, 43, 47],
  Throat: [8, 12, 16, 20, 23, 31, 33, 35, 45, 56, 62],
  G: [1, 2, 7, 10, 13, 15, 25, 46],
  Heart: [21, 26, 40, 51],
  SolarPlexus: [6, 22, 30, 36, 37, 49, 55],
  Sacral: [3, 5, 9, 14, 27, 29, 34, 42, 59],
  Spleen: [18, 28, 32, 44, 48, 50, 57],
  Root: [19, 38, 39, 41, 52, 53, 54, 58, 60],
};

/**
 * Gate → center reverse lookup, derived from {@link CENTER_GATES}. Mirrors the
 * canonical `HD_GATE_TO_CENTER`.
 */
export const GATE_TO_CENTER: Readonly<Record<number, CenterKey>> = (() => {
  const map: Record<number, CenterKey> = {};
  for (const center of Object.keys(CENTER_GATES) as CenterKey[]) {
    for (const gate of CENTER_GATES[center]) map[gate] = center;
  }
  return map;
})();

/** Ordered list of center keys, in canonical render order. */
export const CENTER_ORDER: readonly CenterKey[] = Object.keys(CENTER_POS) as CenterKey[];

/**
 * Returns the polygon `points` / rect geometry for a center shape, ported from
 * `drawCenterShape`. Squares are returned as `{ rect }`; all other shapes as a
 * `{ points }` string suitable for an SVG `<polygon>`.
 *
 * @param pos - The center position + shape.
 * @param size - Half-size; defaults to {@link CENTER_SIZE}.
 * @returns Either a polygon points string or a rect spec.
 */
export function centerShapePoints(
  pos: CenterPosition,
  size: number = CENTER_SIZE,
): { points: string } | { rect: { x: number; y: number; w: number; h: number } } {
  const s = size;
  const { x, y } = pos;
  switch (pos.shape) {
    case 'triangle-up':
      return { points: `${x},${y - s} ${x - s},${y + s * 0.6} ${x + s},${y + s * 0.6}` };
    case 'triangle-down':
      return { points: `${x - s},${y - s * 0.6} ${x + s},${y - s * 0.6} ${x},${y + s}` };
    case 'triangle-right':
      return { points: `${x - s * 0.6},${y - s} ${x + s},${y} ${x - s * 0.6},${y + s}` };
    case 'diamond':
      return { points: `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}` };
    case 'square':
    default:
      return { rect: { x: x - s, y: y - s, w: s * 2, h: s * 2 } };
  }
}

/** Short uppercase labels drawn inside each center. Ported from `drawCenterLabel`. */
export const CENTER_LABELS: Readonly<Record<CenterKey, string>> = {
  Head: 'HEAD',
  Ajna: 'AJNA',
  Throat: 'THROAT',
  G: 'G/SELF',
  Heart: 'HEART',
  SolarPlexus: 'SOLAR',
  Sacral: 'SACRAL',
  Spleen: 'SPLEEN',
  Root: 'ROOT',
};

/** Canonical viewBox width. */
export const VIEWBOX_WIDTH = 300;
/** Canonical viewBox height. */
export const VIEWBOX_HEIGHT = 420;
