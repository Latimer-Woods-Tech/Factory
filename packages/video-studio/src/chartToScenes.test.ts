import { describe, it, expect } from 'vitest';
import { chartToScenes, deriveForgeTheme } from './chartToScenes.js';
import type { BlueprintSegmentData } from './chartToScenes.js';
import { TYPE_COLORS } from './blueprint-types.js';

// ---------------------------------------------------------------------------
// Fixture profiles — two distinct real-shaped charts (doc §6 requires ≥2).
// ---------------------------------------------------------------------------

/** A Projector with Splenic authority and a couple of signature gates. */
const PROJECTOR: BlueprintSegmentData = {
  hdType: 'projector',
  authority: 'Splenic',
  definedCenters: ['G', 'Throat', 'Ajna'],
  signatureGates: [20, 57],
  displayName: 'Ada',
};

/** A Generator with Sacral authority, no explicit gates or display name. */
const GENERATOR: BlueprintSegmentData = {
  hdType: 'generator',
  authority: 'Sacral',
  definedCenters: ['Sacral', 'Root', 'Spleen'],
};

describe('chartToScenes — snapshot fixtures', () => {
  it('maps a Projector profile to its scene arc', () => {
    expect(chartToScenes(PROJECTOR)).toMatchSnapshot();
  });

  it('maps a Generator profile to its scene arc', () => {
    expect(chartToScenes(GENERATOR)).toMatchSnapshot();
  });
});

