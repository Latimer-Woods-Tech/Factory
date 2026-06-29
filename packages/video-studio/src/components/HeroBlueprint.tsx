import React from 'react';
import { AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BodyGraph } from './BodyGraph.js';
import { CosmicSky, type SkyMood } from './CosmicSky.js';

// ---------------------------------------------------------------------------
// HeroBlueprint — the directed personal Energy Blueprint film.
//
// Aesthetic: ETHEREAL / DIVINE-FEMININE. Moonlight lavender, pearl + soft rose
// over a deep plum-violet sky; an airy editorial serif (not heavy sans); a
// luminous MOON that blooms open (not a sci-fi black-hole) and lets the logo
// emerge from its glow; a soft, dreamy, low-grain finish.
//
// Three systems, all driven by character-level narration cues so the picture
// lands on the word:
//   #1 Sync     — every reveal fires on its cue frame (cues.*).
//   #2 Camera   — a choreographed move over a static "world": frame the
//                 identity → push into the chart → drop to the gates → settle
//                 → pull wide for the synthesis.
//   #3 Living   — the chart blooms in, each center ignites on its name, each
//                 signature gate FLARES at its exact position when spoken, with
//                 a subtle 3D parallax tilt + breathing halo.
// ---------------------------------------------------------------------------

export interface HeroGate {
  gate: number; name: string; hex: string; center: string;
  archetype: string; shadow: string; gift: string; siddhi: string;
  /** gatePosition() viewBox coords (300x420) for the flare. */
  x: number; y: number;
}
export interface HeroIdentity { type: string; authority: string; strategy: string; }
export interface HeroCues {
  design: number; type: number; authority: number; centersIntro: number;
  cThroat: number; cG: number; cHeart: number; cSolar: number;
  gatesIntro: number;
  g33: number; g33shadow: number; g33gift: number; g33siddhi: number;
  g19: number; g19shadow: number; g19gift: number; g19siddhi: number;
  g40: number; g40shadow: number; g40gift: number; g40siddhi: number;
  synthesis: number; close: number; flow: number; totalFrames: number;
}
export interface HeroBlueprintProps {
  backgroundUrl?: string;
  identity: HeroIdentity;
  name?: string;
  profile?: string;
  definedCenters: string[];
  definedCenterLabels: string[];
  signatureGates: HeroGate[];
  cues: HeroCues;
  typeColor: string;
  logoUrl?: string;
  /** Emotional-register sky mood (from the forge theme). */
  mood?: SkyMood;
  /** Randomises the procedural sky — different seed = different sky. */
  skySeed?: number;
  /** Hand-and-stars brand logo video for the open. */
  logoVideoUrl?: string;
  /** Brand wordmark shown in the open + close (e.g. "SelfPrime.com"). */
  brandWordmark?: string;
}

// ── Moonlight palette (divine-feminine) ────────────────────────────────────
const LAV = '#cdbcef';   // moonlight lavender — primary accent (was gold)
const PEARL = '#f5eefb';  // brightest moonlight white — headlines & highlights
const ROSE = '#e8c4de';   // soft rose — secondary accent
const VEIL = '#0e0a1c';   // deep plum-violet ground (never pure black)
const SERIF = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";
const SANS = "'Inter', system-ui, sans-serif";

// Body-graph placement in the world (camera zoom enlarges it during its beat).
const GX = 1205, GY = 120, GS = 1.46;

