import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';

// ---------------------------------------------------------------------------
// CosmicSky — a living, procedural, randomised background. Replaces the static
// "generic light beam" image with frame-driven cosmos + weather that mutates
// per render (via `seed`) and per emotional beat (via `intensity`):
//   • a deep mood-graded sky,
//   • a slowly SPINNING multi-depth STARFIELD,
//   • drifting AURORA / nebula light,
//   • periodic SHOOTING STARS,
//   • STORM CLOUDS + rain WEATHER that swell with emotional intensity,
//   • occasional lightning on the stormiest beats.
// Everything is deterministic (Remotion `random(seed)`), so renders are stable
// but every seed yields a different sky. "When in doubt, give a living sky."
// ---------------------------------------------------------------------------

export type SkyMood = 'lux' | 'phoenix' | 'aether' | 'chronos' | 'eros' | 'self';

interface MoodSpec {
  top: string; bottom: string;        // sky gradient
  glow: string; aurora: [string, string];
  storm: number;                       // base storminess 0..1
  shooting: boolean;
  spin: number;                        // radians/frame of the star sky
}

const MOODS: Record<SkyMood, MoodSpec> = {
  lux:     { top: '#1a1438', bottom: '#0c0a1c', glow: '#cdbcef', aurora: ['#cdbcef', '#e8c4de'], storm: 0.03, shooting: true,  spin: 0.0009 },
  phoenix: { top: '#1c0a07', bottom: '#05040a', glow: '#ff7a42', aurora: ['#ff7a42', '#c42b2b'], storm: 0.62, shooting: false, spin: 0.0016 },
  aether:  { top: '#0a1320', bottom: '#04060d', glow: '#bcd2ec', aurora: ['#bcd2ec', '#9a8fd0'], storm: 0.12, shooting: true,  spin: 0.0008 },
  chronos: { top: '#080d18', bottom: '#04050b', glow: '#9aa6c8', aurora: ['#9aa6c8', '#5f6486'], storm: 0.04, shooting: false, spin: 0.0006 },
  eros:    { top: '#190a12', bottom: '#05040a', glow: '#e87a9a', aurora: ['#e87a9a', '#d4742a'], storm: 0.06, shooting: true,  spin: 0.0011 },
  self:    { top: '#06080f', bottom: '#03040a', glow: '#c9a84c', aurora: ['#c9a84c', '#4a90d9'], storm: 0.03, shooting: true,  spin: 0.0009 },
};

export interface CosmicSkyProps {
  frame: number;
  mood?: SkyMood;
  /** Randomises everything (positions, timing, drift). Different seed = different sky. */
  seed?: number;
  /** Emotional intensity 0..1 — swells storm clouds, rain, and lightning. */
  intensity?: number;
}

const W = 1920, H = 1080, CX = 960, CY = 540;
const rnd = (seed: number, i: number) => random(`${seed}:${i}`);

