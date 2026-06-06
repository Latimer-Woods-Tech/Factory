import { describe, it, expect } from 'vitest';
import {
  transitsToBodyScenes,
  dreamJournalToBodyScenes,
  milestonesToBodyScenes,
  personalityToBodyScenes,
  assembleFilmScenes,
  totalDurationFrames,
} from './sourceScenes.js';

describe('source body-scene mappers', () => {
  it('transits → revelation + concept body scenes (no bookends, no body graph)', () => {
    const scenes = transitsToBodyScenes({
      headline: 'The current you are moving through',
      detail: 'Saturn is asking for structure; Jupiter widens the door.',
    });
    expect(scenes.map((s) => s.type)).toEqual(['revelation', 'concept']);
    expect(scenes.every((s) => s.showBodyGraph === false)).toBe(true);
    expect(scenes.some((s) => s.type === 'arrival' || s.type === 'invitation')).toBe(false);
  });

  it('dreamJournal → revelation + concept', () => {
    const scenes = dreamJournalToBodyScenes({ headline: 'h', detail: 'd' });
    expect(scenes.map((s) => s.type)).toEqual(['revelation', 'concept']);
  });

  it('personality → revelation + concept', () => {
    const scenes = personalityToBodyScenes({ headline: 'h', detail: 'd' });
    expect(scenes.map((s) => s.type)).toEqual(['revelation', 'concept']);
  });

  it('milestones → framing + one concept per item, capped at 4', () => {
    const scenes = milestonesToBodyScenes({
      headline: 'How far you have come',
      items: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    // 1 revelation + 4 concept (capped), the 5th/6th items dropped.
    expect(scenes.filter((s) => s.type === 'concept')).toHaveLength(4);
    expect(scenes[0]?.type).toBe('revelation');
  });

  it('milestones skips blank items', () => {
    const scenes = milestonesToBodyScenes({
      headline: 'h',
      items: ['real', '   ', ''],
    });
    expect(scenes.filter((s) => s.type === 'concept')).toHaveLength(1);
  });

  it('clamps over-long display text with an ellipsis', () => {
    const long = 'x'.repeat(500);
    const [revelation] = transitsToBodyScenes({ headline: long, detail: 'd' });
    expect(revelation?.text?.length).toBeLessThanOrEqual(220);
    expect(revelation?.text?.endsWith('…')).toBe(true);
  });
});

describe('assembleFilmScenes', () => {
  it('wraps source bodies with exactly one arrival and one invitation', () => {
    const bodies = [
      ...transitsToBodyScenes({ headline: 'h', detail: 'd' }),
      ...personalityToBodyScenes({ headline: 'h', detail: 'd' }),
    ];
    const scenes = assembleFilmScenes(bodies, {
      typeColor: '#c9a84c',
      invitationText: 'Return to the signal your body gives.',
    });
    expect(scenes[0]?.type).toBe('arrival');
    expect(scenes[scenes.length - 1]?.type).toBe('invitation');
    expect(scenes.filter((s) => s.type === 'arrival')).toHaveLength(1);
    expect(scenes.filter((s) => s.type === 'invitation')).toHaveLength(1);
    // The four source body scenes survive between the bookends.
    expect(scenes).toHaveLength(bodies.length + 2);
  });

  it('arrival text is optional (pure-atmosphere open, Slice-2 default)', () => {
    const scenes = assembleFilmScenes([], {
      typeColor: '#c9a84c',
      invitationText: 'close',
    });
    expect(scenes[0]?.type).toBe('arrival');
    expect(scenes[0]?.text).toBeUndefined();
  });
});

describe('totalDurationFrames', () => {
  it('sums every scene duration (the render durationInFrames)', () => {
    const scenes = assembleFilmScenes(
      transitsToBodyScenes({ headline: 'h', detail: 'd' }),
      { typeColor: '#c9a84c', invitationText: 'close' },
    );
    // arrival 150 + revelation 240 + concept 300 + invitation 390 = 1080
    expect(totalDurationFrames(scenes)).toBe(1080);
  });
});
