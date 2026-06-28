import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { StarField } from '../components/StarField.js';
import { BodyGraph } from '../components/BodyGraph.js';
import { KineticReveal } from '../components/KineticReveal.js';
import { ForgeAtmosphere, type ForgeKey } from '../components/ForgeAtmosphere.js';
import { HeroBlueprint } from '../components/HeroBlueprint.js';
import { TYPE_COLORS, DEFAULT_BRAND_COLOR } from '../blueprint-types.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const blueprintSchema = z.object({
  appId: z.string(),
  /** Short title — shown in the triad/invitation scene. */
  topic: z.string(),
  /** Full narration script (~200 words for 75s). */
  script: z.string(),
  /** ElevenLabs narration audio URL. Empty string = no audio. */
  narrationUrl: z.string(),
  brandColor: z.string().default(DEFAULT_BRAND_COLOR),
  brandAccent: z.string().default(DEFAULT_BRAND_COLOR),
  logoUrl: z.string(),
  /**
   * Scene definitions. If omitted, the composition derives scenes from
   * script length using the default 7-scene arc.
   */
  scenes: z.array(z.object({
    type: z.enum(['arrival', 'revelation', 'concept', 'breath', 'triad', 'invitation']),
    durationFrames: z.number(),
    text: z.string().optional(),
    /** [shadow, gift, siddhi] — only used in triad scenes. */
    triad: z.tuple([z.string(), z.string(), z.string()]).optional(),
    showBodyGraph: z.boolean().default(false),
    definedCenters: z.array(z.string()).optional(),
    typeColor: z.string().optional(),
    spotlightCenter: z.string().optional(),
  })).optional(),
  /** Atmospheric background theme. Default 'self' (pure deep space). */
  forgeTheme: z.enum(['chronos', 'eros', 'aether', 'lux', 'phoenix', 'self']).default('self'),
  /** HD Type for body graph colour. */
  hdType: z.enum(['generator', 'manifesting_generator', 'projector', 'manifestor', 'reflector']).optional(),
  /**
   * Signature gates to light as badges on the body graph. Passed through to the
   * canonical engine, which marks them active when no full activation map is
   * available.
   */
  signatureGates: z.array(z.number()).optional(),
  /** Optional instrumental music bed (R2 URL). Empty/absent = no music. */
  musicUrl: z.string().optional(),
  /** Music bed volume (0-1), kept low so it sits under the narration. */
  musicVolume: z.number().optional(),

  // ── Production-quality hero design (the personal pipeline) ────────────────
  // When `backgroundUrl` + `identity` are supplied, the composition renders the
  // bespoke hero design (cinematic background + identity card + labelled chart +
  // Shadow→Gift→Siddhi gate band) instead of the legacy scene arc.
  /** Bespoke FLUX background image URL (per forge), from generate-background.mjs. */
  backgroundUrl: z.string().optional(),
  /** Personal identity for the hero card. */
  identity: z.object({
    type: z.string(),
    authority: z.string(),
    strategy: z.string(),
  }).optional(),
  /** Defined-centre engine keys for the hero graph (top-level, not per-scene). */
  heroDefinedCenters: z.array(z.string()).optional(),
  /** Human-readable defined-centre labels for the hero callout. */
  definedCenterLabels: z.array(z.string()).optional(),
  /** Signature-gate metadata cards (from the Atom Registry) for the hero band. */
  signatureGateData: z.array(z.object({
    gate: z.number(),
    name: z.string(),
    hex: z.string(),
    center: z.string(),
    archetype: z.string(),
    shadow: z.string(),
    gift: z.string(),
    siddhi: z.string(),
    /** gatePosition() viewBox coords (300x420) for the on-graph flare. */
    x: z.number(),
    y: z.number(),
  })).optional(),
  /** Display name for the identity eyebrow (optional). */
  name: z.string().optional(),
  /** HD profile, e.g. "5/1 Heretic-Investigator" (optional). */
  profile: z.string().optional(),
  /** Character-level narration cue frames driving every reveal (word-perfect sync). */
  cues: z.record(z.string(), z.number()).optional(),
  /** Procedural-sky seed (randomises the living background per render). */
  skySeed: z.number().optional(),
  /** Hand-and-stars brand logo video URL for the open. */
  logoVideoUrl: z.string().optional(),
  /** Brand wordmark shown in the open + as a persistent header (e.g. "SelfPrime.com"). */
  brandWordmark: z.string().optional(),
});

