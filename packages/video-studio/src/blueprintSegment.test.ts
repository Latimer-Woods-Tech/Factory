import { describe, it, expect } from 'vitest';
import type { CompositionSpec, SegmentContext } from '@latimer-woods-tech/video';
import {
  renderBlueprintSegment,
  buildBlueprintProps,
} from './blueprintSegment.js';
import type { BlueprintSourceData } from './blueprintSegment.js';
import { TYPE_COLORS, DEFAULT_BRAND_COLOR } from './blueprint-types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPEC: CompositionSpec = {
  id: 'spec_1',
  userId: 'u_1',
  sources: ['blueprint'],
  format: 'full_film',
  segments: [{ source: 'blueprint', cacheable: true }],
  createdAt: '2026-05-30T00:00:00Z',
};

const SOURCE_DATA: BlueprintSourceData = {
  blueprint: {
    hdType: 'projector',
    authority: 'Splenic',
    definedCenters: ['G', 'Throat'],
    signatureGates: [20],
  },
  narrationText: 'You were built to guide, when recognised and invited.',
  topic: 'Your Energy Blueprint',
  brandColor: '#abcdef',
  logoUrl: 'https://cdn.example.com/logo.png',
  narrationUrl: 'https://r2.example.com/narration.mp3',
};

function ctx(sourceData: unknown): SegmentContext {
  return { userId: 'u_1', spec: SPEC, sourceData };
}

// ---------------------------------------------------------------------------
// buildBlueprintProps
// ---------------------------------------------------------------------------

describe('buildBlueprintProps', () => {
  it('builds EnergyBlueprintProps from resolved source data', () => {
    const props = buildBlueprintProps(SOURCE_DATA);
    expect(props.hdType).toBe('projector');
    expect(props.forgeTheme).toBe('aether'); // projector default
    expect(props.brandColor).toBe('#abcdef');
    expect(props.brandAccent).toBe('#abcdef');
    expect(props.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(props.narrationUrl).toBe('https://r2.example.com/narration.mp3');
    expect(props.script).toBe(SOURCE_DATA.narrationText);
    expect(props.topic).toBe('Your Energy Blueprint');
    expect(props.scenes?.[0]?.type).toBe('arrival');
    // every body-graph scene lights the resolved centres.
    for (const scene of props.scenes ?? []) {
      expect(scene.typeColor).toBe(TYPE_COLORS.projector);
    }
  });

  it('falls back to brand/topic defaults when optionals are omitted', () => {
    const props = buildBlueprintProps({
      blueprint: { hdType: 'generator', definedCenters: ['Sacral'] },
      narrationText: 'Built to respond.',
    });
    expect(props.brandColor).toBe(DEFAULT_BRAND_COLOR);
    expect(props.brandAccent).toBe(DEFAULT_BRAND_COLOR);
    expect(props.logoUrl).toBe('');
    expect(props.narrationUrl).toBe('');
    expect(props.topic).toBe('Your Energy Blueprint');
  });
});

// ---------------------------------------------------------------------------
// renderBlueprintSegment (the SegmentRenderer)
// ---------------------------------------------------------------------------

describe('renderBlueprintSegment', () => {
  it('returns props, the selfprime narration, and cacheable: true', async () => {
    const result = await renderBlueprintSegment('blueprint', ctx(SOURCE_DATA));
    expect(result.cacheable).toBe(true);
    expect(result.narrationText).toBe(SOURCE_DATA.narrationText);
    expect((result.props as { hdType?: string }).hdType).toBe('projector');
  });

  it('passes narration straight through — never synthesises it (D6)', async () => {
    const custom = { ...SOURCE_DATA, narrationText: 'A bespoke human-written line.' };
    const result = await renderBlueprintSegment('blueprint', ctx(custom));
    expect(result.narrationText).toBe('A bespoke human-written line.');
  });

  it('rejects a non-blueprint source', async () => {
    await expect(renderBlueprintSegment('transits', ctx(SOURCE_DATA))).rejects.toThrow(
      /only handles the 'blueprint' source/,
    );
  });

  it('rejects when sourceData is not resolved blueprint data', async () => {
    await expect(renderBlueprintSegment('blueprint', ctx(null))).rejects.toThrow(
      /requires ctx.sourceData/,
    );
    await expect(
      renderBlueprintSegment('blueprint', ctx({ narrationText: 'x' })),
    ).rejects.toThrow(/requires ctx.sourceData/);
    await expect(
      renderBlueprintSegment(
        'blueprint',
        ctx({ blueprint: { hdType: 'projector', definedCenters: 'nope' }, narrationText: 'x' }),
      ),
    ).rejects.toThrow(/requires ctx.sourceData/);
    await expect(
      renderBlueprintSegment(
        'blueprint',
        ctx({ blueprint: { hdType: 'projector', definedCenters: [] } }),
      ),
    ).rejects.toThrow(/requires ctx.sourceData/);
  });
});