export const CosmicSky: React.FC<CosmicSkyProps> = ({ frame, mood = 'self', seed = 1, intensity = 0 }) => {
  const m = MOODS[mood];
  const storm = Math.min(1, m.storm + intensity * 0.9);

  // ── Spinning multi-depth starfield ──────────────────────────────────────
  const layers = [
    { n: 90, r: [0.6, 1.4], op: 0.45, spin: m.spin * 0.5, off: 0 },
    { n: 80, r: [1.0, 2.0], op: 0.7, spin: m.spin, off: 1000 },
    { n: 40, r: [1.6, 3.0], op: 0.95, spin: m.spin * 1.7, off: 2000 },
  ];
  const breathe = interpolate(Math.sin(frame / 80), [-1, 1], [0.8, 1]);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: m.bottom }}>
      {/* Sky gradient base */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 120% 90% at 50% 18%, ${m.top} 0%, ${m.bottom} 70%)` }} />

      {/* Drifting aurora / nebula glow (two slow blobs, hue from mood) */}
      {[0, 1].map((k) => {
        const ax = CX + Math.sin(frame / (260 + k * 90) + k * 2) * 360 + (rnd(seed, 50 + k) - 0.5) * 300;
        const ay = 320 + Math.cos(frame / (300 + k * 70) + k) * 160 + k * 120;
        const sc = 1 + Math.sin(frame / 220 + k) * 0.12;
        return (
          <div key={`a${k}`} style={{
            position: 'absolute', left: ax - 640, top: ay - 420, width: 1280, height: 840,
            background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${m.aurora[k]}38 0%, ${m.aurora[k]}14 38%, transparent 70%)`,
            transform: `scale(${sc})`, filter: 'blur(28px)', opacity: 0.7 * breathe,
          }} />
        );
      })}

      {/* Spinning starfield */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: breathe }}>
        {layers.map((L, li) => (
          <g key={li} transform={`rotate(${(frame * L.spin * 180) / Math.PI}, ${CX}, ${CY})`}>
            {Array.from({ length: L.n }, (_, i) => {
              const x = rnd(seed, L.off + i * 4) * W;
              const y = rnd(seed, L.off + i * 4 + 1) * H;
              const rr = L.r[0]! + rnd(seed, L.off + i * 4 + 2) * (L.r[1]! - L.r[0]!);
              const tw = 0.5 + 0.5 * Math.sin(frame / 30 + rnd(seed, L.off + i * 4 + 3) * 9);
              const gold = rnd(seed, L.off + i * 4 + 3) < 0.16;
              return <circle key={i} cx={x} cy={y} r={rr} fill={gold ? m.glow : '#fff'} opacity={L.op * (0.55 + 0.45 * tw)} />;
            })}
          </g>
        ))}

        {/* Shooting stars — periodic seeded streaks */}
        {m.shooting && Array.from({ length: 3 }, (_, i) => {
          const period = 150 + Math.floor(rnd(seed, 700 + i) * 160);
          const start = Math.floor(rnd(seed, 710 + i) * period);
          const local = ((frame - start) % period + period) % period;
          if (local > 26) return null;
          const p = local / 26;
          const sx = rnd(seed, 720 + i) * W * 0.7;
          const sy = rnd(seed, 730 + i) * H * 0.4;
          const len = 220 + rnd(seed, 740 + i) * 160;
          const ang = 0.5 + rnd(seed, 750 + i) * 0.5;
          const hx = sx + Math.cos(ang) * len * p, hy = sy + Math.sin(ang) * len * p;
          const tx = hx - Math.cos(ang) * 140, ty = hy - Math.sin(ang) * 140;
          const o = Math.sin(p * Math.PI);
          return <line key={`s${i}`} x1={tx} y1={ty} x2={hx} y2={hy} stroke={m.glow} strokeWidth={2} strokeLinecap="round" opacity={o * 0.9} />;
        })}
      </svg>

      {/* Storm clouds — turbulent dark band that swells with intensity */}
      {storm > 0.08 && (
        <AbsoluteFill style={{ opacity: storm * 0.85 }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <filter id={`clouds-${seed}`}>
              <feTurbulence type="fractalNoise" baseFrequency={`0.004 0.009`} numOctaves={3} seed={(seed + frame * 0.4) % 100} stitchTiles="stitch" />
              <feColorMatrix type="matrix" values="0 0 0 0 0.03  0 0 0 0 0.03  0 0 0 0 0.06  0 0 0 0.9 0" />
            </filter>
            <rect x={-100} y={interpolate(frame, [0, 600], [0, -60])} width={W + 200} height={H} filter={`url(#clouds-${seed})`} />
          </svg>
          {/* Rain when very stormy */}
          {storm > 0.45 && (
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: (storm - 0.45) * 1.2 }}>
              {Array.from({ length: 90 }, (_, i) => {
                const x = rnd(seed, 800 + i) * W;
                const speed = 22 + rnd(seed, 810 + i) * 16;
                const y = ((rnd(seed, 820 + i) * H + frame * speed) % (H + 40)) - 40;
                return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 26} stroke="#9fb4d8" strokeWidth={1.2} opacity={0.35} />;
              })}
            </svg>
          )}
          {/* Lightning flash on the stormiest beats */}
          {storm > 0.6 && Math.sin(frame / 7) > 0.985 && <AbsoluteFill style={{ background: 'rgba(220,228,255,0.16)' }} />}
        </AbsoluteFill>
      )}

      {/* Soft atmospheric core glow (breathing, not a static beam) */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 60% 46% at ${50 + Math.sin(frame / 200) * 8}% ${40 + Math.cos(frame / 240) * 6}%, ${m.glow}1f 0%, transparent 60%)`,
        opacity: (0.7 - storm * 0.4) * breathe,
      }} />
      {/* Vignette */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 78% 84% at 50% 46%, transparent 50%, rgba(2,3,8,0.72) 100%)' }} />
    </AbsoluteFill>
  );
};