export type EnergyBlueprintProps = z.infer<typeof blueprintSchema>;

// HD-type → glow colour and the brand accent both come from `blueprint-types`
// (the single source of truth shared with `chartToScenes`), imported above.

// ---------------------------------------------------------------------------
// Default scene layout for a 75-second (2250-frame) video
// ---------------------------------------------------------------------------

/**
 * Flagship body-graph constellation for the brand hero render (no real person).
 * Lights 7 of 9 centers gold so the chart reads as "blazing, certain" rather
 * than the sparse all-open default. Heart and Solar Plexus stay open so it still
 * looks like a real design, not an unnaturally complete one. Per-user renders
 * pass their own `scenes` (from chartToScenes) and never reach this builder, so
 * this constellation only ever applies to the default / hero film.
 */
const HERO_DEFINED_CENTERS = ['Head', 'Ajna', 'Throat', 'G', 'Sacral', 'Spleen', 'Root'];
/** The self/identity centre — spotlit on the hero breath beat ("see who you are"). */
const HERO_SPOTLIGHT_CENTER = 'G';

function buildDefaultScenes(script: string): EnergyBlueprintProps['scenes'] {
  // Split script into roughly two halves for the two concept sections
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const midPoint = Math.floor(sentences.length / 2);
  const part1 = sentences.slice(0, midPoint).join(' ');
  const part2 = sentences.slice(midPoint).join(' ');
  const lastSentence = sentences[sentences.length - 1] ?? '';

  return [
    { type: 'arrival',     durationFrames: 150,  text: undefined, showBodyGraph: false },
    { type: 'revelation',  durationFrames: 300,  text: sentences[0] ?? '', showBodyGraph: false },
    { type: 'concept',     durationFrames: 480,  text: part1, showBodyGraph: true, definedCenters: HERO_DEFINED_CENTERS },
    { type: 'breath',      durationFrames: 90,   text: undefined, showBodyGraph: true, definedCenters: HERO_DEFINED_CENTERS, spotlightCenter: HERO_SPOTLIGHT_CENTER },
    { type: 'concept',     durationFrames: 480,  text: part2, showBodyGraph: true, definedCenters: HERO_DEFINED_CENTERS, spotlightCenter: HERO_SPOTLIGHT_CENTER },
    { type: 'triad',       durationFrames: 360,  triad: ['Shadow', 'Gift', 'Siddhi'], showBodyGraph: false },
    { type: 'invitation',  durationFrames: 390,  text: lastSentence, showBodyGraph: false },
  ];
}

// ---------------------------------------------------------------------------
// Sub-scenes
// ---------------------------------------------------------------------------

interface SceneProps {
  sceneFrame: number;
  durationFrames: number;
  fps: number;
  typeColor: string;
}

const ArrivalScene: React.FC<SceneProps> = ({ sceneFrame }) => {
  // Pure atmosphere — no text. The world breathes.
  const opacity = interpolate(sceneFrame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity }} />;
};

interface RevelationSceneProps extends SceneProps {
  text: string;
}

const RevelationScene: React.FC<RevelationSceneProps> = ({
  sceneFrame, durationFrames, fps, text,
}) => {
  const appear = interpolate(sceneFrame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(sceneFrame, [durationFrames - 20, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(appear, fadeOut),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 200px',
      }}
    >
      <KineticReveal
        text={text}
        frame={sceneFrame}
        startFrame={10}
        msPerWord={260}
        fps={fps}
        fontSize={68}
        fontWeight={300}
        color="#c9a84c"
        lineHeight={1.4}
        textAlign="center"
        maxWidth={1440}
      />
    </AbsoluteFill>
  );
};