function rev(frame: number, a: number, span = 36): number {
  return interpolate(frame, [a, a + span], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

export const HeroBlueprint: React.FC<HeroBlueprintProps> = ({
  identity, name, profile, definedCenters,
  signatureGates, cues, typeColor, logoUrl, mood, skySeed,
  brandWordmark = 'SelfPrime.com',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // Fade up from black on the open; long, graceful fade to black on the close
  // (the music fades to silence in the same window — see EnergyBlueprintVideo).
  const globalOpacity = Math.min(rev(frame, 0, 26), interpolate(frame, [durationInFrames - 70, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

  // ── #2 Camera ──────────────────────────────────────────────────────────
  const last = cues.totalFrames + 230;
  const kfF = [0, cues.type, cues.centersIntro, cues.cThroat, cues.cSolar, cues.gatesIntro, cues.g33, cues.g19, cues.g40, cues.synthesis, cues.close, last];
  // Gate beats (g33→g40): hold the camera CENTRED on the gate band so all three
  // cards stay fully in frame — the on-chart gate flares (not a camera pan) mark
  // which gate is spoken. Then at SYNTHESIS pull back to a wide shot that frames
  // the whole world at once — the chart (with the gate-circuit drawn between the
  // three gates), the thesis, and all three cards — so they read "as one".
  const camX = interpolate(frame, kfF, [840, 600, 900, 1430, 1430, 1080, 960, 960, 960, 980, 820, 880], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const camY = interpolate(frame, kfF, [500, 450, 470, 430, 470, 660, 804, 812, 820, 470, 500, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const camZ = interpolate(frame, kfF, [1.04, 1.08, 1.05, 1.30, 1.27, 1.10, 1.05, 1.05, 1.05, 1.00, 1.02, 1.07], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const camTransform = `translate(${960 - camX * camZ}px, ${540 - camY * camZ}px) scale(${camZ})`;

  // ── Emotional weather: soft mood-clouds swell on the "shadow" beat and clear
  // to radiance — gentle (never a harsh thunderstorm), in keeping with the mood.
  const emotionalIntensity = interpolate(
    frame,
    [cues.gatesIntro, cues.g33shadow, cues.g33siddhi, cues.synthesis, cues.close],
    [0.10, 0.42, 0.12, 0.05, 0.04],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // ── Cinematic open — a title card over the living moonlit cosmos: a soft
  // pearl light gathers and an editorial serif title rises, then dissolves into
  // the reading. (No illustrated moon, no logo animation — filmic, not cartoony.)
  const titleIn = rev(frame, 14, 34);
  const titleOut = rev(frame, cues.type - 60, 46);
  const titleOpacity = titleIn * (1 - titleOut);
  const titleBloom = 0.5 + 0.5 * Math.sin(frame / 18);        // gentle luminosity pulse
  // Close funnel — route the seeker to a practitioner for the deeper synthesis.
  const ctaIn = rev(frame, durationInFrames - 150, 44);

  // ── #3 Living chart ───────────────────────────────────────────────────────
  const bloom = spring({ frame: frame - cues.centersIntro, fps, config: { damping: 22, stiffness: 42 }, from: 0, to: 1 });
  const graphOpacity = rev(frame, cues.centersIntro, 40);
  const tiltY = Math.sin(frame / 90) * 5;       // subtle 3D parallax
  const tiltX = Math.cos(frame / 110) * 2.5;
  // Per-center ignite: centers brighten as named. We feed all defined centers
  // to the engine (so channels render) but ramp the whole graph's glow with the
  // ignite progress for a "lighting up" feel.
  const igniteProg = interpolate(frame, [cues.cThroat, cues.cSolar + 40], [0.35, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Per-center spotlight: the named centre glows brighter on its cue, carrying
  // the "four defined centres" beat on the chart itself (with the chart's own
  // labels) — so there's no separate floating text block to collide with the
  // identity column. Clears once we move on to the gates.
  const activeCenter = frame >= cues.gatesIntro ? undefined
    : frame >= cues.cSolar ? 'SolarPlexus'
      : frame >= cues.cHeart ? 'Heart'
        : frame >= cues.cG ? 'G'
          : frame >= cues.cThroat ? 'Throat'
            : undefined;

  // Flare for a gate at its cue: a bright bloom at the gate's exact position.
  const gateFlare = (cue: number) => interpolate(frame, [cue - 4, cue + 6, cue + 46], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ── Synthesis beat: draw the circuit between the three gates ───────────────
  const synth = rev(frame, cues.synthesis, 70);          // stroke draws on
  const synthFill = rev(frame, cues.synthesis + 55, 60); // interior glows after

  return (
    <AbsoluteFill style={{ opacity: globalOpacity, backgroundColor: VEIL }}>
      {/* ── World (camera target) ─────────────────────────────────────────── */}
      {/* The film recedes as the practitioner CTA arrives, so the close reads
          on a clean stage instead of over the still-lit chart + gate band. */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transform: camTransform, transformOrigin: '0 0', opacity: 1 - ctaIn * 0.94 }}>
        {/* Living procedural sky — soft moonlit violet, lavender + rose aurora. */}
        <CosmicSky frame={frame} mood={mood ?? 'self'} seed={skySeed ?? 1} intensity={emotionalIntensity} />
        {/* Legibility scrims — soft plum, lighter than before (airier). */}
        <AbsoluteFill style={{ background: 'linear-gradient(100deg, rgba(14,10,28,0.78) 0%, rgba(14,10,28,0.38) 30%, rgba(14,10,28,0.03) 56%, rgba(14,10,28,0.28) 100%)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(14,10,28,0) 48%, rgba(14,10,28,0.28) 74%, rgba(14,10,28,0.48) 100%)' }} />

        {/* Identity — recedes once we move past it into the gates, clearing the
            stage for the synthesis thesis that lands in this same column. */}
        <div style={{ position: 'absolute', left: 140, top: 300, maxWidth: 760, fontFamily: SANS, opacity: 1 - rev(frame, cues.gatesIntro + 40, 80) }}>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '0.46em', textTransform: 'uppercase', color: 'rgba(245,238,251,0.62)', marginBottom: 22, opacity: rev(frame, cues.type - 16, 30), textShadow: '0 2px 14px rgba(10,6,24,0.8)' }}>
            {name ? `${name} · ` : ''}Your Energy Blueprint
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 146, fontWeight: 400, letterSpacing: '0.005em', lineHeight: 0.94, color: PEARL, textShadow: '0 6px 50px rgba(10,6,24,0.6)', opacity: rev(frame, cues.type, 26), transform: `translateY(${interpolate(rev(frame, cues.type, 30), [0, 1], [44, 0])}px)` }}>
            {identity.type}
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 46, fontWeight: 400, color: LAV, marginTop: 20, opacity: rev(frame, cues.authority, 30) }}>
            {identity.authority}
          </div>
          <div style={{ width: interpolate(rev(frame, cues.authority + 14, 50), [0, 1], [0, 128]), height: 2, background: `linear-gradient(90deg, ${LAV}, ${ROSE})`, margin: '30px 0 26px', boxShadow: `0 0 18px ${LAV}aa` }} />
          <div style={{ fontSize: 27, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,238,251,0.84)', opacity: rev(frame, cues.authority + 26, 30) }}>
            {identity.strategy}{profile ? `  ·  ${profile}` : ''}
          </div>
        </div>

        {/* Living body graph: scrim + bloom + tilt + breathe + gate flares */}
        <div style={{ position: 'absolute', right: 30, top: 300, transform: 'translateY(-50%)', width: 840, height: 980, background: 'radial-gradient(ellipse 46% 52% at 50% 48%, rgba(14,10,28,0.88) 0%, rgba(14,10,28,0.56) 44%, rgba(14,10,28,0) 74%)', opacity: graphOpacity }} />
        <div style={{ position: 'absolute', inset: 0, opacity: graphOpacity, transform: `perspective(1600px) rotateY(${tiltY}deg) rotateX(${tiltX}deg) scale(${interpolate(bloom, [0, 1], [0.8, 1])})`, transformOrigin: `${GX + 150 * GS}px ${GY + 210 * GS}px`, filter: `drop-shadow(0 0 ${interpolate(igniteProg, [0, 1], [16, 46])}px rgba(205,188,239,${interpolate(igniteProg, [0, 1], [0.22, 0.55])}))` }}>
          <BodyGraph frame={frame} fps={fps} definedCenters={definedCenters} signatureGates={signatureGates.map((g) => g.gate)} typeColor={typeColor} scale={GS} x={GX} y={GY} spotlightCenter={activeCenter} breathe />
          {/* Gate flares — soft moonlit bloom exactly on the named gate */}
          {signatureGates.map((g, i) => {
            const cue = i === 0 ? cues.g33 : i === 1 ? cues.g19 : cues.g40;
            const f = gateFlare(cue);
            if (f <= 0.001) return null;
            return (
              <div key={g.gate} style={{ position: 'absolute', left: GX + g.x * GS, top: GY + g.y * GS, width: 0, height: 0 }}>
                <div style={{ position: 'absolute', left: -70, top: -70, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, rgba(245,238,251,${0.9 * f}) 0%, rgba(205,188,239,${0.5 * f}) 30%, rgba(205,188,239,0) 70%)`, transform: `scale(${interpolate(f, [0, 1], [0.6, 1.25])})` }} />
              </div>
            );
          })}
          {/* Synthesis circuit — at the synthesis beat, a soft lavender triangle
              draws between the three signature gates, lighting them as one closed
              loop ("three gates, one circuit"), with pulsing nodes at each vertex. */}
          {synth > 0.001 && signatureGates.length >= 3 ? (() => {
            const pt = (g: HeroGate) => `${GX + g.x * GS} ${GY + g.y * GS}`;
            const [a, b, c] = signatureGates as [HeroGate, HeroGate, HeroGate];
            return (
            <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible', mixBlendMode: 'screen', pointerEvents: 'none' }}>
              <path
                d={`M ${pt(a)} L ${pt(b)} L ${pt(c)} Z`}
                fill={`rgba(205,188,239,${0.08 * synthFill})`}
                stroke={LAV}
                strokeWidth={2.5}
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - synth}
                opacity={0.92}
                style={{ filter: 'drop-shadow(0 0 9px rgba(205,188,239,0.75))' }}
              />
              {signatureGates.map((g, i) => {
                const pulse = 0.6 + 0.4 * Math.sin(frame / 9 + i * 2.1);
                return <circle key={g.gate} cx={GX + g.x * GS} cy={GY + g.y * GS} r={5 + 3.5 * pulse} fill={PEARL} opacity={synth * (0.45 + 0.55 * pulse)} style={{ filter: 'drop-shadow(0 0 11px rgba(205,188,239,0.95))' }} />;
              })}
            </svg>
            );
          })() : null}
        </div>

        {/* Signature-gate band */}
        <div style={{ position: 'absolute', left: 140, right: 140, top: 824, fontFamily: SANS }}>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(245,238,251,0.6)', marginBottom: 18, opacity: rev(frame, cues.gatesIntro, 36) }}>
            Your Signature Gates&nbsp;&nbsp;·&nbsp;&nbsp;Shadow → Gift → Siddhi
          </div>
          <div style={{ display: 'flex', gap: 30 }}>
            {signatureGates.map((c, i) => {
              const cue = i === 0 ? cues.g33 : i === 1 ? cues.g19 : cues.g40;
              const o = rev(frame, cue - 6, 38);
              const y = interpolate(rev(frame, cue - 6, 44), [0, 1], [40, 0]);
              // Active pulse — the card for the gate being spoken lifts + glows.
              const active = interpolate(frame, [cue - 4, cue + 10, cue + 64], [0, 1, 0.22], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              // Gene-key arc: every gate reveals Shadow → Gift → Siddhi on the
              // exact words it is spoken (each gate gets its own narrated arc).
              const arc = i === 0
                ? { sh: rev(frame, cues.g33shadow, 18), gi: rev(frame, cues.g33gift, 18), si: rev(frame, cues.g33siddhi, 18) }
                : i === 1
                  ? { sh: rev(frame, cues.g19shadow, 18), gi: rev(frame, cues.g19gift, 18), si: rev(frame, cues.g19siddhi, 18) }
                  : { sh: rev(frame, cues.g40shadow, 18), gi: rev(frame, cues.g40gift, 18), si: rev(frame, cues.g40siddhi, 18) };
              return (
                <div key={c.gate} style={{ flex: 1, padding: '24px 28px', borderLeft: `${2 + active * 3}px solid ${LAV}`, background: `rgba(18,13,34,${0.46 + active * 0.34})`, borderRadius: 6, opacity: o, transform: `translateY(${y - active * 8}px) scale(${1 + active * 0.03})`, boxShadow: active > 0.01 ? `0 18px 60px rgba(8,5,20,0.5), 0 0 ${active * 46}px rgba(205,188,239,${active * 0.42})` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                    <span style={{ fontSize: 40, color: LAV, lineHeight: 1 }}>{c.hex}</span>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(245,238,251,0.55)' }}>GATE {c.gate}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: PEARL }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 400, fontStyle: 'italic', fontFamily: SERIF, color: 'rgba(245,238,251,0.64)', marginTop: 8 }}>{c.archetype} · in your {c.center}</div>
                  <div style={{ fontSize: 21, fontWeight: 500, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'rgba(245,238,251,0.5)', opacity: arc.sh }}>{c.shadow}</span>
                    <span style={{ color: 'rgba(245,238,251,0.4)', fontSize: 18, opacity: arc.gi }}>→</span>
                    <span style={{ color: LAV, opacity: arc.gi }}>{c.gift}</span>
                    <span style={{ color: 'rgba(245,238,251,0.4)', fontSize: 18, opacity: arc.si }}>→</span>
                    <span style={{ color: PEARL, opacity: arc.si }}>{c.siddhi}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synthesis thesis — lands in the (now-cleared) identity column on the
            wide synthesis shot, naming the through-line of the three gates. */}
        <div style={{ position: 'absolute', left: 140, top: 408, maxWidth: 620, fontFamily: SANS, opacity: rev(frame, cues.synthesis, 44) }}>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.42em', textTransform: 'uppercase', color: LAV, marginBottom: 20, textShadow: '0 2px 16px rgba(10,6,24,0.85)' }}>The Synthesis</div>
          <div style={{ fontFamily: SERIF, fontSize: 64, fontWeight: 400, letterSpacing: '0.005em', lineHeight: 1.06, color: PEARL, textShadow: '0 4px 30px rgba(10,6,24,0.7)' }}>Perceive<span style={{ color: LAV }}> · </span>Serve<span style={{ color: ROSE }}> · </span>Restore</div>
          <div style={{ width: interpolate(rev(frame, cues.synthesis + 26, 50), [0, 1], [0, 150]), height: 2, background: `linear-gradient(90deg, ${LAV}, ${ROSE})`, margin: '26px 0', boxShadow: `0 0 18px ${LAV}aa` }} />
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 27, fontWeight: 400, lineHeight: 1.5, color: 'rgba(245,238,251,0.84)', textShadow: '0 2px 16px rgba(10,6,24,0.85)', opacity: rev(frame, cues.synthesis + 20, 50) }}>Three gates, one current. Your retreat is not avoidance — it is how you refill the well.</div>
        </div>
      </div>

      {/* Cinematic open — a title card over the living moonlit cosmos. A soft
          pearl light gathers and an editorial serif title rises, then dissolves
          into the reading. No illustrated moon, no logo animation. */}
      {frame < cues.type ? (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: titleOpacity }}>
          {/* Gentle darkening behind the title so it reads over the live sky. */}
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse 72% 62% at 50% 50%, rgba(10,6,24,0.58) 0%, rgba(10,6,24,0) 70%)' }} />
          {/* A soft pearl light gathering at center — not a sphere, just a bloom. */}
          <div style={{ position: 'absolute', width: 1180, height: 1180, borderRadius: '50%', background: `radial-gradient(circle, rgba(205,188,239,${0.1 + 0.05 * titleBloom}) 0%, rgba(232,196,222,0.05) 38%, transparent 66%)`, filter: 'blur(54px)', transform: `scale(${0.72 + 0.28 * titleIn})` }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontFamily: SANS, fontSize: 23, fontWeight: 500, letterSpacing: '0.54em', textTransform: 'uppercase', color: 'rgba(245,238,251,0.66)', marginBottom: 34, transform: `translateY(${(1 - titleIn) * 18}px)`, textShadow: '0 2px 24px rgba(10,6,24,0.85)' }}>
              {brandWordmark}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 96, fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.0, color: PEARL, textShadow: '0 6px 54px rgba(10,6,24,0.7)', transform: `translateY(${(1 - titleIn) * 30}px) scale(${0.95 + 0.05 * titleIn})` }}>
              Your Energy Blueprint
            </div>
            <div style={{ width: interpolate(rev(frame, 54, 56), [0, 1], [0, 280]), height: 2, marginTop: 44, background: `linear-gradient(90deg, transparent, ${LAV}, ${ROSE}, transparent)`, boxShadow: `0 0 18px ${LAV}88` }} />
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Persistent brand wordmark — up in the mix (fades in as the reading begins) */}
      <div style={{ position: 'absolute', top: 74, left: 0, right: 0, textAlign: 'center', fontFamily: SANS, fontSize: 21, fontWeight: 500, letterSpacing: '0.42em', textTransform: 'uppercase', color: 'rgba(245,238,251,0.74)', textShadow: '0 2px 16px rgba(10,6,24,0.85)', opacity: Math.min(rev(frame, cues.type - 20, 40), globalOpacity) }}>{brandWordmark}</div>

      {/* ── Close — practitioner funnel CTA (deeper reading) ──────────────── */}
      {ctaIn > 0 ? (
        <AbsoluteFill style={{ opacity: ctaIn, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: SANS }}>
          {/* Full base so the receding film never bleeds through, with a soft
              lavender breath at center to keep it from going dead flat. */}
          <AbsoluteFill style={{ background: VEIL }} />
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 64% at 50% 48%, rgba(205,188,239,0.10) 0%, transparent 60%)` }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 1120, padding: '0 80px' }}>
            <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: '0.42em', textTransform: 'uppercase', color: LAV, opacity: 0.9 }}>This is only the surface</div>
            <div style={{ fontFamily: SERIF, fontSize: 76, fontWeight: 400, lineHeight: 1.12, color: PEARL }}>Go deeper with a <span style={{ fontStyle: 'italic', color: LAV }}>practitioner</span></div>
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 28, fontWeight: 400, lineHeight: 1.5, color: 'rgba(245,238,251,0.8)', maxWidth: 800 }}>A certified guide reads your full Energy Blueprint — the synthesis these few minutes only began.</div>
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 46px', borderRadius: 999, border: `1.5px solid ${LAV}`, background: 'rgba(205,188,239,0.08)', boxShadow: '0 0 40px rgba(205,188,239,0.2)' }}>
              <span style={{ fontSize: 25, fontWeight: 500, letterSpacing: '0.04em', color: PEARL }}>Book your reading</span>
              <span style={{ fontSize: 25, color: LAV }}>→</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 21, fontWeight: 500, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(245,238,251,0.72)' }}>{brandWordmark}</div>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* ── Atmospheric overlays (outside the camera world) ───────────────── */}
      {/* Floating motes — slow specks of moonlight drifting up, for soft life. */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: 0.5 * globalOpacity }}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">
          {Array.from({ length: 30 }, (_, i) => {
            const s = (n: number) => random(`mote${i}:${n}`);
            const speed = 0.16 + s(1) * 0.42;
            const y = 1140 - (((frame * speed + s(3) * 1200) % 1200));
            const x = s(0) * 1920 + Math.sin(frame / (60 + s(4) * 90) + s(2) * 7) * 34;
            const rr = 0.8 + s(5) * 2.3;
            const tw = 0.5 + 0.5 * Math.sin(frame / 22 + s(6) * 9);
            return <circle key={i} cx={x} cy={y} r={rr} fill={s(7) < 0.5 ? LAV : PEARL} opacity={(0.18 + 0.42 * tw) * 0.5} />;
          })}
        </svg>
      </AbsoluteFill>
      {/* Light-leak sweep — a soft lavender/rose band drifts across slowly. */}
      <div style={{ position: 'absolute', top: -220, bottom: -220, width: 360, left: 0, transform: `translateX(${interpolate(frame % 620, [0, 620], [-560, 2480])}px) rotate(8deg)`, background: 'linear-gradient(90deg, transparent, rgba(205,188,239,0.16), rgba(232,196,222,0.10), transparent)', filter: 'blur(46px)', mixBlendMode: 'screen', opacity: globalOpacity }} />
      {/* Soft moonlit grade — a gentle lavender bloom + cool plum base. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 72% 70% at 42% 38%, rgba(205,188,239,0.07) 0%, rgba(0,0,0,0) 56%), radial-gradient(ellipse 60% 60% at 70% 66%, rgba(232,196,222,0.05) 0%, transparent 60%)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(26,20,56,0.10) 0%, rgba(10,6,24,0.16) 100%)' }} />
      {/* Film grain — very fine + soft (dialed down further for the dreamy look). */}
      <AbsoluteFill style={{ opacity: 0.02 }}>
        <svg width="100%" height="100%">
          <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed={frame % 64} stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
      {/* Letterbox — slim, soft deep-plum bars (gentler than hard black). */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 42, background: '#0a0716' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 42, background: '#0a0716' }} />

      {logoUrl ? <Img src={logoUrl} style={{ position: 'absolute', right: 150, top: 86, height: 44, objectFit: 'contain', opacity: rev(frame, cues.close, 30) }} /> : null}
    </AbsoluteFill>
  );
};
