import { describe, it, expect } from 'vitest';
import { costFn } from './index.js';
import type { CreditPolicy, CompositionSpec } from './index.js';

// A representative operator-tunable policy (D13).
const POLICY: CreditPolicy = {
  base: 5,
  perSource: {
    blueprint: 2,
    transits: 3,
    dreamJournal: 4,
    milestones: 1,
    personality: 2,
  },
  formatTerm: {
    full_film: 10,
    short_clip: 4,
    narrated_stills: 1,
  },
  tierGrants: { free: 0, plus: 50, pro: 200 },
  rolloverCap: 200,
};

describe('costFn', () => {
  it('computes a known spec: base + Σ sources + format term', () => {
    // 5 (base) + 2 (blueprint) + 3 (transits) + 10 (full_film) = 20
    const cost = costFn({ sources: ['blueprint', 'transits'], format: 'full_film' }, POLICY);
    expect(cost).toBe(20);
  });

  it('returns base + formatTerm for empty sources', () => {
    // 5 + 0 sources + 4 (short_clip) = 9
    const cost = costFn({ sources: [], format: 'short_clip' }, POLICY);
    expect(cost).toBe(9);
  });

  it('sums all sources', () => {
    // 5 + (2+3+4+1+2) + 1 (narrated_stills) = 18
    const cost = costFn(
      { sources: ['blueprint', 'transits', 'dreamJournal', 'milestones', 'personality'], format: 'narrated_stills' },
      POLICY,
    );
    expect(cost).toBe(18);
  });

  it('differs per format for the same sources', () => {
    const full = costFn({ sources: ['blueprint'], format: 'full_film' }, POLICY);
    const clip = costFn({ sources: ['blueprint'], format: 'short_clip' }, POLICY);
    const stills = costFn({ sources: ['blueprint'], format: 'narrated_stills' }, POLICY);
    // 5 + 2 + {10, 4, 1}
    expect(full).toBe(17);
    expect(clip).toBe(11);
    expect(stills).toBe(8);
    expect(new Set([full, clip, stills]).size).toBe(3);
  });

  it('is config-driven: retuning the policy changes the result', () => {
    const spec: Pick<CompositionSpec, 'sources' | 'format'> = { sources: ['transits'], format: 'full_film' };
    const cheap = costFn(spec, POLICY);
    const dear = costFn(spec, { ...POLICY, base: 50, formatTerm: { ...POLICY.formatTerm, full_film: 100 } });
    expect(cheap).toBe(18); // 5 + 3 + 10
    expect(dear).toBe(153); // 50 + 3 + 100
  });

  it('returns an integer', () => {
    const cost = costFn({ sources: ['blueprint', 'personality'], format: 'full_film' }, POLICY);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it('treats a source missing from perSource as contributing 0', () => {
    const partial: CreditPolicy = {
      ...POLICY,
      perSource: { ...POLICY.perSource, transits: undefined as unknown as number },
    };
    // 5 (base) + 2 (blueprint) + 0 (transits unpriced) + 10 (full_film) = 17
    expect(costFn({ sources: ['blueprint', 'transits'], format: 'full_film' }, partial)).toBe(17);
  });

  it('treats a format missing from formatTerm as contributing 0', () => {
    const partial: CreditPolicy = {
      ...POLICY,
      formatTerm: { ...POLICY.formatTerm, full_film: undefined as unknown as number },
    };
    // 5 (base) + 2 (blueprint) + 0 (full_film unpriced) = 7
    expect(costFn({ sources: ['blueprint'], format: 'full_film' }, partial)).toBe(7);
  });

  it('rounds fractional policy terms to an integer credit count', () => {
    const fractional: CreditPolicy = {
      ...POLICY,
      base: 1.4,
      perSource: { ...POLICY.perSource, blueprint: 0.2 },
      formatTerm: { ...POLICY.formatTerm, full_film: 0.1 },
    };
    // 1.4 + 0.2 + 0.1 = 1.7 → round → 2
    expect(costFn({ sources: ['blueprint'], format: 'full_film' }, fractional)).toBe(2);
  });
});
