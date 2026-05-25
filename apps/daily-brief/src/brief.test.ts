import { describe, expect, it } from 'vitest';
import { getBriefDateKey } from './brief';

describe('getBriefDateKey', () => {
  it('uses the New York day instead of the UTC day near midnight', () => {
    expect(getBriefDateKey(new Date('2026-05-22T02:30:00.000Z'))).toBe('2026-05-21');
  });

  it('keeps the same date once New York has crossed midnight', () => {
    expect(getBriefDateKey(new Date('2026-05-22T13:00:00.000Z'))).toBe('2026-05-22');
  });
});