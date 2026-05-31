// ---------------------------------------------------------------------------
// blueprintSegment — the `'blueprint'` SegmentRenderer (I1 Slice 1, doc §7)
//
// Implements the segment contract from `@latimer-woods-tech/video` for the
// blueprint source. Given a SegmentContext whose `sourceData` carries the
// resolved blueprint data + the selfprime-authored narration, it builds the
// EnergyBlueprintVideo render props (via the pure `chartToScenes` mapper) and
// returns them alongside the narration text.
//
// Narration is NOT synthesised here. selfprime authors narration from real
// source data (decision D6); this renderer only *passes it through*. The
// blueprint is a static, cacheable segment (it does not change per render), so
// `cacheable` is always `true` (decision D3).
//
// This module is pure glue over `chartToScenes` — no React, no Remotion, no
// Node built-ins — so it unit-tests anywhere.
// ---------------------------------------------------------------------------

import type {
  SegmentContext,
  SegmentRenderer,
  SegmentResult,
  VideoSource,
} from '@latimer-woods-tech/video';
import { chartToScenes, deriveForgeTheme } from './chartToScenes.js';
import type { BlueprintSegmentData } from './chartToScenes.js';
import type { EnergyBlueprintProps } from './compositions/EnergyBlueprintVideo.js';
import { DEFAULT_BRAND_COLOR } from './blueprint-types.js';

/**
 * Shape selfprime places on {@link SegmentContext.sourceData} for the blueprint
 * segment. It bundles the resolved chart data (consumed by {@link chartToScenes})
 * with the narration selfprime authored from that same data (D6).
 *
 * `narrationText` is required and provided by selfprime — the render service
 * never generates it. Optional brand fields let the caller override the default
 * accent colour and supply a logo without changing the contract.
 */
export interface BlueprintSourceData {
  /** Resolved Energy Blueprint chart data (drives the visual scene arc). */
  blueprint: BlueprintSegmentData;
  /** Narration text authored by selfprime from the user's real chart (D6). */
  narrationText: string;
  /** Optional short on-screen title (triad/invitation framing). */
  topic?: string;
  /** Optional brand accent colour (hex); defaults to the selfprime gold. */
  brandColor?: string;
  /** Optional brand logo URL. */
  logoUrl?: string;
  /** Optional pre-uploaded narration audio URL (e.g. ElevenLabs MP3 in R2). */
  narrationUrl?: string;
}

/** @internal Narrow the opaque `ctx.sourceData` to {@link BlueprintSourceData}. */
function isBlueprintSourceData(value: unknown): value is BlueprintSourceData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const blueprint = v['blueprint'];
  return (
    typeof v['narrationText'] === 'string' &&
    typeof blueprint === 'object' &&
    blueprint !== null &&
    typeof (blueprint as Record<string, unknown>)['hdType'] === 'string' &&
    Array.isArray((blueprint as Record<string, unknown>)['definedCenters'])
  );
}

/**
 * Builds the {@link EnergyBlueprintProps} for a resolved blueprint segment.
 *
 * Pure and deterministic: the scene arc, forge theme, and HD type are derived
 * from `data.blueprint` via {@link chartToScenes} / {@link deriveForgeTheme}.
 * The narration *audio* URL passes through if present; the on-screen scene
 * `text` is the factual chart labelling produced by the mapper, never authored
 * prose.
 */
export function buildBlueprintProps(
  data: BlueprintSourceData,
): EnergyBlueprintProps {
  const { blueprint } = data;
  return {
    appId: 'prime_self',
    topic: data.topic ?? 'Your Energy Blueprint',
    // `script` is the full narration text; the composition uses it only as a
    // fallback for default scene derivation, which never runs here because we
    // always pass explicit `scenes`.
    script: data.narrationText,
    narrationUrl: data.narrationUrl ?? '',
    brandColor: data.brandColor ?? DEFAULT_BRAND_COLOR,
    brandAccent: data.brandColor ?? DEFAULT_BRAND_COLOR,
    logoUrl: data.logoUrl ?? '',
    scenes: chartToScenes(blueprint),
    forgeTheme: deriveForgeTheme(blueprint),
    hdType: blueprint.hdType,
  };
}

/**
 * The `'blueprint'` {@link SegmentRenderer} (doc §7).
 *
 * Reads the resolved {@link BlueprintSourceData} from {@link SegmentContext}'s
 * `sourceData`, builds the composition props via {@link buildBlueprintProps},
 * and returns them with the selfprime-authored narration text. The blueprint
 * segment is static, so `cacheable` is always `true` (D3).
 *
 * Throws if invoked for a non-`blueprint` source or if `sourceData` is not a
 * valid {@link BlueprintSourceData} (selfprime must resolve it before enqueue).
 *
 * @example
 * ```ts
 * const result = await renderBlueprintSegment('blueprint', {
 *   userId, spec,
 *   sourceData: {
 *     blueprint: { hdType: 'projector', definedCenters: ['G', 'Throat'] },
 *     narrationText: 'You were built to guide…',
 *   },
 * });
 * // result.props -> EnergyBlueprintProps, result.cacheable === true
 * ```
 */
export const renderBlueprintSegment: SegmentRenderer = (
  source: VideoSource,
  ctx: SegmentContext,
): Promise<SegmentResult> => {
  if (source !== 'blueprint') {
    return Promise.reject(
      new Error(
        `renderBlueprintSegment only handles the 'blueprint' source, got '${source}'`,
      ),
    );
  }
  if (!isBlueprintSourceData(ctx.sourceData)) {
    return Promise.reject(
      new Error(
        'blueprint segment requires ctx.sourceData = { blueprint, narrationText } resolved by selfprime',
      ),
    );
  }

  const data = ctx.sourceData;
  return Promise.resolve({
    props: buildBlueprintProps(data) as unknown as Record<string, unknown>,
    narrationText: data.narrationText,
    cacheable: true,
  });
};
