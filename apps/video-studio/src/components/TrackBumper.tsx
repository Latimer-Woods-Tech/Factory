import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { disciplineLabel, trackToken } from '../lib/trackTokens';

/**
 * TrackBumper — a templatized intro for a per-track training video.
 *
 * A short, calm open that establishes the track (by colour wash + eyebrow) and the
 * topic, so every film in a track reads as part of one family. Drop it at the head
 * of a composition (e.g. inside a <Sequence durationInFrames={...}>), or use it as
 * a standalone open. Self-animating off the current frame.
 */
export interface TrackBumperProps {
  track: string;
  topic: string;
  discipline?: string;
  /** Optional small kicker above the eyebrow (e.g. "Lesson 2"). */
  kicker?: string;
}

const FONT = 'Inter, system-ui, sans-serif';

export const TrackBumper: React.FC<TrackBumperProps> = ({ track, topic, discipline, kicker }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const token = trackToken(track);

  const eyebrow = [kicker, token.label, discipline ? disciplineLabel(discipline) : '']
    .filter(Boolean)
    .join('  ·  ');

  const titleOpacity = interpolate(frame, [6, 24], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleY = interpolate(frame, [6, 24], [28, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eyebrowOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  // The track-colour bar under the eyebrow draws in.
  const barWidth = interpolate(frame, [4, 26], [0, 220], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        paddingLeft: 120,
        paddingRight: 120,
        background:
          `radial-gradient(circle at 78% 24%, ${token.color}26, transparent 55%),`
          + ' linear-gradient(160deg, #0a0e1f 0%, #05070f 100%)',
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: token.accent,
          opacity: eyebrowOpacity,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ width: barWidth, height: 4, borderRadius: 4, background: token.color, marginTop: 14, marginBottom: 26 }} />
      <div
        style={{
          fontFamily: FONT,
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1.12,
          color: '#f4f1e8',
          maxWidth: 1320,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {topic}
      </div>
    </AbsoluteFill>
  );
};
