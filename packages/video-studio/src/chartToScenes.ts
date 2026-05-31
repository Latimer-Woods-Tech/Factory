// ---------------------------------------------------------------------------
// chartToScenes — pure blueprint → Remotion scene[] mapper (I1 Slice 1)
//
// Canonical design: docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md §6/§7.
// Maps a user's resolved Energy Blueprint data into the ordered scene arc the
// EnergyBlueprintVideo composition renders, and derives the `hdType` glow and
// `forgeTheme`. PURE — no React, no Remotion, no Node built-ins — so it is
// testable anywhere and reusable by both a consumer app and the Wave-2 Cloud
// Run render service.
//
// Narration text is NOT authored here. selfprime authors narration from real
// source data (D6); this mapper only shapes the *visual* scene arc. The scene
// `text` fields below are short, factual on-screen labels derived from the
// chart (centre names, type framing), never generated prose.
// ---------------------------------------------------------------------------

import {
  TYPE_COLORS,
  type BlueprintScene,
  type ForgeTheme,
  type HdType,
} from './blueprint-types.js';

/**
 * Resolved blueprint data selfprime supplies for the blueprint segment (D6).
 *
 * This is the data shape selfprime can actually produce from a user's chart;
 * it is intentionally small and declarative so the mapper stays pure. New
 * fields are additive — never remove one (the scene arc must keep rendering
 * correctly for already-stored profiles).
 */
export interface BlueprintSegmentData {
  /** The user's Human Design energy type. Drives glow colour + framing. */
  hdType: HdType;
  /** Inner-authority label (e.g. `'Emotional'`, `'Sacral'`), shown if present. */
  authority?: string;
  /** Defined-centre keys, e.g. `['G','Ajna','Throat']`. Lights the body graph. */
  definedCenters: string[];
  /** Key gates → one concept scene each (e.g. `[34, 20]`). */
  signatureGates?: number[];
  /** Atmospheric theme override; falls back to a per-type default. */
  forge?: ForgeTheme;
  /** Optional display name used in the arrival framing line. */
  displayName?: string;
}

/** Frame budget per scene at 30fps (75s total = 2250 frames). */
const FRAMES = {
  arrival: 150,
  revelation: 300,
  conceptCenters: 480,
  breath: 90,
  conceptGate: 300,
  triad: 360,
  invitation: 390,
} as const;

/**
 * Human-readable framing line per energy type, shown in the revelation scene.
 * Plain, factual Human Design language — no generated prose, no "AI" wording.
 */
const TYPE_FRAMING: Record<HdType, string> = {
  generator: 'A Generator — built to respond.',
  manifesting_generator: 'A Manifesting Generator — built to respond, then move fast.',
  projector: 'A Projector — built to guide, when recognised and invited.',
  manifestor: 'A Manifestor — built to initiate.',
  reflector: 'A Reflector — built to sample the field and reflect it back.',
};

/** Per-type default atmosphere when {@link BlueprintSegmentData.forge} is unset. */
const TYPE_FORGE: Record<HdType, ForgeTheme> = {
  generator: 'phoenix',
  manifesting_generator: 'phoenix',
  projector: 'aether',
  manifestor: 'eros',
  reflector: 'lux',
};

/**
 * Maps a defined-centre key to a short, readable label for the concept scene.
 * Unknown keys pass through unchanged so a new centre name never breaks render.
 */
const CENTER_LABELS: Record<string, string> = {
  Head: 'Head',
  Ajna: 'Ajna',
  Throat: 'Throat',
  G: 'G (Identity)',
  Heart: 'Heart (Ego)',
  Sacral: 'Sacral',
  Spleen: 'Spleen',
  SolarPlexus: 'Solar Plexus',
  Root: 'Root',
};

/** @internal Join centre labels into a readable, comma-separated phrase. */
function describeCenters(centers: string[]): string {
  const labels = centers.map((c) => CENTER_LABELS[c] ?? c);
  if (labels.length === 0) return 'an open chart — every centre receptive';
  if (labels.length === 1) return `your defined ${labels[0] ?? ''} centre`;
  const head = labels.slice(0, -1).join(', ');
  const tail = labels[labels.length - 1] ?? '';
  return `your defined centres: ${head} and ${tail}`;
}

/**
 * Derives the {@link ForgeTheme} for a profile: explicit override wins,
 * otherwise the per-type default.
 */
export function deriveForgeTheme(data: BlueprintSegmentData): ForgeTheme {
  return data.forge ?? TYPE_FORGE[data.hdType];
}

/**
 * Maps resolved blueprint data into the composition's `scenes[]`.
 *
 * The arc is: arrival (atmosphere) → revelation (type framing) → concept
 * (defined centres + body graph) → breath (body-graph hold) → one concept
 * scene per signature gate → triad (shadow/gift/siddhi) → invitation. Every
 * `concept`/`breath` scene carries `definedCenters` so the body graph lights
 * the user's real chart. The result is directly assignable to
 * `EnergyBlueprintProps['scenes']`.
 *
 * Pure and deterministic — same input always yields the same scene array.
 *
 * @example
 * ```ts
 * const scenes = chartToScenes({
 *   hdType: 'projector',
 *   authority: 'Splenic',
 *   definedCenters: ['G', 'Throat', 'Ajna'],
 *   signatureGates: [20, 57],
 * });
 * ```
 */
export function chartToScenes(data: BlueprintSegmentData): BlueprintScene[] {
  const typeColor = TYPE_COLORS[data.hdType];
  const centers = data.definedCenters;
  const gates = data.signatureGates ?? [];

  const arrivalText = data.displayName
    ? `${data.displayName} — your pattern was already complete.`
    : undefined;

  const authorityLine = data.authority
    ? `Your authority is ${data.authority}. Trust the signal it gives.`
    : 'Return to the signal your body gives, not the mind.';

  const scenes: BlueprintScene[] = [
    {
      type: 'arrival',
      durationFrames: FRAMES.arrival,
      text: arrivalText,
      showBodyGraph: false,
      typeColor,
    },
    {
      type: 'revelation',
      durationFrames: FRAMES.revelation,
      text: TYPE_FRAMING[data.hdType],
      showBodyGraph: false,
      typeColor,
    },
    {
      type: 'concept',
      durationFrames: FRAMES.conceptCenters,
      text: `This is ${describeCenters(centers)}. Where energy is consistent in you.`,
      showBodyGraph: true,
      definedCenters: centers,
      typeColor,
    },
    {
      type: 'breath',
      durationFrames: FRAMES.breath,
      showBodyGraph: true,
      definedCenters: centers,
      typeColor,
    },
  ];

  // One concept scene per signature gate, body graph still lit.
  for (const gate of gates) {
    scenes.push({
      type: 'concept',
      durationFrames: FRAMES.conceptGate,
      text: `Gate ${String(gate)} — a defining frequency in your design.`,
      showBodyGraph: true,
      definedCenters: centers,
      typeColor,
    });
  }

  scenes.push(
    {
      type: 'triad',
      durationFrames: FRAMES.triad,
      triad: ['Shadow', 'Gift', 'Siddhi'],
      showBodyGraph: false,
      typeColor,
    },
    {
      type: 'invitation',
      durationFrames: FRAMES.invitation,
      text: authorityLine,
      showBodyGraph: false,
      typeColor,
    },
  );

  return scenes;
}
