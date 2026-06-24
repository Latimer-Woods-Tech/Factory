import { describe, it, expect } from 'vitest';
import {
  ATOM_REGISTRY,
  GATE_KB_KEYS,
  CENTER_TO_MUSICAL_MODE,
  CENTER_TO_FORGE,
  CENTER_COLOR,
  MODE_DESCRIPTORS,
  getAtom,
  modeForGates,
} from './atom-registry.js';
import { GATE_TO_CENTER, CENTER_GATES } from './geometry.js';
import type { CenterKey, MusicalMode, ForgeTheme } from './atom-registry.js';

const ALL_CENTERS: CenterKey[] = [
  'Head', 'Ajna', 'Throat', 'G', 'Heart',
  'SolarPlexus', 'Sacral', 'Spleen', 'Root',
];
const ALL_MODES: MusicalMode[] = [
  'Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian', 'Pentatonic',
];
const ALL_FORGES: ForgeTheme[] = ['chronos', 'eros', 'aether', 'lux', 'phoenix', 'self'];

describe('ATOM_REGISTRY completeness', () => {
  it('has exactly 64 entries', () => {
    expect(Object.keys(ATOM_REGISTRY).length).toBe(64);
  });

  it('covers gates 1–64 with no gaps', () => {
    for (let g = 1; g <= 64; g++) {
      expect(ATOM_REGISTRY[g], `gate ${g} missing`).toBeDefined();
    }
  });

  it('gate numbers in entries match their keys', () => {
    for (let g = 1; g <= 64; g++) {
      expect(ATOM_REGISTRY[g].gate).toBe(g);
    }
  });
});

describe('ATOM_REGISTRY hexagram glyphs', () => {
  it('each gate has a unique I-Ching Unicode character', () => {
    const glyphs = new Set(Object.values(ATOM_REGISTRY).map((e) => e.hexagram));
    expect(glyphs.size).toBe(64);
  });

  it('hexagram for gate 1 is U+4DC0 (䷀)', () => {
    expect(ATOM_REGISTRY[1].hexagram).toBe('䷀');
  });

  it('hexagram for gate 64 is U+4DFF (䷿)', () => {
    expect(ATOM_REGISTRY[64].hexagram).toBe('䷿');
  });

  it('hexagram codepoints are in the I-Ching block U+4DC0–U+4DFF', () => {
    for (let g = 1; g <= 64; g++) {
      const cp = ATOM_REGISTRY[g].hexagram.codePointAt(0)!;
      expect(cp).toBeGreaterThanOrEqual(0x4dc0);
      expect(cp).toBeLessThanOrEqual(0x4dff);
    }
  });
});

describe('ATOM_REGISTRY center mappings', () => {
  it('every gate center matches GATE_TO_CENTER from geometry', () => {
    for (let g = 1; g <= 64; g++) {
      expect(ATOM_REGISTRY[g].center).toBe(GATE_TO_CENTER[g]);
    }
  });

  it('all gates in CENTER_GATES.Sacral resolve to Sacral center', () => {
    for (const gate of CENTER_GATES.Sacral) {
      expect(ATOM_REGISTRY[gate].center).toBe('Sacral');
    }
  });

  it('all gates in CENTER_GATES.Root resolve to Root center', () => {
    for (const gate of CENTER_GATES.Root) {
      expect(ATOM_REGISTRY[gate].center).toBe('Root');
    }
  });
});

describe('CENTER_TO_MUSICAL_MODE', () => {
  it('every center has a musical mode', () => {
    for (const center of ALL_CENTERS) {
      expect(CENTER_TO_MUSICAL_MODE[center], `${center} missing mode`).toBeDefined();
    }
  });

  it('all assigned modes are valid MusicalMode values', () => {
    for (const center of ALL_CENTERS) {
      expect(ALL_MODES).toContain(CENTER_TO_MUSICAL_MODE[center]);
    }
  });

  it('Head and Ajna both use Lydian (inspiration centers)', () => {
    expect(CENTER_TO_MUSICAL_MODE.Head).toBe('Lydian');
    expect(CENTER_TO_MUSICAL_MODE.Ajna).toBe('Lydian');
  });

  it('Sacral uses Dorian (earthy life-force)', () => {
    expect(CENTER_TO_MUSICAL_MODE.Sacral).toBe('Dorian');
  });

  it('SolarPlexus uses Aeolian (emotional wave)', () => {
    expect(CENTER_TO_MUSICAL_MODE.SolarPlexus).toBe('Aeolian');
  });
});