interface ConceptSceneProps extends SceneProps {
  text: string;
  definedCenters?: string[];
  signatureGates?: number[];
  spotlightCenter?: string;
}

const ConceptScene: React.FC<ConceptSceneProps> = ({
  sceneFrame, durationFrames, fps, text, typeColor, definedCenters = [], signatureGates = [], spotlightCenter,
}) => {
  const appear = interpolate(sceneFrame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(sceneFrame, [durationFrames - 20, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const bodyGraphScale = spring({
    frame: sceneFrame,
    fps,
    config: { damping: 18, stiffness: 60 },
    from: 0,
    to: 1,
  });

  return (
    <AbsoluteFill style={{ opacity: Math.min(appear, fadeOut) }}>
      {/* Left side — narration text */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: 1920 * 0.52,
          height: 1080,
          display: 'flex',
          alignItems: 'center',
          padding: '80px 100px 80px 140px',
        }}
      >
        <KineticReveal
          text={text}
          frame={sceneFrame}
          startFrame={15}
          msPerWord={240}
          fps={fps}
          fontSize={32}
          fontWeight={300}
          color="rgba(255,255,255,0.88)"
          lineHeight={1.7}
          textAlign="left"
          maxWidth={800}
        />
      </div>

      {/* Right side — body graph over a soft scrim so it reads off the bg */}
      <div style={{ position: 'absolute', inset: 0, opacity: bodyGraphScale }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 1920 * 0.5,
            width: 1920 * 0.5,
            height: 1080,
            background:
              'radial-gradient(ellipse 45% 58% at 58% 50%, rgba(6,7,14,0.82) 0%, rgba(6,7,14,0.45) 42%, rgba(6,7,14,0) 72%)',
          }}
        />
        <BodyGraph
          frame={sceneFrame}
          fps={fps}
          definedCenters={definedCenters}
          signatureGates={signatureGates}
          typeColor={typeColor}
          scale={1.55}
          x={1150}
          y={210}
          breathe
          spotlightCenter={spotlightCenter}
        />
      </div>
    </AbsoluteFill>
  );
};

const BreathScene: React.FC<
  SceneProps & { showBodyGraph: boolean; definedCenters?: string[]; signatureGates?: number[] }
> = ({
  sceneFrame, fps, typeColor, definedCenters = [], signatureGates = [], showBodyGraph,
}) => (
  <AbsoluteFill style={{ opacity: 1 }}>
    {showBodyGraph && (
      <>
        {/* Hero scrim — pulls the graph out of the murk and centres attention. */}
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(ellipse 42% 64% at 50% 50%, rgba(6,7,14,0.85) 0%, rgba(6,7,14,0.5) 42%, rgba(6,7,14,0) 70%)',
          }}
        />
        {/* Big, centred hero. 300×420 engine at 2.3 → centred in 1920×1080. */}
        <BodyGraph
          frame={sceneFrame}
          fps={fps}
          definedCenters={definedCenters}
          signatureGates={signatureGates}
          typeColor={typeColor}
          scale={2.3}
          x={615}
          y={57}
          breathe
        />
      </>
    )}
  </AbsoluteFill>
);

interface TriadSceneProps extends SceneProps {
  triad: [string, string, string];
}

