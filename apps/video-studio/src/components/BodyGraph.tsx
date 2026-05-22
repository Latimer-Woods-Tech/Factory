import React from 'react';
import { interpolate } from 'remotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BodyGraphProps {
  frame: number;
  fps: number;
  /** Centers that are defined (solid glow). Keys match CENTER_DEFS. */
  definedCenters?: string[];
  /** Type-based glow colour for defined centers. Default '#c9a84c'. */
  typeColor?: string;
  /** Scale applied to the full SVG. Default 1.0. */
  scale?: number;
  /** X offset of the SVG container. Default positions body graph in the right 45% area. */
  x?: number;
  /** Y offset. Default vertically centres within 1080px. */
  y?: number;
  /** Whether defined centers breathe (pulse). Default true. */
  breathe?: boolean;
}

// ---------------------------------------------------------------------------
// Canonical center geometry (viewport 340×480)
// ---------------------------------------------------------------------------

type CenterShape = 'diamond' | 'triangle-down' | 'rect' | 'triangle-right' | 'triangle-left';

interface CenterDef {
  key: string;
  label: string;
  shape: CenterShape;
  cx: number;
  cy: number;
  /** Half-size for diamonds, radius for triangles, half-width for rects. */
  size: number;
  /** Only for rect shapes. */
  width?: number;
  height?: number;
}

const CENTER_DEFS: CenterDef[] = [
  { key: 'head',         label: 'Head',         shape: 'diamond',        cx: 170, cy: 28,  size: 40 },
  { key: 'ajna',         label: 'Ajna',          shape: 'triangle-down',  cx: 170, cy: 90,  size: 36 },
  { key: 'throat',       label: 'Throat',        shape: 'rect',           cx: 135, cy: 152, size: 0, width: 70, height: 34 },
  { key: 'g',            label: 'G Center',      shape: 'diamond',        cx: 170, cy: 236, size: 52 },
  { key: 'heart',        label: 'Heart',         shape: 'rect',           cx: 232, cy: 200, size: 0, width: 30, height: 30 },
  { key: 'solar_plexus', label: 'Solar Plexus',  shape: 'triangle-right', cx: 246, cy: 308, size: 36 },
  { key: 'sacral',       label: 'Sacral',        shape: 'rect',           cx: 120, cy: 316, size: 0, width: 100, height: 44 },
  { key: 'spleen',       label: 'Spleen',        shape: 'triangle-left',  cx: 94,  cy: 244, size: 36 },
  { key: 'root',         label: 'Root',          shape: 'rect',           cx: 148, cy: 424, size: 0, width: 84, height: 30 },
];

// ---------------------------------------------------------------------------
// Channel paths (anatomical connections between centers)
// These are approximate cubic bezier paths between center midpoints.
// ---------------------------------------------------------------------------

interface ChannelDef {
  from: string;
  to: string;
}

const CHANNEL_DEFS: ChannelDef[] = [
  { from: 'head',         to: 'ajna' },
  { from: 'ajna',         to: 'throat' },
  { from: 'throat',       to: 'g' },
  { from: 'throat',       to: 'heart' },
  { from: 'g',            to: 'sacral' },
  { from: 'g',            to: 'spleen' },
  { from: 'heart',        to: 'g' },
  { from: 'spleen',       to: 'sacral' },
  { from: 'spleen',       to: 'solar_plexus' },
  { from: 'solar_plexus', to: 'sacral' },
  { from: 'sacral',       to: 'root' },
  { from: 'solar_plexus', to: 'root' },
];

// ---------------------------------------------------------------------------
// SVG path generators for each center shape
// ---------------------------------------------------------------------------

/** Returns SVG path `d` attribute for a diamond centred at (cx, cy). */
const diamondPath = (cx: number, cy: number, size: number): string => {
  const s = size / 2;
  return `M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`;
};

/** Returns SVG path `d` for a downward-pointing triangle. */
const triangleDownPath = (cx: number, cy: number, size: number): string => {
  const s = size / 2;
  return `M ${cx - s} ${cy - s * 0.6} L ${cx + s} ${cy - s * 0.6} L ${cx} ${cy + s * 0.6} Z`;
};

/** Returns SVG path `d` for a right-leaning triangle (Solar Plexus). */
const triangleRightPath = (cx: number, cy: number, size: number): string => {
  const s = size / 2;
  return `M ${cx - s * 0.6} ${cy - s} L ${cx + s * 0.6} ${cy} L ${cx - s * 0.6} ${cy + s} Z`;
};

/** Returns SVG path `d` for a left-leaning triangle (Spleen). */
const triangleLeftPath = (cx: number, cy: number, size: number): string => {
  const s = size / 2;
  return `M ${cx + s * 0.6} ${cy - s} L ${cx - s * 0.6} ${cy} L ${cx + s * 0.6} ${cy + s} Z`;
};

const getCenterPath = (c: CenterDef): string => {
  switch (c.shape) {
    case 'diamond':        return diamondPath(c.cx, c.cy, c.size);
    case 'triangle-down':  return triangleDownPath(c.cx, c.cy, c.size);
    case 'triangle-right': return triangleRightPath(c.cx, c.cy, c.size);
    case 'triangle-left':  return triangleLeftPath(c.cx, c.cy, c.size);
    case 'rect': {
      const w = c.width ?? 40;
      const h = c.height ?? 30;
      return `M ${c.cx - w / 2} ${c.cy - h / 2} h ${w} v ${h} h ${-w} Z`;
    }
  }
};