describe('CENTER_TO_FORGE', () => {
  it('every center has a forge theme', () => {
    for (const center of ALL_CENTERS) {
      expect(CENTER_TO_FORGE[center], `${center} missing forge`).toBeDefined();
    }
  });

  it('all assigned forge themes are valid ForgeTheme values', () => {
    for (const center of ALL_CENTERS) {
      expect(ALL_FORGES).toContain(CENTER_TO_FORGE[center]);
    }
  });

  it('G center resolves to self (the Self/Identity center)', () => {
    expect(CENTER_TO_FORGE.G).toBe('self');
  });

  it('Throat center resolves to lux (expression = illumination)', () => {
    expect(CENTER_TO_FORGE.Throat).toBe('lux');
  });
});

describe('CENTER_COLOR', () => {
  it('every center has a hex color', () => {
    for (const center of ALL_CENTERS) {
      expect(CENTER_COLOR[center]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('MODE_DESCRIPTORS', () => {
  it('has a descriptor for each MusicalMode', () => {
    for (const mode of ALL_MODES) {
      expect(MODE_DESCRIPTORS[mode], `${mode} missing descriptor`).toBeDefined();
      expect(MODE_DESCRIPTORS[mode].length).toBeGreaterThan(20);
    }
  });

  it('each descriptor mentions the mode name or its common alias', () => {
    // Some descriptors use aliases (Ionian="major", Aeolian="natural minor").
    const ALIAS: Partial<Record<MusicalMode, string>> = {
      Ionian:  'major',
      Aeolian: 'minor',
    };
    for (const mode of ALL_MODES) {
      if (mode === 'Pentatonic') continue;
      const desc = MODE_DESCRIPTORS[mode].toLowerCase();
      const keyword = ALIAS[mode] ?? mode.toLowerCase();
      expect(desc, `${mode} descriptor missing "${keyword}"`).toContain(keyword);
    }
  });
});

describe('GATE_KB_KEYS', () => {
  it('has KB keys for all 64 gates', () => {
    for (let g = 1; g <= 64; g++) {
      expect(GATE_KB_KEYS[g], `gate ${g} missing kbKeys`).toBeDefined();
    }
  });

  it('each entry is a tuple of 4 non-empty strings', () => {
    for (let g = 1; g <= 64; g++) {
      const keys = GATE_KB_KEYS[g];
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBe(4);
      for (const k of keys) {
        expect(typeof k).toBe('string');
        expect(k.length).toBeGreaterThan(0);
      }
    }
  });

  it('gate 1 keys are [Origination, Radiance, Stagnation, Creator]', () => {
    expect(GATE_KB_KEYS[1]).toEqual(['Origination', 'Radiance', 'Stagnation', 'Creator']);
  });

  it('gate 34 keys include Vitality (gift) and Sovereignty (siddhi)', () => {
    expect(GATE_KB_KEYS[34][0]).toBe('Vitality');
    expect(GATE_KB_KEYS[34][1]).toBe('Sovereignty');
  });
});

describe('ATOM_REGISTRY kbKeys', () => {
  it('every atom carries its kbKeys from GATE_KB_KEYS', () => {
    for (let g = 1; g <= 64; g++) {
      expect(ATOM_REGISTRY[g].kbKeys).toEqual(GATE_KB_KEYS[g]);
    }
  });
});

describe('getAtom()', () => {
  it('returns the correct entry for gate 34', () => {
    const atom = getAtom(34);
    expect(atom.gate).toBe(34);
    expect(atom.center).toBe('Sacral');
    expect(atom.musicalMode).toBe('Dorian');
    expect(atom.forgeTheme).toBe('eros');
    expect(atom.hexagram).toBe(String.fromCodePoint(0x4DC0 + 33));
    expect(atom.kbKeys[0]).toBe('Vitality');
  });

  it('returns the correct entry for gate 64 (Head center, Lydian)', () => {
    const atom = getAtom(64);
    expect(atom.center).toBe('Head');
    expect(atom.musicalMode).toBe('Lydian');
    expect(atom.forgeTheme).toBe('aether');
  });

  it('throws RangeError for gate 0', () => {
    expect(() => getAtom(0)).toThrow(RangeError);
  });

  it('throws RangeError for gate 65', () => {
    expect(() => getAtom(65)).toThrow(RangeError);
  });

  it('throws RangeError for negative gate', () => {
    expect(() => getAtom(-1)).toThrow(RangeError);
  });
});

describe('modeForGates()', () => {
  it('returns Ionian for empty gate list (G center default)', () => {
    expect(modeForGates([])).toBe('Ionian');
  });

  it('returns Dorian for gate 34 (Sacral)', () => {
    expect(modeForGates([34])).toBe('Dorian');
  });

  it('returns Lydian for gate 64 (Head)', () => {
    expect(modeForGates([64])).toBe('Lydian');
  });

  it('uses only the first gate when multiple provided', () => {
    // gate 34 (Sacral=Dorian) takes precedence over gate 64 (Head=Lydian)
    expect(modeForGates([34, 64])).toBe('Dorian');
  });

  it('returns Aeolian for gate 55 (SolarPlexus)', () => {
    expect(modeForGates([55])).toBe('Aeolian');
  });
});
