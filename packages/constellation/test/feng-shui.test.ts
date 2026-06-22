import { describe, expect, it } from 'vitest';
import { eightMansions, fengShuiByTheme, fengShuiElementOnly, kuaNumber, WU_XING } from '../src/data/feng-shui.js';

const FOCUS_THEMES = new Set([
  'purpose', 'decisions', 'relationships', 'timing', 'shadow_gift', 'work',
]);
const VALID_DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const EAST_GROUP = new Set([1, 3, 4, 9]);
const WEST_GROUP = new Set([2, 6, 7, 8]);

describe('kuaNumber', () => {
  it('male born 1980 -> 2 (10 - 8)', () => {
    expect(kuaNumber(1980, 'male')).toBe(2);
  });

  it('female born 1980 -> 4 (5 + 8 = 13 -> 4)', () => {
    expect(kuaNumber(1980, 'female')).toBe(4);
  });

  it('handles a 2000+ example: male born 2000 -> 9, female born 2000 -> 6', () => {
    expect(kuaNumber(2000, 'male')).toBe(9);
    expect(kuaNumber(2000, 'female')).toBe(6);
  });

  it('handles another 2000+ example: male born 2024 -> 3 (9 - 6)', () => {
    expect(kuaNumber(2024, 'male')).toBe(3);
  });

  it('never returns 5 — Kua 5 remaps to 2 (male) and 8 (female)', () => {
    expect(kuaNumber(1968, 'male')).toBe(2);
    expect(kuaNumber(1900, 'female')).toBe(8);
  });

  it('never yields 5 across a wide year/gender sweep', () => {
    for (let y = 1920; y <= 2030; y++) {
      const m = kuaNumber(y, 'male');
      const f = kuaNumber(y, 'female');
      expect(m).not.toBe(5);
      expect(f).not.toBe(5);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(9);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(9);
    }
  });

  it('accepts short gender tokens (m / f)', () => {
    expect(kuaNumber(1980, 'm')).toBe(kuaNumber(1980, 'male'));
    expect(kuaNumber(1980, 'f')).toBe(kuaNumber(1980, 'female'));
  });
});

describe('East / West group membership', () => {
  it('classifies East-group Kua {1,3,4,9}', () => {
    for (const kua of EAST_GROUP) {
      const found = sampleForKua(kua);
      expect(found).not.toBeNull();
      expect(found!.group).toBe('East');
    }
  });

  it('classifies West-group Kua {2,6,7,8}', () => {
    for (const kua of WEST_GROUP) {
      const found = sampleForKua(kua);
      expect(found).not.toBeNull();
      expect(found!.group).toBe('West');
    }
  });
});

describe('eightMansions', () => {
  it('returns 4 favorable + 4 unfavorable with valid directions', () => {
    const m = eightMansions(1980, 'male');
    expect(m.favorable).toHaveLength(4);
    expect(m.unfavorable).toHaveLength(4);

    const all = [...m.favorable, ...m.unfavorable];
    for (const entry of all) {
      expect(VALID_DIRECTIONS.has(entry.dir)).toBe(true);
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.meaning).toBe('string');
    }

    const dirs = all.map((e) => e.dir);
    expect(new Set(dirs).size).toBe(8);
  });

  it('names the four favorable mansions in canonical order', () => {
    const { favorable } = eightMansions(1980, 'male');
    expect(favorable.map((f) => f.name)).toEqual([
      'Sheng Chi', 'Tian Yi', 'Yan Nian', 'Fu Wei',
    ]);
  });

  it('names the four unfavorable mansions in canonical order', () => {
    const { unfavorable } = eightMansions(1980, 'male');
    expect(unfavorable.map((u) => u.name)).toEqual([
      'Ho Hai', 'Wu Gui', 'Liu Sha', 'Jue Ming',
    ]);
  });

  it('exposes a Kua never equal to 5', () => {
    expect(eightMansions(1968, 'male').kua).toBe(2);
  });
});

describe('WU_XING', () => {
  it('declares all five elements', () => {
    expect(Object.keys(WU_XING).sort()).toEqual([
      'earth', 'fire', 'metal', 'water', 'wood',
    ]);
  });

  it('forms a closed generating cycle (each element generates exactly one other)', () => {
    const targets = Object.values(WU_XING).map((e) => e.generates).sort();
    expect(targets).toEqual(['earth', 'fire', 'metal', 'water', 'wood']);
    for (const e of Object.values(WU_XING)) {
      expect(WU_XING[e.generates]).toBeDefined();
      expect(WU_XING[e.controls]).toBeDefined();
    }
  });

  it('uses the canonical generating order Wood->Fire->Earth->Metal->Water->Wood', () => {
    expect(WU_XING.wood.generates).toBe('fire');
    expect(WU_XING.fire.generates).toBe('earth');
    expect(WU_XING.earth.generates).toBe('metal');
    expect(WU_XING.metal.generates).toBe('water');
    expect(WU_XING.water.generates).toBe('wood');
  });

  it('carries a colour and keyword per element', () => {
    for (const e of Object.values(WU_XING)) {
      expect(e.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(typeof e.keyword).toBe('string');
    }
  });
});

describe('fengShuiByTheme', () => {
  it('emits only keys within the repo FOCUS_THEMES set (plus environment)', () => {
    const out = fengShuiByTheme({ birthYear: 1980, gender: 'male' });
    const allowed = new Set([...FOCUS_THEMES, 'environment']);
    for (const key of Object.keys(out)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('every emitted theme except environment is a real FOCUS_THEME', () => {
    const out = fengShuiByTheme({ birthYear: 1980, gender: 'male' });
    for (const key of Object.keys(out)) {
      if (key === 'environment') continue;
      expect(FOCUS_THEMES.has(key)).toBe(true);
    }
  });

  it('each insight has a headline and body', () => {
    const out = fengShuiByTheme({ birthYear: 1990, gender: 'female' });
    for (const insight of Object.values(out)) {
      expect(typeof insight.headline).toBe('string');
      expect(insight.headline.length).toBeGreaterThan(0);
      expect(typeof insight.body).toBe('string');
      expect(insight.body.length).toBeGreaterThan(0);
    }
  });

  it('tolerates extra birthData fields', () => {
    const out = fengShuiByTheme({ birthYear: 1985, gender: 'male', city: 'Lisbon', latitude: 38.7 });
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });
});

describe('fengShuiElementOnly (gender-neutral fallback)', () => {
  it('returns an element-only timing slice for a valid element', () => {
    const out = fengShuiElementOnly('water');
    expect(out['timing']).toBeDefined();
    expect(out['timing']!.element).toBe('Water');
    expect(out['timing']!.headline).toMatch(/Water/);
    expect(out['timing']!.body.length).toBeGreaterThan(0);
    expect(out['timing']!.direction).toBeUndefined();
  });

  it('works for every Wu Xing element key', () => {
    for (const key of Object.keys(WU_XING)) {
      expect(fengShuiElementOnly(key)['timing']!.element).toBe(WU_XING[key as keyof typeof WU_XING]!.name);
    }
  });

  it('returns an empty object for an unknown element', () => {
    expect(fengShuiElementOnly('plasma')).toEqual({});
  });
});

function sampleForKua(targetKua: number) {
  for (let y = 1920; y <= 2030; y++) {
    for (const gender of ['male', 'female']) {
      if (kuaNumber(y, gender) === targetKua) return eightMansions(y, gender);
    }
  }
  return null;
}