// ---------------------------------------------------------------------------
// Channel path builder — draws a straight line between center midpoints
// ---------------------------------------------------------------------------

const getChannelPath = (from: CenterDef, to: CenterDef): string =>
  `M ${from.cx} ${from.cy} L ${to.cx} ${to.cy}`;

const findCenter = (key: string): CenterDef | undefined =>
  CENTER_DEFS.find(c => c.key === key);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CenterShapeProps {
  def: CenterDef;
  defined: boolean;
  typeColor: string;
  frame: number;
  breathe: boolean;
}

/** Renders a single center as either defined (glowing fill) or undefined (outline). */
const CenterShape: React.FC<CenterShapeProps> = ({ def, defined, typeColor, frame, breathe }) => {
  const path = getCenterPath(def);

  if (defined) {
    // Breathing pulse: opacity 0.7 → 1.0 → 0.7 over 120 frames
    const pulseOpacity = breathe
      ? interpolate(Math.sin(frame / 60), [-1, 1], [0.7, 1.0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0.85;

    return (
      <g>
        {/* Glow layer — blurred duplicate underneath */}
        <path
          d={path}
          fill={typeColor}
          opacity={pulseOpacity * 0.5}
          style={{ filter: 'blur(6px)' }}
        />
        {/* Solid fill */}
        <path
          d={path}
          fill={typeColor}
          opacity={pulseOpacity * 0.8}
          stroke={typeColor}
          strokeWidth={1.5}
          strokeOpacity={0.9}
        />
      </g>
    );
  }

  // Undefined center: very faint with slow white shimmer
  const shimmerOpacity = interpolate(Math.sin(frame / 150 + def.cx * 0.01), [-1, 1], [0.18, 0.28], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <path
      d={path}
      fill="#ffffff"
      fillOpacity={0.1}
      stroke="#ffffff"
      strokeWidth={1}
      strokeOpacity={shimmerOpacity}
    />
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * BodyGraph — SVG rendering of the Human Design body graph.
 *
 * 9 centers drawn at canonical positions in a 340×480 viewport,
 * connected by anatomical channel lines. Defined centers glow and breathe;
 * undefined centers hold a quiet, semi-transparent outline.
 */
export const BodyGraph: React.FC<BodyGraphProps> = ({
  frame,
  fps,
  definedCenters = [],
  typeColor = '#c9a84c',
  scale = 1.0,
  x,
  y,
  breathe = true,
}) => {
  // Default position: right-center area of a 1920×1080 frame
  const resolvedX = x ?? 1920 * 0.575;
  const resolvedY = y ?? (1080 - 480 * scale) / 2;

  const definedSet = new Set(definedCenters);

  return (
    <div
      style={{
        position: 'absolute',
        left: resolvedX,
        top: resolvedY,
        transformOrigin: 'top left',
        transform: `scale(${String(scale)})`,
        pointerEvents: 'none',
      }}
    >
      <svg
        width={340}
        height={480}
        viewBox="0 0 340 480"
        overflow="visible"
      >
        {/* ----------------------------------------------------------------
            Channel paths — drawn first so centers render on top
        ---------------------------------------------------------------- */}
        {CHANNEL_DEFS.map((ch, i) => {
          const fromC = findCenter(ch.from);
          const toC = findCenter(ch.to);
          if (!fromC || !toC) return null;

          const bothDefined = definedSet.has(ch.from) && definedSet.has(ch.to);
          const channelPath = getChannelPath(fromC, toC);

          return (
            <path
              key={i}
              d={channelPath}
              fill="none"
              stroke={bothDefined ? typeColor : '#ffffff'}
              strokeWidth={bothDefined ? 2.5 : 1}
              strokeOpacity={bothDefined ? 0.4 : 0.12}
              strokeLinecap="round"
            />
          );
        })}

        {/* ----------------------------------------------------------------
            Center shapes
        ---------------------------------------------------------------- */}
        {CENTER_DEFS.map((def) => (
          <CenterShape
            key={def.key}
            def={def}
            defined={definedSet.has(def.key)}
            typeColor={typeColor}
            frame={frame}
            breathe={breathe}
          />
        ))}

        {/* ----------------------------------------------------------------
            Center labels (very faint, small)
        ---------------------------------------------------------------- */}
        {CENTER_DEFS.map((def) => (
          <text
            key={`label-${def.key}`}
            x={def.cx}
            y={def.cy + (def.shape === 'rect' ? (def.height ?? 30) / 2 + 14 : (def.size / 2) + 14)}
            textAnchor="middle"
            fill="#ffffff"
            fillOpacity={0.25}
            fontSize={9}
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={300}
          >
            {def.label}
          </text>
        ))}
      </svg>
    </div>
  );
};

// Export fps so callers have access to the interface type without importing
// from remotion directly.
export type { BodyGraphProps as BodyGraphPropsType };
