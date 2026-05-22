import React from 'react';
import { interpolate } from 'remotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KineticRevealProps {
  text: string;
  frame: number;
  /** Frame at which the reveal begins. Default 0. */
  startFrame?: number;
  /** Milliseconds between each word arriving. Default 280ms (intentional, unhurried). */
  msPerWord?: number;
  /** Frames-per-second of the composition. Default 30. */
  fps?: number;
  // Typography
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  maxWidth?: number;
  // Layout
  x?: number;
  y?: number;
  width?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * KineticReveal — renders text word by word, each word arriving with a gentle
 * upward drift (translateY −8px → 0) and fade-in over 8 frames.
 *
 * Words that have arrived stay on screen. This gives each word weight —
 * the viewer receives one at a time, unhurried.
 */
export const KineticReveal: React.FC<KineticRevealProps> = ({
  text,
  frame,
  startFrame = 0,
  msPerWord = 280,
  fps = 30,
  fontSize = 48,
  fontWeight = 300,
  color = '#c9a84c',
  lineHeight = 1.5,
  textAlign = 'center',
  maxWidth,
  x,
  y,
  width,
}) => {
  const words = text.split(/\s+/).filter(Boolean);
  const framesPerWord = (msPerWord / 1000) * fps;
  // Each word fades in over 8 frames
  const fadeFrames = 8;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize,
    fontWeight,
    color,
    lineHeight,
    textAlign,
    maxWidth: maxWidth ?? 'none',
    width: width ?? 'auto',
    ...(x !== undefined ? { left: x } : {}),
    ...(y !== undefined ? { top: y } : {}),
    display: 'flex',
    flexWrap: 'wrap',
    gap: `0 ${String(Math.round(fontSize * 0.28))}px`,
    justifyContent:
      textAlign === 'center'
        ? 'center'
        : textAlign === 'right'
        ? 'flex-end'
        : 'flex-start',
    alignContent: 'flex-start',
  };

  return (
    <div style={containerStyle}>
      {words.map((word, i) => {
        // Frame at which this word begins to arrive
        const wordStartFrame = startFrame + i * framesPerWord;
        const localFrame = frame - wordStartFrame;

        // Before this word's turn: invisible
        if (localFrame < 0) {
          return (
            <span key={i} style={{ opacity: 0, display: 'inline-block' }}>
              {word}
            </span>
          );
        }

        // Fade in over `fadeFrames`
        const opacity = interpolate(localFrame, [0, fadeFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        // Drift upward: starts 8px below, settles to natural position
        const translateY = interpolate(localFrame, [0, fadeFrames], [8, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity,
              transform: `translateY(${String(translateY)}px)`,
              whiteSpace: 'pre',
            }}
          >
            {word}{' '}
          </span>
        );
      })}
    </div>
  );
};
