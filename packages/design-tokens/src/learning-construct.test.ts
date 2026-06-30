import { describe, expect, it } from 'vitest';
import {
  disciplineLabel,
  disciplineLabels,
  learningConstruct,
  levelToken,
  levelTokens,
  trackIds,
  trackToken,
  trackTokens,
} from './learning-construct.js';
import { tokens } from './index.js';

describe('learning-construct denotation standard', () => {
  it('defines exactly three tracks, each with colour + accent + label + onColor', () => {
    expect(trackIds).toEqual(['app-mastery', 'interpretive-literacy', 'practitioner-formation']);
    for (const id of trackIds) {
      const t = trackTokens[id];
      expect(t.label).toBeTruthy();
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.onColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('reserves colour for tracks only — disciplines are labels (no colour field)', () => {
    expect(Object.keys(disciplineLabels)).toHaveLength(9);
    for (const label of Object.values(disciplineLabels)) expect(typeof label).toBe('string');
  });

  it('levels are a 1-4 progression', () => {
    expect(Object.values(levelTokens).map((l) => l.step).sort()).toEqual([1, 2, 3, 4]);
  });

  it('trackToken falls back to interpretive-literacy for unknown ids', () => {
    expect(trackToken('nope')).toBe(trackTokens['interpretive-literacy']);
    expect(trackToken(undefined).label).toBe('Understand Your Synthesis');
  });

  it('disciplineLabel title-cases an unknown id and empties on missing', () => {
    expect(disciplineLabel('astrology')).toBe('Astrology');
    expect(disciplineLabel('made-up-lens')).toBe('Made Up Lens');
    expect(disciplineLabel(undefined)).toBe('');
  });

  it('levelToken returns null for an unknown level', () => {
    expect(levelToken('client-ready')?.step).toBe(3);
    expect(levelToken('nope')).toBeNull();
  });

  it('is exposed on the combined tokens object', () => {
    expect(tokens.learningConstruct).toBe(learningConstruct);
  });
});
