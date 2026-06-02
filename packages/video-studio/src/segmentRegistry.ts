// ---------------------------------------------------------------------------
// segmentRegistry — VideoSource → SegmentRenderer registry (I1 Slice 3)
//
// The render pipeline iterates `request.spec.sources` and looks up the
// renderer for each source here. Adding a new source is additive: implement
// the SegmentRenderer contract and register it in this map. Existing renderers
// are never modified (doc §6, D3).
// ---------------------------------------------------------------------------

import type { VideoSource, SegmentRenderer } from '@latimer-woods-tech/video';
import { renderBlueprintSegment } from './blueprintSegment.js';
import { renderTransitsSegment } from './transitsSegment.js';
import { renderDreamJournalSegment } from './dreamJournalSegment.js';
import { renderMilestonesSegment } from './milestonesSegment.js';
import { renderPersonalitySegment } from './personalitySegment.js';

/**
 * Maps every {@link VideoSource} to its {@link SegmentRenderer}.
 *
 * The pipeline resolves renderers from this registry so the server.ts /
 * pipeline.ts code never imports individual segment modules directly —
 * all sources route through this single map.
 */
export const SEGMENT_REGISTRY: Readonly<Record<VideoSource, SegmentRenderer>> = {
  blueprint: renderBlueprintSegment,
  transits: renderTransitsSegment,
  dreamJournal: renderDreamJournalSegment,
  milestones: renderMilestonesSegment,
  personality: renderPersonalitySegment,
};

/**
 * Looks up the renderer for `source`, throwing a clear error if the source
 * is not registered (this is a programming error, not a user error).
 */
export function getRenderer(source: VideoSource): SegmentRenderer {
  const renderer = SEGMENT_REGISTRY[source];
  if (!renderer) {
    throw new Error(`No SegmentRenderer registered for source '${source}'`);
  }
  return renderer;
}
