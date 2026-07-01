import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const walkthroughSchema = z.object({
  /** Factory application identifier. */
  appId: z.string(),
  /** Feature name or walkthrough title. */
  topic: z.string(),
  /** Full narration script. */
  script: z.string(),
  /** URL of the ElevenLabs narration audio file. Empty string = no audio. */
  narrationUrl: z.string(),
  /** Primary brand hex colour. */
  brandColor: z.string(),
  /** Accent hex colour for annotations. */
  brandAccent: z.string(),
  /** Logo image URL. */
  logoUrl: z.string(),
  /** Optional instrumental music bed (R2 URL). Empty/absent = no music. */
  musicUrl: z.string().optional(),
  /** Music bed volume (0-1), kept low so it sits under the narration. */
  musicVolume: z.number().optional(),
  /**
   * Ordered array of screenshot URLs to display during the walkthrough.
   * Each screenshot is displayed for 3 seconds (90 frames at 30fps).
   */
  screenshotUrls: z.array(z.string()),
});

export type WalkthroughVideoProps = z.infer<typeof walkthroughSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREENSHOT_FRAMES = 90; // 3 seconds per screenshot at 30fps
const TRANSITION_FRAMES = 15; // 0.5s cross-fade between screenshots

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated progress bar at the bottom showing overall walkthrough progress. */
const ProgressBar: React.FC<{
  frame: number;
  totalFrames: number;
  accent: string;
}> = ({ frame, totalFrames, accent }) => {
  const progress = Math.min(frame / totalFrames, 1);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${String(Math.round(progress * 100))}%`,
          background: accent,
          transition: 'width 0.1s linear',
          boxShadow: `0 0 12px ${accent}`,
        }}
      />
    </div>
  );
};

/** Step indicator dots. */
const StepDots: React.FC<{
  total: number;
  active: number;
  accent: string;
}> = ({ total, active, accent }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 32,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      gap: 12,
    }}
  >
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === active ? 28 : 10,
          height: 10,
          borderRadius: 5,
          background: i === active ? accent : 'rgba(255,255,255,0.4)',
          transition: 'all 0.3s ease',
        }}
      />
    ))}
  </div>
);

/** Single screenshot panel with fade-in/out transitions. */
const ScreenshotPanel: React.FC<{
  url: string;
  frame: number;
  startFrame: number;
  accent: string;
  index: number;
}> = ({ url, frame, startFrame, accent, index }) => {
  const localFrame = frame - startFrame;

  const fadeIn = interpolate(localFrame, [0, TRANSITION_FRAMES], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = spring({
    frame: Math.max(0, localFrame),
    fps: 30,
    config: { damping: 20, stiffness: 80 },
    from: 0.96,
    to: 1,
  });

  if (localFrame < 0 || localFrame >= SCREENSHOT_FRAMES) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 100,
        left: 80,
        right: 80,
        bottom: 80,
        opacity: fadeIn,
        transform: `scale(${String(scale)})`,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: `0 32px 80px rgba(0,0,0,0.4), 0 0 0 4px ${accent}44`,
      }}
    >
      <Img
        src={url}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        aria-label={`Step ${String(index + 1)} screenshot`}
      />
    </div>
  );
};

/** Floating annotation badge. */
const AnnotationBadge: React.FC<{
  stepIndex: number;
  frame: number;
  stepStart: number;
  accent: string;
}> = ({ stepIndex, frame, stepStart, accent }) => {
  const localFrame = frame - stepStart;
  const showFrame = TRANSITION_FRAMES + 10;

  const scale = spring({
    frame: Math.max(0, localFrame - showFrame),
    fps: 30,
    config: { damping: 12, stiffness: 200 },
  });

  if (localFrame < showFrame) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        right: 100,
        background: accent,
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 20,
        fontWeight: 700,
        padding: '10px 20px',
        borderRadius: 24,
        transform: `scale(${String(scale)})`,
        transformOrigin: 'top right',
        boxShadow: `0 4px 20px ${accent}88`,
      }}
    >
      Step {String(stepIndex + 1)}
    </div>
  );
};

/** Top header bar. */
const Header: React.FC<{
  topic: string;
  logoUrl: string;
  brandColor: string;
  frame: number;
  fps: number;
}> = ({ topic, logoUrl, brandColor, frame, fps }) => {
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 88,
        background: brandColor,
        display: 'flex',
        alignItems: 'center',
        padding: '0 48px',
        gap: 24,
        opacity,
      }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Logo"
          style={{ height: 40, objectFit: 'contain', flexShrink: 0 }}
        />
      )}
      <span
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 24,
          fontWeight: 700,
          color: '#ffffff',
        }}
      >
        {topic}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * 40-second product walkthrough composition.
 *
 * Structure:
 * - Top header bar with brand colour + logo + feature title
 * - Each screenshot displays for 3 seconds with a 0.5s cross-fade
 * - Step annotation badge springs in on each screenshot
 * - Bottom progress bar shows overall walkthrough completion
 * - Step indicator dots highlight the current screenshot
 * - Narration audio plays across the full duration
 *
 * If `screenshotUrls` is empty, a dark placeholder is shown.
 */
export const WalkthroughVideo: React.FC<WalkthroughVideoProps> = ({
  topic,
  script,
  screenshotUrls,
  narrationUrl,
  brandColor,
  brandAccent,
  logoUrl,
  musicUrl = '',
  musicVolume = 0.16,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const screenshots = screenshotUrls.length > 0 ? screenshotUrls : [''];

  return (
    <AbsoluteFill style={{ background: '#1a1a2e' }}>
      <Header topic={topic} logoUrl={logoUrl} brandColor={brandColor} frame={frame} fps={fps} />

      {screenshots.map((url, i) => {
        const startFrame = i * SCREENSHOT_FRAMES;
        return (
          <ScreenshotPanel
            key={i}
            url={url}
            frame={frame}
            startFrame={startFrame}
            accent={brandAccent}
            index={i}
          />
        );
      })}

      {screenshots.map((_, i) => {
        const startFrame = i * SCREENSHOT_FRAMES;
        const localFrame = frame - startFrame;
        if (localFrame < 0 || localFrame >= SCREENSHOT_FRAMES) return null;
        return (
          <AnnotationBadge
            key={i}
            stepIndex={i}
            frame={frame}
            stepStart={startFrame}
            accent={brandAccent}
          />
        );
      })}

      <StepDots
        total={screenshots.length}
        active={Math.min(Math.floor(frame / SCREENSHOT_FRAMES), screenshots.length - 1)}
        accent={brandAccent}
      />
      <ProgressBar frame={frame} totalFrames={durationInFrames} accent={brandAccent} />

      {/* Script drives narration; keep accessible */}
      <div aria-hidden="true" style={{ display: 'none' }}>{script}</div>
      {narrationUrl && <Audio src={narrationUrl} />}
      {musicUrl && <Audio src={musicUrl} volume={musicVolume} loop />}
    </AbsoluteFill>
  );
};