describe('chartToScenes — structural invariants', () => {
  it('opens with arrival and closes with invitation', () => {
    const scenes = chartToScenes(PROJECTOR);
    expect(scenes[0]?.type).toBe('arrival');
    expect(scenes[scenes.length - 1]?.type).toBe('invitation');
  });

  it('adds one concept scene per signature gate', () => {
    const withGates = chartToScenes(PROJECTOR); // 2 gates
    const withoutGates = chartToScenes(GENERATOR); // 0 gates
    const conceptCount = (s: ReturnType<typeof chartToScenes>) =>
      s.filter((sc) => sc.type === 'concept').length;
    // base centres-concept (1) + one per gate.
    expect(conceptCount(withGates)).toBe(1 + 2);
    expect(conceptCount(withoutGates)).toBe(1 + 0);
  });

  it('lights at least the user defined centres on every body-graph scene', () => {
    const scenes = chartToScenes(PROJECTOR);
    for (const scene of scenes) {
      if (scene.showBodyGraph) {
        // Every user-defined center must be present. Gate concept scenes may
        // additionally include the gate's center (spotlight) if it is open —
        // that is intentional and tested separately.
        for (const center of PROJECTOR.definedCenters) {
          expect(scene.definedCenters).toContain(center);
        }
      }
    }
  });

  it('uses the HD-type glow colour on every scene', () => {
    const scenes = chartToScenes(GENERATOR);
    for (const scene of scenes) {
      expect(scene.typeColor).toBe(TYPE_COLORS.generator);
    }
  });

  it('frames the arrival line with the display name when present', () => {
    const named = chartToScenes(PROJECTOR)[0];
    expect(named?.text).toContain('Ada');
    const anon = chartToScenes(GENERATOR)[0];
    expect(anon?.text).toBeUndefined();
  });

  it('uses the authority line in the invitation when authority is set', () => {
    const scenes = chartToScenes(PROJECTOR);
    const invitation = scenes[scenes.length - 1];
    expect(invitation?.text).toContain('Splenic');
  });

  it('falls back to a body-signal invitation line when authority is absent', () => {
    const noAuthority = chartToScenes({
      hdType: 'reflector',
      definedCenters: [],
    });
    const invitation = noAuthority[noAuthority.length - 1];
    expect(invitation?.text).toContain('signal your body gives');
  });

  it('describes an open chart when no centres are defined', () => {
    const open = chartToScenes({ hdType: 'reflector', definedCenters: [] });
    const concept = open.find((s) => s.type === 'concept');
    expect(concept?.text).toContain('open chart');
  });

  it('describes a single defined centre in the singular', () => {
    const one = chartToScenes({ hdType: 'manifestor', definedCenters: ['Throat'] });
    const concept = one.find((s) => s.type === 'concept');
    expect(concept?.text).toContain('your defined Throat centre');
  });

  it('passes unknown centre keys through unchanged', () => {
    const weird = chartToScenes({
      hdType: 'manifestor',
      definedCenters: ['Throat', 'Mystery'],
    });
    const concept = weird.find((s) => s.type === 'concept');
    expect(concept?.text).toContain('Mystery');
  });

  it('gate concept scenes set spotlightCenter to the gate\'s center', () => {
    const scenes = chartToScenes(PROJECTOR);
    // Gate 20 → Throat, Gate 57 → Spleen (from bodygraph GATE_TO_CENTER)
    const gate20Scene = scenes.find((s) => s.type === 'concept' && s.spotlightCenter === 'Throat');
    const gate57Scene = scenes.find((s) => s.type === 'concept' && s.spotlightCenter === 'Spleen');
    expect(gate20Scene).toBeDefined();
    expect(gate57Scene).toBeDefined();
  });

  it('gate concept scenes include the gate\'s center in definedCenters even when open', () => {
    // Spleen is NOT in PROJECTOR.definedCenters (['G','Throat','Ajna']).
    // Gate 57 lives in Spleen — so the gate-57 scene should add Spleen.
    const scenes = chartToScenes(PROJECTOR);
    const gate57Scene = scenes.find((s) => s.spotlightCenter === 'Spleen');
    expect(gate57Scene?.definedCenters).toContain('Spleen');
    // Gate 20 lives in Throat (already defined) — no extra entry.
    const gate20Scene = scenes.find((s) => s.spotlightCenter === 'Throat');
    expect(gate20Scene?.definedCenters).toEqual(PROJECTOR.definedCenters);
  });

  it('uses gateInsights text verbatim when provided', () => {
    const withInsights = chartToScenes({
      ...PROJECTOR,
      gateInsights: { 20: 'Your Gate 20 insight here.' },
    });
    const gate20Scene = withInsights.find((s) => s.spotlightCenter === 'Throat');
    expect(gate20Scene?.text).toBe('Your Gate 20 insight here.');
  });

  it('falls back to center-name text when gateInsights is absent', () => {
    const scenes = chartToScenes(PROJECTOR);
    const gate20Scene = scenes.find((s) => s.spotlightCenter === 'Throat');
    // Should contain the center name, not the old generic text
    expect(gate20Scene?.text).toContain('Gate 20');
    expect(gate20Scene?.text).not.toBe('Gate 20 — a defining frequency in your design.');
  });

  it('is deterministic — same input yields an equal scene array', () => {
    expect(chartToScenes(PROJECTOR)).toEqual(chartToScenes(PROJECTOR));
  });

  it('never emits the word "AI" in any on-screen text', () => {
    const allText = [...chartToScenes(PROJECTOR), ...chartToScenes(GENERATOR)]
      .map((s) => s.text ?? '')
      .join(' ');
    expect(allText).not.toMatch(/\bAI\b/);
  });
});

describe('deriveForgeTheme', () => {
  it('uses the per-type default when no override is set', () => {
    expect(deriveForgeTheme(PROJECTOR)).toBe('aether');
    expect(deriveForgeTheme(GENERATOR)).toBe('phoenix');
    expect(deriveForgeTheme({ hdType: 'manifestor', definedCenters: [] })).toBe('eros');
    expect(deriveForgeTheme({ hdType: 'reflector', definedCenters: [] })).toBe('lux');
    expect(
      deriveForgeTheme({ hdType: 'manifesting_generator', definedCenters: [] }),
    ).toBe('phoenix');
  });

  it('honours an explicit forge override', () => {
    expect(deriveForgeTheme({ ...PROJECTOR, forge: 'chronos' })).toBe('chronos');
  });
});
