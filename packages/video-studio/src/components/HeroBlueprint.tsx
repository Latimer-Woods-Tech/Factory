import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BodyGraph } from './BodyGraph.js';
import { CosmicSky, type SkyMood } from './CosmicSky.js';

// ---------------------------------------------------------------------------
// HeroBlueprint v2 — the directed personal Energy Blueprint film.
//
// Three systems, all driven by character-level narration cues so the picture
// lands on the word:
//   #1 Sync     — every reveal fires on its cue frame (cues.*).
//   #2 Camera   — a choreographed move over a static "world": frame the
//                 identity → push into the chart → drop to the gates → settle.
//   #3 Living   — the chart blooms in, each center ignites on its name, each
//                 signature gate FLARES at its exact position when spoken, with
//                 a subtle 3D parallax tilt + breathing halo.
// Plus the cinematic layer: bespoke background (Ken Burns), warm/cool grade,
// film grain, and letterbox bars.
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

const GOLD = '#e8c87a';

// Body-graph placement in the world (camera zoom enlarges it during its beat).
const GX = 1205, GY = 120, GS = 1.46;

function rev(frame: number, a: number, span = 36): number {
  return interpolate(frame, [a, a + span], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

// Cardiac lub-dub envelope — two gaussian thumps per beat, returns 0..1.
function heartbeat(frame: number, period: number): number {
  const ph = ((((frame % period) + period) % period)) / period;
  const g = (c: number, w: number) => Math.exp(-(((ph - c) / w) ** 2));
  return Math.min(1, g(0, 0.05) + g(0.17, 0.07) * 0.55);
}

export const HeroBlueprint: React.FC<HeroBlueprintProps> = ({
  identity, name, profile, definedCenters, definedCenterLabels,
  signatureGates, cues, typeColor, logoUrl, mood, skySeed, logoVideoUrl,
  brandWordmark = 'SelfPrime.com',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const globalOpacity = Math.min(rev(frame, 0, 26), interpolate(frame, [durationInFrames - 34, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

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

  // ── Emotional weather: storm swells through the "shadow" beat, clears by siddhi ──
  const emotionalIntensity = interpolate(
    frame,
    [cues.gatesIntro, cues.g33shadow, cues.g33siddhi, cues.synthesis, cues.close],
    [0.12, 0.7, 0.15, 0.06, 0.04],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  // ── Portal open ──────────────────────────────────────────────────────────
  // A point of energy ignites on a heartbeat, swirls open into a Rick-&-Morty /
  // Dr-Who portal (spinning vortex + splattered glowing rim); the hand-and-stars
  // logo steps out of it, then we push THROUGH the portal into the film.
  const logoIn = rev(frame, 4, 18) * (1 - rev(frame, 128, 162));
  const hb = heartbeat(frame, 31);
  const portalScale = spring({ frame: frame - 10, fps, config: { damping: 11, stiffness: 95, mass: 0.8 }, durationInFrames: 46 });
  const portalSpin = frame * 3.0;
  const logoEmerge = spring({ frame: frame - 46, fps, config: { damping: 15, stiffness: 65 }, durationInFrames: 62 });
  const stepThrough = rev(frame, 120, 42); // push through the portal at the end
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

  // Flare for a gate at its cue: a bright bloom at the gate's exact position.
  const gateFlare = (cue: number) => interpolate(frame, [cue - 4, cue + 6, cue + 46], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ── Synthesis beat: draw the circuit between the three gates ───────────────
  const synth = rev(frame, cues.synthesis, 70);          // stroke draws on
  const synthFill = rev(frame, cues.synthesis + 55, 60); // interior glows after

  return (
    <AbsoluteFill style={{ opacity: globalOpacity, backgroundColor: '#04050b' }}>
      {/* ── World (camera target) ─────────────────────────────────────────── */}
      {/* The film recedes as the practitioner CTA arrives, so the close reads
          on a clean stage instead of over the still-lit chart + gate band. */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transform: camTransform, transformOrigin: '0 0', opacity: 1 - ctaIn * 0.94 }}>
        {/* Living procedural sky — replaces the static beam. Mutates per render
            (skySeed) and swells with emotional intensity (storm on the shadow
            beat, clearing to radiance by the siddhi). */}
        <CosmicSky frame={frame} mood={mood ?? 'self'} seed={skySeed ?? 1} intensity={emotionalIntensity} />
        {/* Legibility scrims — left for the text column, right for the chart. */}
        <AbsoluteFill style={{ background: 'linear-gradient(100deg, rgba(4,5,11,0.82) 0%, rgba(4,5,11,0.42) 30%, rgba(4,5,11,0.04) 56%, rgba(4,5,11,0.32) 100%)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(4,5,11,0) 48%, rgba(4,5,11,0.32) 74%, rgba(4,5,11,0.52) 100%)' }} />

        {/* Identity — recedes once we move past it into the gates, clearing the
            stage for the synthesis thesis that lands in this same column. */}
        <div style={{ position: 'absolute', left: 140, top: 300, maxWidth: 720, fontFamily: 'Inter, system-ui, sans-serif', opacity: 1 - rev(frame, cues.gatesIntro + 40, 80) }}>
          <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '0.46em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 20, opacity: rev(frame, cues.type - 16, 30), textShadow: '0 2px 14px rgba(0,0,0,0.8)' }}>
            {name ? `${name} · ` : ''}Your Energy Blueprint
          </div>
          <div style={{ fontSize: 142, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 0.9, color: '#fff', textShadow: '0 6px 50px rgba(0,0,0,0.6)', opacity: rev(frame, cues.type, 26), transform: `translateY(${interpolate(rev(frame, cues.type, 30), [0, 1], [44, 0])}px)` }}>
            {identity.type}
          </div>
          <div style={{ fontSize: 44, fontWeight: 600, color: GOLD, marginTop: 18, opacity: rev(frame, cues.authority, 30) }}>
            {identity.authority}
          </div>
          <div style={{ width: interpolate(rev(frame, cues.authority + 14, 50), [0, 1], [0, 128]), height: 3, background: GOLD, margin: '30px 0 26px', boxShadow: `0 0 18px ${GOLD}aa` }} />
          <div style={{ fontSize: 29, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.86)', opacity: rev(frame, cues.authority + 26, 30) }}>
            {identity.strategy}{profile ? `  ·  ${profile}` : ''}
          </div>
        </div>

        {/* Defined-centres callout — fades with the identity before synthesis. */}
        <div style={{ position: 'absolute', left: 690, top: 300, transform: 'translateY(-50%)', fontFamily: 'Inter, system-ui, sans-serif', opacity: Math.min(rev(frame, cues.centersIntro, 40), 1 - rev(frame, cues.gatesIntro + 40, 80)) }}>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', textShadow: '0 2px 16px rgba(0,0,0,0.85)' }}>Defined Centers</div>
          <div style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginTop: 10, lineHeight: 1.5, textShadow: '0 2px 16px rgba(0,0,0,0.85)' }}>
            {definedCenterLabels.map((l, i) => (
              <React.Fragment key={l}>
                <span style={{ color: GOLD }}>{l}</span>{i < definedCenterLabels.length - 1 && <span style={{ color: 'rgba(255,255,255,0.4)' }}> · </span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Living body graph: scrim + bloom + tilt + breathe + gate flares */}
        <div style={{ position: 'absolute', right: 30, top: 300, transform: 'translateY(-50%)', width: 840, height: 980, background: 'radial-gradient(ellipse 46% 52% at 50% 48%, rgba(4,5,11,0.9) 0%, rgba(4,5,11,0.6) 44%, rgba(4,5,11,0) 74%)', opacity: graphOpacity }} />
        <div style={{ position: 'absolute', inset: 0, opacity: graphOpacity, transform: `perspective(1600px) rotateY(${tiltY}deg) rotateX(${tiltX}deg) scale(${interpolate(bloom, [0, 1], [0.8, 1])})`, transformOrigin: `${GX + 150 * GS}px ${GY + 210 * GS}px`, filter: `drop-shadow(0 0 ${interpolate(igniteProg, [0, 1], [16, 46])}px rgba(232,200,122,${interpolate(igniteProg, [0, 1], [0.2, 0.5])}))` }}>
          <BodyGraph frame={frame} fps={fps} definedCenters={definedCenters} signatureGates={signatureGates.map((g) => g.gate)} typeColor={typeColor} scale={GS} x={GX} y={GY} breathe />
          {/* Gate flares — bright bloom exactly on the named gate */}
          {signatureGates.map((g, i) => {
            const cue = i === 0 ? cues.g33 : i === 1 ? cues.g19 : cues.g40;
            const f = gateFlare(cue);
            if (f <= 0.001) return null;
            return (
              <div key={g.gate} style={{ position: 'absolute', left: GX + g.x * GS, top: GY + g.y * GS, width: 0, height: 0 }}>
                <div style={{ position: 'absolute', left: -70, top: -70, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, rgba(255,245,214,${0.9 * f}) 0%, rgba(232,200,122,${0.5 * f}) 30%, rgba(232,200,122,0) 70%)`, transform: `scale(${interpolate(f, [0, 1], [0.6, 1.25])})` }} />
              </div>
            );
          })}
          {/* Synthesis circuit — at the synthesis beat, a gold triangle draws
              between the three signature gates, lighting them as one closed loop
              ("three gates, one circuit"), with pulsing nodes at each vertex. */}
          {synth > 0.001 && signatureGates.length >= 3 ? (() => {
            const pt = (g: HeroGate) => `${GX + g.x * GS} ${GY + g.y * GS}`;
            const [a, b, c] = signatureGates as [HeroGate, HeroGate, HeroGate];
            return (
            <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible', mixBlendMode: 'screen', pointerEvents: 'none' }}>
              <path
                d={`M ${pt(a)} L ${pt(b)} L ${pt(c)} Z`}
                fill={`rgba(232,200,122,${0.07 * synthFill})`}
                stroke={GOLD}
                strokeWidth={2.5}
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - synth}
                opacity={0.9}
                style={{ filter: 'drop-shadow(0 0 9px rgba(232,200,122,0.7))' }}
              />
              {signatureGates.map((g, i) => {
                const pulse = 0.6 + 0.4 * Math.sin(frame / 9 + i * 2.1);
                return <circle key={g.gate} cx={GX + g.x * GS} cy={GY + g.y * GS} r={5 + 3.5 * pulse} fill="#fff5d6" opacity={synth * (0.45 + 0.55 * pulse)} style={{ filter: 'drop-shadow(0 0 11px rgba(232,200,122,0.9))' }} />;
              })}
            </svg>
            );
          })() : null}
        </div>

        {/* Signature-gate band */}
        <div style={{ position: 'absolute', left: 140, right: 140, top: 824, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 18, opacity: rev(frame, cues.gatesIntro, 36) }}>
            Your Signature Gates&nbsp;&nbsp;·&nbsp;&nbsp;Shadow → Gift → Siddhi
          </div>
          <div style={{ display: 'flex', gap: 30 }}>
            {signatureGates.map((c, i) => {
              const cue = i === 0 ? cues.g33 : i === 1 ? cues.g19 : cues.g40;
              const o = rev(frame, cue - 6, 38);
              const y = interpolate(rev(frame, cue - 6, 44), [0, 1], [40, 0]);
              // Active pulse — the card for the gate being spoken lifts + glows.
              const active = interpolate(frame, [cue - 4, cue + 10, cue + 64], [0, 1, 0.22], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              // Gene-key arc: every gate now reveals Shadow → Gift → Siddhi on the
              // exact words it is spoken (each gate gets its own narrated arc).
              const arc = i === 0
                ? { sh: rev(frame, cues.g33shadow, 18), gi: rev(frame, cues.g33gift, 18), si: rev(frame, cues.g33siddhi, 18) }
                : i === 1
                  ? { sh: rev(frame, cues.g19shadow, 18), gi: rev(frame, cues.g19gift, 18), si: rev(frame, cues.g19siddhi, 18) }
                  : { sh: rev(frame, cues.g40shadow, 18), gi: rev(frame, cues.g40gift, 18), si: rev(frame, cues.g40siddhi, 18) };
              return (
                <div key={c.gate} style={{ flex: 1, padding: '24px 28px', borderLeft: `${3 + active * 3}px solid ${GOLD}`, background: `rgba(8,9,17,${0.5 + active * 0.32})`, borderRadius: 4, opacity: o, transform: `translateY(${y - active * 8}px) scale(${1 + active * 0.03})`, boxShadow: active > 0.01 ? `0 18px 60px rgba(0,0,0,0.5), 0 0 ${active * 46}px rgba(232,200,122,${active * 0.4})` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                    <span style={{ fontSize: 40, color: GOLD, lineHeight: 1 }}>{c.hex}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)' }}>GATE {c.gate}</span>
                    <span style={{ fontSize: 34, fontWeight: 700, color: '#fff' }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.62)', marginTop: 8 }}>{c.archetype} · in your {c.center}</div>
                  <div style={{ fontSize: 21, fontWeight: 600, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', opacity: arc.sh }}>{c.shadow}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, opacity: arc.gi }}>→</span>
                    <span style={{ color: GOLD, opacity: arc.gi }}>{c.gift}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, opacity: arc.si }}>→</span>
                    <span style={{ color: '#fff5d6', opacity: arc.si }}>{c.siddhi}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synthesis thesis — lands in the (now-cleared) identity column on the
            wide synthesis shot, naming the through-line of the three gates. */}
        <div style={{ position: 'absolute', left: 140, top: 410, maxWidth: 600, fontFamily: 'Inter, system-ui, sans-serif', opacity: rev(frame, cues.synthesis, 44) }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '0.42em', textTransform: 'uppercase', color: GOLD, marginBottom: 18, textShadow: '0 2px 16px rgba(0,0,0,0.85)' }}>The Synthesis</div>
          <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.04, color: '#fff', textShadow: '0 4px 30px rgba(0,0,0,0.7)' }}>Perceive<span style={{ color: GOLD }}> · </span>Serve<span style={{ color: GOLD }}> · </span>Restore</div>
          <div style={{ width: interpolate(rev(frame, cues.synthesis + 26, 50), [0, 1], [0, 150]), height: 3, background: GOLD, margin: '26px 0', boxShadow: `0 0 18px ${GOLD}aa` }} />
          <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', textShadow: '0 2px 16px rgba(0,0,0,0.85)', opacity: rev(frame, cues.synthesis + 20, 50) }}>Three gates, one current. Your retreat is not avoidance — it is how you refill the well.</div>
        </div>
      </div>

      {/* Brand open — portal swirls open, the hand & stars logo steps out */}
      {logoVideoUrl && frame < 172 ? (
        <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: logoIn, transform: `scale(${1 + stepThrough * 1.6})` }}>
          {/* ── A realistic 3D wormhole (not a flat cartoon swirl) ──────────── */}
          {/* Gravitational lensing halo — starlight refracted around the rim. */}
          <div style={{ position: 'absolute', width: 820, height: 820, borderRadius: '50%', background: 'radial-gradient(circle, transparent 58%, rgba(190,210,236,0.12) 64%, rgba(190,210,236,0.04) 70%, transparent 76%)', transform: `scale(${portalScale})`, filter: 'blur(3px)' }} />
          {/* Outer atmospheric bloom — subtle, volumetric. */}
          <div style={{ position: 'absolute', width: 880, height: 880, borderRadius: '50%', background: `radial-gradient(circle, rgba(232,200,122,${0.12 + 0.07 * hb}) 0%, rgba(106,92,192,0.07) 42%, transparent 64%)`, transform: `scale(${portalScale})`, filter: 'blur(20px)' }} />

          {/* Receding tunnel — concentric depth rings fade + blur toward the core. */}
          <div style={{ position: 'absolute', width: 640, height: 640, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${portalScale})` }}>
            {Array.from({ length: 7 }, (_, i) => {
              const t = (i + 1) / 8;
              const d = 600 * (1 - t * 0.78);
              return <div key={i} style={{ position: 'absolute', width: d, height: d, borderRadius: '50%', border: `1px solid ${i % 2 ? GOLD : '#6a5cc0'}`, opacity: 0.07 + 0.13 * (1 - t), filter: `blur(${0.5 + t * 1.7}px)` }} />;
            })}
          </div>

          {/* Accretion disk — matter spiralling in. A conic confined to a ring band
              by a radial mask; rotation via the conic's from-angle (smooth, no
              flat wheel look). Low-contrast + blurred so it reads as light, not paint. */}
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            background: `conic-gradient(from ${portalSpin}deg at 50% 50%, transparent 0%, ${GOLD}99 9%, transparent 24%, #6a5cc0aa 38%, transparent 52%, ${GOLD}77 64%, transparent 80%, #6a5cc099 92%, transparent 100%)`,
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 26%, #000 46%, #000 64%, transparent 88%)',
            maskImage: 'radial-gradient(circle at 50% 50%, transparent 26%, #000 46%, #000 64%, transparent 88%)',
            transform: `scale(${portalScale})`, filter: 'blur(6px)', mixBlendMode: 'screen',
          }} />

          {/* Event horizon — a deep dark core so the centre reads as a hole. */}
          <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, #02030a 0%, #03040c 30%, rgba(4,5,12,0.7) 50%, transparent 66%)', transform: `scale(${portalScale})` }} />

          {/* Hot accretion rim — a thin bright ring of light at the boundary. */}
          <div style={{ position: 'absolute', width: 562, height: 562, borderRadius: '50%', border: `2px solid ${GOLD}`, boxShadow: `0 0 26px 3px ${GOLD}aa, 0 0 60px 8px ${GOLD}44, inset 0 0 44px 6px ${GOLD}55, inset 0 0 110px 22px rgba(106,92,192,0.34)`, opacity: 0.85 + 0.15 * hb, transform: `scale(${portalScale})` }} />

          {/* Rim-light crescent — an off-axis highlight gives the orb its 3D read. */}
          <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle at 38% 30%, rgba(255,246,216,0.42) 0%, rgba(255,246,216,0.08) 16%, transparent 32%)', transform: `scale(${portalScale})`, mixBlendMode: 'screen' }} />

          {/* Plasma filaments — thin organic arcs on the rim, blurred (subtle, not splattered). */}
          <svg width={700} height={700} style={{ position: 'absolute', transform: `scale(${portalScale})`, mixBlendMode: 'screen', filter: 'blur(1.2px)', opacity: 0.5 }}>
            <filter id="portalEdge"><feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed={frame % 50} result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="16" /></filter>
            <circle cx={350} cy={350} r={284} fill="none" stroke={GOLD} strokeWidth={2.5} filter="url(#portalEdge)" opacity={0.7} />
            <circle cx={350} cy={350} r={284} fill="none" stroke="#fff3cf" strokeWidth={1} filter="url(#portalEdge)" opacity={0.6} />
          </svg>
          {/* The hand & stars logo stepping out of the portal (renders only once
              it begins to emerge — avoids OffthreadVideo bleeding during ignition) */}
          {frame >= 44 ? (
            <OffthreadVideo src={logoVideoUrl} muted style={{ width: 600, height: 'auto', mixBlendMode: 'screen', transform: `scale(${0.12 + logoEmerge * 0.88})`, opacity: logoEmerge, clipPath: 'circle(44% at 50% 42%)', filter: `drop-shadow(0 0 48px rgba(201,168,76,${0.3 + 0.25 * hb}))` }} />
          ) : null}
          {/* Wordmark settles after the step-out */}
          <div style={{ position: 'absolute', top: 'calc(50% + 300px)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 34, fontWeight: 700, letterSpacing: '0.34em', color: '#fff', textTransform: 'uppercase', textShadow: '0 2px 30px rgba(0,0,0,0.7)', opacity: rev(frame, 104, 26) * (1 - stepThrough) }}>{brandWordmark}</div>
        </AbsoluteFill>
      ) : null}

      {/* Persistent brand wordmark — up in the mix (fades in after the logo open) */}
      <div style={{ position: 'absolute', top: 74, left: 0, right: 0, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: '0.42em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.74)', textShadow: '0 2px 16px rgba(0,0,0,0.85)', opacity: Math.min(rev(frame, 150, 40), globalOpacity) }}>{brandWordmark}</div>

      {/* ── Close — practitioner funnel CTA (deeper reading) ──────────────── */}
      {ctaIn > 0 ? (
        <AbsoluteFill style={{ opacity: ctaIn, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {/* Full near-opaque base so the receding film never bleeds through,
              with a soft gold breath at center to keep it from going dead flat. */}
          <AbsoluteFill style={{ background: '#04050b' }} />
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 64% at 50% 48%, ${GOLD}14 0%, transparent 60%)` }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, maxWidth: 1120, padding: '0 80px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.42em', textTransform: 'uppercase', color: GOLD, opacity: 0.85 }}>This is only the surface</div>
            <div style={{ fontSize: 72, fontWeight: 300, lineHeight: 1.1, color: '#fff' }}>Go deeper with a <span style={{ color: GOLD }}>practitioner</span></div>
            <div style={{ fontSize: 27, fontWeight: 300, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)', maxWidth: 780 }}>A certified guide reads your full Energy Blueprint — the synthesis these few minutes only began.</div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 44px', borderRadius: 999, border: `1.5px solid ${GOLD}`, background: 'rgba(232,200,122,0.08)', boxShadow: '0 0 40px rgba(232,200,122,0.18)' }}>
              <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '0.04em', color: '#fff' }}>Book your reading</span>
              <span style={{ fontSize: 26, color: GOLD }}>→</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>{brandWordmark}</div>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* ── Cinematic overlays (outside the camera world) ─────────────────── */}
      {/* Floating embers — slow motes of light drifting up, for atmospheric life. */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: 0.5 * globalOpacity }}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">
          {Array.from({ length: 30 }, (_, i) => {
            const s = (n: number) => random(`ember${i}:${n}`);
            const speed = 0.16 + s(1) * 0.42;
            const y = 1140 - (((frame * speed + s(3) * 1200) % 1200));
            const x = s(0) * 1920 + Math.sin(frame / (60 + s(4) * 90) + s(2) * 7) * 34;
            const rr = 0.8 + s(5) * 2.3;
            const tw = 0.5 + 0.5 * Math.sin(frame / 22 + s(6) * 9);
            return <circle key={i} cx={x} cy={y} r={rr} fill={s(7) < 0.5 ? GOLD : '#fff'} opacity={(0.18 + 0.42 * tw) * 0.5} />;
          })}
        </svg>
      </AbsoluteFill>
      {/* Light-leak sweep — a soft warm band drifts across slowly (anamorphic feel). */}
      <div style={{ position: 'absolute', top: -220, bottom: -220, width: 360, left: 0, transform: `translateX(${interpolate(frame % 620, [0, 620], [-560, 2480])}px) rotate(8deg)`, background: 'linear-gradient(90deg, transparent, rgba(232,200,122,0.16), rgba(255,245,214,0.10), transparent)', filter: 'blur(42px)', mixBlendMode: 'screen', opacity: globalOpacity }} />
      {/* Warm/cool grade */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 70% at 38% 40%, rgba(232,200,122,0.06) 0%, rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(20,26,48,0.10) 0%, rgba(0,0,0,0.18) 100%)', mixBlendMode: 'screen' }} />
      {/* Film grain — subtle (dialed down from 0.05; finer grain compresses far
          better, shrinking the H.264 file while keeping the cinematic texture). */}
      <AbsoluteFill style={{ opacity: 0.028 }}>
        <svg width="100%" height="100%">
          <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed={frame % 64} stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
      {/* Letterbox */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 54, background: '#000' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 54, background: '#000' }} />

      {logoUrl ? <Img src={logoUrl} style={{ position: 'absolute', right: 150, top: 86, height: 44, objectFit: 'contain', opacity: rev(frame, cues.close, 30) }} /> : null}
    </AbsoluteFill>
  );
};
