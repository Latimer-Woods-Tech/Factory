// ---------------------------------------------------------------------------
// sourceScenes — pure source → Remotion body-scene mappers (I1 Slice 3)
//
// Canonical design: docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md §6 (Slice
// 3, "Sources & composition catalog"). Adds the remaining four source segments
// (transits, dream journal, milestones, personality) to the blueprint segment
// shipped in Slice 1.
//
// Each mapper turns the small, declarative display data selfprime resolves for
// one source into the ordered "body" scenes for that source — the middle of the
// film. A film is assembled as a single `arrival` open + the concatenated body
// scenes of every selected source (in catalog order) + a single `invitation`
// close (see {@link assembleFilmScenes}). This is why each source contributes
// only body scenes and never its own arrival/invitation: multiple sources
// concatenate into one coherent arc instead of repeating the bookends.
//
// PURE — no React, no Remotion, no Node built-ins — so every mapper unit-tests
// anywhere. Narration text is NOT authored here: selfprime authors narration
// from real source data (decision D6); the mappers only shape the *visual*
// scene arc and place selfprime's short, factual on-screen labels. The word
// "AI" never appears in any on-screen string produced here.
// ---------------------------------------------------------------------------

import {
  DEFAULT_BRAND_COLOR,
  type BlueprintScene,
} from './blueprint-types.js';

/**
 * Frame budgets per body-scene kind at 30fps. Kept modest so a multi-source
 * film stays watchable: a two-scene source body runs ~17s.
 */
const BODY_FRAMES = {
  /** A source's opening framing line. */
  revelation: 240,
  /** A source's detail/substance scene. */
  concept: 300,
  /** One milestone line. */
  milestone: 150,
  /** Bookend open (atmosphere, no text). */
  arrival: 150,
  /** Bookend close (line + logo). */
  invitation: 390,
} as const;

/** @internal Trim + hard-cap a display string so on-screen text never overflows. */
function clampLine(value: string, max = 220): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

// ---------------------------------------------------------------------------
// transits (fresh per render)
// ---------------------------------------------------------------------------

/**
 * Display data selfprime resolves for the `transits` source. `headline` frames
 * the current planetary weather; `detail` is the short, factual on-screen
 * reading line selfprime produced from the user's real current transits.
 */
export interface TransitsSegmentData {
  /** Short framing line, e.g. `"The current you're moving through"`. */
  headline: string;
  /** Factual on-screen detail line(s) for the transit reading. */
  detail: string;
  /** Optional per-scene glow colour; falls back to the brand accent. */
  typeColor?: string;
}

/** Maps resolved transit data into its body scenes (revelation → concept). */
export function transitsToBodyScenes(
  data: TransitsSegmentData,
): BlueprintScene[] {
  const typeColor = data.typeColor ?? DEFAULT_BRAND_COLOR;
  return [
    {
      type: 'revelation',
      durationFrames: BODY_FRAMES.revelation,
      text: clampLine(data.headline),
      showBodyGraph: false,
      typeColor,
    },
    {
      type: 'concept',
      durationFrames: BODY_FRAMES.concept,
      text: clampLine(data.detail),
      showBodyGraph: false,
      typeColor,
    },
  ];
}

// ---------------------------------------------------------------------------
// dreamJournal (fresh per render)
// ---------------------------------------------------------------------------

/**
 * Display data selfprime resolves for the `dreamJournal` source. `headline`
 * frames the reflection; `detail` is the short on-screen line selfprime drew
 * from the user's own dream-journal entries.
 */
export interface DreamJournalSegmentData {
  /** Short framing line, e.g. `"What your dreams have been circling"`. */
  headline: string;
  /** Factual on-screen detail line for the dream reflection. */
  detail: string;
  /** Optional per-scene glow colour; falls back to the brand accent. */
  typeColor?: string;
}

/** Maps resolved dream-journal data into its body scenes. */
export function dreamJournalToBodyScenes(
  data: DreamJournalSegmentData,
): BlueprintScene[] {
  const typeColor = data.typeColor ?? DEFAULT_BRAND_COLOR;
  return [
    {
      type: 'revelation',
      durationFrames: BODY_FRAMES.revelation,
      text: clampLine(data.headline),
      showBodyGraph: false,
      typeColor,
    },
    {
      type: 'concept',
      durationFrames: BODY_FRAMES.concept,
      text: clampLine(data.detail),
      showBodyGraph: false,
      typeColor,
    },
  ];
}

// ---------------------------------------------------------------------------
// milestones (fresh per render)
// ---------------------------------------------------------------------------

