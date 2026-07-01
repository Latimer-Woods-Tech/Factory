import React, { useMemo } from 'react';
import { interpolate } from 'remotion';
import { renderBodyGraph } from '@latimer-woods-tech/bodygraph';

// ---------------------------------------------------------------------------
// BodyGraph (film) — now a thin Remotion wrapper over the canonical engine
// @latimer-woods-tech/bodygraph. The engine owns ALL geometry, shapes,
// channels, and gate badges (one renderer shared by film / web / PDF). This
// component's only job is to layer Remotion *motion* on top of the engine's
// SVG without ever blurring the crisp shapes or gate numbers.
//
// Layering strategy (keeps numbers razor-sharp):
//   • BACK layer  — engine SVG with `glow: true`. Its soft halos breathe/pulse
//                   (we animate the whole back layer's opacity + scale). Even
//                   though this layer also draws crisp shapes, it sits behind…
//   • FRONT layer — engine SVG with `glow: false` (no halo): pure crisp shapes,
//                   lit channels, and gate badges/numbers. Static + sharp,
//                   painted on top so the breathing halo never softens an edge
//                   or a number.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types — surface preserved so EnergyBlueprintVideo.tsx keeps working.
// ---------------------------------------------------------------------------

export interface BodyGraphProps {
  frame: number;
  fps: number;
  /** Centers that are defined (solid glow). PascalCase keys (e.g. 'G', 'Throat'). */
  definedCenters?: string[];
  /**
   * Signature gates to light as badges. Passed straight to the engine, which
   * falls back to these when no full `gateActivations` map is available.
   */
  signatureGates?: number[];
  /** Type-based accent colour for defined centers + lit channels. Default '#c9a84c'. */
  typeColor?: string;
  /** Scale applied to the full SVG. Default 1.0. */
  scale?: number;
  /** X offset of the SVG container. Default positions body graph in the right 45% area. */
  x?: number;
  /** Y offset. Default vertically centres within 1080px. */
  y?: number;
  /** Whether defined centers breathe (pulse). Default true. */
  breathe?: boolean;
  /**
   * The center key to spotlight on this scene. When set, the bodygraph engine
   * renders that center with an intensified halo (doubled blur radius, higher
   * opacity) so the viewer's eye is drawn to the gate's home center.
   * Corresponds to `BlueprintScene.spotlightCenter`.
   */
  spotlightCenter?: string;
}

// Engine viewBox is 300×420; the film historically reserved a 340×480 box.
// Render at the engine's native size and let `scale` handle sizing.
const ENGINE_W = 300;
const ENGINE_H = 420;

/**
 * BodyGraph — SVG rendering of the Human Design body graph for the film.
 *
 * Delegates all drawing to {@link renderBodyGraph} (the canonical engine) and
 * layers a breathing halo animation behind a static, crisp top layer so the
 * gate numbers and center edges always stay sharp.
 */
export const BodyGraph: React.FC<BodyGraphProps> = ({
  frame,
  definedCenters = [],
  signatureGates = [],
  typeColor = '#c9a84c',
  scale = 1.0,
  x,
  y,
  breathe = true,
  spotlightCenter,
}) => {
  // Default position: right-center area of a 1920×1080 frame.
  const resolvedX = x ?? 1920 * 0.575;
  const resolvedY = y ?? (1080 - ENGINE_H * scale) / 2;

  // Derive the spotlight array — a single-element array when a center is being
  // spotlit, empty otherwise. Array form matches the engine's forward-compat API.
  const spotlightCenters = spotlightCenter ? [spotlightCenter] : [];

  // Crisp top layer — never animated, never blurred. Gate badges + numbers live
  // here. idSuffix keeps gradient/filter ids unique if multiple graphs mount.
  // The crisp layer does NOT receive spotlightCenters — spotlight is a halo
  // effect only, not a shape change, and the halo lives on the glow layer.
  // Moonlight theme override — recolors the engine's gold defaults (undefined
  // centers + gate badges) into the divine-feminine palette so the chart never
  // leaks warm masculine gold. Defined centers / lit channels keep `typeColor`
  // (the per-type periwinkle), which harmonizes with the lavender.
  const moonlight = useMemo(
    () => ({
      accent: typeColor,
      accentStrong: typeColor,
      definedStroke: typeColor,
      channelActive: typeColor,
      glow: typeColor,
      openStroke: 'rgba(205,188,239,0.5)',
      openColor: 'rgba(245,238,251,0.9)',
      badgeBoth: { fill: 'rgba(205,188,239,0.22)', stroke: '#cdbcef', text: '#f5eefb' },
      badgeFaint: { fill: 'rgba(245,238,251,0.1)', stroke: 'rgba(205,188,239,0.42)', text: 'rgba(245,238,251,0.85)' },
    }),
    [typeColor],
  );

  const crispSvg = useMemo(
    () =>
      renderBodyGraph(
        { definedCenters, signatureGates },
        moonlight,
        { glow: false, showGateBadges: true, idSuffix: '-film-crisp' },
      ),
    [definedCenters, signatureGates, moonlight],
  );

  // Back glow layer — halos only (no badges, so nothing crisp to soften). This
  // is the layer we breathe. Spotlight centers get the intensified halo here.
  const glowSvg = useMemo(
    () =>
      renderBodyGraph(
        { definedCenters, signatureGates },
        moonlight,
        { glow: true, showGateBadges: false, idSuffix: '-film-glow', spotlightCenters },
      ),
    // spotlightCenter (string | undefined) drives spotlightCenters array; include it.
    [definedCenters, signatureGates, moonlight, spotlightCenter],
  );

  // Breathing pulse drives ONLY the back glow layer: opacity 0.55 → 0.95 and a
  // subtle scale, over a ~120-frame sine cycle. Shapes/numbers in the front
  // layer are unaffected and stay razor-sharp.
  const pulse = breathe
    ? interpolate(Math.sin(frame / 60), [-1, 1], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0.5;
  // Pulse the halo by OPACITY only — never scale — so the back layer stays
  // pixel-aligned under the crisp front layer (a scale pulse ghosts the labels).
  const glowOpacity = breathe ? interpolate(pulse, [0, 1], [0.72, 1.05]) : 0.85;
  const glowScale = 1;

  return (
    <div
      style={{
        position: 'absolute',
        left: resolvedX,
        top: resolvedY,
        width: ENGINE_W,
        height: ENGINE_H,
        transformOrigin: 'top left',
        transform: `scale(${String(scale)})`,
        pointerEvents: 'none',
      }}
    >
      {/* BACK — breathing halo layer (under the crisp layer). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: glowOpacity,
          transform: `scale(${String(glowScale)})`,
          transformOrigin: 'center',
        }}
        // eslint-disable-next-line @typescript-eslint/naming-convention
        dangerouslySetInnerHTML={{ __html: glowSvg }}
      />

      {/* FRONT — crisp, static shapes + lit channels + gate badges/numbers. */}
      <div
        style={{ position: 'absolute', inset: 0 }}
        // eslint-disable-next-line @typescript-eslint/naming-convention
        dangerouslySetInnerHTML={{ __html: crispSvg }}
      />
    </div>
  );
};

// Export the props type for callers that need the interface without importing
// from remotion directly.
export type { BodyGraphProps as BodyGraphPropsType };
