import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BodyGraph } from './BodyGraph.js';

// ---------------------------------------------------------------------------
// HeroBlueprint — the production-quality personal Energy Blueprint hero.
//
// A single progressive-build composition (the approved mockup, in motion):
//   1. Bespoke cinematic background (FLUX, per forge) with slow Ken Burns.
//   2. Identity card — Type · Authority · Strategy — reveals top-left.
//   3. The real body graph scales in (right) over a contrast scrim; defined
//      centers labelled.
//   4. Signature-gate cards reveal one at a time across the bottom, each with
//      its I-Ching glyph, name, home centre, and the Shadow → Gift → Siddhi
//      transformation arc (the "direction").
//
// All data-driven from the Atom Registry (gate name/glyph/centre/Gene-Key triad)
// and the chart (type/authority/strategy/defined centres/signature gates).
// ---------------------------------------------------------------------------

export interface HeroGate {
  gate: number;
  name: string;
  hex: string;
  center: string;
  archetype: string;
  shadow: string;
  gift: string;
  siddhi: string;
}

export interface HeroIdentity {
  type: string;
  authority: string;
  strategy: string;
}

export interface HeroBlueprintProps {
  backgroundUrl: string;
  identity: HeroIdentity;
  /** Engine center keys to light (e.g. ['G','Throat']). */
  definedCenters: string[];
  /** Human-readable defined-centre labels for the side callout. */
  definedCenterLabels: string[];
  signatureGates: HeroGate[];
  typeColor: string;
  logoUrl?: string;
}

const GOLD = '#e8c87a';