/**
 * Display data selfprime resolves for the `milestones` source. Each item is a
 * short, factual milestone label (e.g. a practice streak, an achievement). The
 * mapper renders a framing line then one concise scene per milestone.
 */
export interface MilestonesSegmentData {
  /** Short framing line, e.g. `"How far you've come"`. */
  headline: string;
  /** Ordered milestone labels (capped to keep the film watchable). */
  items: string[];
  /** Optional per-scene glow colour; falls back to the brand accent. */
  typeColor?: string;
}

/** Max milestone scenes so a long history can't balloon the film. */
const MAX_MILESTONES = 4;

/** Maps resolved milestone data into its body scenes (framing → one per item). */
export function milestonesToBodyScenes(
  data: MilestonesSegmentData,
): BlueprintScene[] {
  const typeColor = data.typeColor ?? DEFAULT_BRAND_COLOR;
  const scenes: BlueprintScene[] = [
    {
      type: 'revelation',
      durationFrames: BODY_FRAMES.revelation,
      text: clampLine(data.headline),
      showBodyGraph: false,
      typeColor,
    },
  ];
  for (const item of data.items.slice(0, MAX_MILESTONES)) {
    const label = clampLine(item, 120);
    if (!label) continue;
    scenes.push({
      type: 'concept',
      durationFrames: BODY_FRAMES.milestone,
      text: label,
      showBodyGraph: false,
      typeColor,
    });
  }
  return scenes;
}

// ---------------------------------------------------------------------------
// personality (cacheable)
// ---------------------------------------------------------------------------

/**
 * Display data selfprime resolves for the `personality` source from the user's
 * psychometric results. `headline` frames it; `detail` is the short on-screen
 * summary line.
 */
export interface PersonalitySegmentData {
  /** Short framing line, e.g. `"The shape of how you think"`. */
  headline: string;
  /** Factual on-screen detail line for the personality summary. */
  detail: string;
  /** Optional per-scene glow colour; falls back to the brand accent. */
  typeColor?: string;
}

/** Maps resolved personality data into its body scenes. */
export function personalityToBodyScenes(
  data: PersonalitySegmentData,
): BlueprintScene[] {
  const typeColor = data.typeColor ?? DEFAULT_BRAND_COLOR;
  return [
    {
      type: 'revelation',
      durationFrames: BODY_FRAMES.revelation,
      text: clampLine(data.headline),
      showBodyGraph: false,
      typeColor,
    },
    {
      type: 'concept',
      durationFrames: BODY_FRAMES.concept,
      text: clampLine(data.detail),
      showBodyGraph: false,
      typeColor,
    },
  ];
}

// ---------------------------------------------------------------------------
// Film assembly — single arrival + concatenated source bodies + single invitation
// ---------------------------------------------------------------------------

/** Inputs for the bookend scenes that open and close every film. */
export interface FilmBookendOptions {
  /** Glow colour for the bookends (the user's HD type colour). */
  typeColor: string;
  /**
   * Optional arrival line. When omitted the arrival is pure atmosphere (the
   * Slice-1/2 default), matching the verified blueprint open.
   */
  arrivalText?: string;
  /** Closing invitation line (e.g. the authority/return-to-signal line). */
  invitationText: string;
}

/**
 * Assembles a complete film scene arc: one `arrival` open, the concatenated
 * `bodies` (already in catalog order, each produced by a source mapper above or
 * by {@link "./chartToScenes".chartToBodyScenes}), and one `invitation` close.
 *
 * The total `durationInFrames` for the render is the sum of every scene's
 * `durationFrames` — the composition reads this via `calculateMetadata` so a
 * film of any source combination renders at its exact length.
 *
 * Pure and deterministic.
 */
export function assembleFilmScenes(
  bodies: BlueprintScene[],
  opts: FilmBookendOptions,
): BlueprintScene[] {
  return [
    {
      type: 'arrival',
      durationFrames: BODY_FRAMES.arrival,
      text: opts.arrivalText,
      showBodyGraph: false,
      typeColor: opts.typeColor,
    },
    ...bodies,
    {
      type: 'invitation',
      durationFrames: BODY_FRAMES.invitation,
      text: clampLine(opts.invitationText),
      showBodyGraph: false,
      typeColor: opts.typeColor,
    },
  ];
}

/** Sums the frame budget of a scene arc — the render's `durationInFrames`. */
export function totalDurationFrames(scenes: BlueprintScene[]): number {
  return scenes.reduce((sum, s) => sum + s.durationFrames, 0);
}
