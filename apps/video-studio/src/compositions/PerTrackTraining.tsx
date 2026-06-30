import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { TrackBumper } from '../components/TrackBumper';
import { TrackLowerThird } from '../components/TrackLowerThird';
import { trackToken } from '../lib/trackTokens';

/**
 * PerTrackTraining — the templatized per-track training video.
 *
 * Assembles the shared denotation system into one family-consistent film:
 *   [ Bumper (track-coloured open) ] → [ stepped body ] → [ persistent lower-third ]
 * Colour and labelling come entirely from the track/discipline/level tokens
 * (lib/trackTokens), so every film in a track reads as one set without per-video
 * art direction. Register it in Root.tsx alongside the other compositions:
 *
 *   import { PerTrackTraining, perTrackTrainingSchema } from './compositions/PerTrackTraining';
 *   <Composition id="PerTrackTraining" component={PerTrackTraining}
 *     durationInFrames={900} fps={VIDEO_FPS} width={VIDEO_WIDTH} height={VIDEO_HEIGHT}
 *     schema={perTrackTrainingSchema}
 *     calculateMetadata={({ props }) => ({
 *       durationInFrames: Math.max(450, Math.ceil((props.durationSeconds || 30) * VIDEO_FPS)) })}
 *     defaultProps={{ ... }} />
 */
export const perTrackTrainingSchema = z.object({
  appId: z.string(),
  /** One of the three construct tracks (drives colour + labelling). */
  track: z.enum(['app-mastery', 'interpretive-literacy', 'practitioner-formation']),
  /** Lens this lesson honours (label only). */
  discipline: z.string().optional(),
  /** Difficulty rung (four-pip progression). */
  level: z.string().optional(),
  /** Lesson title, shown in the bumper. */
  topic: z.string(),
  /** Optional small kicker over the eyebrow, e.g. "Lesson 2". */
  kicker: z.string().optional(),
  /** Full narration script (used as audio; mirrored as a11y text). */
  script: z.string(),
  narrationUrl: z.string(),
  musicUrl: z.string().optional(),
  musicVolume: z.number().optional(),
  /** Ordered teaching beats revealed across the body (max 8). */
  steps: z.array(z.string()).max(8),
  durationSeconds: z.number().min(15).max(1800),
  /** Bumper length in seconds. Default 2.6s. */
  bumperSeconds: z.number().optional(),
});

export type PerTrackTrainingProps = z.infer<typeof perTrackTrainingSchema>;

const FONT = 'Inter, system-ui, sans-serif';

/** The stepped body — one beat at a time, centred, with a quiet enter animation. */
const Body: React.FC<{ steps: string[]; track: string }> = ({ steps, track }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const token = trackToken(track);
  const stepFrames = steps.length > 0 ? Math.floor(durationInFrames / steps.length) : durationInFrames;
  const active = Math.min(Math.floor(frame / stepFrames), Math.max(steps.length - 1, 0));
  const local = frame - active * stepFrames;

  const opacity = interpolate(local, [0, 18], [0, 1], {
    easing: Easing.out(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const translateY = interpolate(local, [0, 18], [26, 0], {
    easing: Easing.out(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        paddingLeft: 120,
        paddingRight: 120,
        background:
          `radial-gradient(circle at 24% 78%, ${token.color}1f, transparent 55%),`
          + ' linear-gradient(160deg, #0a0e1f 0%, #05070f 100%)',
      }}
    >
      {steps.length > 0 && (
        <div style={{ opacity, transform: `translateY(${translateY}px)`, maxWidth: 1360 }}>
          <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: token.accent }}>
            {`Step ${active + 1} of ${steps.length}`}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 56, fontWeight: 600, lineHeight: 1.25, color: '#f0ede3', marginTop: 18 }}>
            {steps[active] ?? ''}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const PerTrackTraining: React.FC<PerTrackTrainingProps> = ({
  track,
  discipline,
  level,
  topic,
  kicker,
  script,
  steps,
  narrationUrl,
  musicUrl = '',
  musicVolume = 0.14,
  bumperSeconds = 2.6,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const bumperFrames = Math.round(bumperSeconds * fps);

  return (
    <AbsoluteFill>
      {/* Body runs the full length; the bumper overlays the opening beats. */}
      <Body steps={steps} track={track} />

      <Sequence durationInFrames={bumperFrames} name="Bumper">
        <TrackBumper track={track} topic={topic} discipline={discipline} kicker={kicker} />
      </Sequence>

      {/* Persistent denotation chip after the bumper clears. */}
      <Sequence from={bumperFrames} durationInFrames={Math.max(1, durationInFrames - bumperFrames)} name="LowerThird">
        <TrackLowerThird track={track} discipline={discipline} level={level} appearAtSeconds={0.2} />
      </Sequence>

      <div aria-hidden="true" style={{ display: 'none' }}>{script}</div>
      {narrationUrl && <Audio src={narrationUrl} />}
      {musicUrl && <Audio src={musicUrl} volume={musicVolume} loop />}
    </AbsoluteFill>
  );
};