const TriadScene: React.FC<TriadSceneProps> = ({ sceneFrame, triad }) => {
  const [shadow, gift, siddhi] = triad;

  // Each word gets ~100 frames: arrive 80 frames, hold 20, then fade
  const shadowFade = Math.min(
    interpolate(sceneFrame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(sceneFrame, [90, 110], [1, 0.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  const giftFade = Math.min(
    interpolate(sceneFrame, [110, 122], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(sceneFrame, [200, 220], [1, 0.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  const siddhiFade = interpolate(sceneFrame, [220, 232], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  // Gold line draws under siddhi
  const lineWidth = interpolate(sceneFrame, [240, 300], [0, 400], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const wordStyle = (opacity: number, color: string, glow?: boolean): React.CSSProperties => ({
    position: 'absolute',
    left: 0, right: 0,
    textAlign: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 96,
    fontWeight: 300,
    letterSpacing: '0.06em',
    color,
    opacity,
    textShadow: glow ? `0 0 60px ${color}88, 0 0 120px ${color}44` : 'none',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'relative', width: 1200, height: 200 }}>
        <div style={{ ...wordStyle(Math.max(0, shadowFade), '#a0a0b8'), top: 0 }}>{shadow}</div>
        <div style={{ ...wordStyle(Math.max(0, giftFade),   '#c9a84c'), top: 0 }}>{gift}</div>
        <div style={{ ...wordStyle(Math.max(0, siddhiFade), '#fff5d6', true), top: 0 }}>{siddhi}</div>
      </div>

      {/* Gold line draws under the siddhi word */}
      {siddhiFade > 0 && (
        <svg width={lineWidth} height={2} style={{ marginTop: 24 }}>
          <line x1={0} y1={1} x2={lineWidth} y2={1}
            stroke="#c9a84c" strokeWidth={2} strokeOpacity={siddhiFade} />
        </svg>
      )}
    </AbsoluteFill>
  );
};

interface InvitationSceneProps extends SceneProps {
  text: string;
  logoUrl: string;
}

const InvitationScene: React.FC<InvitationSceneProps> = ({
  sceneFrame, durationFrames, fps, text, logoUrl,
}) => {
  const appear = interpolate(sceneFrame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const fadeToBlack = interpolate(sceneFrame, [durationFrames - 30, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const logoOpacity = interpolate(sceneFrame, [10, 40], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(appear, fadeToBlack),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
      }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Prime Self"
          style={{ height: 52, objectFit: 'contain', opacity: logoOpacity }}
        />
      )}
      <KineticReveal
        text={text}
        frame={sceneFrame}
        startFrame={20}
        msPerWord={320}
        fps={fps}
        fontSize={28}
        fontWeight={300}
        color="rgba(255,255,255,0.7)"
        lineHeight={1.6}
        textAlign="center"
        maxWidth={800}
      />
      {/* Subtle URL */}
      <p
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 16,
          fontWeight: 300,
          color: '#c9a84c',
          opacity: logoOpacity * 0.7,
          letterSpacing: '0.1em',
          marginTop: 16,
        }}
      >
        selfprime.net
      </p>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------

export const EnergyBlueprintVideo: React.FC<EnergyBlueprintProps> = ({
  script,
  narrationUrl,
  scenes: sceneProp,
  forgeTheme = 'self',
  hdType,
  brandColor = DEFAULT_BRAND_COLOR,
  logoUrl,
  signatureGates = [],
  musicUrl = '',
  musicVolume = 0.16,
  identity,
  heroDefinedCenters,
  definedCenterLabels,
  signatureGateData,
  name,
  profile,
  cues,
  skySeed,
  logoVideoUrl,
  brandWordmark,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const typeColor = (hdType && TYPE_COLORS[hdType]) ?? brandColor;

  // Music envelope — swell the bed in over the open (no hard attack at frame 0,
  // which read as an abrupt/odd start) and ease it out under the close.
  const musicEnv = (f: number) =>
    musicVolume *
    Math.min(
      interpolate(f, [0, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      interpolate(f, [durationInFrames - 90, durationInFrames - 12], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    );

  // Production-quality hero design — the per-user pipeline supplies identity +
  // gate metadata + narration cues (the living CosmicSky replaces any static
  // background). Legacy scene arc is the fallback for content videos.
  if (identity && cues) {
    return (
      <AbsoluteFill>
        <HeroBlueprint
          identity={identity}
          name={name}
          profile={profile}
          definedCenters={heroDefinedCenters ?? []}
          definedCenterLabels={definedCenterLabels ?? []}
          signatureGates={(signatureGateData ?? []) as never}
          cues={cues as never}
          typeColor={typeColor}
          logoUrl={logoUrl}
          mood={forgeTheme}
          skySeed={skySeed}
          logoVideoUrl={logoVideoUrl}
          brandWordmark={brandWordmark}
        />
        {narrationUrl && <Audio src={narrationUrl} />}
        {musicUrl && <Audio src={musicUrl} volume={musicEnv} loop />}
      </AbsoluteFill>
    );
  }

  const resolvedScenes = sceneProp ?? buildDefaultScenes(script) ?? [];

  // Determine which scene is current and the local frame within it
  let sceneStart = 0;
  let resolvedActiveScene = resolvedScenes[0];
  let sceneLocalFrame = 0;

  for (const s of resolvedScenes) {
    const sceneEnd = sceneStart + s.durationFrames;
    if (frame < sceneEnd) {
      resolvedActiveScene = s;
      sceneLocalFrame = frame - sceneStart;
      break;
    }
    sceneStart = sceneEnd;
  }

  // Fallback to first scene if nothing resolved (shouldn't happen)
  const scene = resolvedActiveScene ?? resolvedScenes[0];
  if (!scene) return <AbsoluteFill style={{ background: '#05091a' }} />;

  // Overall fade in from black (first 20 frames) and fade to black (last 20)
  const globalOpacity = Math.min(
    interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );

  const sceneTypeColor = scene.typeColor ?? typeColor;
  const definedCenters = scene.definedCenters ?? [];

  return (
    <AbsoluteFill style={{ opacity: globalOpacity }}>
      {/* Layer 1: Forge atmosphere */}
      <ForgeAtmosphere forge={forgeTheme as ForgeKey} frame={frame} fps={fps} intensity={0.7} />

      {/* Layer 2: Star field (always present, but subtle in concept scenes) */}
      <div style={{ opacity: scene.type === 'concept' ? 0.5 : 1 }}>
        <StarField frame={frame} seed={137} goldenRatio={0.12} density={160} />
      </div>

      {/* Layer 3: Scene content */}
      {scene.type === 'arrival' && (
        <ArrivalScene sceneFrame={sceneLocalFrame} durationFrames={scene.durationFrames} fps={fps} typeColor={sceneTypeColor} />
      )}

      {scene.type === 'revelation' && scene.text && (
        <RevelationScene sceneFrame={sceneLocalFrame} durationFrames={scene.durationFrames} fps={fps} typeColor={sceneTypeColor} text={scene.text} />
      )}

      {scene.type === 'concept' && scene.text && (
        <ConceptScene sceneFrame={sceneLocalFrame} durationFrames={scene.durationFrames} fps={fps} typeColor={sceneTypeColor} text={scene.text} definedCenters={definedCenters} signatureGates={signatureGates} spotlightCenter={scene.spotlightCenter} />
      )}

      {scene.type === 'breath' && (
        <BreathScene sceneFrame={sceneLocalFrame} durationFrames={scene.durationFrames} fps={fps} typeColor={sceneTypeColor} showBodyGraph={scene.showBodyGraph} definedCenters={definedCenters} signatureGates={signatureGates} />
      )}

      {scene.type === 'triad' && scene.triad && (
        <TriadScene sceneFrame={sceneLocalFrame} durationFrames={scene.durationFrames} fps={fps} typeColor={sceneTypeColor} triad={scene.triad} />
      )}

      {scene.type === 'invitation' && scene.text && (
        <InvitationScene sceneFrame={sceneLocalFrame} durationFrames={scene.durationFrames} fps={fps} typeColor={sceneTypeColor} text={scene.text} logoUrl={logoUrl} />
      )}

      {/* Narration audio */}
      {narrationUrl && <Audio src={narrationUrl} />}
      {/* Instrumental music bed, looped + ducked under the narration */}
      {musicUrl && <Audio src={musicUrl} volume={musicVolume} loop />}
    </AbsoluteFill>
  );
};
