import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// TrainingScreencast — classy product-screencast treatment (issue #1846).
//
// A real captured selfprime.net flow plays inside a branded browser bezel that
// floats over the moonlight divine-feminine identity. Zoom-to-focus beats and
// gold-on-dark lower-thirds are interpolate()-driven (Remotion renders static
// frames — CSS transitions do nothing). This SUPERSEDES TrainingVideo.tsx (the
// rejected blue-sidebar motion-graphics treatment); it is not an extension of it.
// ---------------------------------------------------------------------------

// Moonlight palette (HeroBlueprint v8+ identity).
const VEIL = '#0e0a1c';
const LAV = '#cdbcef';
const PEARL = '#f5eefb';
const STAR = '#bcd2ec';
const GOLD = '#f0c69a';
const DISPLAY = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
const LABEL = "'Inter','Segoe UI',system-ui,sans-serif";

const beatSchema = z.object({
  /** When this beat begins, in seconds from clip start. */
  at: z.number(),
  /** Eyebrow line (tracked caps), e.g. "STEP 1 OF 4". */
  eyebrow: z.string(),
  /** Lower-third headline (serif). */
  title: z.string(),
  /** Zoom focus: scale (1 = fit) and normalized focus point (0..1) of the capture. */
  zoom: z
    .object({ scale: z.number(), x: z.number(), y: z.number() })
    .optional(),
});

export const trainingScreencastSchema = z.object({
  appId: z.string(),
  topic: z.string(),
  /** Capture source — an http(s) URL (R2) or a filename resolved via staticFile. */
  captureUrl: z.string(),
  /** Native pixel size of the capture (for correct bezel aspect). */
  captureWidth: z.number().default(1440),
  captureHeight: z.number().default(900),
  /** Seconds to skip at the head of the capture (drops the page-load prefix). */
  captureStartSeconds: z.number().default(0),
  /** Timed lower-third + zoom beats. */
  beats: z.array(beatSchema),
  /** ElevenLabs narration (R2 URL). Empty = silent. */
  narrationUrl: z.string().default(''),
  /** Instrumental bed (R2 URL). Empty = none. */
  musicUrl: z.string().default(''),
  musicVolume: z.number().default(0.14),
  /** Logo mark (optional) for the bezel chrome. */
  logoUrl: z.string().default(''),
  durationSeconds: z.number().min(8).max(900).default(40),
});

export type TrainingScreencastProps = z.infer<typeof trainingScreencastSchema>;

const resolveSrc = (s: string) =>
  /^https?:\/\//.test(s) ? s : staticFile(s);

