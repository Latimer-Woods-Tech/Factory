/**
 * Light Feng Shui from birth data (the "Eight Mansions lens").
 *
 * A pure, deterministic, dependency-free module. Derives a person's Kua (Gua)
 * number from birth year + gender, expands it into the Ba Zhai "Eight Mansions"
 * pattern of four favorable and four unfavorable compass directions, carries the
 * Wu Xing (five-element) cycle vocabulary, and offers concise second-person
 * insights tagged to the repo's FOCUS_THEMES.
 *
 * Like the fixed-stars lens, this is TRADITION, not measured impact — a pattern
 * language offered as a frame for your own lived data, never asserted as fate.
 *
 * --- Kua (Ba Zhai) formula ---
 * MALE,   year <  2000:  kua = 10 - yearSum
 * FEMALE, year <  2000:  kua =  5 + yearSum
 * MALE,   year >= 2000:  kua =  9 - yearSum
 * FEMALE, year >= 2000:  kua =  6 + yearSum
 * Kua 5 → 2 (male) / 8 (female). 0 result → 9.
 *
 * LICHUN CAVEAT: the Chinese solar year begins at Lichun (~Feb 4), not Jan 1.
 * Births in January or early February before Lichun traditionally belong to the
 * PREVIOUS year. Callers should subtract 1 from birthYear for those cases.
 */

/** The five Wu Xing element keys. */
export type WuXingKey = 'wood' | 'fire' | 'earth' | 'metal' | 'water';

/** A Wu Xing element with its generating/controlling cycle relationships. */
export interface WuXingElement {
  name: string;
  generates: WuXingKey;
  controls: WuXingKey;
  color: string;
  keyword: string;
}

/** A single Ba Zhai mansion entry. */
export interface MansionEntry {
  dir: string;
  name: string;
  meaning: string;
}

/** Full Eight-Mansions expansion for a person. */
export interface EightMansionsResult {
  kua: number;
  group: 'East' | 'West';
  favorable: MansionEntry[];
  unfavorable: MansionEntry[];
}

/** A single Feng Shui theme insight. */
export interface FengShuiInsight {
  headline: string;
  body: string;
  element?: string;
  direction?: string;
}

/** Birth data shape accepted by fengShuiByTheme. */
export interface BirthData {
  birthYear: number;
  gender: string;
  [key: string]: unknown;
}

const WEST_GROUP = new Set([2, 6, 7, 8]);

function reduceToDigit(n: number): number {
  let v = Math.abs(Math.trunc(n));
  while (v > 9) {
    let s = 0;
    while (v > 0) { s += v % 10; v = Math.trunc(v / 10); }
    v = s;
  }
  return v;
}

function yearDigit(year: number): number {
  return reduceToDigit(Math.abs(Math.trunc(year)) % 100);
}

/**
 * Kua (Gua) number from birth year + gender, per the canonical Ba Zhai formula.
 * Always returns an integer 1..9, never 5.
 */
export function kuaNumber(birthYear: number, gender: string): number {
  const yearSum = yearDigit(birthYear);
  const g = String(gender ?? '').trim().toLowerCase();
  const isMale = g === 'male' || g === 'm' || g === 'man' || g === 'boy';

  let kua: number;
  if (birthYear >= 2000) {
    kua = isMale ? reduceToDigit(9 - yearSum) : reduceToDigit(6 + yearSum);
  } else {
    kua = isMale ? reduceToDigit(10 - yearSum) : reduceToDigit(5 + yearSum);
  }

  if (kua === 0) kua = 9;
  if (kua === 5) kua = isMale ? 2 : 8;
  return kua;
}

const KUA_DIRECTIONS: Record<number, string[]> = {
  1: ['SE', 'E', 'S', 'N', 'W', 'NE', 'NW', 'SW'],
  2: ['NE', 'W', 'NW', 'SW', 'E', 'SE', 'N', 'S'],
  3: ['S', 'N', 'SE', 'E', 'SW', 'NW', 'NE', 'W'],
  4: ['N', 'S', 'E', 'SE', 'NW', 'SW', 'W', 'NE'],
  6: ['W', 'NE', 'SW', 'NW', 'SE', 'E', 'S', 'N'],
  7: ['NW', 'SW', 'NE', 'W', 'N', 'S', 'SE', 'E'],
  8: ['SW', 'NW', 'W', 'NE', 'S', 'N', 'E', 'SE'],
  9: ['E', 'SE', 'N', 'S', 'NE', 'W', 'SW', 'NW'],
};

const FAVORABLE = [
  { name: 'Sheng Chi', meaning: 'success and wealth — your best direction for growth and ambition' },
  { name: 'Tian Yi',   meaning: 'health and recovery — steadies the body and brings helpful people' },
  { name: 'Yan Nian',  meaning: 'relationships and longevity — warmth, trust, lasting bonds' },
  { name: 'Fu Wei',    meaning: 'stability and personal growth — calm focus, clarity, quiet confidence' },
];

const UNFAVORABLE = [
  { name: 'Ho Hai',   meaning: 'mishaps — small setbacks, friction, things that quietly go wrong' },
  { name: 'Wu Gui',   meaning: 'five ghosts — conflict, betrayal, energy that drains and scatters' },
  { name: 'Liu Sha',  meaning: 'six killings — loss in relationships, legal and money trouble' },
  { name: 'Jue Ming', meaning: 'total loss — the most draining direction; avoid for what matters most' },
];

