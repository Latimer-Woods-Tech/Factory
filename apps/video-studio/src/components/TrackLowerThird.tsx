import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  disciplineLabel,
  levelToken,
  LEVEL_STEPS,
  trackToken,
  type TrackToken,
} from '../lib/trackTokens';

/**
 * TrackLowerThird — the denotation chip for a per-track training video.
 *
 * Tells the viewer, at a glance, exactly what they are watching:
 *   [ TRACK ]  ·  Discipline  ·  ●●●○ Level
 * Colour comes from the TRACK only (wayfinding); the discipline is a label and the
 * level is a four-pip progression. Drop it into any composition — it animates
 * itself off the current frame and needs no wiring beyond the props.
 */
export interface TrackLowerThirdProps {
  track: string;
  discipline?: string;
  level?: string;
  /** When the chip slides in (seconds). Default 0.4s. */
  appearAtSeconds?: number;
  /** Corner to anchor to. Default bottom-left. */
  align?: 'left' | 'right';
}

const FONT = 'Inter, system-ui, sans-serif';

const LevelPips: React.FC<{ step: number; token: TrackToken }> = ({ step, token }) => (
  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }} aria-hidden="true">
    {Array.from({ length: LEVEL_STEPS }, (_, i) => (
      <span
        key={i}
        style={{
          width: 9,
          height: 9,
          borderRadius: 9,
          background: i < step ? token.accent : 'rgba(255,255,255,0.22)',
          display: 'inline-block',
        }}
      />
    ))}
  </div>
);

export const TrackLowerThird: React.FC<TrackLowerThirdProps> = ({
  track,
  discipline,
  level,
  appearAtSeconds = 0.4,
  align = 'left',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const token = trackToken(track);
  const lvl = levelToken(level);
  const start = Math.round(appearAtSeconds * fps);

  const opacity = interpolate(frame, [start, start + 14], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const slide = interpolate(frame, [start, start + 14], [24, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 64,
        left: align === 'left' ? 64 : undefined,
        right: align === 'right' ? 64 : undefined,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '14px 22px',
        borderRadius: 14,
        background: 'rgba(8,11,20,0.66)',
        backdropFilter: 'blur(6px)',
        borderLeft: `4px solid ${token.color}`,
        opacity,
        transform: `translateX(${align === 'right' ? -slide : slide}px)`,
      }}
    >
      {/* Track pill — the only coloured element (wayfinding). */}
      <span
        style={{
          fontFamily: FONT,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: token.onColor,
          background: token.color,
          padding: '6px 14px',
          borderRadius: 8,
          whiteSpace: 'nowrap',
        }}
      >
        {token.label}
      </span>

      {discipline && (
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 500, color: '#eef0f6', whiteSpace: 'nowrap' }}>
          {disciplineLabel(discipline)}
        </span>
      )}

      {lvl && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LevelPips step={lvl.step} token={token} />
          <span style={{ fontFamily: FONT, fontSize: 17, fontWeight: 400, color: 'rgba(238,240,246,0.7)', whiteSpace: 'nowrap' }}>
            {lvl.label}
          </span>
        </span>
      )}
    </div>
  );
};
