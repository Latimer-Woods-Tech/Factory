import React from 'react';
import { AbsoluteFill, random } from 'remotion';

// ---------------------------------------------------------------------------
// effects — composable, render-cheap cinematic primitives shared by every
// "look" preset (see ../looks.ts). All are deterministic (Remotion `random`),
// screen-blended, and tuned to stay FILMIC, never cartoony: soft, volumetric,
// low-contrast. Each is driven by a 0..1 intensity so a look can dial it from
// absent to lead.
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;

/**
 * Organic camera float — smooth seeded "noise" (summed sines) so the camera
 * reads as operator-held rather than mathematically perfect. Returns sub-pixel
 * offsets added on top of the keyframed move.
 */
export function cameraFloat(frame: number, seed: number, amt: number): { dx: number; dy: number; dz: number } {
  const s = (i: number) => random(`float${String(seed)}:${String(i)}`);
  const wob = (i: number, base: number) =>
    Math.sin(frame / (base + s(i) * 40) + s(i + 1) * TWO_PI) * 0.6 +
    Math.sin(frame / (base * 0.5 + s(i + 2) * 20) + s(i + 3) * TWO_PI) * 0.4;
  return { dx: wob(0, 72) * amt, dy: wob(4, 88) * amt, dz: wob(8, 130) * amt * 0.0009 };
}

/**
 * Volumetric god-rays — soft, near-parallel light shafts (cathedral light),
 * slowly drifting. Deliberately NOT a radial pinwheel (that reads cartoony):
 * a few angled, heavily-blurred columns descending past the source.
 */