/**
 * Eight Mansions (Ba Zhai) expansion for a person: their Kua, their group, and
 * the four favorable + four unfavorable directions with names and meanings.
 */
export function eightMansions(birthYear: number, gender: string): EightMansionsResult {
  const kua = kuaNumber(birthYear, gender);
  const dirs = KUA_DIRECTIONS[kua] ?? [];
  const group = WEST_GROUP.has(kua) ? 'West' : 'East';

  const favorable = FAVORABLE.map((m, i) => ({ dir: dirs[i] ?? '', name: m.name, meaning: m.meaning }));
  const unfavorable = UNFAVORABLE.map((m, i) => ({ dir: dirs[i + 4] ?? '', name: m.name, meaning: m.meaning }));

  return { kua, group, favorable, unfavorable };
}

/**
 * WU_XING — the Five Elements with generating/controlling cycle relationships,
 * per-element colour and keyword. Vocabulary converges with BaZi readings.
 */
export const WU_XING: Record<WuXingKey, WuXingElement> = {
  wood:  { name: 'Wood',  generates: 'fire',  controls: 'earth', color: '#4caf7d', keyword: 'growth, vision, the upward reach' },
  fire:  { name: 'Fire',  generates: 'earth', controls: 'metal', color: '#ff6b4a', keyword: 'passion, visibility, the spark that spreads' },
  earth: { name: 'Earth', generates: 'metal', controls: 'water', color: '#d4a45a', keyword: 'stability, nourishment, the holding ground' },
  metal: { name: 'Metal', generates: 'water', controls: 'wood',  color: '#cfd3da', keyword: 'precision, structure, the refining cut' },
  water: { name: 'Water', generates: 'wood',  controls: 'fire',  color: '#4a8fd4', keyword: 'flow, depth, wisdom that finds its way' },
};

const KUA_ELEMENT: Record<number, WuXingKey> = {
  1: 'water', 2: 'earth', 3: 'wood', 4: 'wood',
  6: 'metal', 7: 'metal', 8: 'earth', 9: 'fire',
};

function elementGeneratedBy(key: WuXingKey): WuXingKey {
  for (const [k, v] of Object.entries(WU_XING) as [WuXingKey, WuXingElement][]) {
    if (v.generates === key) return k;
  }
  return key;
}

/**
 * Insights keyed to the repo's FOCUS_THEMES (plus 'environment').
 * Each value is a short, second-person, pattern-language note — a frame to test
 * against your own life, not a deterministic verdict.
 */
export function fengShuiByTheme(birthData: BirthData): Record<string, FengShuiInsight> {
  const { birthYear, gender } = birthData;
  const { kua, group, favorable } = eightMansions(birthYear, gender);
  const elementKey = KUA_ELEMENT[kua] ?? 'earth';
  const element = WU_XING[elementKey];
  const feeder = WU_XING[elementGeneratedBy(elementKey)];

  const shengChi = favorable[0]!;
  const tianYi   = favorable[1]!;
  const yanNian  = favorable[2]!;

  return {
    work: {
      headline: `Face your Sheng Chi (${shengChi.dir}) when the stakes are high`,
      body: `As a ${group}-group person (Kua ${kua}), your strongest direction is ${shengChi.dir}. Tradition seats you to face it for ambitious work — the desk turned that way, the important call made from that side of the room. Treat it as a small lever for focus, not a guarantee.`,
      element: element.name,
      direction: shengChi.dir,
    },
    relationships: {
      headline: `Your Yan Nian direction is ${yanNian.dir}`,
      body: `${yanNian.dir} is your relationship-and-longevity direction. Shared meals, difficult conversations, and the seats you offer guests land more warmly when oriented this way. A gentle pattern to notice, not a rule to obey.`,
      direction: yanNian.dir,
    },
    timing: {
      headline: `${element.name} is your governing element`,
      body: `Kua ${kua} carries a ${element.name} signature — ${element.keyword}. Seasons, rooms, and projects that echo ${element.name} (it is fed by ${feeder.name}) tend to feel like tailwind; lean into those windows rather than forcing against the grain.`,
      element: element.name,
    },
    environment: {
      headline: `Steady yourself toward Tian Yi (${tianYi.dir})`,
      body: `For rest and recovery, orient the place you sleep and recharge toward ${tianYi.dir}, your Tian Yi (health) direction, and keep your Jue Ming corner uncluttered. Arrange the room around what restores you; the compass is a prompt, your own felt sense is the verdict.`,
      element: element.name,
      direction: tianYi.dir,
    },
  };
}

/**
 * Gender-neutral fallback: when birth sex is withheld, the Kua and directions
 * cannot be computed (the formula is binary), but a governing-element framing
 * still can — sourced from a BaZi day-master element passed in by the caller.
 * Returns the element-only slice (no directions).
 */
export function fengShuiElementOnly(elementKey: string): Record<string, FengShuiInsight> {
  const element = WU_XING[elementKey as WuXingKey];
  if (!element) return {};
  const feeder = WU_XING[elementGeneratedBy(elementKey as WuXingKey)];
  return {
    timing: {
      headline: `${element.name} is your governing element`,
      body: `Your chart carries a ${element.name} signature — ${element.keyword}. Seasons, rooms, and projects that echo ${element.name} (it is fed by ${feeder.name}) tend to feel like tailwind; lean into those windows. Directional guidance needs birth sex, which is left out here — this is the element layer only.`,
      element: element.name,
    },
  };
}
