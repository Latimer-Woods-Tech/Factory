import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BodyGraph } from './BodyGraph.js';

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
  gatesIntro: number; g33: number; g33shadow: number; g33gift: number; g33siddhi: number;
  g19: number; g40: number; close: number; flow: number; totalFrames: number;
}
export interface HeroBlueprintProps {
  backgroundUrl: string;
  identity: HeroIdentity;
  name?: string;
  profile?: string;
  definedCenters: string[];
  definedCenterLabels: string[];
  signatureGates: HeroGate[];
  cues: HeroCues;
  typeColor: string;
  logoUrl?: string;
}

const GOLD = '#e8c87a';

// Body-graph placement in the world (camera zoom enlarges it during its beat).
const GX = 1205, GY = 120, GS = 1.46;

function rev(frame: number, a: number, span = 36): number {
  return interpolate(frame, [a, a + span], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

export const HeroBlueprint: React.FC<HeroBlueprintProps> = ({
  backgroundUrl, identity, name, profile, definedCenters, definedCenterLabels,
  signatureGates, cues, typeColor, logoUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const globalOpacity = Math.min(rev(frame, 0, 26), interpolate(frame, [durationInFrames - 34, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

  // ── #2 Camera ──────────────────────────────────────────────────────────
  const last = cues.totalFrames + 230;
  const kfF = [0, cues.type, cues.centersIntro, cues.cThroat, cues.cSolar, cues.gatesIntro, cues.g33, cues.g19, cues.g40, cues.close, last];
  const camX = interpolate(frame, kfF, [840, 600, 900, 1430, 1430, 1240, 720, 980, 1180, 820, 880], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const camY = interpolate(frame, kfF, [500, 450, 470, 430, 470, 500, 880, 900, 900, 500, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const camZ = interpolate(frame, kfF, [1.04, 1.08, 1.05, 1.30, 1.27, 1.13, 1.12, 1.07, 1.06, 1.02, 1.07], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const camTransform = `translate(${960 - camX * camZ}px, ${540 - camY * camZ}px) scale(${camZ})`;

  // ── Background Ken Burns (independent of camera, for parallax depth) ──────
  const bgScale = interpolate(frame, [0, durationInFrames], [1.08, 1.2]);
  const bgX = interpolate(frame, [0, durationInFrames], [0, -28]);

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

  return (
    <AbsoluteFill style={{ opacity: globalOpacity, backgroundColor: '#04050b' }}>
      {/* ── World (camera target) ─────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transform: camTransform, transformOrigin: '0 0' }}>
        {/* Background */}
        <Img src={backgroundUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${bgScale}) translateX(${bgX}px)`, opacity: rev(frame, 0, 50) }} />
        <AbsoluteFill style={{ background: 'linear-gradient(100deg, rgba(4,5,11,0.9) 0%, rgba(4,5,11,0.55) 30%, rgba(4,5,11,0.08) 56%, rgba(4,5,11,0.5) 100%)' }} />
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 82% 88% at 52% 42%, rgba(0,0,0,0) 40%, rgba(4,5,11,0.8) 100%)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(4,5,11,0) 46%, rgba(4,5,11,0.4) 74%, rgba(4,5,11,0.64) 100%)' }} />

        {/* Identity */}
        <div style={{ position: 'absolute', left: 140, top: 300, maxWidth: 720, fontFamily: 'Inter, system-ui, sans-serif' }}>
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

        {/* Defined-centres callout */}
        <div style={{ position: 'absolute', left: 690, top: 300, transform: 'translateY(-50%)', fontFamily: 'Inter, system-ui, sans-serif', opacity: rev(frame, cues.centersIntro, 40) }}>
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
              // Gene-key arc: for gate 33 use the spoken cues; others reveal with the card.
              const arc = i === 0
                ? { sh: rev(frame, cues.g33shadow, 18), gi: rev(frame, cues.g33gift, 18), si: rev(frame, cues.g33siddhi, 18) }
                : { sh: rev(frame, cue + 30, 16), gi: rev(frame, cue + 48, 16), si: rev(frame, cue + 66, 16) };
              return (
                <div key={c.gate} style={{ flex: 1, padding: '24px 28px', borderLeft: `3px solid ${GOLD}`, background: 'rgba(8,9,17,0.5)', borderRadius: 4, opacity: o, transform: `translateY(${y}px)` }}>
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
      </div>

      {/* ── Cinematic overlays (outside the camera world) ─────────────────── */}
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