// --- Living moonlight backdrop -------------------------------------------------
const Backdrop: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  // Slow breathing of the glows so the field never sits still.
  const t = frame / fps;
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.5);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 78% 18%, ${LAV}1f, transparent 55%),`
          + ` radial-gradient(110% 80% at 16% 88%, ${STAR}1a, transparent 52%),`
          + ` linear-gradient(160deg, #140d28 0%, ${VEIL} 60%, #07050f 100%)`,
      }}
    >
      {/* drifting star motes */}
      {Array.from({ length: 36 }).map((_, i) => {
        const seed = (i * 9301 + 49297) % 233280 / 233280;
        const x = (seed * 100).toFixed(2);
        const y = (((i * 7 + 13) % 100)).toFixed(2);
        const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * (0.6 + seed) + i));
        const r = 0.8 + seed * 1.6;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: r,
              height: r,
              borderRadius: r,
              background: i % 3 === 0 ? STAR : PEARL,
              opacity: tw * (0.4 + 0.6 * breathe),
              boxShadow: `0 0 ${4 + r * 3}px ${i % 3 === 0 ? STAR : LAV}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// --- Browser bezel wrapping the capture ---------------------------------------
const Bezel: React.FC<{
  src: string;
  aspect: number;
  frame: number;
  fps: number;
  beats: TrainingScreencastProps['beats'];
  startFrom: number;
}> = ({ src, aspect, frame, fps, beats, startFrom }) => {
  // Base bezel footprint on the 1920x1080 canvas.
  const baseW = 1380;
  const baseH = Math.round(baseW / aspect);
  const chromeH = 44;

  // Intro: bezel eases up + fades in over the first 0.7s.
  const intro = interpolate(frame, [0, fps * 0.7], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const introY = interpolate(intro, [0, 1], [40, 0]);

  // Zoom-to-focus: find the active beat with a zoom and interpolate toward it.
  const sec = frame / fps;
  let scale = 1;
  let fx = 0.5;
  let fy = 0.42;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (b.zoom && sec >= b.at) {
      const k = interpolate(sec, [b.at, b.at + 0.9], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      scale = interpolate(k, [0, 1], [scale, b.zoom.scale]);
      fx = interpolate(k, [0, 1], [fx, b.zoom.x]);
      fy = interpolate(k, [0, 1], [fy, b.zoom.y]);
    }
  }
  // Translate so the focus point stays centred as we scale in.
  const tx = (0.5 - fx) * baseW * (scale - 1);
  const ty = (0.5 - fy) * baseH * (scale - 1);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: baseW,
        height: baseH + chromeH,
        transform: `translate(-50%, calc(-50% + ${introY}px))`,
        opacity: intro,
        filter: 'drop-shadow(0 40px 90px rgba(0,0,0,0.6))',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 22,
          overflow: 'hidden',
          border: `1px solid ${LAV}33`,
          background: '#0b0718',
        }}
      >
        {/* chrome bar */}
        <div
          style={{
            height: chromeH,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '0 18px',
            background: 'linear-gradient(180deg,#1a1330,#120c24)',
            borderBottom: `1px solid ${LAV}1f`,
          }}
        >
          {[ROSEDOT, GOLD, STAR].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85 }} />
          ))}
          <div
            style={{
              marginLeft: 18,
              flex: 1,
              height: 22,
              borderRadius: 11,
              background: '#ffffff0a',
              border: `1px solid ${LAV}1a`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              fontFamily: LABEL,
              fontSize: 12,
              letterSpacing: '0.04em',
              color: `${PEARL}99`,
            }}
          >
            selfprime.net
          </div>
        </div>
        {/* captured flow with zoom-to-focus */}
        <div style={{ width: '100%', height: baseH, overflow: 'hidden' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <OffthreadVideo
              src={src}
              startFrom={startFrom}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
            />
          </div>
        </div>
      </div>
    </div>
  );
};
const ROSEDOT = '#e8c4de';

// --- Gold-on-dark lower-third --------------------------------------------------
const LowerThird: React.FC<{
  beats: TrainingScreencastProps['beats'];
  frame: number;
  fps: number;
}> = ({ beats, frame, fps }) => {
  const sec = frame / fps;
  // Active beat = last beat whose `at` has passed.
  let active = -1;
  for (let i = 0; i < beats.length; i++) if (sec >= beats[i].at) active = i;
  if (active < 0) return null;
  const b = beats[active];
  const next = beats[active + 1];
  const localStart = b.at;
  const localEnd = next ? next.at : sec + 1;

  // Reveal in over 0.5s; ease out over the last 0.4s before the next beat.
  const reveal = interpolate(sec, [localStart, localStart + 0.5], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const out = next
    ? interpolate(sec, [localEnd - 0.4, localEnd], [1, 0], {
        easing: Easing.in(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const op = Math.min(reveal, out);
  const slide = interpolate(reveal, [0, 1], [26, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 96,
        bottom: 92,
        opacity: op,
        transform: `translateY(${slide}px)`,
        maxWidth: 760,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '18px 26px 20px',
          borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(20,13,40,0.82), rgba(10,7,20,0.9))',
          border: `1px solid ${GOLD}33`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div
          style={{
            fontFamily: LABEL,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: GOLD,
            marginBottom: 8,
          }}
        >
          {b.eyebrow}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 46, lineHeight: 1.12, color: PEARL }}>
          {b.title}
        </div>
        <div style={{ marginTop: 14, height: 2, width: 64, background: GOLD, opacity: 0.8, borderRadius: 2 }} />
      </div>
    </div>
  );
};

// --- Topic plate (top-left eyebrow) -------------------------------------------
const TopicPlate: React.FC<{ topic: string; logoUrl: string; frame: number; fps: number }> = ({
  topic,
  logoUrl,
  frame,
  fps,
}) => {
  const op = interpolate(frame, [fps * 0.2, fps * 0.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 60, left: 96, opacity: op, display: 'flex', alignItems: 'center', gap: 16 }}>
      {logoUrl ? <Img src={logoUrl} style={{ height: 34, width: 'auto' }} /> : null}
      <div style={{ fontFamily: DISPLAY, fontSize: 30, color: PEARL, letterSpacing: '0.01em' }}>{topic}</div>
    </div>
  );
};

export const TrainingScreencast: React.FC<TrainingScreencastProps> = ({
  topic,
  captureUrl,
  captureWidth = 1440,
  captureHeight = 900,
  captureStartSeconds = 0,
  beats,
  narrationUrl = '',
  musicUrl = '',
  musicVolume = 0.14,
  logoUrl = '',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const aspect = captureWidth / captureHeight;

  // Gentle end fade so a clip never hard-cuts.
  const endFade = interpolate(
    frame,
    [durationInFrames - fps * 0.6, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ background: VEIL }}>
      <AbsoluteFill style={{ opacity: endFade }}>
        <Backdrop frame={frame} fps={fps} />
        <Bezel src={resolveSrc(captureUrl)} aspect={aspect} frame={frame} fps={fps} beats={beats} startFrom={Math.round(captureStartSeconds * fps)} />
        <TopicPlate topic={topic} logoUrl={logoUrl} frame={frame} fps={fps} />
        <LowerThird beats={beats} frame={frame} fps={fps} />
      </AbsoluteFill>
      {narrationUrl ? <Audio src={resolveSrc(narrationUrl)} /> : null}
      {musicUrl ? <Audio src={resolveSrc(musicUrl)} volume={musicVolume} loop /> : null}
    </AbsoluteFill>
  );
};
