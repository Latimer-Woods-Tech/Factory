import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

// LCG pseudo-random — deterministic, seed-stable
const lcg = (s: number): number =>
  ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;

const lcgN = (seed: number, n: number): number => {
  let s = seed;
  for (let i = 0; i < n; i++) s = lcg(s);
  return s / 0xffffffff;
};

export type ForgeKey = 'chronos' | 'eros' | 'aether' | 'lux' | 'phoenix' | 'self';

export interface ForgeAtmosphereProps {
  forge: ForgeKey;
  frame: number;
  fps?: number;
  intensity?: number; // 0–1, default 0.7
}

const FORGE_BG: Record<ForgeKey, string> = {
  chronos: '#07091f',
  eros:    '#100808',
  aether:  '#050d1a',
  lux:     '#060a1c',
  phoenix: '#050f10',
  self:    '#05091a',
};

const ChronosAtmosphere: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const bands = Array.from({ length: 8 }, (_, i) => ({
    y: (((lcgN(77, i * 3 + 1) * 1200) - 100 + frame * (0.08 + lcgN(77, i * 3 + 2) * 0.04)) % 1200 + 1200) % 1200,
    opacity: (0.04 + lcgN(77, i * 3 + 3) * 0.04) * intensity,
    height: 1 + lcgN(77, i * 3 + 1) * 2,
  }));

  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {bands.map((b, i) => (
        <rect key={i} x={0} y={b.y} width={1920} height={b.height}
          fill="#c9a84c" opacity={b.opacity} />
      ))}
      {Array.from({ length: 6 }, (_, i) => {
        const x = (lcgN(13, i * 2) * 1920 + frame * 0.12) % 1920;
        return (
          <line key={i} x1={x} y1={0} x2={x + 200} y2={1080}
            stroke="#a88840" strokeWidth={0.5} strokeOpacity={0.03 * intensity} />
        );
      })}
    </svg>
  );
};

const ErosAtmosphere: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const embers = Array.from({ length: 40 }, (_, i) => ({
    x: lcgN(55, i * 4 + 1) * 1920,
    y: lcgN(55, i * 4 + 2) * 1080,
    r: 1 + lcgN(55, i * 4 + 3) * 3,
    phase: lcgN(55, i * 4 + 4) * Math.PI * 2,
  }));

  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {embers.map((e, i) => {
        const flicker = 0.3 + 0.7 * Math.pow(Math.abs(Math.sin(frame / 12 + e.phase)), 2);
        return (
          <circle key={i} cx={e.x} cy={e.y} r={e.r}
            fill="#e8923a" opacity={0.15 * flicker * intensity} />
        );
      })}
    </svg>
  );
};

const AetherAtmosphere: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const threads = Array.from({ length: 12 }, (_, i) => {
    const x0 = lcgN(33, i * 5 + 1) * 1920;
    const y0 = lcgN(33, i * 5 + 2) * 1080;
    const dx = (lcgN(33, i * 5 + 3) - 0.5) * 400;
    const dy = (lcgN(33, i * 5 + 4) - 0.5) * 200;
    const phase = lcgN(33, i * 5 + 5) * Math.PI * 2;
    const sway = Math.sin(frame / 180 + phase) * 30;
    return { x0, y0, dx: dx + sway, dy };
  });

  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="blur-mist"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      {threads.map((t, i) => (
        <line key={i} x1={t.x0} y1={t.y0} x2={t.x0 + t.dx} y2={t.y0 + t.dy}
          stroke="#b8d4e8" strokeWidth={1.5}
          strokeOpacity={0.06 * intensity}
          style={{ filter: 'url(#blur-mist)' }} />
      ))}
    </svg>
  );
};

const LuxAtmosphere: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const beams = Array.from({ length: 7 }, (_, i) => {
    const angle = -30 + i * 15;
    const rad = (angle * Math.PI) / 180;
    const originX = 960 + Math.sin(frame / 300 + i) * 80;
    const originY = -40;
    const len = 1400;
    const endX = originX + Math.sin(rad) * len;
    const endY = originY + Math.cos(rad) * len;
    const op = (0.03 + Math.abs(Math.sin(frame / 200 + i * 0.7)) * 0.03) * intensity;
    return { originX, originY, endX, endY, op };
  });

  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="blur-beam"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      {beams.map((b, i) => (
        <line key={i} x1={b.originX} y1={b.originY} x2={b.endX} y2={b.endY}
          stroke="#fff8e0" strokeWidth={40} strokeOpacity={b.op}
          style={{ filter: 'url(#blur-beam)' }} />
      ))}
    </svg>
  );
};

const PhoenixAtmosphere: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const sparks = Array.from({ length: 30 }, (_, i) => {
    const baseX = lcgN(88, i * 3 + 1) * 1920;
    const riseSpeed = 0.3 + lcgN(88, i * 3 + 3) * 0.4;
    const phase = lcgN(88, i * 3 + 2) * 300;
    const elapsed = (frame + phase) % 400;
    const y = (lcgN(88, i * 3 + 2) * 300 + 780) - elapsed * riseSpeed;
    const x = baseX + Math.sin(elapsed / 40 + i) * 20;
    const fade = elapsed < 200 ? elapsed / 200 : 1 - (elapsed - 200) / 200;
    return { x, y, fade };
  });

  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {sparks.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={1.5}
          fill="#c9a84c" opacity={Math.max(0, s.fade) * 0.25 * intensity} />
      ))}
    </svg>
  );
};

export const ForgeAtmosphere: React.FC<ForgeAtmosphereProps> = ({
  forge,
  frame,
  fps = 30,
  intensity = 0.7,
}) => {
  const fadeIn = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill style={{ background: FORGE_BG[forge] }} />
      {forge === 'chronos' && <ChronosAtmosphere frame={frame} intensity={intensity} />}
      {forge === 'eros'    && <ErosAtmosphere    frame={frame} intensity={intensity} />}
      {forge === 'aether'  && <AetherAtmosphere  frame={frame} intensity={intensity} />}
      {forge === 'lux'     && <LuxAtmosphere     frame={frame} intensity={intensity} />}
      {forge === 'phoenix' && <PhoenixAtmosphere frame={frame} intensity={intensity} />}
    </AbsoluteFill>
  );
};