export const GodRays: React.FC<{ x: number; intensity: number; color: string; frame: number }> = ({ x, intensity, color, frame }) => {
  if (intensity <= 0.001) return null;
  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: intensity, pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: 7 }, (_, i) => {
        const drift = Math.sin(frame / (150 + i * 28) + i) * 46;
        const left = x + (i - 3) * 156 + drift;
        const w = 78 + (i % 3) * 64;
        const op = 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(frame / 95 + i * 1.7));
        return (
          <div key={i} style={{
            position: 'absolute', top: -240, left, width: w, height: 1560,
            background: `linear-gradient(to bottom, ${color}, transparent 70%)`,
            transform: 'rotate(9deg)', transformOrigin: 'top center',
            filter: 'blur(36px)', opacity: op,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

export type ParticleMode = 'motes' | 'stardust' | 'aurora' | 'petals' | 'bokeh';

/**
 * Atmospheric particles — luminous drift with five registers:
 *   • motes    — sparse specks rising slowly (the calm default),
 *   • stardust — dense, twinkly, faintly inward-pulled (celestial),
 *   • aurora   — few large soft glowing wisps (oceanic/emotional),
 *   • petals   — luminous petals falling + swaying + tumbling (most feminine),
 *   • bokeh    — large out-of-focus light orbs drifting (dreamy-lens depth).
 * `converge` (0..1) pulls every particle toward (cx,cy) — the "stardust births
 * the chart" hero moment.
 */
export const Particles: React.FC<{
  frame: number; mode: ParticleMode; color1: string; color2: string;
  opacity?: number; converge?: number; cx?: number; cy?: number;
}> = ({ frame, mode, color1, color2, opacity = 0.5, converge = 0, cx = 1424, cy = 540 }) => {
  const count = mode === 'stardust' ? 64 : mode === 'aurora' ? 14 : mode === 'bokeh' ? 16 : mode === 'petals' ? 24 : 30;
  const baseR = mode === 'aurora' ? 9 : mode === 'bokeh' ? 26 : mode === 'stardust' ? 1.3 : 1.6;
  const span = mode === 'aurora' ? 0.3 : mode === 'stardust' ? 0.5 : 0.45;
  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', opacity, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        {Array.from({ length: count }, (_, i) => {
          const s = (n: number) => random(`p${mode}${String(i)}:${String(n)}`);
          // Petals tumble down faster with a wide horizontal sway; bokeh drifts slowest.
          const speed = 0.14 + s(1) * (mode === 'aurora' ? 0.18 : mode === 'bokeh' ? 0.1 : mode === 'petals' ? 0.5 : 0.44);
          const driftY = 1140 - ((frame * speed + s(3) * 1200) % 1200);
          const swayAmp = mode === 'aurora' ? 80 : mode === 'petals' ? 120 : mode === 'bokeh' ? 50 : 34;
          const x0 = s(0) * 1920 + Math.sin(frame / (60 + s(4) * 90) + s(2) * 7) * swayAmp;
          const tw = 0.5 + 0.5 * Math.sin(frame / (mode === 'stardust' ? 14 : 22) + s(6) * 9);
          const x = x0 + (cx - x0) * converge;
          const y = driftY + (cy - driftY) * converge;
          const fill = s(7) < 0.5 ? color1 : color2;
          if (mode === 'petals') {
            // A luminous petal: a soft rotating ellipse, brighter on the turn.
            const rot = (frame * (0.6 + s(8) * 1.2) + s(9) * 360) % 360;
            const pr = (5 + s(5) * 7) * (1 - converge * 0.5);
            return (
              <g key={i} transform={`translate(${String(x)} ${String(y)}) rotate(${String(rot)})`} opacity={(0.2 + 0.5 * tw) * opacity * (1 - converge * 0.25)}>
                <ellipse cx={0} cy={0} rx={pr} ry={pr * 0.42} fill={fill} style={{ filter: 'blur(0.6px)' }} />
              </g>
            );
          }
          const rr = baseR + s(5) * (baseR * span * 6);
          const blur = mode === 'aurora' ? 12 : mode === 'bokeh' ? 18 : 0;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={rr * (1 - converge * 0.5)}
              fill={fill}
              opacity={(mode === 'bokeh' ? 0.05 + 0.1 * tw : 0.16 + 0.42 * tw) * opacity * (1 - converge * 0.25)}
              style={blur ? { filter: `blur(${String(blur)}px)` } : undefined}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Aurora ribbons — slow, flowing horizontal bands of light behind the subject,
 * undulating like the northern lights. Builds in over `progress` (0..1); the
 * signature hero for the emotional/oceanic looks. Soft, screen-blended, never
 * neon — a few wide blurred sine-curtains.
 */
export const AuroraRibbon: React.FC<{ frame: number; progress: number; color1: string; color2: string; cy?: number }> = ({ frame, progress, color1, color2, cy = 470 }) => {
  if (progress <= 0.001) return null;
  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <defs>
          {[0, 1, 2].map((k) => (
            <linearGradient key={k} id={`aur${String(k)}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={k % 2 ? color2 : color1} stopOpacity="0" />
              <stop offset="50%" stopColor={k % 2 ? color2 : color1} stopOpacity="0.5" />
              <stop offset="100%" stopColor={k % 2 ? color1 : color2} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2].map((k) => {
          const yc = cy + (k - 1) * 130 + Math.sin(frame / (120 + k * 40) + k) * 40;
          const amp = 70 + k * 26;
          const ph = frame / (90 + k * 30) + k * 2;
          const pts = Array.from({ length: 25 }, (_, j) => {
            const px = (j / 24) * 1920;
            const py = yc + Math.sin(px / 240 + ph) * amp + Math.sin(px / 90 + ph * 1.6) * (amp * 0.3);
            return `${String(px)},${String(py)}`;
          }).join(' ');
          return (
            <polyline
              key={k}
              points={pts}
              fill="none"
              stroke={`url(#aur${String(k)})`}
              strokeWidth={70 + k * 30}
              strokeLinecap="round"
              opacity={progress * (0.5 - k * 0.1)}
              style={{ filter: 'blur(34px)' }}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Caustics — rippling water-light at the lower frame that rises with `rise`
 * (0..1): a waterline gradient swells upward while shimmering refraction bands
 * play across it. The tide hero — the reading "fills the well". Screen-blended.
 */
export const Caustics: React.FC<{ frame: number; rise: number; color: string }> = ({ frame, rise, color }) => {
  if (rise <= 0.001) return null;
  const waterTop = 1080 - rise * 520; // higher tide = waterline climbs
  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Rising water glow */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: waterTop, bottom: 0, background: `linear-gradient(to top, ${color}33 0%, ${color}12 45%, transparent 100%)` }} />
      {/* Shimmering refraction bands */}
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 9 }, (_, i) => {
          const yc = waterTop + 40 + i * ((1080 - waterTop) / 9);
          const ph = frame / (40 + i * 9) + i;
          const pts = Array.from({ length: 21 }, (_, j) => {
            const px = (j / 20) * 1920;
            const py = yc + Math.sin(px / 130 + ph) * 14 + Math.sin(px / 47 + ph * 1.8) * 6;
            return `${String(px)},${String(py)}`;
          }).join(' ');
          return <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={1.6} opacity={rise * (0.06 + 0.05 * Math.sin(ph))} style={{ filter: 'blur(1.2px)' }} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Constellation overlay — draws faint connecting lines between a handful of
 * seeded "fixed stars" around a focal point, fading in over `progress` (0..1).
 * The celestial-cartography hero: the sky reveals it was a figure all along.
 */
export const Constellation: React.FC<{ frame: number; progress: number; color: string; seed: number; cx: number; cy: number }> = ({ frame, progress, color, seed, cx, cy }) => {
  if (progress <= 0.001) return null;
  const stars = Array.from({ length: 9 }, (_, i) => {
    const s = (n: number) => random(`con${String(seed)}:${String(i)}:${String(n)}`);
    const ang = (i / 9) * TWO_PI + s(0) * 0.6;
    const rad = 260 + s(1) * 320;
    return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * 0.7, tw: 0.5 + 0.5 * Math.sin(frame / 12 + i) };
  });
  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        {stars.map((a, i) => {
          const b = stars[(i + 1) % stars.length]!;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const draw = Math.max(0, Math.min(1, progress * stars.length - i));
          return (
            <line
              key={`l${String(i)}`}
              x1={a.x}
              y1={a.y}
              x2={a.x + (b.x - a.x) * draw}
              y2={a.y + (b.y - a.y) * draw}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.34 * progress}
              strokeDasharray={String(len)}
              style={{ filter: `drop-shadow(0 0 5px ${color})` }}
            />
          );
        })}
        {stars.map((st, i) => (
          <circle key={`s${String(i)}`} cx={st.x} cy={st.y} r={1.6 + 2 * st.tw} fill={color} opacity={progress * (0.4 + 0.6 * st.tw)} style={{ filter: `drop-shadow(0 0 7px ${color})` }} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};
