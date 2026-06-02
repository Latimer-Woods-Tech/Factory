// milestonesSegment — the `'milestones'` SegmentRenderer (I1 Slice 3)
// Fresh per render (D3). selfprime draws from the achievements table (D6).

import type {
  SegmentContext,
  SegmentRenderer,
  SegmentResult,
  VideoSource,
} from '@latimer-woods-tech/video';
import { milestonesToBodyScenes } from './sourceScenes.js';

export interface MilestonesSegmentData {
  headline: string;
  items: string[];
  narrationText?: string;
  typeColor?: string;
}

function isMilestonesSourceData(value: unknown): value is MilestonesSegmentData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['headline'] === 'string' && Array.isArray(v['items']);
}

export const renderMilestonesSegment: SegmentRenderer = (
  source: VideoSource,
  ctx: SegmentContext,
): Promise<SegmentResult> => {
  if (source !== 'milestones') {
    return Promise.reject(new Error(`renderMilestonesSegment only handles 'milestones', got '${source}'`));
  }
  if (!isMilestonesSourceData(ctx.sourceData)) {
    return Promise.reject(new Error('milestones segment requires ctx.sourceData = { headline, items[] } resolved by selfprime'));
  }
  const data = ctx.sourceData;
  return Promise.resolve({
    props: { headline: data.headline, items: data.items, typeColor: data.typeColor, bodyScenes: milestonesToBodyScenes(data) } as Record<string, unknown>,
    narrationText: data.narrationText ?? '',
    cacheable: false,
  });
};