/** Fade-in helper over [a,b]; optional fade-out over [c,d]. */
function reveal(frame: number, a: number, b: number, c?: number, d?: number): number {
  const up = interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (c == null || d == null) return up;
  const down = interpolate(frame, [c, d], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return Math.min(up, down);
}

export const HeroBlueprint: React.FC<HeroBlueprintProps> = ({
  backgroundUrl,
  identity,
  definedCenters,
  definedCenterLabels,
  signatureGates,
  typeColor,
  logoUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Global fade in/out from black.
  const globalOpacity = reveal(frame, 0, 24, durationInFrames - 30, durationInFrames);

  // Ken Burns on the background — slow, premium drift + zoom.
  const bgScale = interpolate(frame, [0, durationInFrames], [1.06, 1.16], { extrapolateRight: 'clamp' });
  const bgShiftX = interpolate(frame, [0, durationInFrames], [0, -32], { extrapolateRight: 'clamp' });
  const bgOpacity = reveal(frame, 0, 50);

  // Reveal schedule (2250f / 75s).
  const idEyebrow = reveal(frame, 70, 105);
  const idType = spring({ frame: frame - 95, fps, config: { damping: 22, stiffness: 70 }, from: 0, to: 1 });
  const idTypeOpacity = reveal(frame, 95, 130);
  const idAuth = reveal(frame, 150, 185);
  const idRule = interpolate(frame, [200, 260], [0, 128], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const idStrategy = reveal(frame, 250, 290);

  const graphIn = spring({ frame: frame - 380, fps, config: { damping: 20, stiffness: 55 }, from: 0, to: 1 });
  const graphOpacity = reveal(frame, 380, 460);
  const centersLabel = reveal(frame, 560, 620);

  // Gate cards: staggered, beginning at 900, each ~210f apart.
  const cardStart = 900;
  const cardStride = 200;
  const bandHeader = reveal(frame, cardStart - 60, cardStart - 20);

  return (
    <AbsoluteFill style={{ opacity: globalOpacity, backgroundColor: '#05060d' }}>
      {/* 1 — Bespoke background with Ken Burns */}
      <AbsoluteFill style={{ opacity: bgOpacity }}>
        <Img
          src={backgroundUrl}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${bgScale}) translateX(${bgShiftX}px)`,
          }}
        />
      </AbsoluteFill>

      {/* Scrims for legibility */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(100deg, rgba(5,6,13,0.92) 0%, rgba(5,6,13,0.6) 30%, rgba(5,6,13,0.1) 56%, rgba(5,6,13,0.48) 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 80% 86% at 52% 42%, rgba(0,0,0,0) 40%, rgba(5,6,13,0.78) 100%)',
        }}
      />
      {/* Right-side scrim — keeps the body graph legible over a bright sky. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(5,6,13,0) 46%, rgba(5,6,13,0.42) 72%, rgba(5,6,13,0.66) 100%)',
        }}
      />
      {/* Overall grade — tames a hot sun centre without crushing the atmosphere. */}
      <AbsoluteFill style={{ background: 'rgba(5,6,13,0.22)' }} />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(0deg, rgba(5,6,13,0.94) 0%, rgba(5,6,13,0.55) 18%, rgba(5,6,13,0) 34%)',
        }}
      />

      {/* 2 — Identity card */}
      <div style={{ position: 'absolute', left: 140, top: 118, maxWidth: 700, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div
          style={{
            fontSize: 23, fontWeight: 600, letterSpacing: '0.46em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.6)', marginBottom: 20, opacity: idEyebrow,
          }}
        >
          Your Energy Blueprint
        </div>
        <div
          style={{
            fontSize: 138, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 0.9, color: '#fff',
            textShadow: '0 6px 50px rgba(0,0,0,0.55)',
            opacity: idTypeOpacity,
            transform: `translateY(${interpolate(idType, [0, 1], [40, 0])}px)`,
          }}
        >
          {identity.type}
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, color: GOLD, marginTop: 18, opacity: idAuth }}>
          {identity.authority}
        </div>
        <div style={{ width: idRule, height: 3, background: GOLD, margin: '30px 0 26px', boxShadow: `0 0 18px ${GOLD}aa` }} />
        <div
          style={{
            fontSize: 29, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.86)', opacity: idStrategy,
          }}
        >
          {identity.strategy}
        </div>
      </div>

      {/* 3 — Defined-centres callout + the hero body graph */}
      <div
        style={{
          position: 'absolute', right: 640, top: 300, transform: 'translateY(-50%)', textAlign: 'right',
          fontFamily: 'Inter, system-ui, sans-serif', opacity: centersLabel,
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)', textShadow: '0 2px 16px rgba(0,0,0,0.85)' }}>
          Defined Centers
        </div>
        <div style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginTop: 10, lineHeight: 1.5, textShadow: '0 2px 16px rgba(0,0,0,0.85)' }}>
          {definedCenterLabels.map((l, i) => (
            <React.Fragment key={l}>
              <span style={{ color: GOLD }}>{l}</span>
              {i < definedCenterLabels.length - 1 && <span style={{ color: 'rgba(255,255,255,0.4)' }}> · </span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* contrast scrim behind the graph */}
      <div
        style={{
          position: 'absolute', right: 30, top: 300, transform: 'translateY(-50%)', width: 820, height: 940,
          background: 'radial-gradient(ellipse 46% 52% at 50% 48%, rgba(5,6,13,0.9) 0%, rgba(5,6,13,0.62) 44%, rgba(5,6,13,0) 74%)',
          opacity: graphOpacity,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, opacity: graphOpacity, transform: `scale(${interpolate(graphIn, [0, 1], [0.92, 1])})`, transformOrigin: '78% 28%' }}>
        <BodyGraph
          frame={frame}
          fps={fps}
          definedCenters={definedCenters}
          signatureGates={signatureGates.map((g) => g.gate)}
          typeColor={typeColor}
          scale={1.72}
          x={1280}
          y={-18}
          breathe
        />
      </div>

      {/* 4 — Signature-gate band */}
      <div style={{ position: 'absolute', left: 140, right: 140, bottom: 64, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div
          style={{
            fontSize: 21, fontWeight: 600, letterSpacing: '0.34em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)', marginBottom: 18, opacity: bandHeader,
          }}
        >
          Your Signature Gates&nbsp;&nbsp;·&nbsp;&nbsp;Shadow → Gift → Siddhi
        </div>
        <div style={{ display: 'flex', gap: 30 }}>
          {signatureGates.map((c, i) => {
            const t = cardStart + i * cardStride;
            const cardOpacity = reveal(frame, t, t + 40);
            const cardY = interpolate(reveal(frame, t, t + 45), [0, 1], [36, 0]);
            const arcReveal = reveal(frame, t + 40, t + 95);
            return (
              <div
                key={c.gate}
                style={{
                  flex: 1, padding: '24px 28px', borderLeft: `3px solid ${GOLD}`,
                  background: 'rgba(10,11,20,0.42)', borderRadius: 4,
                  opacity: cardOpacity, transform: `translateY(${cardY}px)`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span style={{ fontSize: 40, color: GOLD, lineHeight: 1 }}>{c.hex}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)' }}>GATE {c.gate}</span>
                  <span style={{ fontSize: 34, fontWeight: 700, color: '#fff' }}>{c.name}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.62)', marginTop: 8 }}>
                  {c.archetype} · in your {c.center}
                </div>
                <div style={{ fontSize: 21, fontWeight: 600, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, opacity: arcReveal }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{c.shadow}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>→</span>
                  <span style={{ color: GOLD }}>{c.gift}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>→</span>
                  <span style={{ color: '#fff5d6' }}>{c.siddhi}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Logo + URL, near the close */}
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{ position: 'absolute', right: 150, top: 90, height: 46, objectFit: 'contain', opacity: reveal(frame, durationInFrames - 360, durationInFrames - 320, durationInFrames - 40, durationInFrames - 10) }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
