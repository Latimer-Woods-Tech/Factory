import React from 'react';
import { interpolate } from 'remotion';

// ---------------------------------------------------------------------------
// LCG — deterministic pseudo-random number generator.
// Returns the next seed value; normalised to [0, 1) by the caller.
// ---------------------------------------------------------------------------

/** One step of a Linear Congruential Generator. */
const lcg = (s: number): number =>
  ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;

/** Advance the LCG `n` times and return a value in [0, 1). */
const lcgN = (seed: number, n: number): number => {
  let s = seed;
  for (let i = 0; i < n; i++) s = lcg(s);
  return s / 0xffffffff;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StarFieldProps {
  frame: number;
  /** Seed makes star positions stable across renders. Default 42. */
  seed?: number;
  /** Fraction of stars that are golden. Default 0.12 (~20 of 180). */
  goldenRatio?: number;
  /** Total number of star points. Default 180. */
  density?: number;
}

interface Star {
  x: number;          // initial x in [0, 1920]
  y: number;          // initial y in [0, 1080]
  size: number;       // radius in px: 1-3
  baseOpacity: number;// opacity in [0.2, 0.8]
  driftX: number;     // px/frame: -0.3 to 0.3
  driftY: number;     // px/frame: 0.05 to 0.3 (mostly downward drift)
  gold: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the full star array from a seed — called once per component render. */
const buildStars = (seed: number, density: number, goldenRatio: number): Star[] => {
  const stars: Star[] = [];
  let s = seed;

  for (let i = 0; i < density; i++) {
    // Advance seed 8 times per star so each property is independent.
    const base = i * 8;

    const x = lcgN(s, base + 1) * 1920;
    const y = lcgN(s, base + 2) * 1080;
    const size = 1 + lcgN(s, base + 3) * 2;         // 1 – 3 px
    const baseOpacity = 0.2 + lcgN(s, base + 4) * 0.6; // 0.2 – 0.8
    const driftXRaw = lcgN(s, base + 5) * 0.6 - 0.3;   // -0.3 to 0.3
    const driftY = 0.05 + lcgN(s, base + 6) * 0.25;    // 0.05 to 0.3
    const gold = lcgN(s, base + 7) < goldenRatio;

    stars.push({ x, y, size, baseOpacity, driftX: driftXRaw, driftY, gold });
  }

  return stars;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StarField — 180 meditative points of light drifting through deep space.
 *
 * The field breathes using a 3-second (90-frame at 30fps) sin cycle so the
 * overall opacity rises and falls gently, never flashing or sparkling.
 * All randomness is seeded via LCG so positions are stable across renders.
 */
export const StarField: React.FC<StarFieldProps> = ({
  frame,
  seed = 42,
  goldenRatio = 0.12,
  density = 180,
}) => {
  // Stable star array — in Remotion every frame is a pure render snapshot;
  // React memoisation is not needed here but we keep creation cheap by
  // relying on deterministic LCG output.
  const stars = buildStars(seed, density, goldenRatio);

  // Breathing: overall field opacity oscillates between 0.85 and 1.0 on a
  // ~3-second cycle (90 frames). Slow, meditative — never jarring.
  const breathe = interpolate(
    Math.sin(frame / 90),
    [-1, 1],
    [0.85, 1.0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <svg
      width={1920}
      height={1080}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: breathe,
        pointerEvents: 'none',
      }}
    >
      {stars.map((star, i) => {
        // Wrap position so stars that drift off-screen loop back.
        const cx = ((star.x + star.driftX * frame) % 1920 + 1920) % 1920;
        const cy = ((star.y + star.driftY * frame) % 1080 + 1080) % 1080;

        const fill = star.gold ? '#c9a84c' : '#ffffff';
        const opacity = star.baseOpacity;

        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={star.size}
            fill={fill}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
};
